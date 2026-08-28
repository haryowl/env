/**
 * Map live device fields → TMAT 3D simulation HUD + scene drivers.
 */

import { toNum } from './sparingAnalysis';
import {
  resolveTmatParamKey,
  TMAT_EWS,
  computePp57TmatRatio,
  consecutiveDryHours,
} from './tmatAnalysis';

/** Typical 12 V solar/battery span for bar display (V). */
export const BATTERY_V_MIN = 11.0;
export const BATTERY_V_MAX = 12.8;

/** HUD tank % range (matches sample-style display). */
export const TMAT_LEVEL_PCT_MIN = 22;
export const TMAT_LEVEL_PCT_MAX = 90;

const EWS_COLORS = {
  aman: '#16A34A',
  waspada: '#EA580C',
  melebihi: '#DC2626',
  unknown: '#64748B',
};

/**
 * Signed TMAT elevation (m) → tank fill % for 3D + HUD.
 * 0 m (surface) → 90%; −0.40 m (PP57) → 22%; deeper → clamp min.
 */
export function tmatElevationToLevelPct(elevationM) {
  const v = toNum(elevationM);
  if (v == null) return null;
  const span = TMAT_LEVEL_PCT_MAX - TMAT_LEVEL_PCT_MIN;
  if (v >= 0) return TMAT_LEVEL_PCT_MAX;
  const pct = TMAT_LEVEL_PCT_MAX + (v / Math.abs(TMAT_EWS.tmat.bakuMutuM)) * span;
  return Math.max(5, Math.min(TMAT_LEVEL_PCT_MAX, pct));
}

/** Battery voltage (V) → 0–100% bar for HUD. */
export function batteryVoltageToPct(volts) {
  const v = toNum(volts);
  if (v == null) return null;
  const span = BATTERY_V_MAX - BATTERY_V_MIN;
  if (span <= 0) return null;
  return Math.max(0, Math.min(100, ((v - BATTERY_V_MIN) / span) * 100));
}

export function pp57StatusFromElevation(elevationM) {
  const ratio = computePp57TmatRatio(elevationM);
  if (ratio == null) return { key: 'unknown', label: '—', color: EWS_COLORS.unknown, detail: '' };
  if (ratio >= 100) {
    return {
      key: 'melebihi',
      label: 'MELEBIHI',
      color: EWS_COLORS.melebihi,
      detail: `Di luar / melewati baku mutu ${TMAT_EWS.tmat.bakuMutuM} m`,
    };
  }
  if (ratio >= 75) {
    return {
      key: 'waspada',
      label: 'WASPADA',
      color: EWS_COLORS.waspada,
      detail: 'Mendekati baku mutu PP 57/2016',
    };
  }
  return {
    key: 'aman',
    label: 'AMAN',
    color: EWS_COLORS.aman,
    detail: `Dalam zona 0 … ${TMAT_EWS.tmat.amanMin} m`,
  };
}

export function moistureEwsStatus(moisture) {
  const m = toNum(moisture);
  if (m == null) return { key: 'unknown', label: '—', color: EWS_COLORS.unknown, detail: '' };
  const e = TMAT_EWS.moisture;
  if (m < e.hydrophobicMax) {
    return { key: 'melebihi', label: 'KRITIS', color: EWS_COLORS.melebihi, detail: `Hidrofobik · < ${e.hydrophobicMax}% VWC` };
  }
  if (m <= e.waspadaMax) {
    return { key: 'waspada', label: 'WASPADA', color: EWS_COLORS.waspada, detail: `Stress ${e.waspadaMin}–${e.waspadaMax}%` };
  }
  if (m >= e.idealMin && m <= e.idealMax) {
    return { key: 'aman', label: 'AMAN', color: EWS_COLORS.aman, detail: `Ideal ${e.idealMin}–${e.idealMax}%` };
  }
  return { key: 'waspada', label: 'WASPADA', color: EWS_COLORS.waspada, detail: m > e.idealMax ? 'Jenuh / saturasi' : 'Di bawah ideal' };
}

export function rainfallEwsStatus(rain, dryDays) {
  const r = toNum(rain);
  const e = TMAT_EWS.rainfall;
  if (dryDays != null && dryDays >= e.drySpellBahayaDays) {
    return { key: 'melebihi', label: 'DRY SPELL', color: EWS_COLORS.melebihi, detail: `${dryDays.toFixed(0)} hari tanpa hujan` };
  }
  if (dryDays != null && dryDays >= e.drySpellWaspadaDays) {
    return { key: 'waspada', label: 'SIAGA 1', color: EWS_COLORS.waspada, detail: `${dryDays.toFixed(0)} hari kering · BMKG` };
  }
  if (r == null) return { key: 'unknown', label: '—', color: EWS_COLORS.unknown, detail: '' };
  if (r < e.dailyLowMm) {
    return { key: 'waspada', label: 'RENDAH', color: EWS_COLORS.waspada, detail: `< ${e.dailyLowMm} mm/h` };
  }
  return { key: 'aman', label: 'OK', color: EWS_COLORS.aman, detail: 'Curah hujan terdistribusi' };
}

export function batteryEwsStatus(volts, pct) {
  const v = toNum(volts);
  if (v == null) return { key: 'unknown', label: '—', color: EWS_COLORS.unknown, detail: '' };
  if (pct != null && pct <= 15) {
    return { key: 'melebihi', label: 'KRITIS', color: EWS_COLORS.melebihi, detail: 'Tegangan sangat rendah' };
  }
  if (pct != null && pct <= 35) {
    return { key: 'waspada', label: 'WASPADA', color: EWS_COLORS.waspada, detail: 'Tegangan rendah' };
  }
  return { key: 'aman', label: 'OK', color: EWS_COLORS.aman, detail: `${BATTERY_V_MIN}–${BATTERY_V_MAX} V span` };
}

