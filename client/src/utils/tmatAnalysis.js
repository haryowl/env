/**
 * TMAT Table 2 analysis helpers (infiltration, flood, drought, recharge).
 * Uses latest values + short history for Δ moisture / Δ TMAT / dry spell.
 *
 * Regulatory vs operational (Section B):
 * - TMAT has a fixed legal limit (PP No. 57/2016): 0.4 m depth → elevation −0.40 m.
 * - Soil Moisture, Soil Temperature, Rainfall are operational / physiological / EWS
 *   indicators (hydrophobic peat, canopy loss, BMKG dry-spell), not hard statute caps.
 */

import { toNum, normalizeKey } from './sparingAnalysis';

/**
 * IoT monitoring thresholds for peatland telemetry (volumetric moisture, °C, mm, m).
 * TMAT baku mutu from PP 57/2016; other params are early-warning guidance.
 */
export const TMAT_EWS = {
  tmat: {
    /** Legal depth limit (m below surface) → signed elevation */
    bakuMutuM: -0.4,
    amanMin: -0.39,
    amanMax: 0,
    label: 'PP No. 57/2016 · baku mutu −0,40 m',
  },
  moisture: {
    idealMin: 50,
    idealMax: 80,
    waspadaMin: 35,
    waspadaMax: 49,
    hydrophobicMax: 35,
    label: 'Volumetrik gambut · hidrofobik < 35%',
  },
  soil_temp: {
    idealMin: 24,
    idealMax: 30,
    waspadaMin: 31,
    waspadaMax: 35,
    bahaya: 35,
    smoldering: 45,
    label: 'Gambut tropis · >35°C anomali / >45°C smoldering',
  },
  rainfall: {
    drySpellWaspadaDays: 10,
    drySpellBahayaDays: 14,
    dailyLowMm: 5,
    monthlyCriticalMm: 50,
    monthlyRechargeMinMm: 150,
    monthlyRechargeGoodMm: 200,
    label: 'BMKG dry spell · Siaga 1 >10–14 hari tanpa hujan',
  },
};

