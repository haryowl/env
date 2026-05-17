const { query, getRow, getRows } = require('../config/database');

const SETTINGS_ID = 1;

const DATA_TARGETS = {
  sensor_readings: {
    label: 'Sensor readings',
    table: 'sensor_readings',
    idColumn: 'id',
    timestampColumn: 'timestamp',
    description: 'Time-series sensor values used by dashboards, Data Dash, and alerts.',
  },
  gps_tracks: {
    label: 'GPS tracks',
    table: 'gps_tracks',
    idColumn: 'id',
    timestampColumn: 'timestamp',
    description: 'GPS history used by Live tracking and maps.',
  },
  alert_logs: {
    label: 'Alert logs',
    table: 'alert_logs',
    idColumn: 'log_id',
    timestampColumn: 'detected_at',
    description: 'Historical alert events (threshold and inactivity).',
  },
  device_events: {
    label: 'Device events',
    table: 'device_events',
    idColumn: 'event_id',
    timestampColumn: 'timestamp',
    description: 'Device event log entries.',
  },
};

const DEFAULT_POLICIES = {
  sensor_readings: { enabled: true, retention_value: 90, retention_unit: 'days' },
  gps_tracks: { enabled: true, retention_value: 180, retention_unit: 'days' },
  alert_logs: { enabled: true, retention_value: 365, retention_unit: 'days' },
  device_events: { enabled: false, retention_value: 90, retention_unit: 'days' },
};

function retentionToCutoff(value, unit) {
  const v = Math.max(1, Math.floor(Number(value) || 1));
  const cutoff = new Date();
  if (unit === 'months') {
    cutoff.setMonth(cutoff.getMonth() - v);
  } else {
    cutoff.setDate(cutoff.getDate() - v);
  }
  return cutoff;
}

function normalizePolicy(raw, fallback) {
  const base = fallback || { enabled: false, retention_value: 90, retention_unit: 'days' };
  const unit = raw?.retention_unit === 'months' ? 'months' : 'days';
  const retention_value = Math.max(1, Math.min(3650, Math.floor(Number(raw?.retention_value) || base.retention_value)));
  return {
    enabled: Boolean(raw?.enabled),
    retention_value,
    retention_unit: unit,
  };
}

function normalizePolicies(policies) {
  const out = {};
  for (const key of Object.keys(DATA_TARGETS)) {
    out[key] = normalizePolicy(policies?.[key], DEFAULT_POLICIES[key]);
  }
  return out;
}

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS data_retention_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      policies JSONB NOT NULL DEFAULT '{}',
      auto_cleanup_enabled BOOLEAN NOT NULL DEFAULT false,
      auto_cleanup_interval_hours INTEGER NOT NULL DEFAULT 24,
      last_auto_run_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by INTEGER REFERENCES users(user_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS data_cleanup_runs (
      run_id SERIAL PRIMARY KEY,
      triggered_by VARCHAR(20) NOT NULL,
      user_id INTEGER REFERENCES users(user_id),
      dry_run BOOLEAN NOT NULL DEFAULT false,
      device_ids TEXT[],
      results JSONB NOT NULL DEFAULT '{}',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);
  const row = await getRow('SELECT id FROM data_retention_settings WHERE id = $1', [SETTINGS_ID]);
  if (!row) {
    await query(
      `INSERT INTO data_retention_settings (id, policies, auto_cleanup_enabled, auto_cleanup_interval_hours)
       VALUES ($1, $2, false, 24)`,
      [SETTINGS_ID, JSON.stringify(DEFAULT_POLICIES)]
    );
  }
}

async function getSettings() {
  await ensureTables();
  const row = await getRow('SELECT * FROM data_retention_settings WHERE id = $1', [SETTINGS_ID]);
  return {
    policies: normalizePolicies(row?.policies || DEFAULT_POLICIES),
    auto_cleanup_enabled: Boolean(row?.auto_cleanup_enabled),
    auto_cleanup_interval_hours: Math.max(1, Number(row?.auto_cleanup_interval_hours) || 24),
    last_auto_run_at: row?.last_auto_run_at || null,
    updated_at: row?.updated_at || null,
    targets: Object.entries(DATA_TARGETS).map(([key, meta]) => ({
      key,
      ...meta,
      defaultPolicy: DEFAULT_POLICIES[key],
    })),
  };
}

async function updateSettings({ policies, auto_cleanup_enabled, auto_cleanup_interval_hours }, userId) {
  await ensureTables();
  const normalized = normalizePolicies(policies);
  await query(
    `UPDATE data_retention_settings
     SET policies = $1,
         auto_cleanup_enabled = $2,
         auto_cleanup_interval_hours = $3,
         updated_at = NOW(),
         updated_by = $4
     WHERE id = $5`,
    [
      JSON.stringify(normalized),
      Boolean(auto_cleanup_enabled),
      Math.max(1, Math.min(168, Math.floor(Number(auto_cleanup_interval_hours) || 24))),
      userId || null,
      SETTINGS_ID,
    ]
  );
  return getSettings();
}

async function getTableStats(targetKey, deviceIds) {
  const meta = DATA_TARGETS[targetKey];
  if (!meta) return null;
  const { table, timestampColumn } = meta;
  const params = [];
  let where = '';
  if (deviceIds?.length) {
    params.push(deviceIds);
    where = ` WHERE device_id = ANY($${params.length})`;
  }
  const countSql = `SELECT COUNT(*)::bigint AS cnt, MIN(${timestampColumn}) AS oldest, MAX(${timestampColumn}) AS newest FROM ${table}${where}`;
  const countRow = await getRow(countSql, params);
  return {
    key: targetKey,
    label: meta.label,
    rowCount: Number(countRow?.cnt || 0),
    oldest: countRow?.oldest || null,
    newest: countRow?.newest || null,
  };
}

