/**
 * SPARING Table 1 analysis helpers (PermenLHK / EPA / KepMenLH references).
 * Flow is converted to m³/s when unit looks like L/min (platform default).
 */

export function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const PARAM_ALIASES = {
  ph: ['ph_value', 'ph', 'p_h'],
  cod: ['cod_mg_l', 'cod', 'cod_value'],
  tss: ['tss_mg_l', 'tss', 'tss_value'],
  nh3n: ['nh3n', 'nh3_n', 'nh3-n', 'ammonia', 'nh3n_mg_l'],
  flow: ['flow_rate', 'debit', 'flow', 'q', 'discharge'],
};

export function normalizeKey(p) {
  return String(p || '').toLowerCase().replace(/\s+/g, '_');
}

/** Resolve a logical SPARING param from a list of field keys / row.param values. */
export function resolveParamKey(keys, kind) {
  const aliases = PARAM_ALIASES[kind] || [];
  const list = (keys || []).map((k) => ({ raw: k, norm: normalizeKey(k) }));
  for (const a of aliases) {
    const hit = list.find((x) => x.norm === a || x.norm.includes(a));
    if (hit) return hit.raw;
  }
  return null;
}

export function isPhParam(paramKey) {
  const k = normalizeKey(paramKey);
  return k === 'ph' || k === 'ph_value' || k.includes('ph');
}

/**
 * Convert flow reading to m³/s for Load = COD × Q × 86.4.
 * Default platform unit is L/min.
 */
export function flowToM3PerSec(flowValue, unitHint = '') {
  const q = toNum(flowValue);
  if (q == null) return null;
  const u = String(unitHint || '').toLowerCase().replace(/\s+/g, '');
  if (/m3\/s|m³\/s|cms/.test(u)) return q;
  // m³/min before m³/h so "m3/min" is not missed (no match on /h)
  if (/m3\/min|m³\/min|m3\/menit|m³\/menit/.test(u)) return q / 60;
  if (/m3\/h|m³\/h|m3\/jam|m³\/jam/.test(u)) return q / 3600;
  if (/m3\/d|m³\/d|m3\/hari|m³\/hari/.test(u)) return q / 86400;
  if (/l\/s|liter\/s|lps/.test(u)) return q / 1000;
  if (/l\/h|liter\/h/.test(u)) return q / 1000 / 3600;
  // L/min (default) and bare "l/min"
  return q / 60000;
}

/** Flow reading as m³/min for display / 3D mapping. */
export function flowToM3PerMin(flowValue, unitHint = '') {
  const q = flowToM3PerSec(flowValue, unitHint);
  if (q == null) return null;
  return q * 60;
}

/** Organic pollution load (kg/day). */
export function organicLoadKgDay(codMgL, flowValue, flowUnit) {
  const cod = toNum(codMgL);
  const q = flowToM3PerSec(flowValue, flowUnit);
  if (cod == null || q == null) return null;
  return cod * q * 86.4;
}

/** Free (unionized) ammonia NH3 from NH3-N and pH (pKa 9.25 @ 25°C). */
export function freeAmmoniaMgL(nh3n, ph, pKa = 9.25) {
  const n = toNum(nh3n);
  const p = toNum(ph);
  if (n == null || p == null) return null;
  return n / (1 + 10 ** (pKa - p));
}

export function codTssRatio(cod, tss) {
  const c = toNum(cod);
  const t = toNum(tss);
  if (c == null || t == null || t === 0) return null;
  return c / t;
}

/**
 * WWTP performance index IP = Σ(Ci/BMu) / n over available params.
 * Ceiling: Ci/BMu = nilai/max. Band (pH): |nilai−mid|/half (0 at ideal, 1 at edge).
 */
