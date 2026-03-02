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

const checkRolePermissions = async () => {
  try {
    console.log('Checking role permissions...\n');

    // Check role device permissions
    console.log('=== Role Device Permissions ===');
    const roleDevicePermissions = await pool.query(`
      SELECT 
        r.role_name,
        r.display_name,
        rdp.device_id,
        d.name as device_name,
        rdp.permissions
      FROM role_device_permissions rdp
      JOIN roles r ON rdp.role_id = r.role_id
      JOIN devices d ON rdp.device_id = d.device_id
      ORDER BY r.role_name, d.name
    `);

    if (roleDevicePermissions.rows.length === 0) {
      console.log('No role device permissions found.');
    } else {
      roleDevicePermissions.rows.forEach(row => {
        console.log(`${row.role_name} (${row.display_name}) -> ${row.device_name} (${row.device_id}): ${JSON.stringify(row.permissions)}`);
      });
    }

    console.log('\n=== User Device Permissions ===');
    const userDevicePermissions = await pool.query(`
      SELECT 
        u.username,
        udp.device_id,
        d.name as device_name,
        udp.permissions
      FROM user_device_permissions udp
      JOIN users u ON udp.user_id = u.user_id
      JOIN devices d ON udp.device_id = d.device_id
      ORDER BY u.username, d.name
    `);

    if (userDevicePermissions.rows.length === 0) {
      console.log('No user device permissions found.');
    } else {
      userDevicePermissions.rows.forEach(row => {
        console.log(`${row.username} -> ${row.device_name} (${row.device_id}): ${JSON.stringify(row.permissions)}`);
      });
    }

    console.log('\n=== User Roles ===');
    const userRoles = await pool.query(`
      SELECT 
        u.username,
        r.role_name,
        r.display_name,
        ur.is_primary
      FROM user_roles ur
      JOIN users u ON ur.user_id = u.user_id
      JOIN roles r ON ur.role_id = r.role_id
      ORDER BY u.username, ur.is_primary DESC
    `);

    if (userRoles.rows.length === 0) {
      console.log('No user roles found.');
    } else {
      userRoles.rows.forEach(row => {
        console.log(`${row.username} -> ${row.role_name} (${row.display_name}) ${row.is_primary ? '[PRIMARY]' : ''}`);
      });
    }

  } catch (error) {
    console.error('Failed to check role permissions:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
checkRolePermissions(); 