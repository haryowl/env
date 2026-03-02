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

const debugUserPermissions = async () => {
  try {
    console.log('Debugging user permissions for admin user...\n');

    // Get admin user details
    const user = await pool.query(`
      SELECT user_id, username, role, preferences
      FROM users 
      WHERE username = 'admin'
    `);

    if (user.rows.length === 0) {
      console.log('❌ Admin user not found');
      return;
    }

    const adminUser = user.rows[0];
    console.log('=== Admin User Details ===');
    console.log(`User ID: ${adminUser.user_id}`);
    console.log(`Username: ${adminUser.username}`);
    console.log(`Role: ${adminUser.role}`);
    console.log(`Preferences: ${adminUser.preferences || 'None'}`);

    // Get user roles
    const userRoles = await pool.query(`
      SELECT 
        ur.user_id,
        ur.role_id,
        ur.is_primary,
        r.role_name,
        r.display_name,
        r.menu_permissions,
        r.device_permissions
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
      ORDER BY ur.is_primary DESC
    `, [adminUser.user_id]);

    console.log('\n=== User Roles ===');
    userRoles.rows.forEach(role => {
      console.log(`\nRole: ${role.role_name} (${role.display_name}) ${role.is_primary ? '[PRIMARY]' : ''}`);
      console.log(`Menu Permissions: ${JSON.stringify(role.menu_permissions, null, 2)}`);
    });

    // Check specifically for /scheduled-exports permission
    console.log('\n=== /scheduled-exports Permission Check ===');
    const hasPermission = userRoles.rows.some(role => 
      role.menu_permissions && 
      role.menu_permissions['/scheduled-exports'] && 
      role.menu_permissions['/scheduled-exports'].access === true
    );

    if (hasPermission) {
      console.log('✅ Admin user HAS permission to access /scheduled-exports');
    } else {
      console.log('❌ Admin user does NOT have permission to access /scheduled-exports');
    }

    // Show the exact permission object for /scheduled-exports
    userRoles.rows.forEach(role => {
      if (role.menu_permissions && role.menu_permissions['/scheduled-exports']) {
        console.log(`\n/scheduled-exports permission from ${role.role_name}:`);
        console.log(JSON.stringify(role.menu_permissions['/scheduled-exports'], null, 2));
      }
    });

  } catch (error) {
    console.error('Failed to debug user permissions:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
debugUserPermissions();



