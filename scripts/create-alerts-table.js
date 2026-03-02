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

const checkAndCreateAlertsTable = async () => {
  try {
    // Check if table exists
    const checkRes = await pool.query(`
      SELECT to_regclass('public.alerts') AS table_exists;
    `);
    if (checkRes.rows[0].table_exists) {
      console.log('alerts table already exists.');
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alerts (
          alert_id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          device_id VARCHAR(50) REFERENCES devices(device_id) ON DELETE CASCADE,
          parameter VARCHAR(50),
          min DOUBLE PRECISION,
          max DOUBLE PRECISION,
          type VARCHAR(20) NOT NULL CHECK (type IN ('threshold', 'inactivity')),
          threshold_time INTEGER,
          actions JSONB DEFAULT '{}',
          template TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log('alerts table created successfully!');
    }
  } catch (error) {
    console.error('Error checking/creating alerts table:', error);
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  checkAndCreateAlertsTable();
} 