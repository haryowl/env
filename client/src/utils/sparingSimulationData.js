/**
 * Map live device fields → SPARING 3D HUD + isometric channel drivers.
 */

import {
  toNum,
  resolveParamKey,
  normalizeKey,
  flowToM3PerSec,
  flowToM3PerMin,
  freeAmmoniaMgL,
  organicLoadKgDay,
} from './sparingAnalysis';

const EWS_COLORS = {
  aman: '#16A34A',
  waspada: '#EA580C',
  melebihi: '#DC2626',
  unknown: '#64748B',
  neutral: '#38BDF8',
};

/** Ceiling / safe-band heat ratio (0–120+), mirrors HeatRatioModal.computeHeatRatio. */
function computeHeatRatio(nilai, bakuMin, bakuMax) {
  const v = toNum(nilai);
  const mn = toNum(bakuMin);
  const mx = toNum(bakuMax);
  if (v == null) return null;
  if (mn != null && mx != null && mx > mn && mn !== 0) {
    const mid = (mn + mx) / 2;
    const half = (mx - mn) / 2;
    if (half <= 0) return null;
    return (Math.abs(v - mid) / half) * 100;
  }
  if (mx != null && (mn == null || mn === 0)) {
    if (mx === 0) return null;
    return (v / mx) * 100;
  }
  if (mn != null && mx == null) {
    if (v >= mn) return 0;
    if (mn === 0) return null;
    return ((mn - v) / Math.abs(mn)) * 100;
  }
  return null;
}

/** Fallback ceiling / band when device alerts are not configured. */
export const SPARING_DEFAULTS = {
  tss: { bakuMax: 100 },
  nh3n: { bakuMax: 25 },
  cod: { bakuMax: 100 },
  ph: { bakuMin: 6, bakuMax: 9 },
};

function statusFromRatio(ratio, { phBand = false } = {}) {
  if (ratio == null || !Number.isFinite(ratio)) {
    return { key: 'unknown', label: '—', color: EWS_COLORS.unknown, ratio: null };
  }
  if (ratio >= 100) {
    return { key: 'melebihi', label: 'MELEBIHI', color: EWS_COLORS.melebihi, ratio };
  }
  if (ratio >= 75) {
    return { key: 'waspada', label: 'WARNING', color: EWS_COLORS.waspada, ratio };
  }
  if (phBand) {
    return { key: 'aman', label: 'NEUTRAL', color: EWS_COLORS.neutral, ratio };
  }
  return { key: 'aman', label: 'OK', color: EWS_COLORS.aman, ratio };
}

function resolveThreshold(kind, fieldKey, alertThresholds = {}) {
  const key = normalizeKey(fieldKey || '');
  const thr = alertThresholds[key] || alertThresholds[fieldKey] || {};
  const def = SPARING_DEFAULTS[kind] || {};
  let bakuMin = thr.min != null ? Number(thr.min) : def.bakuMin ?? null;
  let bakuMax = thr.max != null ? Number(thr.max) : def.bakuMax ?? null;
  if (bakuMin === 0 && bakuMax != null && bakuMax > 0 && kind !== 'ph') {
    bakuMin = null;
  }
  return { bakuMin, bakuMax };
}

function readField(fields, key) {
  if (!key) return null;
  return toNum(fields?.[key]);
}

/** Approximate open-channel velocity (m/s) from volumetric flow. */
export function flowToChannelMs(flowValue, unitHint = '') {
  const q = flowToM3PerSec(flowValue, unitHint);
  if (q == null) return null;
  if (q <= 0) return 0;
  const areaM2 = 0.18; // ~0.6 m wide × 0.3 m deep visual channel
  return Math.max(0, Math.min(3.5, q / areaM2));
}

/**
 * Map live flow → clearly distinct 3D animation drivers.
 * Tuned so 0 / ~0.55 / ~1.8 m³/min read as stop / medium / fast.
 */
