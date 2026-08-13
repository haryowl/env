const VALUE_KINDS = {
  RATE: 'rate',
  CUMULATIVE: 'cumulative',
  LEVEL: 'level',
};

const VALID_VALUE_KINDS = new Set(Object.values(VALUE_KINDS));

function normalizeValueKind(value) {
  if (value === null || value === undefined || value === '' || value === 'auto') {
    return null;
  }
  return VALID_VALUE_KINDS.has(value) ? value : null;
}

module.exports = {
  VALUE_KINDS,
  VALID_VALUE_KINDS,
  normalizeValueKind,
};
