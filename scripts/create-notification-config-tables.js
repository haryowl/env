const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const createNotificationConfigTables = async () => {
  try {
    console.log('Creating notification configuration tables...');

    // Email configuration table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_config (
        config_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        smtp_host VARCHAR(255) NOT NULL,
        smtp_port INTEGER NOT NULL,
        smtp_secure BOOLEAN DEFAULT false,
        username VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        from_email VARCHAR(255) NOT NULL,
        from_name VARCHAR(255),
        is_default BOOLEAN DEFAULT false,
        created_by INTEGER REFERENCES users(user_id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Email recipients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_recipients (
        recipient_id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(user_id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Alert email assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_email_assignments (
        assignment_id SERIAL PRIMARY KEY,
        alert_id INTEGER REFERENCES alerts(alert_id) ON DELETE CASCADE,
        recipient_id INTEGER REFERENCES email_recipients(recipient_id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(alert_id, recipient_id)
      );
    `);

    // HTTP notification configuration table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS http_config (
        config_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        url VARCHAR(500) NOT NULL,
        method VARCHAR(10) DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH')),
        headers JSONB DEFAULT '{}',
        timeout INTEGER DEFAULT 30000,
        retry_count INTEGER DEFAULT 3,
        retry_delay INTEGER DEFAULT 5000,
        is_default BOOLEAN DEFAULT false,
        created_by INTEGER REFERENCES users(user_id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Alert HTTP assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_http_assignments (
        assignment_id SERIAL PRIMARY KEY,
        alert_id INTEGER REFERENCES alerts(alert_id) ON DELETE CASCADE,
        config_id INTEGER REFERENCES http_config(config_id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(alert_id, config_id)
      );
    `);

    // Notification logs table (for both email and HTTP)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        log_id SERIAL PRIMARY KEY,
        alert_id INTEGER REFERENCES alerts(alert_id) ON DELETE CASCADE,
        notification_type VARCHAR(20) NOT NULL CHECK (notification_type IN ('email', 'http')),
        recipient VARCHAR(255), -- email address or HTTP URL
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
        message TEXT,
        error_details TEXT,
        sent_at TIMESTAMPTZ,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_config_default ON email_config(is_default);
      CREATE INDEX IF NOT EXISTS idx_http_config_default ON http_config(is_default);
      CREATE INDEX IF NOT EXISTS idx_alert_email_assignments_alert ON alert_email_assignments(alert_id);
      CREATE INDEX IF NOT EXISTS idx_alert_http_assignments_alert ON alert_http_assignments(alert_id);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_alert ON notification_logs(alert_id);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_type_status ON notification_logs(notification_type, status);
      CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at DESC);
    `);

    // Insert default email configuration
    await pool.query(`
      INSERT INTO email_config (name, smtp_host, smtp_port, smtp_secure, username, password, from_email, from_name, is_default)
      VALUES ('Default SMTP', 'smtp.gmail.com', 587, false, 'your-email@gmail.com', 'your-app-password', 'alerts@yourdomain.com', 'IoT Alert System', true)
      ON CONFLICT DO NOTHING;
    `);

    // Insert default HTTP configuration
    await pool.query(`
      INSERT INTO http_config (name, url, method, headers, is_default)
      VALUES ('Default Webhook', 'https://webhook.site/your-webhook-url', 'POST', '{"Content-Type": "application/json"}', true)
      ON CONFLICT DO NOTHING;
    `);

    console.log('Notification configuration tables created successfully!');

  } catch (error) {
    console.error('Error creating notification configuration tables:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  createNotificationConfigTables().catch(console.error);
}

module.exports = { createNotificationConfigTables }; 