/** Scene animation speeds tied to live telemetry magnitude. */
export function buildFlowDrivers({ rain, soil, levelPct }) {
  const rainNorm = rain != null ? Math.min(1, Math.max(0, rain / 25)) : 0.12;
  const soilNorm = soil != null ? Math.min(1, Math.max(0, soil / 85)) : 0.25;
  const levelNorm = levelPct != null ? Math.min(1, Math.max(0, levelPct / 100)) : 0.45;
  return {
    rainSpeed: 0.1 + rainNorm * 0.42,
    soilSpeed: 0.08 + soilNorm * 0.32,
    tmatSpeed: 0.12 + levelNorm * 0.38,
    rainIntensity: rainNorm,
    soilIntensity: soilNorm,
    tmatIntensity: levelNorm,
    showRain: rain != null && rain > 0.05,
    showFlow: rain != null || soil != null || levelPct != null,
  };
}

export function buildEwsAlerts({ soil, rain, dryDays, tmatRaw, soilTemp }) {
  const alerts = [];
  const m = toNum(soil);
  const temp = toNum(soilTemp);
  if (m != null && m < TMAT_EWS.moisture.hydrophobicMax) {
    alerts.push({ level: 'melebihi', text: 'Gambut hidrofobik — irreversible drying risk' });
  }
  if (temp != null && temp >= TMAT_EWS.soil_temp.smoldering) {
    alerts.push({ level: 'melebihi', text: `Smoldering risk · suhu tanah ≥ ${TMAT_EWS.soil_temp.smoldering}°C` });
  } else if (temp != null && temp > TMAT_EWS.soil_temp.bahaya) {
    alerts.push({ level: 'waspada', text: 'Suhu tanah tinggi · vegetasi / ET stress' });
  }
  if (dryDays != null && dryDays >= TMAT_EWS.rainfall.drySpellWaspadaDays) {
    alerts.push({ level: dryDays >= TMAT_EWS.rainfall.drySpellBahayaDays ? 'melebihi' : 'waspada', text: `Dry spell ${dryDays.toFixed(0)} hari · percepatan penurunan TMAT` });
  }
  const tmatSt = pp57StatusFromElevation(tmatRaw);
  if (tmatSt.key === 'melebihi') {
    alerts.push({ level: 'melebihi', text: tmatSt.detail });
  }
  if (m != null && m >= TMAT_EWS.moisture.idealMin && m <= TMAT_EWS.moisture.idealMax && (rain == null || rain > TMAT_EWS.rainfall.dailyLowMm)) {
    alerts.push({ level: 'aman', text: 'Kondisi gambut dalam zona operasional ideal' });
  }
  return alerts.slice(0, 4);
}

/** Water/tank tint from PP57 status. */
export function statusWaterColors(statusKey) {
  if (statusKey === 'melebihi') {
    return { water: '#ef5350', emissive: '#b71c1c', glass: '#ffab91' };
  }
  if (statusKey === 'waspada') {
    return { water: '#ffa726', emissive: '#e65100', glass: '#ffe0b2' };
  }
  return { water: '#29b6f6', emissive: '#00bcd4', glass: '#81d4fa' };
}

/**
 * @returns full telemetry bundle for HUD + 3D scene
 */
export function buildTmatSimulationTelemetry(paramKeys, latestFields, history) {
  const keys = paramKeys || [];
  const fields = latestFields || {};
  const rainKey = resolveTmatParamKey(keys, 'rainfall');
  const soilKey = resolveTmatParamKey(keys, 'moisture');
  const tmatKey = resolveTmatParamKey(keys, 'tmat');
  const batteryKey = resolveTmatParamKey(keys, 'battery');
  const tempKey = resolveTmatParamKey(keys, 'soil_temp');

  const rain = rainKey != null ? toNum(fields[rainKey]) : null;
  const soil = soilKey != null ? toNum(fields[soilKey]) : null;
  const tmatRaw = tmatKey != null ? toNum(fields[tmatKey]) : null;
  const batteryV = batteryKey != null ? toNum(fields[batteryKey]) : null;
  const soilTemp = tempKey != null ? toNum(fields[tempKey]) : null;
  const levelPct = tmatElevationToLevelPct(tmatRaw);
  const batteryPct = batteryVoltageToPct(batteryV);

  const dryHours = rainKey ? consecutiveDryHours(history, rainKey) : null;
  const dryDays = dryHours != null ? dryHours / 24 : null;

  const pp57 = pp57StatusFromElevation(tmatRaw);
  const ews = {
    rain: rainfallEwsStatus(rain, dryDays),
    soil: moistureEwsStatus(soil),
    battery: batteryEwsStatus(batteryV, batteryPct),
    tmat: pp57,
  };

  return {
    rain,
    soil,
    soilTemp,
    tmatRaw,
    levelPct,
    batteryV,
    batteryPct,
    dryHours,
    dryDays,
    pp57,
    ews,
    waterColors: statusWaterColors(pp57.key),
    flowDrivers: buildFlowDrivers({ rain, soil, levelPct }),
    alerts: buildEwsAlerts({ soil, rain, dryDays, tmatRaw, soilTemp }),
    keys: {
      rain: rainKey || undefined,
      soil: soilKey || undefined,
      tmat: tmatKey || undefined,
      battery: batteryKey || undefined,
      soil_temp: tempKey || undefined,
    },
  };
}

export function hasTmatSimulationParams(paramKeys) {
  return Boolean(resolveTmatParamKey(paramKeys || [], 'tmat'));
}
