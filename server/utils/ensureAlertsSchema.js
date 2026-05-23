const { query } = require('../config/database');

let ensured = false;

async function ensureAlertsSchema() {
  if (ensured) return;

  await query(`
    ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_alerts_created_by
    ON alerts(created_by) WHERE created_by IS NOT NULL
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS alert_email_recipients (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      alerts JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    ALTER TABLE alert_email_recipients
    ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS alert_http_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      enabled BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS alert_http_endpoints (
      id SERIAL PRIMARY KEY,
      url VARCHAR(500) NOT NULL,
      method VARCHAR(10) DEFAULT 'POST',
      headers JSONB DEFAULT '{}',
      alerts JSONB DEFAULT '[]',
      body_template JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    ALTER TABLE alert_http_endpoints
    ADD COLUMN IF NOT EXISTS body_template JSONB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS alert_notification_logs (
      id SERIAL PRIMARY KEY,
      alert_id INTEGER,
      notification_type VARCHAR(20) NOT NULL,
      recipient VARCHAR(255),
      status VARCHAR(20) NOT NULL,
      message TEXT,
      error_details TEXT,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    ALTER TABLE alert_notification_logs
    ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_alert_email_recipients_email ON alert_email_recipients(email)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_alert_http_endpoints_url ON alert_http_endpoints(url)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_alert_notification_logs_alert_id ON alert_notification_logs(alert_id)`);

  ensured = true;
}

function resetAlertsSchemaCacheForTests() {
  ensured = false;
}

module.exports = { ensureAlertsSchema, resetAlertsSchemaCacheForTests };
