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

const addDevicePermissions = async () => {
  try {
    console.log('Adding device permissions for real devices...');

    // Get all users
    const users = await pool.query('SELECT user_id, username FROM users');
    
    // Get all devices
    const devices = await pool.query('SELECT device_id, name FROM devices');

    console.log('\n=== Users ===');
    users.rows.forEach(user => {
      console.log(`${user.username} (ID: ${user.user_id})`);
    });

    console.log('\n=== Devices ===');
    devices.rows.forEach(device => {
      console.log(`${device.name} (${device.device_id})`);
    });

    // Add permissions for all devices to all users
    for (const user of users.rows) {
      for (const device of devices.rows) {
        // Check if permission already exists
        const existingPermission = await pool.query(
          'SELECT user_id FROM user_device_permissions WHERE user_id = $1 AND device_id = $2',
          [user.user_id, device.device_id]
        );

        if (existingPermission.rows.length === 0) {
          await pool.query(`
            INSERT INTO user_device_permissions (user_id, device_id, permissions)
            VALUES ($1, $2, $3)
          `, [
            user.user_id,
            device.device_id,
            JSON.stringify({ read: true, write: false, configure: false, delete: false })
          ]);
          
          console.log(`✓ Added permissions for ${user.username} -> ${device.name}`);
        } else {
          console.log(`- Permission already exists for ${user.username} -> ${device.name}`);
        }
      }
    }

    console.log('\n✓ Device permissions added successfully');

  } catch (error) {
    console.error('Failed to add device permissions:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
addDevicePermissions(); 