const { getRow, getRows, query } = require('../config/database');

function parseDeviceConfig(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw || {};
}

/**
 * Collect unique JSON keys ever seen on payloads for a device (for Device Mapper source fields).
 */
async function getDiscoveredPayloadFields(deviceId) {
  const fieldSet = new Set();

  const device = await getRow('SELECT config FROM devices WHERE device_id = $1', [deviceId]);
  if (device?.config) {
    const cfg = parseDeviceConfig(device.config);
    const observed = cfg.observed_payload_fields;
    if (Array.isArray(observed)) {
      observed.forEach((k) => {
        if (k && String(k).trim()) fieldSet.add(String(k).trim());
      });
    }
  }

  try {
    const keyRows = await getRows(
      `SELECT DISTINCT key
       FROM sensor_readings sr,
       LATERAL jsonb_object_keys(COALESCE(sr.metadata->'payload', '{}'::jsonb)) AS key
       WHERE sr.device_id = $1
         AND sr.timestamp > NOW() - INTERVAL '90 days'`,
      [deviceId]
    );
    keyRows.forEach((row) => {
      if (row?.key) fieldSet.add(String(row.key));
    });
  } catch (e) {
    console.warn('payloadFieldDiscovery: metadata key scan failed:', e.message);
  }

  const sensorTypes = await getRows(
    `SELECT DISTINCT sensor_type AS key
     FROM sensor_readings
     WHERE device_id = $1
       AND sensor_type IS NOT NULL
       AND TRIM(sensor_type) <> ''
       AND timestamp > NOW() - INTERVAL '90 days'`,
    [deviceId]
  );
  sensorTypes.forEach((row) => {
    if (row?.key) fieldSet.add(String(row.key));
  });

  return [...fieldSet].sort((a, b) => a.localeCompare(b));
}

/**
 * Merge keys from a payload into devices.config.observed_payload_fields.
 */
async function mergeObservedPayloadFields(deviceId, payload) {
  if (!deviceId || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }

  const incoming = Object.keys(payload).filter((k) => k && k !== 'metadata');
  if (!incoming.length) return [];

  const device = await getRow('SELECT config FROM devices WHERE device_id = $1', [deviceId]);
  if (!device) return incoming;

  const cfg = parseDeviceConfig(device.config);
  const existing = Array.isArray(cfg.observed_payload_fields) ? cfg.observed_payload_fields : [];
  const merged = [...new Set([...existing, ...incoming])].sort((a, b) => a.localeCompare(b));

  const changed =
    merged.length !== existing.length || merged.some((k, i) => k !== existing[i]);
  if (changed) {
    const next = { ...cfg, observed_payload_fields: merged };
    await query('UPDATE devices SET config = $1::jsonb, updated_at = NOW() WHERE device_id = $2', [
      JSON.stringify(next),
      deviceId,
    ]);
  }

  return merged;
}

module.exports = {
  getDiscoveredPayloadFields,
  mergeObservedPayloadFields,
  parseDeviceConfig,
};
