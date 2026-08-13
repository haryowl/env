/** How a numeric field behaves for hourly chart aggregation. */
export const VALUE_KINDS = {
  RATE: 'rate',
  CUMULATIVE: 'cumulative',
  LEVEL: 'level',
};

export const VALUE_KIND_OPTIONS = [
  {
    value: 'auto',
    label: 'Auto (infer from unit)',
    helper: 'Recommended default. Rate for L/min, cumulative for rainfall, etc.',
  },
  {
    value: VALUE_KINDS.RATE,
    label: 'Rate (flow)',
    helper: 'Instantaneous rate (e.g. L/min). Total / hour = average × 60.',
  },
  {
    value: VALUE_KINDS.CUMULATIVE,
    label: 'Cumulative / counter',
    helper: 'Additive readings (rainfall mm, pulse counts). Total / hour = sum.',
  },
  {
    value: VALUE_KINDS.LEVEL,
    label: 'Level / instant',
    helper: 'Concentration or level (pH, mg/L, °C). Total / hour uses average.',
  },
];

function normalizeUnit(unit) {
  return String(unit || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/³/g, '3');
}

/**
 * Infer value kind from unit, category, and field name when not explicitly set.
 */
export function inferValueKind({ unit, category, fieldName } = {}) {
  const u = normalizeUnit(unit);
  const cat = String(category || '').toLowerCase();
  const name = String(fieldName || '').toLowerCase();

  if (
    cat.includes('flow') ||
    name.includes('debit') ||
    name.includes('flow') ||
    name.includes('discharge') ||
    name.includes('velocity')
  ) {
    if (!u.includes('mg/l') && !name.includes('ph')) {
      return VALUE_KINDS.RATE;
    }
  }

  if (
    /\/min|\/menit|\/sec|\/detik|l\/min|m3\/min|m³\/min|m3\/menit|liter\/min/.test(u)
  ) {
    return VALUE_KINDS.RATE;
  }

  if (
    /\bmm\b/.test(String(unit || '').toLowerCase()) ||
    name.includes('hujan') ||
    name.includes('rainfall') ||
    name.includes('curah') ||
    name.includes('counter') ||
    name.includes('totalizer') ||
    name.includes('pulse')
  ) {
    return VALUE_KINDS.CUMULATIVE;
  }

  return VALUE_KINDS.LEVEL;
}

/**
 * Minutes (or hours) multiplier to convert an average rate into a hourly total.
 * avg_rate × factor = total over one hour.
 */
export function getRateToHourlyFactor(unit) {
  const u = normalizeUnit(unit);
  if (/\/s(ec)?(\b|$)|\/detik/.test(u)) return 3600;
  if (/\/h(our)?(\b|$)|\/jam|\/hr(\b|$)/.test(u)) return 1;
  return 60;
}

/**
 * Resolve effective value kind from field metadata (explicit or inferred).
 * @param {string} fieldName
 * @param {Record<string, { valueKind?: string|null, unit?: string, category?: string, fieldName?: string }>} metadataMap
 */
export function getEffectiveValueKind(fieldName, metadataMap) {
  const meta = metadataMap?.[fieldName];
  const explicit = meta?.valueKind;
  if (explicit && explicit !== 'auto' && Object.values(VALUE_KINDS).includes(explicit)) {
    return explicit;
  }
  return inferValueKind({
    unit: meta?.unit,
    category: meta?.category,
    fieldName: meta?.fieldName || fieldName,
  });
}

/** Chart axis / legend unit when Total / hour converts a rate to an hourly total. */
export function getTotalHourDisplayUnit(unit, valueKind) {
  if (valueKind !== VALUE_KINDS.RATE || !unit) return unit || '';
  return String(unit)
    .replace(/\/min/gi, '/h')
    .replace(/\/menit/gi, '/jam')
    .replace(/\/sec/gi, '/h')
    .replace(/\/detik/gi, '/jam');
}

export function getChartDisplayUnit(fieldName, displayMode, metadataMap) {
  const meta = metadataMap?.[fieldName];
  const unit = meta?.unit || '';
  if (displayMode !== 'total_hour') return unit;
  const kind = getEffectiveValueKind(fieldName, metadataMap);
  return getTotalHourDisplayUnit(unit, kind);
}

export function valueKindLabel(kind) {
  const opt = VALUE_KIND_OPTIONS.find((o) => o.value === kind);
  if (opt) return opt.label;
  if (kind === VALUE_KINDS.RATE) return 'Rate';
  if (kind === VALUE_KINDS.CUMULATIVE) return 'Cumulative';
  if (kind === VALUE_KINDS.LEVEL) return 'Level';
  return 'Auto';
}
