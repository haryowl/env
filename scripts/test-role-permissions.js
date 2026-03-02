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

const testRolePermissions = async () => {
  try {
    console.log('Testing role permissions...');

    // Get a real device ID
    const devices = await pool.query('SELECT device_id FROM devices LIMIT 1');
    if (devices.rows.length === 0) {
      console.log('No devices found in database');
      return;
    }

    const deviceId = devices.rows[0].device_id;
    console.log(`Using device ID: ${deviceId}`);

    // Get a real role ID
    const roles = await pool.query('SELECT role_id FROM roles LIMIT 1');
    if (roles.rows.length === 0) {
      console.log('No roles found in database');
      return;
    }

    const roleId = roles.rows[0].role_id;
    console.log(`Using role ID: ${roleId}`);

    // Test inserting a role device permission
    console.log('\n=== Testing Role Device Permission Insert ===');
    try {
      const testInsert = await pool.query(`
        INSERT INTO role_device_permissions (role_id, device_id, permissions)
        VALUES ($1, $2, $3)
        ON CONFLICT (role_id, device_id) DO UPDATE SET permissions = $3
      `, [roleId, deviceId, JSON.stringify({ read: true, write: false })]);
      
      console.log('✓ Test insert successful');
      
      // Verify the insert
      const verifyInsert = await pool.query(`
        SELECT * FROM role_device_permissions 
        WHERE role_id = $1 AND device_id = $2
      `, [roleId, deviceId]);
      
      if (verifyInsert.rows.length > 0) {
        console.log('✓ Insert verified:', verifyInsert.rows[0]);
      } else {
        console.log('✗ Insert verification failed');
      }
      
      // Clean up test record
      await pool.query(`
        DELETE FROM role_device_permissions 
        WHERE role_id = $1 AND device_id = $2
      `, [roleId, deviceId]);
      console.log('✓ Test record cleaned up');
      
    } catch (insertError) {
      console.error('✗ Test insert failed:', insertError.message);
    }

    // Test the validation logic
    console.log('\n=== Testing Device ID Validation ===');
    const allDevices = await pool.query('SELECT device_id FROM devices');
    const validDeviceIds = allDevices.rows.map(d => d.device_id);
    const invalidDeviceIds = ['invalid_device_1', 'invalid_device_2'];
    
    console.log('Valid device IDs:', validDeviceIds);
    console.log('Invalid device IDs:', invalidDeviceIds);
    
    // Test with mixed valid and invalid device IDs
    const mixedDeviceIds = [...validDeviceIds.slice(0, 2), ...invalidDeviceIds];
    console.log('Mixed device IDs:', mixedDeviceIds);
    
    const existingDevices = await pool.query(`
      SELECT device_id FROM devices WHERE device_id = ANY($1)
    `, [mixedDeviceIds]);
    
    const existingDeviceIds = existingDevices.rows.map(d => d.device_id);
    const invalidFound = mixedDeviceIds.filter(id => !existingDeviceIds.includes(id));
    
    console.log('Existing device IDs found:', existingDeviceIds);
    console.log('Invalid device IDs found:', invalidFound);

  } catch (error) {
    console.error('Failed to test role permissions:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
testRolePermissions(); 