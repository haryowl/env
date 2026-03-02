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

const checkSensorData = async () => {
  try {
    console.log('Checking sensor data...\n');

    // Check total count
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM sensor_readings');
    console.log('Total sensor readings:', totalResult.rows[0].count);

    // Check the time range of data
    const timeRangeResult = await pool.query('SELECT MIN(timestamp) as earliest, MAX(timestamp) as latest FROM sensor_readings');
    console.log('Data time range:', {
      earliest: timeRangeResult.rows[0].earliest,
      latest: timeRangeResult.rows[0].latest
    });

    // Check recent data (last 8 hours)
    const recentResult = await pool.query('SELECT COUNT(*) as count FROM sensor_readings WHERE timestamp >= NOW() - INTERVAL \'8 hours\'');
    console.log('Recent sensor readings (last 8 hours):', recentResult.rows[0].count);

    // Check data for the specific device
    const deviceResult = await pool.query('SELECT COUNT(*) as count FROM sensor_readings WHERE device_id = $1', ['7092139028080123021']);
    console.log('Sensor readings for device 7092139028080123021:', deviceResult.rows[0].count);

    // Check recent data for the specific device
    const deviceRecentResult = await pool.query('SELECT COUNT(*) as count FROM sensor_readings WHERE device_id = $1 AND timestamp >= NOW() - INTERVAL \'8 hours\'', ['7092139028080123021']);
    console.log('Recent sensor readings for device 7092139028080123021 (last 8 hours):', deviceRecentResult.rows[0].count);

    // Get the most recent data for the device
    const latestDeviceResult = await pool.query('SELECT device_id, sensor_type, value, timestamp FROM sensor_readings WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 5', ['7092139028080123021']);
    console.log('\nMost recent readings for device 7092139028080123021:');
    latestDeviceResult.rows.forEach((row, i) => {
      console.log(`${i + 1}. Type: ${row.sensor_type}, Value: ${row.value}, Time: ${row.timestamp}`);
    });

    // Check device mapper assignments
    const mapperResult = await pool.query('SELECT * FROM device_mapper_assignments WHERE device_id = $1', ['7092139028080123021']);
    console.log('\nDevice mapper assignments for 7092139028080123021:');
    console.log(mapperResult.rows);

    // Check mapper templates
    if (mapperResult.rows.length > 0) {
      const templateResult = await pool.query('SELECT * FROM mapper_templates WHERE template_id = $1', [mapperResult.rows[0].template_id]);
      console.log('\nMapper template:');
      console.log(JSON.stringify(templateResult.rows[0], null, 2));
    }

    // Check what data would be returned if we look at the last 24 hours instead of 8 hours
    const last24HoursResult = await pool.query('SELECT COUNT(*) as count FROM sensor_readings WHERE device_id = $1 AND timestamp >= NOW() - INTERVAL \'24 hours\'', ['7092139028080123021']);
    console.log('\nSensor readings for device 7092139028080123021 (last 24 hours):', last24HoursResult.rows[0].count);

    // Check what data would be returned if we look at the last 7 days
    const last7DaysResult = await pool.query('SELECT COUNT(*) as count FROM sensor_readings WHERE device_id = $1 AND timestamp >= NOW() - INTERVAL \'7 days\'', ['7092139028080123021']);
    console.log('Sensor readings for device 7092139028080123021 (last 7 days):', last7DaysResult.rows[0].count);

  } catch (error) {
    console.error('Error checking sensor data:', error);
  } finally {
    await pool.end();
  }
};

checkSensorData(); 