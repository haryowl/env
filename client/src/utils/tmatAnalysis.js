/**
 * TMAT Table 2 analysis helpers (infiltration, flood, drought, recharge).
 * Uses latest values + short history for Δ moisture / Δ TMAT / dry spell.
 */

import { toNum, normalizeKey } from './sparingAnalysis';

export const TMAT_PARAM_ALIASES = {
  tmat: ['tmat', 'tmat_level', 'groundwater_level', 'gw_level', 'muka_air_tanah'],
  water: ['water_level', 'waterlevel', 'wl', 'surface_water', 'level_air'],
  moisture: ['soil_moisture', 'moisture', 'kelembaban', 'sm', 'soil_moist'],
  soil_temp: ['soil_temperature', 'soil_temp', 'temperature_soil', 'temp_tanah'],
  rainfall: ['rainfall', 'rain', 'precip', 'curah_hujan', 'ch'],
};

export function resolveTmatParamKey(keys, kind) {
  const aliases = TMAT_PARAM_ALIASES[kind] || [];
  const list = (keys || []).map((k) => ({ raw: k, norm: normalizeKey(k) }));
  for (const a of aliases) {
    const hit = list.find((x) => x.norm === a || x.norm.includes(a));
    if (hit) return hit.raw;
  }
  return null;
}

export function isTmatKindParam(paramKey) {
  const k = normalizeKey(paramKey);
  return Object.values(TMAT_PARAM_ALIASES).some((aliases) =>
    aliases.some((a) => k === a || k.includes(a))
  );
}

/** TMAT depth: shallower = higher risk → Rasio = Ambang / Nilai × 100 */
export function isInvertedTmatParam(paramKey) {
  const k = normalizeKey(paramKey);
  return TMAT_PARAM_ALIASES.tmat.some((a) => k === a || k.includes(a));
}

export function computeInvertedCeilingRatio(nilai, ambang) {
  const v = toNum(nilai);
  const a = toNum(ambang);
  if (v == null || a == null || v === 0) return null;
  return (a / v) * 100;
}

function rowTimeMs(row) {
  const raw = row?.datetime ?? row?.timestamp;
  if (raw == null) return NaN;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function seriesFromHistory(history, paramKey) {
  if (!paramKey || !Array.isArray(history)) return [];
  return history
    .map((row) => ({ t: rowTimeMs(row), v: toNum(row[paramKey]) }))
    .filter((p) => Number.isFinite(p.t) && p.v != null)
    .sort((a, b) => a.t - b.t);
}

/** Δ over roughly the last hour (or full window if shorter). */
export function deltaOverWindow(history, paramKey, windowMs = 3600 * 1000) {
  const series = seriesFromHistory(history, paramKey);
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const cutoff = last.t - windowMs;
  let first = series[0];
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].t <= cutoff) {
      first = series[i];
      break;
    }
    first = series[i];
  }
  if (first.t === last.t && series.length >= 2) first = series[0];
  return last.v - first.v;
}

/** Hours at end of series with rainfall ≈ 0. */
export function consecutiveDryHours(history, rainKey) {
  const series = seriesFromHistory(history, rainKey);
  if (!series.length) return null;
  let dryMs = 0;
  for (let i = series.length - 1; i > 0; i -= 1) {
    if (series[i].v > 0.05) break;
    dryMs += series[i].t - series[i - 1].t;
  }
  if (series.length === 1 && series[0].v <= 0.05) return 0;
  return dryMs / 3600000;
}

/**
 * Infiltration % ≈ (Δ Soil Moisture / Rainfall) × 100 over ~1h.
 * If moisture > 85% treat as saturated capacity signal.
 */
