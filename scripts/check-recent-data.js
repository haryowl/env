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

const checkRecentData = async () => {
  try {
    console.log('Checking for recent data...\n');

    // Check the most recent data for the device
    const recentResult = await pool.query(`
      SELECT device_id, sensor_type, value, timestamp 
      FROM sensor_readings 
      WHERE device_id = '7092139028080123021' 
      ORDER BY timestamp DESC 
      LIMIT 10
    `);
    
    console.log('Most recent sensor readings:');
    recentResult.rows.forEach((row, i) => {
      console.log(`${i + 1}. Type: ${row.sensor_type}, Value: ${row.value}, Time: ${row.timestamp}`);
    });

    // Check data from the last hour
    const lastHourResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM sensor_readings 
      WHERE device_id = '7092139028080123021' 
      AND timestamp >= NOW() - INTERVAL '1 hour'
    `);
    
    console.log(`\nSensor readings in the last hour: ${lastHourResult.rows[0].count}`);

    // Check data from the last 30 minutes
    const last30MinResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM sensor_readings 
      WHERE device_id = '7092139028080123021' 
      AND timestamp >= NOW() - INTERVAL '30 minutes'
    `);
    
    console.log(`Sensor readings in the last 30 minutes: ${last30MinResult.rows[0].count}`);

    // Check data from the last 10 minutes
    const last10MinResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM sensor_readings 
      WHERE device_id = '7092139028080123021' 
      AND timestamp >= NOW() - INTERVAL '10 minutes'
    `);
    
    console.log(`Sensor readings in the last 10 minutes: ${last10MinResult.rows[0].count}`);

    // Check if there's any data from today
    const todayResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM sensor_readings 
      WHERE device_id = '7092139028080123021' 
      AND DATE(timestamp) = CURRENT_DATE
    `);
    
    console.log(`Sensor readings today: ${todayResult.rows[0].count}`);

    // Check the current time vs the latest data time
    const now = new Date();
    console.log(`\nCurrent time: ${now.toISOString()}`);
    
    if (recentResult.rows.length > 0) {
      const latestTime = new Date(recentResult.rows[0].timestamp);
      const timeDiff = now.getTime() - latestTime.getTime();
      const minutesDiff = Math.floor(timeDiff / (1000 * 60));
      console.log(`Latest data time: ${latestTime.toISOString()}`);
      console.log(`Time difference: ${minutesDiff} minutes ago`);
    }

  } catch (error) {
    console.error('Error checking recent data:', error);
  } finally {
    await pool.end();
  }
};

checkRecentData(); 