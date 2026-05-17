const moment = require('moment-timezone');
const { getRow } = require('../config/database');

function hasExplicitTimezone(datetime) {
  const s = String(datetime).trim();
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s) || /\dT\d.*(?:Z|[+-]\d{2}:?\d{2})/i.test(s);
}

/**
 * Normalize device payload datetime to UTC ISO string for storage.
 * ISO strings with Z/offset are always treated as that instant (not reinterpreted in device TZ).
 * Naive strings are parsed in deviceTimezone (mapper assignment TZ preferred).
 */
function normalizeDatetimeToUtc(datetime, deviceTimezone = 'UTC') {
  if (datetime == null || datetime === '') return null;
  const s = String(datetime).trim();
  if (hasExplicitTimezone(s)) {
    const m = moment.parseZone(s);
    return m.isValid() ? m.utc().toISOString() : moment.utc(s).toISOString();
  }
  const tz = deviceTimezone && deviceTimezone !== 'UTC' ? deviceTimezone : 'UTC';
  if (tz === 'UTC') {
    return moment.utc(s).toISOString();
  }
  const local = moment.tz(s, tz);
  return local.isValid() ? local.utc().toISOString() : moment.utc(s).toISOString();
}

async function getEffectiveDeviceTimezone(deviceId) {
  const row = await getRow(
    `SELECT d.timezone AS device_tz, dma.timezone AS assignment_tz
     FROM devices d
     LEFT JOIN device_mapper_assignments dma ON dma.device_id = d.device_id
     WHERE d.device_id = $1`,
    [deviceId]
  );
  return row?.assignment_tz || row?.device_tz || 'UTC';
}

async function enrichDeviceWithEffectiveTimezone(device) {
  if (!device?.device_id) return device;
  const effectiveTimezone = await getEffectiveDeviceTimezone(device.device_id);
  return { ...device, timezone: effectiveTimezone, effective_timezone: effectiveTimezone };
}

module.exports = {
  hasExplicitTimezone,
  normalizeDatetimeToUtc,
  getEffectiveDeviceTimezone,
  enrichDeviceWithEffectiveTimezone,
};
