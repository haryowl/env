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

const debugDevicesQuery = async () => {
  try {
    console.log('Debugging devices query...\n');

    // Test super admin query (no conditions)
    console.log('=== Testing Super Admin Query ===');
    const superAdminQuery = `
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
    `;

    try {
      const superAdminDevices = await pool.query(superAdminQuery, [1, 1]); // user_id = 1 for admin
      console.log(`✓ Super admin query successful! Found ${superAdminDevices.rows.length} devices`);
    } catch (error) {
      console.error(`✗ Super admin query failed:`, error.message);
    }

    // Test viewer query (with conditions)
    console.log('\n=== Testing Viewer Query ===');
    const viewerQuery = `
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
      WHERE (
        udp.user_id = $3 OR 
        EXISTS (
          SELECT 1 FROM user_roles ur2 
          JOIN role_device_permissions rdp2 ON ur2.role_id = rdp2.role_id 
          WHERE ur2.user_id = $4 AND rdp2.device_id = d.device_id
        )
      )
      ORDER BY d.created_at DESC
    `;

    try {
      const viewerDevices = await pool.query(viewerQuery, [10, 10, 10, 10]); // user_id = 10 for admin0
      console.log(`✓ Viewer query successful! Found ${viewerDevices.rows.length} devices`);
    } catch (error) {
      console.error(`✗ Viewer query failed:`, error.message);
    }

    // Test simple query without complex joins
    console.log('\n=== Testing Simple Query ===');
    const simpleQuery = `
      SELECT 
        d.*,
        dg.name as group_name
      FROM devices d
      LEFT JOIN device_groups dg ON d.group_id = dg.group_id
      ORDER BY d.created_at DESC
    `;

    try {
      const simpleDevices = await pool.query(simpleQuery);
      console.log(`✓ Simple query successful! Found ${simpleDevices.rows.length} devices`);
    } catch (error) {
      console.error(`✗ Simple query failed:`, error.message);
    }

  } catch (error) {
    console.error('Failed to debug devices query:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
debugDevicesQuery(); 