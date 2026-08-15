const { getRows } = require('../../config/database');
const klhkConfig = require('./klhkConfigService');

const SLOT_MS = 2 * 60 * 1000;
const BIN_SECONDS = 120;

async function getEnabledSparingMappings(deviceId) {
  const rows = await klhkConfig.getSparingMappings(deviceId);
  return rows.filter((m) => m.enabled);
}

function parseNumericValue(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return parseNumericValue(value.value);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchReadingsInRange(deviceId, startMs, endMs, sensorFields) {
  if (!sensorFields.length) return [];
  return getRows(
    `SELECT sensor_type, value, timestamp
     FROM sensor_readings
     WHERE device_id = $1
       AND timestamp >= to_timestamp($2 / 1000.0)
       AND timestamp < to_timestamp($3 / 1000.0)
       AND lower(sensor_type) = ANY($4::text[])
     ORDER BY timestamp ASC`,
    [deviceId, startMs, endMs, sensorFields.map((f) => String(f).toLowerCase())]
  );
}

function sensorFieldLookup(mappings) {
  const byLower = new Map();
  for (const m of mappings) {
    byLower.set(String(m.sensor_field).toLowerCase(), m);
  }
  return byLower;
}

function rowMatchesMapping(row, lookup) {
  return lookup.get(String(row.sensor_type).toLowerCase());
}

function interpolateMissingData(records, hourTimestampMs, mappings) {
  const TARGET_COUNT = 30;
  const startTimeSeconds = Math.floor(hourTimestampMs / 1000);
  const fallbackByParam = {};
  for (const mapping of mappings) {
    const param = mapping.sparing_param;
    const values = records
      .map((r) => parseNumericValue(r[param]))
      .filter((value) => value !== null);
    fallbackByParam[param] =
      values.length > 0
        ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
        : 0;
  }
  const result = [];

  for (let i = 0; i < TARGET_COUNT; i++) {
    const expectedTime = startTimeSeconds + i * BIN_SECONDS;
    const existing = records.find((r) => r.datetime === expectedTime);
    const completed = { datetime: expectedTime, ...(existing || {}) };
    for (const mapping of mappings) {
      const param = mapping.sparing_param;
      if (parseNumericValue(completed[param]) === null) {
        completed[param] = fallbackByParam[param];
      }
    }
    result.push(completed);
  }
  return result;
}

async function collectHourlyData(deviceId, loggerId, hourTimestampMs, opts = {}) {
  const mappings = await getEnabledSparingMappings(deviceId);
  if (!mappings.length || !loggerId) return null;

  const startMs = hourTimestampMs;
  const endMs = hourTimestampMs + 60 * 60 * 1000;
  const lookup = sensorFieldLookup(mappings);
  const sensorFields = mappings.map((m) => m.sensor_field);
  const rows = await fetchReadingsInRange(deviceId, startMs, endMs, sensorFields);

  if (!rows.length) return null;

  const startSeconds = Math.floor(startMs / 1000);
  const dataByTimestamp = new Map();

  for (const row of rows) {
    const mapping = rowMatchesMapping(row, lookup);
    if (!mapping) continue;
    const tsMs = new Date(row.timestamp).getTime();
    const seconds = Math.floor(tsMs / 1000);
    const offset = seconds - startSeconds;
    const binIndex = Math.floor(offset / BIN_SECONDS);
    const binSeconds = startSeconds + binIndex * BIN_SECONDS;

    if (!dataByTimestamp.has(binSeconds)) {
      dataByTimestamp.set(binSeconds, { datetime: binSeconds });
    }
    const val = parseNumericValue(row.value);
    if (val != null) {
      dataByTimestamp.get(binSeconds)[mapping.sparing_param] = val;
    }
  }

  const collectedData = Array.from(dataByTimestamp.values()).sort((a, b) => a.datetime - b.datetime);

  if (collectedData.length < 30) {
    if (!opts.quiet) {
      console.log(`[KLHK SPARING ${deviceId}] Interpolating ${collectedData.length} records to 30`);
    }
  }

  // Also fills missing parameters inside an otherwise existing 2-minute slot.
  const dataArray = interpolateMissingData(collectedData, hourTimestampMs, mappings);
  return { uid: loggerId, data: dataArray };
}

async function collect2MinData(deviceId, loggerId, slotTimestampMs, opts = {}) {
  const mappings = await getEnabledSparingMappings(deviceId);
  if (!mappings.length || !loggerId) return null;

  const startMs = slotTimestampMs;
  const endMs = slotTimestampMs + SLOT_MS;
  const lookup = sensorFieldLookup(mappings);
  const sensorFields = mappings.map((m) => m.sensor_field);
  const rows = await fetchReadingsInRange(deviceId, startMs, endMs, sensorFields);

  if (!rows.length) {
    if (!opts.quiet) {
      console.log(`[KLHK SPARING ${deviceId}] No readings for slot ${new Date(slotTimestampMs).toISOString()}`);
    }
    return null;
  }

  const latestByField = new Map();
  for (const row of rows) {
    const mapping = rowMatchesMapping(row, lookup);
    if (!mapping) continue;
    latestByField.set(mapping.sparing_param, row);
  }

  const record = { datetime: Math.floor(slotTimestampMs / 1000) };
  for (const m of mappings) {
    const row = latestByField.get(m.sparing_param);
    if (row) {
      const val = parseNumericValue(row.value);
      if (val != null) record[m.sparing_param] = val;
    }
  }

  // The SPARING 2-minute endpoint expects one flat reading, unlike the
  // hourly endpoint which expects { uid, data: [...] }.
  return { uid: loggerId, ...record };
}

module.exports = {
  collectHourlyData,
  collect2MinData,
  getEnabledSparingMappings,
};
