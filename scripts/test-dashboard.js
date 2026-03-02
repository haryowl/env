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

const testDashboard = async () => {
  try {
    console.log('Testing dashboard data access...');
    
    // Test 1: Check if devices exist
    const devices = await pool.query('SELECT device_id, name, status FROM devices WHERE status != $1', ['deleted']);
    console.log(`Found ${devices.rows.length} devices:`);
    devices.rows.forEach(device => {
      console.log(`  - ${device.name} (${device.device_id}): ${device.status}`);
    });
    
    // Test 2: Check if sensor data exists
    const sensorData = await pool.query('SELECT COUNT(*) as count FROM sensor_readings');
    console.log(`Found ${sensorData.rows[0].count} sensor readings`);
    
    // Test 3: Check if users exist
    const users = await pool.query('SELECT user_id, username, role FROM users WHERE status = $1', ['active']);
    console.log(`Found ${users.rows.length} active users:`);
    users.rows.forEach(user => {
      console.log(`  - ${user.username} (${user.role})`);
    });
    
    // Test 4: Check device permissions
    const permissions = await pool.query('SELECT COUNT(*) as count FROM user_device_permissions');
    console.log(`Found ${permissions.rows[0].count} device permissions`);
    
    // Test 5: Check recent sensor data
    const recentData = await pool.query(`
      SELECT device_id, sensor_type, value, metadata->>'datetime' as datetime
      FROM sensor_readings 
      ORDER BY timestamp DESC 
      LIMIT 5
    `);
    console.log('Recent sensor data:');
    recentData.rows.forEach(row => {
      console.log(`  - Device ${row.device_id}: ${row.sensor_type} = ${row.value} at ${row.datetime}`);
    });
    
  } catch (error) {
    console.error('Error testing dashboard:', error);
  } finally {
    await pool.end();
  }
};

testDashboard(); 