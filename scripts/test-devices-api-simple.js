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

const testSimpleQuery = async () => {
  try {
    console.log('Testing simple devices query...\n');

    // Test the exact query that's failing
    const testUser = { user_id: 10, username: 'admin0', role: 'viewer' };
    
    const conditions = [];
    const params = [];
    let paramCount = 1;

    // Add user permission filter (except for super admins)
    if (testUser.role !== 'super_admin') {
      // Check both user-specific permissions and role-based permissions
      conditions.push(`(
        udp.user_id = $${paramCount++} OR 
        EXISTS (
          SELECT 1 FROM user_roles ur 
          JOIN role_device_permissions rdp ON ur.role_id = rdp.role_id 
          WHERE ur.user_id = $${paramCount++} AND rdp.device_id = d.device_id
        )
      )`);
      params.push(testUser.user_id, testUser.user_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get devices
    const devicesQuery = `
      SELECT DISTINCT 
        d.*,
        dg.name as group_name,
        COALESCE(udp.permissions, '{}'::jsonb) as user_permissions,
        COALESCE(rdp.permissions, '{}'::jsonb) as role_permissions
      FROM devices d
      LEFT JOIN device_groups dg ON d.group_id = dg.group_id
      LEFT JOIN user_device_permissions udp ON d.device_id = udp.device_id AND udp.user_id = $${paramCount++}
      LEFT JOIN user_roles ur ON ur.user_id = $${paramCount++}
      LEFT JOIN role_device_permissions rdp ON ur.role_id = rdp.role_id AND rdp.device_id = d.device_id
      ${whereClause}
      ORDER BY d.created_at DESC
    `;

    params.push(testUser.user_id, testUser.user_id);

    console.log('Query:', devicesQuery);
    console.log('Params:', params);

    try {
      const devices = await pool.query(devicesQuery, params);
      console.log(`✓ Query successful! Found ${devices.rows.length} devices:`);
      devices.rows.forEach(device => {
        console.log(`  - ${device.name} (${device.device_id}) - ${device.status}`);
      });
    } catch (queryError) {
      console.error(`✗ Query failed:`, queryError.message);
      console.error('Full error:', queryError);
    }

  } catch (error) {
    console.error('Failed to test devices API:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
testSimpleQuery(); 