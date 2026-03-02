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

const createTestDevices = async () => {
  try {
    console.log('Creating test devices...');

    // Create test devices
    const testDevices = [
      {
        device_id: 'sensor_001',
        device_type: 'sensor',
        protocol: 'mqtt',
        name: 'Temperature Sensor 001',
        description: 'Outdoor temperature sensor',
        location: 'Building A - Roof',
        timezone: 'UTC',
        status: 'online'
      },
      {
        device_id: 'sensor_002',
        device_type: 'sensor',
        protocol: 'mqtt',
        name: 'Humidity Sensor 001',
        description: 'Indoor humidity sensor',
        location: 'Building B - Room 101',
        timezone: 'UTC',
        status: 'online'
      },
      {
        device_id: 'gps_001',
        device_type: 'gps',
        protocol: 'mqtt',
        name: 'Vehicle GPS Tracker',
        description: 'GPS tracker for delivery vehicle',
        location: 'Vehicle Fleet',
        timezone: 'UTC',
        status: 'online'
      },
      {
        device_id: 'hybrid_001',
        device_type: 'hybrid',
        protocol: 'mqtt',
        name: 'Weather Station',
        description: 'Complete weather monitoring station',
        location: 'Weather Station - Main Campus',
        timezone: 'UTC',
        status: 'online'
      }
    ];

    for (const device of testDevices) {
      // Check if device already exists
      const existingDevice = await pool.query(
        'SELECT device_id FROM devices WHERE device_id = $1',
        [device.device_id]
      );

      if (existingDevice.rows.length === 0) {
        await pool.query(`
          INSERT INTO devices (
            device_id, device_type, protocol, name, description, location, 
            timezone, status, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [
          device.device_id,
          device.device_type,
          device.protocol,
          device.name,
          device.description,
          device.location,
          device.timezone,
          device.status
        ]);

        console.log(`✓ Created device: ${device.name} (${device.device_id})`);
      } else {
        console.log(`- Device already exists: ${device.name} (${device.device_id})`);
      }
    }

    // Grant permissions to all users for these test devices
    const users = await pool.query('SELECT user_id FROM users');
    const devices = await pool.query('SELECT device_id FROM devices WHERE device_id IN ($1, $2, $3, $4)', 
      ['sensor_001', 'sensor_002', 'gps_001', 'hybrid_001']);

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
        }
      }
    }

    console.log('✓ Test devices created successfully');
    console.log('✓ Device permissions granted to all users');

  } catch (error) {
    console.error('Failed to create test devices:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
createTestDevices(); 