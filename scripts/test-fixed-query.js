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

const testFixedQuery = async () => {
  try {
    console.log('Testing fixed query structure...\n');

    // Test super admin query (no conditions)
    console.log('=== Testing Super Admin Query ===');
    const conditions = [];
    const params = [];
    
    // Always add the required parameters for JOIN clauses
    params.push(1, 1); // user_id = 1 for admin

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(DISTINCT d.device_id) as total
      FROM devices d
      LEFT JOIN device_groups dg ON d.group_id = dg.group_id
      LEFT JOIN user_device_permissions udp ON d.device_id = udp.device_id AND udp.user_id = $1
      LEFT JOIN user_roles ur ON ur.user_id = $2
      LEFT JOIN role_device_permissions rdp ON ur.role_id = rdp.role_id AND rdp.device_id = d.device_id
      ${whereClause}
    `;

    try {
      const countResult = await pool.query(countQuery, params);
      console.log(`✓ Super admin count query successful! Total: ${countResult.rows[0].total}`);
    } catch (error) {
      console.error(`✗ Super admin count query failed:`, error.message);
    }

    // Test devices query
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
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    // Add pagination parameters
    params.push(20, 0); // limit = 20, offset = 0

    try {
      const devices = await pool.query(devicesQuery, params);
      console.log(`✓ Super admin devices query successful! Found ${devices.rows.length} devices`);
      devices.rows.forEach(device => {
        console.log(`  - ${device.name} (${device.device_id})`);
      });
    } catch (error) {
      console.error(`✗ Super admin devices query failed:`, error.message);
    }

  } catch (error) {
    console.error('Failed to test fixed query:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
testFixedQuery(); 