export function infiltrationPercent(history, moistureKey, rainKey, latestMoisture) {
  const moist = toNum(latestMoisture);
  const dMoist = deltaOverWindow(history, moistureKey);
  const seriesRain = seriesFromHistory(history, rainKey);
  const rainLast = seriesRain.length ? seriesRain[seriesRain.length - 1].v : null;
  // Prefer sum of rain over same ~1h window
  let rainSum = null;
  if (seriesRain.length >= 2) {
    const last = seriesRain[seriesRain.length - 1];
    const cutoff = last.t - 3600 * 1000;
    rainSum = seriesRain.filter((p) => p.t >= cutoff).reduce((s, p) => s + Math.max(0, p.v), 0);
  } else if (rainLast != null) {
    rainSum = rainLast;
  }

  if (moist != null && moist > 85 && (rainSum == null || rainSum < 0.1)) {
    return { value: 8, saturated: true }; // low capacity when sealed/saturated
  }
  if (dMoist == null || rainSum == null || rainSum <= 0) return null;
  return { value: (Math.max(0, dMoist) / rainSum) * 100, saturated: moist != null && moist > 85 };
}

export function infiltrationStatus(inf) {
  if (inf == null || inf.value == null) {
    return { key: 'unknown', label: '—', color: '#64748B', detail: '', ratio: null, primary: '—' };
  }
  const v = inf.value;
  const ratio = Math.max(0, 100 - v); // low infiltration → hotter
  if (v < 30 && inf.saturated) {
    return { key: 'melebihi', label: 'KRITIS', color: '#DC2626', detail: 'Tersumbat / saturated', ratio: 110, primary: `${v.toFixed(0)}% kapasitas` };
  }
  if (v < 30) {
    return { key: 'melebihi', label: 'KRITIS', color: '#DC2626', detail: 'Resapan rendah', ratio: 105, primary: `${v.toFixed(0)}% kapasitas` };
  }
  if (v <= 60) {
    return { key: 'waspada', label: 'WASPADA', color: '#EA580C', detail: 'Resapan sedang', ratio: 80, primary: `${v.toFixed(0)}% kapasitas` };
  }
  return { key: 'aman', label: 'AMAN', color: '#16A34A', detail: 'Resapan baik', ratio: Math.min(50, ratio), primary: `${v.toFixed(0)}% kapasitas` };
}

/**
 * Flood risk score ~ sample: 0.5×TMAT_risk + 0.25×Water + 0.25×Moist (0–100+).
 * TMAT_risk uses invert vs ambang (default 2 m).
 */
export function groundwaterFloodScore({ tmat, tmatAmbang, water, waterAmbang, moisture, moistureAmbang }) {
  const t = toNum(tmat);
  const ta = toNum(tmatAmbang) ?? 2;
  const w = toNum(water);
  const wa = toNum(waterAmbang) ?? 2;
  const m = toNum(moisture);
  const ma = toNum(moistureAmbang) ?? 80;
  if (t == null && w == null && m == null) return null;

  const tmatRisk = t != null && t > 0 ? Math.min(200, (ta / t) * 100) / 100 : 0;
  const waterRisk = w != null && wa > 0 ? Math.min(2, w / wa) : 0;
  const moistRisk = m != null && ma > 0 ? Math.min(2, m / ma) : 0;
  const score = (0.5 * tmatRisk + 0.25 * waterRisk + 0.25 * moistRisk) * 100;

  // Table 2 discrete rules (override to MELEBIHI when all fire)
  const criticalCombo = t != null && t < 0.5 && m != null && m > 90 && w != null && w > 1.5;
  return { score, criticalCombo, tmat: t, water: w, moisture: m };
}

export function floodStatus(flood) {
  if (flood == null || flood.score == null) {
    return { key: 'unknown', label: '—', color: '#64748B', detail: '', ratio: null, primary: '—' };
  }
  const s = flood.score;
  if (flood.criticalCombo || s >= 100) {
    return { key: 'melebihi', label: 'MELEBIHI', color: '#DC2626', detail: 'Banjir tanah risk', ratio: Math.max(100, s), primary: `${s.toFixed(0)}% skor banjir` };
  }
  const t = flood.tmat;
  if (t != null && t >= 0.5 && t <= 1.5 && s < 100) {
    return { key: 'waspada', label: 'WASPADA', color: '#EA580C', detail: 'TMAT dangkal–sedang', ratio: Math.max(75, s), primary: `${s.toFixed(0)}% skor banjir` };
  }
  if (t != null && t > 2 && s < 75) {
    return { key: 'aman', label: 'AMAN', color: '#16A34A', detail: 'TMAT dalam', ratio: s, primary: `${s.toFixed(0)}% skor banjir` };
  }
  if (s >= 85) return { key: 'melebihi', label: 'MELEBIHI', color: '#DC2626', detail: '0.5×TMAT + 0.25×Water + 0.25×Moist', ratio: s, primary: `${s.toFixed(0)}% skor banjir` };
  if (s >= 50) return { key: 'waspada', label: 'WASPADA', color: '#EA580C', detail: '0.5×TMAT + 0.25×Water + 0.25×Moist', ratio: s, primary: `${s.toFixed(0)}% skor banjir` };
  return { key: 'aman', label: 'AMAN', color: '#16A34A', detail: '0.5×TMAT + 0.25×Water + 0.25×Moist', ratio: s, primary: `${s.toFixed(0)}% skor banjir` };
}