export function flowVisualDrivers(flowValue, unitHint = '') {
  const m3min = flowToM3PerMin(flowValue, unitHint);
  if (m3min == null) {
    return {
      flowM3Min: null,
      flowMs: null,
      flowSpeed: 0.9,
      impellerSpin: 4,
      waveAmp: 0.016,
      textureScroll: 0.014,
      particleDrift: 0.7,
    };
  }

  // Hard stop when effectively zero
  if (m3min <= 0.001) {
    return {
      flowM3Min: 0,
      flowMs: 0,
      flowSpeed: 0,
      impellerSpin: 0,
      waveAmp: 0,
      textureScroll: 0,
      particleDrift: 0,
    };
  }

  // Perceptual curve: 0.55 → ~1.0, 1.8 → ~2.4
  const flowSpeed = Math.min(2.8, 0.28 + m3min * 1.2);
  const flowMs = flowToChannelMs(flowValue, unitHint) ?? 0;
  return {
    flowM3Min: m3min,
    flowMs,
    flowSpeed,
    impellerSpin: flowSpeed * 5.8,
    waveAmp: Math.min(0.055, 0.01 + flowSpeed * 0.016),
    textureScroll: 0.006 + flowSpeed * 0.022,
    particleDrift: 0.25 + flowSpeed * 0.85,
  };
}

