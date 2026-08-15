const { query } = require('../config/database');

let ensured = false;

async function ensureKlhkReportingSchema() {
  if (ensured) return;

  await query(`
    CREATE TABLE IF NOT EXISTS klhk_device_config (
      device_id VARCHAR(255) PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
      reporting_type VARCHAR(16) NOT NULL DEFAULT 'off'
        CHECK (reporting_type IN ('off', 'sparing', 'tmat')),
      backup_running BOOLEAN NOT NULL DEFAULT false,
      retry_max_attempts INTEGER,
      retry_interval_minutes INTEGER,
      last_started_at TIMESTAMPTZ,
      last_stopped_at TIMESTAMPTZ,
      last_started_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      last_stopped_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      logger_id TEXT,
      api_secret TEXT,
      api_secret_fetched_at TIMESTAMPTZ,
      api_base TEXT,
      api_secret_url TEXT,
      api_send_hourly_url TEXT,
      api_send_2min_url TEXT,
      api_testing_url TEXT,
      send_mode VARCHAR(16) DEFAULT 'hourly'
        CHECK (send_mode IS NULL OR send_mode IN ('hourly', '2min', 'both')),
      last_hourly_send TIMESTAMPTZ,
      last_2min_send TIMESTAMPTZ,
      retry_all_failed_on_reconnect BOOLEAN DEFAULT false,
      device_id_unik TEXT,
      api_key TEXT,
      api_url TEXT,
      push_interval_seconds INTEGER DEFAULT 60,
      last_send TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS klhk_sparing_mappings (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      sparing_param VARCHAR(64) NOT NULL,
      sensor_field VARCHAR(255) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (device_id, sparing_param)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS klhk_tmat_mappings (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      tmat_param VARCHAR(64) NOT NULL,
      sensor_field VARCHAR(255) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (device_id, tmat_param)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS klhk_send_queue (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      protocol VARCHAR(16) NOT NULL CHECK (protocol IN ('sparing', 'tmat')),
      send_type VARCHAR(32) NOT NULL,
      hour_timestamp BIGINT,
      payload JSONB NOT NULL,
      records_count INTEGER DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS klhk_send_logs (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      protocol VARCHAR(16) NOT NULL CHECK (protocol IN ('sparing', 'tmat')),
      send_type VARCHAR(32) NOT NULL,
      hour_timestamp BIGINT,
      records_count INTEGER DEFAULT 0,
      status VARCHAR(16) NOT NULL CHECK (status IN ('success', 'failed')),
      response TEXT,
      duration_ms INTEGER,
      triggered_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Scheduler runs that never reach the API are logged as 'skipped' so the UI
  // can explain why nothing was transmitted.
  await query(`
    ALTER TABLE klhk_send_logs DROP CONSTRAINT IF EXISTS klhk_send_logs_status_check
  `);
  await query(`
    ALTER TABLE klhk_send_logs ADD CONSTRAINT klhk_send_logs_status_check
    CHECK (status IN ('success', 'failed', 'skipped'))
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_klhk_send_queue_device_status
    ON klhk_send_queue (device_id, status, created_at)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_klhk_send_logs_device_time
    ON klhk_send_logs (device_id, created_at DESC)
  `);

  ensured = true;
}

function resetKlhkReportingSchemaCacheForTests() {
  ensured = false;
}

module.exports = { ensureKlhkReportingSchema, resetKlhkReportingSchemaCacheForTests };