export function droughtIndex({ moisture, soilTemp, rainLatest, dryHours }) {
  const m = toNum(moisture);
  const temp = toNum(soilTemp);
  const rain = toNum(rainLatest) ?? 0;
  if (m == null && temp == null) return null;

  let idx = 0;
  if (m != null) {
    if (m < 30) idx += 50;
    else if (m <= 50) idx += 30;
    else idx += Math.max(0, 60 - m) * 0.4;
  }
  if (temp != null && temp > 35) idx += 25;
  if (rain <= 0.05) idx += 15;
  if (dryHours != null && dryHours >= 7 * 24) idx += 40;
  else if (dryHours != null && dryHours >= 48) idx += 20;

  const critical = m != null && m < 30 && temp != null && temp > 35 && rain <= 0.05
    && (dryHours == null || dryHours >= 24);
  return { idx: Math.min(120, idx), critical, moisture: m, dryHours };
}

export function droughtStatus(d) {
  if (d == null) return { key: 'unknown', label: '—', color: '#64748B', detail: '', ratio: null, primary: '—' };
  if (d.critical || d.idx >= 85) {
    return { key: 'melebihi', label: 'KRITIS', color: '#DC2626', detail: 'Kekeringan', ratio: Math.max(100, d.idx), primary: `${d.idx.toFixed(0)} drought idx` };
  }
  const m = d.moisture;
  if ((m != null && m >= 30 && m <= 50) || d.idx >= 50) {
    return { key: 'waspada', label: 'WASPADA', color: '#EA580C', detail: 'Moisture 30–50% / stress', ratio: Math.max(75, d.idx), primary: `${d.idx.toFixed(0)} drought idx` };
  }
  return { key: 'aman', label: 'AMAN', color: '#16A34A', detail: 'ET / kelembaban OK', ratio: d.idx, primary: `${d.idx.toFixed(0)} drought idx` };
}

/** Efficiency = ΔTMAT / Rainfall (same window). Higher = more permeable. */
export function rechargeEfficiency(history, tmatKey, rainKey) {
  const dTmat = deltaOverWindow(history, tmatKey);
  const seriesRain = seriesFromHistory(history, rainKey);
  if (!seriesRain.length || dTmat == null) return null;
  const last = seriesRain[seriesRain.length - 1];
  const cutoff = last.t - 3600 * 1000;
  const rainSum = seriesRain.filter((p) => p.t >= cutoff).reduce((s, p) => s + Math.max(0, p.v), 0);
  if (rainSum <= 0) return null;
  // Rising water table after rain → use |Δ| when TMAT is depth (decrease depth = recharge)
  const eff = Math.abs(dTmat) / rainSum;
  return eff;
}

export function rechargeStatus(eff) {
  if (eff == null) return { key: 'unknown', label: '—', color: '#64748B', detail: '', ratio: null, primary: '—' };
  // Map efficiency to heat: low efficiency = hot. Show as % of 0.4 “good” baseline.
  const pctGood = Math.min(120, (eff / 0.4) * 100);
  const heat = Math.max(0, 120 - pctGood);
  if (eff < 0.15) {
    return { key: 'melebihi', label: 'KRITIS', color: '#DC2626', detail: 'Clogged / low recharge', ratio: 110, primary: `${(eff * 100).toFixed(0)}% efisiensi` };
  }
  if (eff <= 0.4) {
    return { key: 'waspada', label: 'WASPADA', color: '#EA580C', detail: 'Recharge sedang', ratio: 80, primary: `${(eff * 100).toFixed(0)}% efisiensi` };
  }
  return { key: 'aman', label: 'AMAN', color: '#16A34A', detail: 'Permeable · lag tipikal 2–6 jam', ratio: heat, primary: `${(eff * 100).toFixed(0)}% efisiensi` };
}

