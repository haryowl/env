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

  // Multi-device alert rules: keep device_id as primary/legacy FK, device_ids as the full set
  await query(`
    ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS device_ids TEXT[]
  `);
  await query(`
    UPDATE alerts
    SET device_ids = ARRAY[device_id]
    WHERE device_ids IS NULL AND device_id IS NOT NULL
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_alerts_device_ids
    ON alerts USING GIN (device_ids)
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

  // WhatsApp (Wablas) provider — admin-managed singleton
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_provider_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      enabled BOOLEAN DEFAULT false,
      url VARCHAR(500) NOT NULL DEFAULT '',
      method VARCHAR(10) DEFAULT 'POST',
      headers JSONB DEFAULT '{}'::jsonb,
      body_template JSONB,
      updated_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    INSERT INTO whatsapp_provider_config (id, enabled, url, method, headers, body_template)
    VALUES (
      1,
      false,
      'https://jogja.wablas.com/api/v2/send-message',
      'POST',
      '{}'::jsonb,
      '{"data":[{"phone":"{{phone}}","message":"{{message}}"}]}'::jsonb
    )
    ON CONFLICT (id) DO NOTHING
  `);

  // Per-user WhatsApp phone subscriptions
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      alert_id INTEGER NOT NULL REFERENCES alerts(alert_id) ON DELETE CASCADE,
      phone VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, device_id, alert_id, phone)
    )
  `);
  // Allow same phone + alert on different devices (legacy DB had user_id + alert_id + phone only)
  await query(`
    ALTER TABLE whatsapp_subscriptions
    DROP CONSTRAINT IF EXISTS whatsapp_subscriptions_user_id_alert_id_phone_key
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_subscriptions_user_device_alert_phone
    ON whatsapp_subscriptions (user_id, device_id, alert_id, phone)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_subscriptions_alert_id
    ON whatsapp_subscriptions(alert_id)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_subscriptions_user_id
    ON whatsapp_subscriptions(user_id)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_subscriptions_device_id
    ON whatsapp_subscriptions(device_id)
  `);

  ensured = true;
}

function resetAlertsSchemaCacheForTests() {
  ensured = false;
}

module.exports = { ensureAlertsSchema, resetAlertsSchemaCacheForTests };