export const TMAT_PARAM_ALIASES = {
  tmat: ['tmat', 'tmat_level', 'groundwater_level', 'ground_water_level', 'ground_water', 'gwl', 'gw_level', 'muka_air_tanah', 'tma'],
  water: ['water_level', 'waterlevel', 'wl', 'surface_water', 'level_air'],
  moisture: ['soil_moisture', 'soil_moisturize', 'moisture', 'kelembaban', 'sm', 'soil_moist'],
  soil_temp: ['soil_temperature', 'soil_temp', 'temperature_soil', 'temp_tanah'],
  rainfall: ['rainfall', 'rain', 'precip', 'curah_hujan', 'ch'],
  battery: ['battery_voltage', 'battery_volt', 'battery_v', 'voltage_v', 'voltage', 'battery', 'batt', 'bat_v', 'v_batt', 'vdc', 'bat_vol'],
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

export function tmatParamKind(paramKey) {
  const k = normalizeKey(paramKey);
  const kinds = Object.keys(TMAT_PARAM_ALIASES);
  for (const kind of kinds) {
    if (TMAT_PARAM_ALIASES[kind].some((a) => k === a || k.includes(a))) return kind;
  }
  return null;
}

export function isTmatKindParam(paramKey) {
  return tmatParamKind(paramKey) != null;
}

/** TMAT elevation param (signed m relative to soil surface). */
export function isInvertedTmatParam(paramKey) {
  return tmatParamKind(paramKey) === 'tmat';
}

/**
 * Default ZONA MIN/MAX when device alerts are empty.
 * Alert thresholds always win when present.
 */
export function getTmatOperationalDefaults(paramKey) {
  const kind = tmatParamKind(paramKey);
  if (kind === 'tmat') {
    // Floor ambang PP 57/2016 (−0.40 m). Depth beyond this → heat via PP57 ratio.
    return { bakuMin: TMAT_EWS.tmat.bakuMutuM, bakuMax: null };
  }
  if (kind === 'moisture') {
    return { bakuMin: TMAT_EWS.moisture.idealMin, bakuMax: TMAT_EWS.moisture.idealMax };
  }
  if (kind === 'soil_temp') {
    return { bakuMin: TMAT_EWS.soil_temp.idealMin, bakuMax: TMAT_EWS.soil_temp.idealMax };
  }
  if (kind === 'rainfall') {
    // Soft daily floor for EWS (< 5 mm several days → waspada in drought card)
    return { bakuMin: TMAT_EWS.rainfall.dailyLowMm, bakuMax: null };
  }
  return null;
}

/**
 * PP 57/2016 TMAT heat vs −0.40 m baku mutu.
 * Aman 0…−0.39 m → &lt;85%; waspada −0.40 m → 100%; bahaya deeper (e.g. −0.50 → 125%).
 * Positive nilai (above surface) → flood/ponding heat ≥ 100%.
 */
export function computePp57TmatRatio(nilai, bakuMutu = TMAT_EWS.tmat.bakuMutuM) {
  const v = toNum(nilai);
  const limit = toNum(bakuMutu) ?? TMAT_EWS.tmat.bakuMutuM;
  if (v == null || limit === 0) return null;
  const limDepth = Math.abs(limit);
  const amanDepth = Math.abs(TMAT_EWS.tmat.amanMin); // 0.39
  if (v > 0) return 100 + (v / limDepth) * 100;
  const depth = -v;
  if (depth <= amanDepth) {
    // Stay in AMAN chip band (&lt;85%) through −0.39 m
    return (depth / amanDepth) * 74;
  }
  if (depth <= limDepth) {
    // −0.39…−0.40 → 74…100 (WASPADA at baku mutu)
    return 74 + ((depth - amanDepth) / (limDepth - amanDepth)) * 26;
  }
  // Deeper than −0.40 → MELEBIHI
  return 100 + ((depth - limDepth) / limDepth) * 100;
}

/** Soil moisture volumetric EWS heat (ideal 50–80%, hydrophobic < 35%). */
export function computeMoistureEwsRatio(nilai) {
  const m = toNum(nilai);
  if (m == null) return null;
  const { idealMin, idealMax, waspadaMin, hydrophobicMax } = TMAT_EWS.moisture;
  if (m >= idealMin && m <= idealMax) {
    const mid = (idealMin + idealMax) / 2;
    const half = (idealMax - idealMin) / 2;
    return half > 0 ? (Math.abs(m - mid) / half) * 45 : 0;
  }
  if (m >= waspadaMin && m < idealMin) {
    return 75 + ((idealMin - m) / (idealMin - waspadaMin)) * 25;
  }
  if (m < hydrophobicMax) {
    return 100 + Math.min(50, ((hydrophobicMax - m) / hydrophobicMax) * 50);
  }
  // > idealMax: saturation / reduced infiltration capacity
  return 55 + Math.min(40, (m - idealMax) * 1.5);
}

/** Soil temperature EWS heat (ideal 24–30°C, >35 bahaya, >45 smoldering). */
export function computeSoilTempEwsRatio(nilai) {
  const t = toNum(nilai);
  if (t == null) return null;
  const { idealMin, idealMax, waspadaMax, bahaya, smoldering } = TMAT_EWS.soil_temp;
  if (t >= idealMin && t <= idealMax) {
    const mid = (idealMin + idealMax) / 2;
    const half = (idealMax - idealMin) / 2;
    return half > 0 ? (Math.abs(t - mid) / half) * 40 : 0;
  }
  if (t < idealMin) {
    return Math.min(70, ((idealMin - t) / idealMin) * 70);
  }
  if (t <= waspadaMax) {
    return 75 + ((t - idealMax) / (waspadaMax - idealMax)) * 25;
  }
  if (t <= smoldering) {
    return 100 + ((t - bahaya) / (smoldering - bahaya)) * 20;
  }
  return 120;
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
 * Flood risk: shallow / ponding TMAT + high water + high moisture.
 * PP 57 signed TMAT: shallower (→ 0) raises flood risk; deeper than −0.4 lowers it.
 */
export function groundwaterFloodScore({
  tmat,
  tmatMin,
  tmatMax,
  tmatAmbang,
  water,
  waterAmbang,
  moisture,
  moistureAmbang,
}) {
  const t = toNum(tmat);
  const tMin = toNum(tmatMin);
  const tMax = toNum(tmatMax);
  const ta = toNum(tmatAmbang) ?? TMAT_EWS.tmat.bakuMutuM;
  const w = toNum(water);
  const wa = toNum(waterAmbang) ?? 2;
  const m = toNum(moisture);
  const ma = toNum(moistureAmbang) ?? TMAT_EWS.moisture.idealMax;
  if (t == null && w == null && m == null) return null;

  const hasTmatBand = tMin != null && tMax != null && tMax > tMin && tMin !== 0;
  const pp57Ambang = ta != null && ta < 0;

  let tmatRisk = 0;
  if (t != null) {
    if (hasTmatBand && !pp57Ambang) {
      const mid = (tMin + tMax) / 2;
      const half = (tMax - tMin) / 2;
      tmatRisk = half > 0 ? Math.min(2, Math.abs(t - mid) / half) : 0;
    } else if (pp57Ambang || (t <= 0 && (ta == null || ta < 0))) {
      const lim = Math.abs(ta ?? TMAT_EWS.tmat.bakuMutuM);
      if (t > 0) tmatRisk = Math.min(2, 1 + t / lim);
      else tmatRisk = Math.min(2, Math.max(0, 1 - (-t) / lim)); // 1 at surface, 0 at −0.4
    } else if (t > 0 && ta > 0) {
      tmatRisk = Math.min(2, (ta / t));
    }
  }

  const waterRisk = w != null && wa > 0 ? Math.min(2, w / wa) : 0;
  // High moisture contributes to flood; hydrophobic low moisture does not
  const moistRisk = m != null && ma > 0 ? Math.min(2, m / ma) : 0;
  const score = (0.5 * tmatRisk + 0.25 * waterRisk + 0.25 * moistRisk) * 100;

  const outsideBand = hasTmatBand && t != null && (t < tMin || t > tMax);
  const deepBreach = t != null && ta != null && ta < 0 && t < ta;
  const criticalCombo = m != null && m > 90 && w != null && w > 1.5
    && (t != null && (t > -0.1 || t > 0));

  return {
    score,
    criticalCombo,
    tmat: t,
    tmatMin: hasTmatBand ? tMin : null,
    tmatMax: hasTmatBand ? tMax : null,
    outsideBand,
    deepBreach,
    water: w,
    moisture: m,
  };
}

export function floodStatus(flood) {
  if (flood == null || flood.score == null) {
    return { key: 'unknown', label: '—', color: '#64748B', detail: '', ratio: null, primary: '—' };
  }
  const s = flood.score;
  if (flood.criticalCombo || s >= 100) {
    return {
      key: 'melebihi',
      label: 'MELEBIHI',
      color: '#DC2626',
      detail: 'Banjir / genangan · TMAT dangkal + moisture tinggi',
      ratio: Math.max(100, s),
      primary: `${s.toFixed(0)}% skor banjir`,
    };
  }
  if (flood.outsideBand && flood.tmat != null && flood.tmatMax != null && flood.tmat > flood.tmatMax) {
    return {
      key: 'melebihi',
      label: 'MELEBIHI',
      color: '#DC2626',
      detail: `TMAT di atas zona [${flood.tmatMin} … ${flood.tmatMax}]`,
      ratio: Math.max(100, s),
      primary: `${s.toFixed(0)}% skor banjir`,
    };
  }
  if (s >= 85) {
    return { key: 'melebihi', label: 'MELEBIHI', color: '#DC2626', detail: '0.5×TMAT + 0.25×Water + 0.25×Moist', ratio: s, primary: `${s.toFixed(0)}% skor banjir` };
  }
  if (s >= 50) {
    return { key: 'waspada', label: 'WASPADA', color: '#EA580C', detail: 'TMAT mendekati permukaan', ratio: Math.max(75, s), primary: `${s.toFixed(0)}% skor banjir` };
  }
  return { key: 'aman', label: 'AMAN', color: '#16A34A', detail: 'Risiko genangan rendah', ratio: s, primary: `${s.toFixed(0)}% skor banjir` };
}

/**
 * Drought / fire-weather index from peat EWS guidance:
 * moisture hydrophobic, soil temp anomaly/smoldering, BMKG dry spell.
 */
export function droughtIndex({ moisture, soilTemp, rainLatest, dryHours }) {
  const m = toNum(moisture);
  const temp = toNum(soilTemp);
  const rain = toNum(rainLatest) ?? 0;
  if (m == null && temp == null && dryHours == null) return null;

  const ewsM = TMAT_EWS.moisture;
  const ewsT = TMAT_EWS.soil_temp;
  const ewsR = TMAT_EWS.rainfall;

  let idx = 0;
  let hydrophobic = false;
  let smoldering = false;

  if (m != null) {
    if (m < ewsM.hydrophobicMax) {
      idx += 55;
      hydrophobic = true;
    } else if (m <= ewsM.waspadaMax) {
      idx += 30;
    } else if (m < ewsM.idealMin) {
      idx += 15;
    } else if (m <= ewsM.idealMax) {
      idx += 0;
    }
  }

  if (temp != null) {
    if (temp >= ewsT.smoldering) {
      idx += 50;
      smoldering = true;
    } else if (temp > ewsT.bahaya) {
      idx += 30;
    } else if (temp >= ewsT.waspadaMin) {
      idx += 15;
    }
  }

  if (rain < ewsR.dailyLowMm) idx += 10;
  if (rain <= 0.05) idx += 8;

  const dryDays = dryHours != null ? dryHours / 24 : null;
  if (dryDays != null && dryDays >= ewsR.drySpellBahayaDays) idx += 45;
  else if (dryDays != null && dryDays >= ewsR.drySpellWaspadaDays) idx += 30;
  else if (dryDays != null && dryDays >= 2) idx += 12;

  const critical = (hydrophobic && temp != null && temp > ewsT.bahaya)
    || smoldering
    || (hydrophobic && dryDays != null && dryDays >= ewsR.drySpellWaspadaDays);

  return {
    idx: Math.min(120, idx),
    critical,
    hydrophobic,
    smoldering,
    moisture: m,
    soilTemp: temp,
    dryHours,
    dryDays,
  };
}

export function droughtStatus(d) {
  if (d == null) return { key: 'unknown', label: '—', color: '#64748B', detail: '', ratio: null, primary: '—' };
  const dryLabel = d.dryDays != null ? ` · dry spell ${d.dryDays.toFixed(0)} hari` : '';

  if (d.smoldering) {
    return {
      key: 'melebihi',
      label: 'KRITIS',
      color: '#DC2626',
      detail: `Smoldering risk · suhu ≥ ${TMAT_EWS.soil_temp.smoldering}°C${dryLabel}`,
      ratio: Math.max(110, d.idx),
      primary: `${d.idx.toFixed(0)} drought idx`,
    };
  }
  if (d.critical || d.idx >= 85 || d.hydrophobic) {
    return {
      key: 'melebihi',
      label: 'KRITIS',
      color: '#DC2626',
      detail: d.hydrophobic
        ? `Hidrofobik · moisture < ${TMAT_EWS.moisture.hydrophobicMax}%${dryLabel}`
        : `Kekeringan gambut${dryLabel}`,
      ratio: Math.max(100, d.idx),
      primary: `${d.idx.toFixed(0)} drought idx`,
    };
  }
  if ((d.moisture != null && d.moisture < TMAT_EWS.moisture.idealMin)
    || (d.soilTemp != null && d.soilTemp >= TMAT_EWS.soil_temp.waspadaMin)
    || (d.dryDays != null && d.dryDays >= TMAT_EWS.rainfall.drySpellWaspadaDays)
    || d.idx >= 50) {
    return {
      key: 'waspada',
      label: 'WASPADA',
      color: '#EA580C',
      detail: `EWS gambut · Siaga 1${dryLabel}`,
      ratio: Math.max(75, d.idx),
      primary: `${d.idx.toFixed(0)} drought idx`,
    };
  }
  return {
    key: 'aman',
    label: 'AMAN',
    color: '#16A34A',
    detail: `Kelembaban ${TMAT_EWS.moisture.idealMin}–${TMAT_EWS.moisture.idealMax}% · suhu ${TMAT_EWS.soil_temp.idealMin}–${TMAT_EWS.soil_temp.idealMax}°C`,
    ratio: d.idx,
    primary: `${d.idx.toFixed(0)} drought idx`,
  };
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
    tmatMin: by.tmat?.bakuMin,
    tmatMax: by.tmat?.bakuMax,
    tmatAmbang: by.tmat?.bakuMin || by.tmat?.bakuMax || TMAT_EWS.tmat.bakuMutuM,
    water: by.water?.nilai,
    waterAmbang: by.water?.bakuMax || by.water?.bakuMin || 2,
    moisture: by.moisture?.nilai,
    moistureAmbang: by.moisture?.bakuMax || by.moisture?.bakuMin || TMAT_EWS.moisture.idealMax,
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
      formula: '0.5×TMAT(dangkal) + 0.25×Water + 0.25×Moist',
      ready: flood != null,
      missing: [!by.tmat && 'TMAT', !by.water && 'Water Level', !by.moisture && 'Soil Moisture'].filter(Boolean),
      ...floodSt,
    },
    {
      id: 'drought',
      title: 'Drought & Peat Fire EWS',
      formula: `Moisture <${TMAT_EWS.moisture.hydrophobicMax}% · Temp >${TMAT_EWS.soil_temp.bahaya}°C · Dry spell >${TMAT_EWS.rainfall.drySpellWaspadaDays} hari`,
      ready: drought != null,
      missing: [!by.moisture && 'Soil Moisture', !by.soil_temp && 'Soil Temp'].filter(Boolean),
      ...droughtSt,
    },
    {
      id: 'recharge',
      title: 'Aquifer Recharge Lag',
      formula: `Efficiency = ΔTMAT / Rainfall · target bulanan ≥${TMAT_EWS.rainfall.monthlyRechargeMinMm} mm`,
      ready: eff != null,
      missing: [!by.tmat && 'TMAT', !by.rainfall && 'Rainfall'].filter(Boolean),
      ...rechSt,
    },
  ];
}