async function countRowsToDelete(targetKey, cutoff, deviceIds) {
  const meta = DATA_TARGETS[targetKey];
  const params = [cutoff];
  let sql = `SELECT COUNT(*)::bigint AS cnt FROM ${meta.table} WHERE ${meta.timestampColumn} < $1`;
  if (deviceIds?.length) {
    params.push(deviceIds);
    sql += ` AND device_id = ANY($${params.length})`;
  }
  const row = await getRow(sql, params);
  return Number(row?.cnt || 0);
}

async function deleteRowsBatch(targetKey, cutoff, deviceIds, batchSize = 5000) {
  const meta = DATA_TARGETS[targetKey];
  const pk = meta.idColumn;
  let totalDeleted = 0;
  const maxBatches = 200;

  for (let i = 0; i < maxBatches; i += 1) {
    let params;
    let sql;
    if (deviceIds?.length) {
      params = [cutoff, deviceIds, batchSize];
      sql = `
        WITH doomed AS (
          SELECT ${pk} AS pk FROM ${meta.table}
          WHERE ${meta.timestampColumn} < $1 AND device_id = ANY($2)
          LIMIT $3
        )
        DELETE FROM ${meta.table} t
        USING doomed d
        WHERE t.${pk} = d.pk
        RETURNING t.${pk}`;
    } else {
      params = [cutoff, batchSize];
      sql = `
        WITH doomed AS (
          SELECT ${pk} AS pk FROM ${meta.table}
          WHERE ${meta.timestampColumn} < $1
          LIMIT $2
        )
        DELETE FROM ${meta.table} t
        USING doomed d
        WHERE t.${pk} = d.pk
        RETURNING t.${pk}`;
    }

    const result = await query(sql, params);
    const deleted = result.rowCount || 0;
    totalDeleted += deleted;
    if (deleted < batchSize) break;
  }
  return totalDeleted;
}

/**
 * @param {object} opts
 * @param {boolean} opts.dryRun
 * @param {string[]} [opts.deviceIds]
 * @param {Record<string, object>} [opts.policyOverrides] per-target policy for this run only
 * @param {'manual'|'scheduled'} opts.triggeredBy
 * @param {number} [opts.userId]
 */
async function runCleanup(opts) {
  await ensureTables();
  const settings = await getSettings();
  const deviceIds = Array.isArray(opts.deviceIds) && opts.deviceIds.length ? opts.deviceIds : null;
  const dryRun = Boolean(opts.dryRun);
  const results = {};

  for (const key of Object.keys(DATA_TARGETS)) {
    const policy = normalizePolicy(
      opts.policyOverrides?.[key] || settings.policies[key],
      DEFAULT_POLICIES[key]
    );
    if (!policy.enabled) {
      results[key] = { skipped: true, reason: 'disabled', policy, deleted: 0, wouldDelete: 0 };
      continue;
    }
    const cutoff = retentionToCutoff(policy.retention_value, policy.retention_unit);
    const wouldDelete = await countRowsToDelete(key, cutoff, deviceIds);
    let deleted = 0;
    if (!dryRun && wouldDelete > 0) {
      deleted = await deleteRowsBatch(key, cutoff, deviceIds);
    }
    results[key] = {
      skipped: false,
      policy,
      cutoff: cutoff.toISOString(),
      wouldDelete,
      deleted: dryRun ? 0 : deleted,
    };
  }

  const insert = await query(
    `INSERT INTO data_cleanup_runs (triggered_by, user_id, dry_run, device_ids, results, completed_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [
      opts.triggeredBy || 'manual',
      opts.userId || null,
      dryRun,
      deviceIds,
      JSON.stringify(results),
    ]
  );

  if (!dryRun && opts.triggeredBy === 'scheduled') {
    await query(
      `UPDATE data_retention_settings SET last_auto_run_at = NOW() WHERE id = $1`,
      [SETTINGS_ID]
    );
  }

  return {
    dryRun,
    deviceIds,
    results,
    run: insert.rows[0],
  };
}

async function getStorageOverview(deviceIds) {
  await ensureTables();
  const stats = {};
  for (const key of Object.keys(DATA_TARGETS)) {
    stats[key] = await getTableStats(key, deviceIds);
  }
  return stats;
}

async function getRunHistory(limit = 20) {
  await ensureTables();
  const rows = await getRows(
    `SELECT run_id, triggered_by, user_id, dry_run, device_ids, results, started_at, completed_at
     FROM data_cleanup_runs
     ORDER BY started_at DESC
     LIMIT $1`,
    [Math.min(100, Math.max(1, limit))]
  );
  return rows;
}

async function maybeRunScheduledCleanup() {
  const settings = await getSettings();
  if (!settings.auto_cleanup_enabled) return null;

  const intervalMs = settings.auto_cleanup_interval_hours * 60 * 60 * 1000;
  const last = settings.last_auto_run_at ? new Date(settings.last_auto_run_at).getTime() : 0;
  if (Date.now() - last < intervalMs) return null;

  console.log('[data-cleanup] Running scheduled retention cleanup');
  return runCleanup({ dryRun: false, triggeredBy: 'scheduled' });
}

module.exports = {
  DATA_TARGETS,
  DEFAULT_POLICIES,
  retentionToCutoff,
  ensureTables,
  getSettings,
  updateSettings,
  getStorageOverview,
  runCleanup,
  getRunHistory,
  maybeRunScheduledCleanup,
};
