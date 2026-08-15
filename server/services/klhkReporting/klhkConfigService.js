const { getRow, getRows, query } = require('../../config/database');
const { ensureKlhkReportingSchema } = require('../../utils/ensureKlhkReportingSchema');
const {
  SPARING_PARAMS,
  TMAT_PARAMS,
  REPORTING_TYPES,
  SEND_MODES,
} = require('./klhkConstants');

function maskSecret(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 12))}${value.slice(-2)}`;
}

function rowToConfig(row) {
  if (!row) return null;
  return {
    device_id: row.device_id,
    reporting_type: row.reporting_type || 'off',
    backup_running: Boolean(row.backup_running),
    retry_max_attempts: row.retry_max_attempts,
    retry_interval_minutes: row.retry_interval_minutes,
    last_started_at: row.last_started_at,
    last_stopped_at: row.last_stopped_at,
    last_started_by: row.last_started_by,
    last_stopped_by: row.last_stopped_by,
    logger_id: row.logger_id || '',
    api_secret_set: Boolean(row.api_secret),
    api_secret_masked: row.api_secret ? maskSecret(row.api_secret) : null,
    api_secret_fetched_at: row.api_secret_fetched_at,
    api_base: row.api_base || '',
    api_secret_url: row.api_secret_url || '',
    api_send_hourly_url: row.api_send_hourly_url || '',
    api_send_2min_url: row.api_send_2min_url || '',
    api_testing_url: row.api_testing_url || '',
    send_mode: row.send_mode || 'hourly',
    last_hourly_send: row.last_hourly_send,
    last_2min_send: row.last_2min_send,
    retry_all_failed_on_reconnect: Boolean(row.retry_all_failed_on_reconnect),
    device_id_unik: row.device_id_unik || '',
    api_key_set: Boolean(row.api_key),
    api_key_masked: row.api_key ? maskSecret(row.api_key) : null,
    api_url: row.api_url || '',
    push_interval_seconds: row.push_interval_seconds ?? 60,
    last_send: row.last_send,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getConfig(deviceId) {
  await ensureKlhkReportingSchema();
  const row = await getRow('SELECT * FROM klhk_device_config WHERE device_id = $1', [deviceId]);
  return rowToConfig(row);
}

async function getOrCreateConfig(deviceId) {
  let cfg = await getConfig(deviceId);
  if (cfg) return cfg;
  await ensureKlhkReportingSchema();
  await query(
    `INSERT INTO klhk_device_config (device_id, reporting_type, backup_running)
     VALUES ($1, 'off', false)
     ON CONFLICT (device_id) DO NOTHING`,
    [deviceId]
  );
  return getConfig(deviceId);
}

async function updateConfig(deviceId, patch) {
  await getOrCreateConfig(deviceId);
  const reportingType = patch.reporting_type;
  if (reportingType != null && !REPORTING_TYPES.has(reportingType)) {
    throw new Error(`Invalid reporting_type: ${reportingType}`);
  }
  if (patch.send_mode != null && !SEND_MODES.has(patch.send_mode)) {
    throw new Error(`Invalid send_mode: ${patch.send_mode}`);
  }

  if (reportingType === 'off' && patch.backup_running !== true) {
    patch = { ...patch, backup_running: false };
  }

  const fields = [];
  const values = [];
  let idx = 1;

  const allowed = {
    reporting_type: 'reporting_type',
    backup_running: 'backup_running',
    retry_max_attempts: 'retry_max_attempts',
    retry_interval_minutes: 'retry_interval_minutes',
    logger_id: 'logger_id',
    api_secret: 'api_secret',
    api_secret_fetched_at: 'api_secret_fetched_at',
    api_base: 'api_base',
    api_secret_url: 'api_secret_url',
    api_send_hourly_url: 'api_send_hourly_url',
    api_send_2min_url: 'api_send_2min_url',
    api_testing_url: 'api_testing_url',
    send_mode: 'send_mode',
    retry_all_failed_on_reconnect: 'retry_all_failed_on_reconnect',
    device_id_unik: 'device_id_unik',
    api_key: 'api_key',
    api_url: 'api_url',
    push_interval_seconds: 'push_interval_seconds',
    last_hourly_send: 'last_hourly_send',
    last_2min_send: 'last_2min_send',
    last_send: 'last_send',
  };

  for (const [key, col] of Object.entries(allowed)) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = $${idx++}`);
      values.push(patch[key]);
    }
  }

  if (!fields.length) return getConfig(deviceId);

  fields.push(`updated_at = NOW()`);
  values.push(deviceId);

  await query(
    `UPDATE klhk_device_config SET ${fields.join(', ')} WHERE device_id = $${idx}`,
    values
  );
  return getConfig(deviceId);
}

