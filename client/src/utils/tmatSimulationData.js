/**
 * Map live device fields → TMAT 3D simulation HUD + scene drivers.
 */

import { toNum } from './sparingAnalysis';
import {
  resolveTmatParamKey,
  TMAT_EWS,
  computePp57TmatRatio,
} from './tmatAnalysis';

/** Typical 12 V solar/battery span for bar display (V). */
export const BATTERY_V_MIN = 11.0;
export const BATTERY_V_MAX = 12.8;

/** HUD tank % range (matches sample-style display). */
export const TMAT_LEVEL_PCT_MIN = 22;
export const TMAT_LEVEL_PCT_MAX = 90;

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
  if (ratio == null) return { key: 'unknown', label: '—', color: '#64748B' };
  if (ratio >= 100) return { key: 'melebihi', label: 'MELEBIHI', color: '#DC2626' };
  if (ratio >= 75) return { key: 'waspada', label: 'WASPADA', color: '#EA580C' };
  return { key: 'aman', label: 'AMAN', color: '#16A34A' };
}

/**
 * @returns {{
 *   rain: number|null,
 *   soil: number|null,
 *   tmatRaw: number|null,
 *   levelPct: number|null,
 *   batteryV: number|null,
 *   batteryPct: number|null,
 *   pp57: ReturnType<typeof pp57StatusFromElevation>,
 *   keys: { rain?: string, soil?: string, tmat?: string, battery?: string },
 * }}
 */
export function buildTmatSimulationTelemetry(paramKeys, latestFields) {
  const keys = paramKeys || [];
  const fields = latestFields || {};
  const rainKey = resolveTmatParamKey(keys, 'rainfall');
  const soilKey = resolveTmatParamKey(keys, 'moisture');
  const tmatKey = resolveTmatParamKey(keys, 'tmat');
  const batteryKey = resolveTmatParamKey(keys, 'battery');

  const rain = rainKey != null ? toNum(fields[rainKey]) : null;
  const soil = soilKey != null ? toNum(fields[soilKey]) : null;
  const tmatRaw = tmatKey != null ? toNum(fields[tmatKey]) : null;
  const batteryV = batteryKey != null ? toNum(fields[batteryKey]) : null;

  return {
    rain,
    soil,
    tmatRaw,
    levelPct: tmatElevationToLevelPct(tmatRaw),
    batteryV,
    batteryPct: batteryVoltageToPct(batteryV),
    pp57: pp57StatusFromElevation(tmatRaw),
    keys: {
      rain: rainKey || undefined,
      soil: soilKey || undefined,
      tmat: tmatKey || undefined,
      battery: batteryKey || undefined,
    },
  };
}

export function hasTmatSimulationParams(paramKeys) {
  return Boolean(resolveTmatParamKey(paramKeys || [], 'tmat'));
}
