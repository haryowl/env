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

const checkExistingRoles = async () => {
  try {
    console.log('Checking existing roles in database...\n');

    // Check roles table
    const rolesResult = await pool.query('SELECT role_id, role_name, display_name, is_system_role FROM roles ORDER BY role_name');
    console.log('=== Roles in roles table ===');
    if (rolesResult.rows.length === 0) {
      console.log('No roles found in roles table');
    } else {
      rolesResult.rows.forEach(role => {
        console.log(`${role.role_name} (${role.display_name}) - System: ${role.is_system_role}`);
      });
    }

    // Check users table to see what roles are being used
    const usersResult = await pool.query('SELECT DISTINCT role FROM users ORDER BY role');
    console.log('\n=== Roles used in users table ===');
    if (usersResult.rows.length === 0) {
      console.log('No roles found in users table');
    } else {
      usersResult.rows.forEach(user => {
        console.log(user.role);
      });
    }

    // Check if there's a mismatch
    const rolesInRolesTable = rolesResult.rows.map(r => r.role_name);
    const rolesInUsersTable = usersResult.rows.map(u => u.role);
    
    console.log('\n=== Analysis ===');
    console.log('Roles in roles table:', rolesInRolesTable);
    console.log('Roles in users table:', rolesInUsersTable);
    
    const missingRoles = rolesInUsersTable.filter(role => !rolesInRolesTable.includes(role));
    if (missingRoles.length > 0) {
      console.log('\n⚠️  Missing roles (used in users but not in roles table):', missingRoles);
    } else {
      console.log('\n✓ All roles in users table exist in roles table');
    }

  } catch (error) {
    console.error('Error checking roles:', error);
  } finally {
    await pool.end();
  }
};

checkExistingRoles(); 