async function getSparingMappings(deviceId) {
  await ensureKlhkReportingSchema();
  return getRows(
    `SELECT id, device_id, sparing_param, sensor_field, enabled, created_at
     FROM klhk_sparing_mappings WHERE device_id = $1 ORDER BY sparing_param`,
    [deviceId]
  );
}

async function getTmatMappings(deviceId) {
  await ensureKlhkReportingSchema();
  return getRows(
    `SELECT id, device_id, tmat_param, sensor_field, enabled, created_at
     FROM klhk_tmat_mappings WHERE device_id = $1 ORDER BY tmat_param`,
    [deviceId]
  );
}

/**
 * Sensor fields that this device can actually produce. Mapper target fields
 * are included even before the first reading arrives; stored sensor types are
 * authoritative and cover fields not present in the current mapper template.
 */
async function getAvailableSensorFields(deviceId) {
  await ensureKlhkReportingSchema();
  const [storedRows, assignment] = await Promise.all([
    getRows(
      `SELECT sensor_type, MAX(timestamp) AS last_seen
       FROM sensor_readings
       WHERE device_id = $1
       GROUP BY sensor_type
       ORDER BY sensor_type`,
      [deviceId]
    ),
    getRow(
      `SELECT mt.mappings
       FROM device_mapper_assignments dma
       JOIN mapper_templates mt ON mt.template_id = dma.template_id
       WHERE dma.device_id = $1`,
      [deviceId]
    ),
  ]);

  const fields = new Map();
  for (const row of storedRows) {
    const name = String(row.sensor_type || '').trim();
    if (name) {
      fields.set(name.toLowerCase(), {
        field_name: name,
        source: 'stored',
        last_seen: row.last_seen,
      });
    }
  }

  const mapperMappings = Array.isArray(assignment?.mappings) ? assignment.mappings : [];
  for (const mapping of mapperMappings) {
    const name = String(
      mapping?.target_field ?? mapping?.targetField ?? ''
    ).trim();
    if (!name || ['datetime', 'timestamp'].includes(name.toLowerCase())) continue;
    const key = name.toLowerCase();
    if (!fields.has(key)) {
      fields.set(key, {
        field_name: name,
        source: 'mapper',
        last_seen: null,
      });
    }
  }

  return [...fields.values()].sort((a, b) =>
    a.field_name.localeCompare(b.field_name, undefined, { sensitivity: 'base' })
  );
}

async function replaceSparingMappings(deviceId, mappings) {
  await ensureKlhkReportingSchema();
  const availableFields = await getAvailableSensorFields(deviceId);
  const availableNames = new Set(
    availableFields.map((field) => field.field_name.toLowerCase())
  );
  for (const m of mappings) {
    if (!SPARING_PARAMS.includes(m.sparing_param)) {
      throw new Error(`Invalid sparing_param: ${m.sparing_param}`);
    }
    if (!m.sensor_field || !String(m.sensor_field).trim()) {
      throw new Error(`sensor_field required for ${m.sparing_param}`);
    }
    if (!availableNames.has(String(m.sensor_field).trim().toLowerCase())) {
      throw new Error(
        `Sensor field "${m.sensor_field}" is not available on device ${deviceId}`
      );
    }
  }
  await query('DELETE FROM klhk_sparing_mappings WHERE device_id = $1', [deviceId]);
  for (const m of mappings) {
    await query(
      `INSERT INTO klhk_sparing_mappings (device_id, sparing_param, sensor_field, enabled)
       VALUES ($1, $2, $3, $4)`,
      [deviceId, m.sparing_param, String(m.sensor_field).trim(), m.enabled !== false]
    );
  }
  return getSparingMappings(deviceId);
}

