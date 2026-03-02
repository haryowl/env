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

const fixDevicePermissions = async () => {
  try {
    console.log('Checking and fixing device permissions...');
    
    // Get all users
    const users = await pool.query('SELECT user_id, username, role FROM users WHERE status = $1', ['active']);
    console.log(`Found ${users.rows.length} active users`);
    
    // Get all devices
    const devices = await pool.query('SELECT device_id, name FROM devices WHERE status != $1', ['deleted']);
    console.log(`Found ${devices.rows.length} active devices`);
    
    // For each user, ensure they have access to all devices
    for (const user of users.rows) {
      console.log(`Processing user: ${user.username} (${user.role})`);
      
      for (const device of devices.rows) {
        // Check if permission already exists
        const existingPermission = await pool.query(
          'SELECT user_id FROM user_device_permissions WHERE user_id = $1 AND device_id = $2',
          [user.user_id, device.device_id]
        );
        
        if (existingPermission.rows.length === 0) {
          // Create permission based on user role
          let permissions = { read: true, write: false, configure: false, delete: false };
          
          if (user.role === 'super_admin' || user.role === 'admin') {
            permissions = { read: true, write: true, configure: true, delete: true };
          } else if (user.role === 'operator') {
            permissions = { read: true, write: false, configure: true, delete: false };
          }
          
          await pool.query(
            'INSERT INTO user_device_permissions (user_id, device_id, permissions) VALUES ($1, $2, $3)',
            [user.user_id, device.device_id, JSON.stringify(permissions)]
          );
          
          console.log(`  - Added permissions for device: ${device.name}`);
        }
      }
    }
    
    console.log('Device permissions fixed successfully!');

  } catch (error) {
    console.error('Error fixing device permissions:', error);
  } finally {
    await pool.end();
  }
};

fixDevicePermissions(); 