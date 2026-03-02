const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function testDevicesEndpoint() {
  const client = await pool.connect();
  try {
    console.log('=== Testing Devices Endpoint ===\n');
    
    // Check if devices table exists and has data
    const devices = await client.query('SELECT COUNT(*) as count FROM devices');
    console.log('Total devices in database:', devices.rows[0].count);
    
    // Get sample devices
    const sampleDevices = await client.query(`
      SELECT device_id, name, device_type, protocol, status 
      FROM devices 
      LIMIT 5
    `);
    
    console.log('\nSample devices:');
    sampleDevices.rows.forEach(device => {
      console.log(`  ${device.device_id}: ${device.name} (${device.device_type}, ${device.protocol}, ${device.status})`);
    });
    
    // Check devices table structure
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'devices'
      ORDER BY ordinal_position
    `);
    
    console.log('\nDevices table columns:');
    columns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

testDevicesEndpoint().catch(console.error);


