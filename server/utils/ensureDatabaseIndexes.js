const { query, getRow } = require('../config/database');

let ensured = false;

/**
 * Performance indexes aligned with hot query paths in routes/services.
 * Safe to run on every server start (CREATE INDEX IF NOT EXISTS).
 */
const INDEX_DEFINITIONS = [
  // alert_logs — Dashboard chart, /api/alert-logs, alert evaluation
  {
    table: 'alert_logs',
    name: 'idx_alert_logs_device_detected_at',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_alert_logs_device_detected_at
      ON alert_logs (device_id, detected_at DESC)
    `,
  },
  {
    table: 'alert_logs',
    name: 'idx_alert_logs_device_param_detected',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_alert_logs_device_param_detected
      ON alert_logs (device_id, parameter, detected_at DESC)
    `,
  },
  {
    table: 'alert_logs',
    name: 'idx_alert_logs_active_lookup',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_alert_logs_active_lookup
      ON alert_logs (alert_id, device_id, parameter, detected_at DESC)
      WHERE status = 'active'
    `,
  },
  {
    table: 'alert_logs',
    name: 'idx_alert_logs_detected_at',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_alert_logs_detected_at
      ON alert_logs (detected_at)
    `,
  },
  // sensor_readings — DISTINCT ON (sensor_type), latest-per-field, duplicate checks
  {
    table: 'sensor_readings',
    name: 'idx_sensor_readings_device_type_timestamp',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_type_timestamp
      ON sensor_readings (device_id, sensor_type, timestamp DESC)
    `,
  },
  // sensor_readings — mapped device datetime in metadata (/data-dash, device popup)
  {
    table: 'sensor_readings',
    name: 'idx_sensor_readings_device_metadata_datetime',
    optional: true,
    sql: `
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_metadata_datetime
      ON sensor_readings (
        device_id,
        ((metadata->>'datetime')::timestamptz) DESC NULLS LAST
      )
      WHERE metadata->>'datetime' IS NOT NULL AND metadata->>'datetime' <> ''
    `,
  },
];

async function tableExists(tableName) {
  const row = await getRow(`SELECT to_regclass($1) AS reg`, [`public.${tableName}`]);
  return row?.reg != null;
}

async function ensureDatabaseIndexes() {
  if (ensured) return;

  for (const def of INDEX_DEFINITIONS) {
    if (!(await tableExists(def.table))) {
      continue;
    }
    try {
      await query(def.sql);
    } catch (error) {
      if (def.optional) {
        console.warn(
          `ensureDatabaseIndexes: skipped optional index ${def.name}:`,
          error.message
        );
      } else {
        console.error(`ensureDatabaseIndexes: failed ${def.name}:`, error.message);
        throw error;
      }
    }
  }

  ensured = true;
}

function resetDatabaseIndexesCacheForTests() {
  ensured = false;
}

module.exports = {
  ensureDatabaseIndexes,
  resetDatabaseIndexesCacheForTests,
  INDEX_DEFINITIONS,
};
