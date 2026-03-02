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

const createAlertNotificationTables = async () => {
  try {
    console.log('Creating alert notification tables...');

    // Alert email configuration table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_email_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        smtp_host VARCHAR(255),
        smtp_port INTEGER,
        smtp_secure BOOLEAN DEFAULT false,
        smtp_user VARCHAR(255),
        smtp_pass VARCHAR(255),
        from_email VARCHAR(255),
        from_name VARCHAR(255),
        enabled BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Alert email recipients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_email_recipients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        alerts JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Alert HTTP configuration table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_http_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        enabled BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Alert HTTP endpoints table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_http_endpoints (
        id SERIAL PRIMARY KEY,
        url VARCHAR(500) NOT NULL,
        method VARCHAR(10) DEFAULT 'POST',
        headers JSONB DEFAULT '{}',
        alerts JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Alert notification logs table
    await pool.query(`
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
      );
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_email_recipients_email ON alert_email_recipients(email);
      CREATE INDEX IF NOT EXISTS idx_alert_http_endpoints_url ON alert_http_endpoints(url);
      CREATE INDEX IF NOT EXISTS idx_alert_notification_logs_alert_id ON alert_notification_logs(alert_id);
      CREATE INDEX IF NOT EXISTS idx_alert_notification_logs_created_at ON alert_notification_logs(created_at DESC);
    `);

    console.log('Alert notification tables created successfully!');

  } catch (error) {
    console.error('Error creating alert notification tables:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  createAlertNotificationTables().catch(console.error);
}

module.exports = { createAlertNotificationTables }; 