/**
 * Resolve a sensor reading value from the numeric column and/or metadata payload.
 * String status fields (e.g. KLHK Status) are stored with value NULL and text in metadata.
 */

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  return metadata;
}

function normalizeReadingValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const numValue = parseFloat(trimmed);
    return Number.isNaN(numValue) ? trimmed : numValue;
  }
  return value;
}

function extractPayloadField(metadata, ...fieldNames) {
  const meta = parseMetadata(metadata);
  const payload = meta.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;

  for (const fieldName of fieldNames) {
    if (!fieldName || !(fieldName in payload)) continue;
    const val = payload[fieldName];
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' && val.trim() === '') continue;
    return val;
  }
  return undefined;
}

function isNonNumericFieldValue(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number' && Number.isFinite(val)) return false;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return false;
    return Number.isNaN(Number(trimmed));
  }
  return true;
}

/**
 * @param {{ value?: *, metadata?: * }} row
 * @param {...string} fieldNames - payload keys / sensor_type aliases (source + target)
 */
function resolveSensorReadingValue(row, ...fieldNames) {
  if (!row) return null;

  if (row.value !== null && row.value !== undefined) {
    return normalizeReadingValue(row.value);
  }

  const meta = parseMetadata(row.metadata);
  if (meta.string_value !== null && meta.string_value !== undefined && meta.string_value !== '') {
    return normalizeReadingValue(meta.string_value);
  }

  const fromPayload = extractPayloadField(row.metadata, ...fieldNames);
  if (fromPayload !== undefined) {
    return normalizeReadingValue(fromPayload);
  }

  return null;
}

module.exports = {
  parseMetadata,
  normalizeReadingValue,
  extractPayloadField,
  isNonNumericFieldValue,
  resolveSensorReadingValue,
};
