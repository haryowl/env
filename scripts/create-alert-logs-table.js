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

const checkAndCreateAlertLogsTable = async () => {
  try {
    // Check if table exists
    const checkRes = await pool.query(`
      SELECT to_regclass('public.alert_logs') AS table_exists;
    `);
    if (checkRes.rows[0].table_exists) {
      console.log('alert_logs table already exists.');
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alert_logs (
          log_id SERIAL PRIMARY KEY,
          alert_id INTEGER REFERENCES alerts(alert_id) ON DELETE CASCADE,
          device_id VARCHAR(50),
          parameter VARCHAR(50),
          value DOUBLE PRECISION,
          detected_at TIMESTAMPTZ NOT NULL,
          status VARCHAR(20) DEFAULT 'active',
          details JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log('alert_logs table created successfully!');
    }
  } catch (error) {
    console.error('Error checking/creating alert_logs table:', error);
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  checkAndCreateAlertLogsTable();
} 