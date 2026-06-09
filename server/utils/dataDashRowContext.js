const { parseMetadata, normalizeReadingValue } = require('./sensorReadingValue');

function rowDeviceDatetime(row, meta) {
  if (row?.datetime != null && row.datetime !== '') return row.datetime;
  if (meta.datetime != null && meta.datetime !== '') return meta.datetime;
  const payload = meta.payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const fromPayload = payload.datetime;
    if (fromPayload != null && fromPayload !== '') return fromPayload;
  }
  return null;
}

function rowServerReceivedAt(meta) {
  return meta.serverReceivedAt || null;
}

function payloadFieldFromMeta(meta, ...fieldNames) {
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

function resolveReadingValueWithMeta(row, meta, ...fieldNames) {
  if (!row) return null;

  if (row.value !== null && row.value !== undefined) {
    return normalizeReadingValue(row.value);
  }

  if (meta.string_value !== null && meta.string_value !== undefined && meta.string_value !== '') {
    return normalizeReadingValue(meta.string_value);
  }

  const fromPayload = payloadFieldFromMeta(meta, ...fieldNames);
  if (fromPayload !== undefined) {
    return normalizeReadingValue(fromPayload);
  }

  return null;
}

function enrichSensorRow(row) {
  const meta = parseMetadata(row.metadata);
  return {
    row,
    meta,
    deviceDatetime: rowDeviceDatetime(row, meta),
    serverReceivedAt: rowServerReceivedAt(meta),
  };
}

module.exports = {
  enrichSensorRow,
  resolveReadingValueWithMeta,
  payloadFieldFromMeta,
};