/**
 * Build TMAT derived cards from heat rows + history.
 */
export function buildTmatCards(rows, history, getUnit) {
  const keys = (rows || []).map((r) => r.param);
  const by = {};
  Object.keys(TMAT_PARAM_ALIASES).forEach((kind) => {
    const key = resolveTmatParamKey(keys, kind);
    if (key) by[kind] = (rows || []).find((r) => r.param === key);
  });

  // Also allow reading from history-only keys if not in rows
  const histKeys = Array.isArray(history) && history[0]
    ? Object.keys(history[0]).filter((k) => !['datetime', 'timestamp', 'device_id'].includes(k))
    : [];
  Object.keys(TMAT_PARAM_ALIASES).forEach((kind) => {
    if (by[kind]) return;
    const key = resolveTmatParamKey([...keys, ...histKeys], kind);
    if (!key) return;
    const last = Array.isArray(history) && history.length
      ? toNum(history[history.length - 1][key])
      : null;
    by[kind] = { param: key, nilai: last == null ? '' : String(last), bakuMin: '', bakuMax: '' };
  });

  const moistureKey = by.moisture?.param;
  const rainKey = by.rainfall?.param;
  const tmatKey = by.tmat?.param;

  const inf = infiltrationPercent(history, moistureKey, rainKey, by.moisture?.nilai);
  const flood = groundwaterFloodScore({
    tmat: by.tmat?.nilai,
    tmatAmbang: by.tmat?.bakuMax || by.tmat?.bakuMin || 2,
    water: by.water?.nilai,
    waterAmbang: by.water?.bakuMax || by.water?.bakuMin || 2,
    moisture: by.moisture?.nilai,
    moistureAmbang: by.moisture?.bakuMax || by.moisture?.bakuMin || 80,
  });
  const dryHours = consecutiveDryHours(history, rainKey);
  const drought = droughtIndex({
    moisture: by.moisture?.nilai,
    soilTemp: by.soil_temp?.nilai,
    rainLatest: by.rainfall?.nilai,
    dryHours,
  });
  const eff = rechargeEfficiency(history, tmatKey, rainKey);

  const infSt = infiltrationStatus(inf);
  const floodSt = floodStatus(flood);
  const droughtSt = droughtStatus(drought);
  const rechSt = rechargeStatus(eff);

  return [
    {
      id: 'infiltration',
      title: 'Infiltration Rate',
      formula: 'Infiltration % = (Δ Soil Moisture / Rainfall) × 100',
      ready: inf != null,
      missing: [!by.moisture && 'Soil Moisture', !by.rainfall && 'Rainfall'].filter(Boolean),
      ...infSt,
    },
    {
      id: 'flood',
      title: 'Groundwater Flood Risk',
      formula: '0.5×TMAT + 0.25×Water + 0.25×Moist',
      ready: flood != null,
      missing: [!by.tmat && 'TMAT', !by.water && 'Water Level', !by.moisture && 'Soil Moisture'].filter(Boolean),
      ...floodSt,
    },
    {
      id: 'drought',
      title: 'Drought & Evapotranspiration',
      formula: 'f(Soil Temp, Soil Moisture, Rainfall)',
      ready: drought != null,
      missing: [!by.moisture && 'Soil Moisture', !by.soil_temp && 'Soil Temp'].filter(Boolean),
      ...droughtSt,
    },
    {
      id: 'recharge',
      title: 'Aquifer Recharge Lag',
      formula: 'Efficiency = ΔTMAT / Rainfall',
      ready: eff != null,
      missing: [!by.tmat && 'TMAT', !by.rainfall && 'Rainfall'].filter(Boolean),
      ...rechSt,
    },
  ];
}
