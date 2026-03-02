const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function checkUserPermissions() {
  const client = await pool.connect();
  try {
    console.log('=== Checking User Permissions ===\n');
    
    // Check which roles have /company-site permission
    const rolesWithPermission = await client.query(`
      SELECT role_id, role_name, display_name, menu_permissions
      FROM roles 
      WHERE menu_permissions ? 'company-site'
    `);
    
    console.log('Roles with /company-site permission:');
    rolesWithPermission.rows.forEach(role => {
      const perm = role.menu_permissions['/company-site'];
      console.log(`  ${role.role_name} (${role.display_name}):`, perm);
    });
    
    // Check user roles assignments
    const userRoles = await client.query(`
      SELECT u.user_id, u.username, u.role, ur.role_id, r.role_name, r.display_name
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.role_id
      ORDER BY u.user_id
    `);
    
    console.log('\nUser role assignments:');
    userRoles.rows.forEach(user => {
      console.log(`  ${user.username} (${user.user_id}): ${user.role} -> ${user.role_name || 'No role assigned'}`);
    });
    
    // Check if any users have /company-site permission
    const usersWithPermission = await client.query(`
      SELECT u.user_id, u.username, u.role, r.role_name, r.menu_permissions
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id AND ur.is_primary = true
      LEFT JOIN roles r ON ur.role_id = r.role_id
      WHERE r.menu_permissions ? 'company-site'
    `);
    
    console.log('\nUsers with /company-site permission:');
    if (usersWithPermission.rows.length === 0) {
      console.log('  No users found with /company-site permission');
    } else {
      usersWithPermission.rows.forEach(user => {
        const perm = user.menu_permissions['/company-site'];
        console.log(`  ${user.username}: ${perm}`);
      });
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkUserPermissions().catch(console.error);