function phColor(ph) {
  const p = toNum(ph);
  if (p == null) return '#4FC3F7';
  if (p < 6) return '#E57373';
  if (p > 9) return '#7C4DFF';
  // lerp acidic red → neutral cyan → alkaline violet around mid 7.5
  if (p <= 7.5) {
    const t = (p - 6) / 1.5;
    return mixHex('#E57373', '#4FC3F7', Math.max(0, Math.min(1, t)));
  }
  const t = (p - 7.5) / 1.5;
  return mixHex('#4FC3F7', '#7C4DFF', Math.max(0, Math.min(1, t)));
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255;
  const ag = (pa >> 8) & 255;
  const ab = pa & 255;
  const br = (pb >> 16) & 255;
  const bg = (pb >> 8) & 255;
  const bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

export function buildSparingSimulationTelemetry(
  paramKeys,
  latestFields,
  fieldMetadata = {},
  alertThresholds = {},
  getUnit
) {
  const keys = paramKeys || [];
  const fields = latestFields || {};

  const tssKey = resolveParamKey(keys, 'tss');
  const nh3Key = resolveParamKey(keys, 'nh3n');
  const phKey = resolveParamKey(keys, 'ph');
  const codKey = resolveParamKey(keys, 'cod');
  const flowKey = resolveParamKey(keys, 'flow');

  const tss = readField(fields, tssKey);
  const nh3n = readField(fields, nh3Key);
  const ph = readField(fields, phKey);
  const cod = readField(fields, codKey);
  const flowRaw = readField(fields, flowKey);

  const flowUnit = flowKey && typeof getUnit === 'function'
    ? (getUnit(flowKey) || fieldMetadata?.[flowKey]?.unit || 'L/min')
    : (fieldMetadata?.[flowKey]?.unit || 'L/min');

  const flowDrivers = flowVisualDrivers(flowRaw, flowUnit);
  const freeNh3 = freeAmmoniaMgL(nh3n, ph);
  const load = organicLoadKgDay(cod, flowRaw, flowUnit);

  const thr = {
    tss: resolveThreshold('tss', tssKey, alertThresholds),
    nh3n: resolveThreshold('nh3n', nh3Key, alertThresholds),
    ph: resolveThreshold('ph', phKey, alertThresholds),
    cod: resolveThreshold('cod', codKey, alertThresholds),
  };

  const ratios = {
    tss: computeHeatRatio(tss, thr.tss.bakuMin, thr.tss.bakuMax),
    nh3n: computeHeatRatio(nh3n, thr.nh3n.bakuMin, thr.nh3n.bakuMax),
    ph: computeHeatRatio(ph, thr.ph.bakuMin, thr.ph.bakuMax),
    cod: computeHeatRatio(cod, thr.cod.bakuMin, thr.cod.bakuMax),
  };

  const status = {
    tss: statusFromRatio(ratios.tss),
    nh3n: statusFromRatio(ratios.nh3n),
    ph: statusFromRatio(ratios.ph, { phBand: true }),
    cod: statusFromRatio(ratios.cod),
  };

  const nh3Glow = nh3n != null && nh3n > 25;
  const waterTint = phColor(ph);

  // Stronger perceptual density: mid-range values already look busy
  const particles = {
    tssDensity: tss == null ? 0.15 : Math.min(1, Math.max(0, tss / 120)),
    nh3Density: nh3n == null ? 0.12 : Math.min(1, Math.max(0, nh3n / 30)),
    codDensity: cod == null ? 0.15 : Math.min(1, Math.max(0, cod / 140)),
    tssSettle: tss == null ? 0.4 : Math.min(1.6, 0.35 + (tss / 100)),
    codFlutter: cod == null ? 0.4 : Math.min(2.2, 0.4 + (cod / 90)),
    nh3Glow,
    nh3LightIntensity: nh3Glow ? Math.min(2.2, nh3n / 10) : 0.35,
  };

  const {
    flowMs,
    flowSpeed,
    impellerSpin,
    flowM3Min,
    waveAmp,
    textureScroll,
    particleDrift,
  } = flowDrivers;

  const probes = [
    {
      id: 'tss',
      label: 'TSS',
      fullName: 'TSS Probe · Suspended Solids',
      value: tss,
      unit: 'mg/L',
      status: status.tss,
      accent: false,
      note: tss == null ? 'No reading' : `Turbidity ${tss > 300 ? 'high' : 'normal'}`,
    },
    {
      id: 'nh3n',
      label: 'NH3-N',
      fullName: 'NH3-N Probe · Ammonia Nitrogen',
      value: nh3n,
      unit: 'mg/L',
      status: status.nh3n,
      accent: true,
      note: freeNh3 != null ? `Free NH₃ ${freeNh3.toFixed(3)} mg/L` : 'Awaiting pH × NH3-N',
    },
    {
      id: 'ph',
      label: 'PH',
      fullName: 'pH Probe · Acidity',
      value: ph,
      unit: '',
      status: status.ph,
      accent: false,
      note: thr.ph.bakuMin != null ? `Band ${thr.ph.bakuMin}–${thr.ph.bakuMax}` : 'Live pH',
    },
    {
      id: 'cod',
      label: 'COD',
      fullName: 'COD Probe · Oxygen Demand',
      value: cod,
      unit: 'mg/L',
      status: status.cod,
      accent: false,
      note: load != null ? `Load ${load.toFixed(1)} kg/hari` : 'Awaiting COD × Flow',
    },
  ];

  const alerts = [];
  probes.forEach((p) => {
    if (p.status.key === 'melebihi') {
      alerts.push({ level: 'melebihi', text: `${p.label} melebihi baku mutu` });
    } else if (p.status.key === 'waspada') {
      alerts.push({ level: 'waspada', text: `${p.label} mendekati baku mutu` });
    }
  });
  if (nh3Glow) {
    alerts.push({ level: 'waspada', text: 'NH3-N glow active · elevated ammonia' });
  }

  return {
    tss,
    nh3n,
    ph,
    cod,
    flowRaw,
    flowUnit,
    flowMs,
    flowM3Min,
    flowSpeed,
    impellerSpin,
    waveAmp,
    textureScroll,
    particleDrift,
    freeNh3,
    load,
    waterTint,
    particles,
    probes,
    status,
    ratios,
    thr,
    alerts,
    hasLive: [tss, nh3n, ph, cod, flowRaw].some((v) => v != null),
    keys: {
      tss: tssKey || undefined,
      nh3n: nh3Key || undefined,
      ph: phKey || undefined,
      cod: codKey || undefined,
      flow: flowKey || undefined,
    },
  };
}

export function hasSparingSimulationParams(paramKeys) {
  const keys = paramKeys || [];
  return Boolean(
    resolveParamKey(keys, 'tss')
    || resolveParamKey(keys, 'nh3n')
    || resolveParamKey(keys, 'ph')
    || resolveParamKey(keys, 'cod')
    || resolveParamKey(keys, 'flow')
  );
}