export function wwtpPerformanceIndex(entries) {
  const parts = [];
  (entries || []).forEach(({ nilai, bakuMin, bakuMax }) => {
    const v = toNum(nilai);
    const mn = toNum(bakuMin);
    const mx = toNum(bakuMax);
    if (v == null) return;
    if (mn != null && mx != null && mx > mn && mn > 0) {
      const mid = (mn + mx) / 2;
      const half = (mx - mn) / 2;
      if (half > 0) parts.push(Math.abs(v - mid) / half);
      return;
    }
    if (mx != null && mx !== 0) {
      parts.push(v / mx);
    }
  });
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export function loadStatus(loadKgDay, loadBakuKgDay) {
  if (loadKgDay == null) return { key: 'unknown', label: '—', color: '#64748B', detail: '' };
  if (loadBakuKgDay == null || loadBakuKgDay <= 0) {
    return {
      key: 'info',
      label: 'HITUNG',
      color: '#38BDF8',
      detail: `${fmtLoad(loadKgDay)} kg/hari`,
      ratio: null,
    };
  }
  const pct = (loadKgDay / loadBakuKgDay) * 100;
  if (pct >= 100) return { key: 'melebihi', label: 'MELEBIHI', color: '#DC2626', detail: `${fmtLoad(loadKgDay)} kg/hari`, ratio: pct };
  if (pct >= 50) return { key: 'waspada', label: 'WASPADA', color: '#EA580C', detail: `${fmtLoad(loadKgDay)} kg/hari`, ratio: pct };
  return { key: 'aman', label: 'AMAN', color: '#16A34A', detail: `${fmtLoad(loadKgDay)} kg/hari`, ratio: pct };
}

export function nh3Status(nh3) {
  if (nh3 == null) return { key: 'unknown', label: '—', color: '#64748B', detail: '', ratio: null };
  const ratio = (nh3 / 0.5) * 100;
  if (nh3 >= 0.5) return { key: 'melebihi', label: 'MELEBIHI', color: '#DC2626', detail: `${nh3.toFixed(3)} mg/L NH₃ bebas`, ratio };
  if (nh3 >= 0.02) return { key: 'waspada', label: 'WASPADA', color: '#EA580C', detail: `${nh3.toFixed(3)} mg/L NH₃ bebas`, ratio };
  return { key: 'aman', label: 'AMAN', color: '#16A34A', detail: `${nh3.toFixed(3)} mg/L NH₃ bebas (biota)`, ratio };
}

export function codTssStatus(ratio) {
  if (ratio == null) return { key: 'unknown', label: '—', color: '#64748B', detail: '', ratio: null };
  const heat = (ratio / 1.5) * 100;
  if (ratio >= 1.5) return { key: 'melebihi', label: 'KIMIA', color: '#DC2626', detail: `${ratio.toFixed(2)} COD/TSS · dissolved chemical`, ratio: heat };
  if (ratio >= 0.8) return { key: 'waspada', label: 'CAMPURAN', color: '#CA8A04', detail: `${ratio.toFixed(2)} COD/TSS · mixed sewage`, ratio: heat };
  return { key: 'aman', label: 'FISIK', color: '#16A34A', detail: `${ratio.toFixed(2)} COD/TSS · physical dominant`, ratio: heat };
}

export function wwtpStatus(ip) {
  if (ip == null) return { key: 'unknown', label: '—', color: '#64748B', detail: '', ratio: null };
  const heat = (ip / 2) * 100;
  if (ip >= 2) return { key: 'melebihi', label: 'KRITIS', color: '#DC2626', detail: `IP ${ip.toFixed(2)} · IPAL fail`, ratio: heat };
  if (ip >= 1) return { key: 'waspada', label: 'WASPADA', color: '#EA580C', detail: `IP ${ip.toFixed(2)} · 1–2 param fail`, ratio: heat };
  return { key: 'aman', label: 'AMAN', color: '#16A34A', detail: `IP ${ip.toFixed(2)}`, ratio: heat };
}

function fmtLoad(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(1);
  return n.toFixed(3);
}

/**
 * Build SPARING derived cards from editable heat rows + unit lookup.
 */
export function buildSparingCards(rows, getUnit) {
  const byKind = {};
  const keys = (rows || []).map((r) => r.param);
  Object.keys(PARAM_ALIASES).forEach((kind) => {
    const key = resolveParamKey(keys, kind);
    if (key) byKind[kind] = (rows || []).find((r) => r.param === key);
  });

  const ph = byKind.ph;
  const cod = byKind.cod;
  const tss = byKind.tss;
  const nh3n = byKind.nh3n;
  const flow = byKind.flow;

  const flowUnit = flow && getUnit ? getUnit(flow.param) : 'L/min';
  const load = organicLoadKgDay(cod?.nilai, flow?.nilai, flowUnit);
  const codBaku = toNum(cod?.bakuMax) ?? toNum(cod?.bakuMin);
  const loadBaku = organicLoadKgDay(codBaku, flow?.nilai, flowUnit);
  const nh3 = freeAmmoniaMgL(nh3n?.nilai, ph?.nilai);
  const ct = codTssRatio(cod?.nilai, tss?.nilai);

  const ipEntries = [ph, cod, tss, nh3n].filter(Boolean).map((r) => ({
    nilai: r.nilai,
    bakuMin: r.bakuMin,
    bakuMax: r.bakuMax,
  }));
  const ip = wwtpPerformanceIndex(ipEntries);

  return [
    {
      id: 'organic_load',
      title: 'Organic Load (COD × Flow)',
      formula: 'Load = COD × Q × 86.4',
      ready: load != null,
      missing: [!cod && 'COD', !flow && 'Flow'].filter(Boolean),
      ...loadStatus(load, loadBaku),
      primary: load != null ? `${fmtLoad(load)} kg/hari` : '—',
    },
    {
      id: 'toxic_nh3',
      title: 'Toxic Ammonia Risk (NH₃N × pH)',
      formula: 'NH₃ = NH₃N / (1 + 10^(9.25 − pH))',
      ready: nh3 != null,
      missing: [!nh3n && 'NH3N', !ph && 'pH'].filter(Boolean),
      ...nh3Status(nh3),
      primary: nh3 != null ? `${nh3.toFixed(3)} mg/L` : '—',
    },
    {
      id: 'cod_tss',
      title: 'Physical vs Chemical (TSS vs COD)',
      formula: 'Ratio = COD / TSS',
      ready: ct != null,
      missing: [!cod && 'COD', !tss && 'TSS'].filter(Boolean),
      ...codTssStatus(ct),
      primary: ct != null ? `${ct.toFixed(2)} COD/TSS` : '—',
    },
    {
      id: 'wwtp_ip',
      title: 'WWTP Performance',
      formula: 'IP = Σ(Ci/BMu) / n',
      ready: ip != null,
      missing: ipEntries.length < 2 ? ['need ≥2 params with baku'] : [],
      ...wwtpStatus(ip),
      primary: ip != null ? `IP ${ip.toFixed(2)}` : '—',
    },
  ];
}