async function replaceTmatMappings(deviceId, mappings) {
  await ensureKlhkReportingSchema();
  const availableFields = await getAvailableSensorFields(deviceId);
  const availableNames = new Set(
    availableFields.map((field) => field.field_name.toLowerCase())
  );
  for (const m of mappings) {
    if (!TMAT_PARAMS.includes(m.tmat_param)) {
      throw new Error(`Invalid tmat_param: ${m.tmat_param}`);
    }
    if (!m.sensor_field || !String(m.sensor_field).trim()) {
      throw new Error(`sensor_field required for ${m.tmat_param}`);
    }
    if (!availableNames.has(String(m.sensor_field).trim().toLowerCase())) {
      throw new Error(
        `Sensor field "${m.sensor_field}" is not available on device ${deviceId}`
      );
    }
  }
  await query('DELETE FROM klhk_tmat_mappings WHERE device_id = $1', [deviceId]);
  for (const m of mappings) {
    await query(
      `INSERT INTO klhk_tmat_mappings (device_id, tmat_param, sensor_field, enabled)
       VALUES ($1, $2, $3, $4)`,
      [deviceId, m.tmat_param, String(m.sensor_field).trim(), m.enabled !== false]
    );
  }
  return getTmatMappings(deviceId);
}

async function listDeviceSummaries(allowedDeviceIds) {
  await ensureKlhkReportingSchema();
  let sql = `
    SELECT d.device_id, d.name, d.status,
           COALESCE(k.reporting_type, 'off') AS reporting_type,
           COALESCE(k.backup_running, false) AS backup_running,
           k.last_hourly_send, k.last_2min_send, k.last_send
    FROM devices d
    LEFT JOIN klhk_device_config k ON k.device_id = d.device_id
    WHERE COALESCE(d.is_deleted, false) = false
  `;
  const params = [];
  if (allowedDeviceIds !== null && Array.isArray(allowedDeviceIds)) {
    if (!allowedDeviceIds.length) return [];
    params.push(allowedDeviceIds);
    sql += ` AND d.device_id = ANY($${params.length})`;
  }
  sql += ' ORDER BY d.name, d.device_id';
  return getRows(sql, params);
}

async function startBackup(deviceId, userId) {
  const cfg = await getOrCreateConfig(deviceId);
  if (cfg.reporting_type === 'off') {
    throw new Error('Configure reporting_type to sparing or tmat before starting backup');
  }
  await query(
    `UPDATE klhk_device_config
     SET backup_running = true, last_started_at = NOW(), last_started_by = $2, updated_at = NOW()
     WHERE device_id = $1`,
    [deviceId, userId || null]
  );
  return getConfig(deviceId);
}

async function stopBackup(deviceId, userId) {
  await getOrCreateConfig(deviceId);
  await query(
    `UPDATE klhk_device_config
     SET backup_running = false, last_stopped_at = NOW(), last_stopped_by = $2, updated_at = NOW()
     WHERE device_id = $1`,
    [deviceId, userId || null]
  );
  return getConfig(deviceId);
}

async function getQueueDepth(deviceId) {
  await ensureKlhkReportingSchema();
  const row = await getRow(
    `SELECT COUNT(*)::int AS cnt FROM klhk_send_queue
     WHERE device_id = $1 AND status IN ('pending', 'failed', 'sending')`,
    [deviceId]
  );
  return row?.cnt ?? 0;
}

async function getSendLogs(deviceId, limit = 50) {
  await ensureKlhkReportingSchema();
  return getRows(
    `SELECT id, device_id, protocol, send_type, hour_timestamp, records_count,
            status, response, duration_ms, triggered_by, created_at
     FROM klhk_send_logs WHERE device_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [deviceId, Math.min(Math.max(limit, 1), 200)]
  );
}

async function getQueueItems(deviceId, limit = 50) {
  await ensureKlhkReportingSchema();
  return getRows(
    `SELECT id, device_id, protocol, send_type, hour_timestamp, records_count,
            status, retry_count, last_attempt_at, error_message, created_at, sent_at
     FROM klhk_send_queue WHERE device_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [deviceId, Math.min(Math.max(limit, 1), 200)]
  );
}

async function getApiSecret(deviceId) {
  await ensureKlhkReportingSchema();
  const row = await getRow(
    'SELECT api_secret FROM klhk_device_config WHERE device_id = $1',
    [deviceId]
  );
  return row?.api_secret || null;
}

async function getApiKey(deviceId) {
  await ensureKlhkReportingSchema();
  const row = await getRow('SELECT api_key FROM klhk_device_config WHERE device_id = $1', [deviceId]);
  return row?.api_key || null;
}

module.exports = {
  maskSecret,
  getConfig,
  getOrCreateConfig,
  updateConfig,
  getSparingMappings,
  getTmatMappings,
  getAvailableSensorFields,
  replaceSparingMappings,
  replaceTmatMappings,
  listDeviceSummaries,
  startBackup,
  stopBackup,
  getQueueDepth,
  getSendLogs,
  getQueueItems,
  getApiSecret,
  getApiKey,
  SPARING_PARAMS,
  TMAT_PARAMS,
};
