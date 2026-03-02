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

const testSuperAdminQuery = async () => {
  try {
    console.log('Testing super admin query (no conditions)...\n');

    // Simulate super admin query - no conditions, no parameters
    const superAdminQuery = `
      SELECT COUNT(DISTINCT d.device_id) as total
      FROM devices d
      LEFT JOIN device_groups dg ON d.group_id = dg.group_id
      LEFT JOIN user_device_permissions udp ON d.device_id = udp.device_id AND udp.user_id = $1
      LEFT JOIN user_roles ur ON ur.user_id = $2
      LEFT JOIN role_device_permissions rdp ON ur.role_id = rdp.role_id AND rdp.device_id = d.device_id
    `;

    try {
      const result = await pool.query(superAdminQuery, [1, 1]); // user_id = 1 for admin
      console.log(`✓ Super admin count query successful! Total: ${result.rows[0].total}`);
    } catch (error) {
      console.error(`✗ Super admin count query failed:`, error.message);
    }

    // Test the full devices query for super admin
    const devicesQuery = `
      SELECT DISTINCT 
        d.*,
        dg.name as group_name,
        COALESCE(udp.permissions, '{}'::jsonb) as user_permissions,
        COALESCE(rdp.permissions, '{}'::jsonb) as role_permissions
      FROM devices d
      LEFT JOIN device_groups dg ON d.group_id = dg.group_id
      LEFT JOIN user_device_permissions udp ON d.device_id = udp.device_id AND udp.user_id = $1
      LEFT JOIN user_roles ur ON ur.user_id = $2
      LEFT JOIN role_device_permissions rdp ON ur.role_id = rdp.role_id AND rdp.device_id = d.device_id
      ORDER BY d.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    try {
      const devices = await pool.query(devicesQuery, [1, 1, 20, 0]); // user_id = 1, limit = 20, offset = 0
      console.log(`✓ Super admin devices query successful! Found ${devices.rows.length} devices`);
      devices.rows.forEach(device => {
        console.log(`  - ${device.name} (${device.device_id})`);
      });
    } catch (error) {
      console.error(`✗ Super admin devices query failed:`, error.message);
    }

  } catch (error) {
    console.error('Failed to test super admin query:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
testSuperAdminQuery(); 