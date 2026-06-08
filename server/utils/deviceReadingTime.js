/**
 * Device reading time helpers.
 * Canonical time axis: mapper target field `datetime` (normalized UTC on ingest).
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

/**
 * Resolve mapped device datetime from a sensor_readings row.
 * Priority: metadata.datetime → metadata.payload.datetime (mapped target field).
 */
function resolveDeviceDatetimeFromReading(row) {
  if (!row) return null;

  if (row.datetime != null && row.datetime !== '') {
    return row.datetime;
  }

  const meta = parseMetadata(row.metadata);
  if (meta.datetime != null && meta.datetime !== '') {
    return meta.datetime;
  }

  const payload = meta.payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const fromPayload = payload.datetime;
    if (fromPayload != null && fromPayload !== '') {
      return fromPayload;
    }
  }

  return null;
}

function resolveServerReceivedAt(row) {
  const meta = parseMetadata(row?.metadata);
  return meta.serverReceivedAt || null;
}

function deviceReadingMergeKey(deviceId, deviceDatetime, fallbackTimestamp) {
  const timeKey = deviceDatetime || fallbackTimestamp || 'unknown';
  return `${deviceId}_${timeKey}`;
}

function compareDeviceTime(a, b) {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return ta - tb;
}

module.exports = {
  parseMetadata,
  resolveDeviceDatetimeFromReading,
  resolveServerReceivedAt,
  deviceReadingMergeKey,
  compareDeviceTime,
};
