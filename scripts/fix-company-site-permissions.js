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

async function fixCompanySitePermissions() {
  const client = await pool.connect();
  try {
    console.log('=== Fixing Company Site Permissions ===\n');
    
    // First, let's see what permissions each role currently has
    const roles = await client.query(`
      SELECT role_id, role_name, display_name, menu_permissions
      FROM roles 
      ORDER BY role_name
    `);
    
    console.log('Current role permissions:');
    roles.rows.forEach(role => {
      console.log(`\n${role.role_name} (${role.display_name}):`);
      if (role.menu_permissions) {
        Object.keys(role.menu_permissions).forEach(menu => {
          console.log(`  ${menu}: ${JSON.stringify(role.menu_permissions[menu])}`);
        });
      }
    });
    
    // Update roles to include /company-site permission
    const updatePromises = roles.rows.map(role => {
      const currentPermissions = role.menu_permissions || {};
      const updatedPermissions = {
        ...currentPermissions,
        '/company-site': { access: true, read: true, create: true, update: true, delete: true }
      };
      
      return client.query(`
        UPDATE roles 
        SET menu_permissions = $1 
        WHERE role_id = $2
      `, [JSON.stringify(updatedPermissions), role.role_id]);
    });
    
    await Promise.all(updatePromises);
    console.log('\n✅ Updated all roles with /company-site permissions');
    
    // Now assign users to their roles in user_roles table
    const users = await client.query('SELECT user_id, username, role FROM users');
    
    console.log('\nAssigning users to roles:');
    for (const user of users.rows) {
      // Find the role by name
      const role = roles.rows.find(r => r.role_name === user.role);
      if (role) {
        // Check if user-role assignment already exists
        const existing = await client.query(`
          SELECT user_id FROM user_roles WHERE user_id = $1 AND role_id = $2
        `, [user.user_id, role.role_id]);
        
        if (existing.rows.length === 0) {
          await client.query(`
            INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at)
            VALUES ($1, $2, true, NOW())
          `, [user.user_id, role.role_id]);
          console.log(`  ✅ Assigned ${user.username} to ${role.role_name}`);
        } else {
          console.log(`  ⚠️  ${user.username} already assigned to ${role.role_name}`);
        }
      } else {
        console.log(`  ❌ Role ${user.role} not found for user ${user.username}`);
      }
    }
    
    // Verify the fixes
    console.log('\n=== Verification ===');
    const usersWithPermission = await client.query(`
      SELECT u.user_id, u.username, r.role_name, r.menu_permissions->'/company-site' as company_site_permission
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id AND ur.is_primary = true
      LEFT JOIN roles r ON ur.role_id = r.role_id
      WHERE r.menu_permissions ? 'company-site'
    `);
    
    console.log('Users with /company-site permission:');
    usersWithPermission.rows.forEach(user => {
      console.log(`  ${user.username}: ${JSON.stringify(user.company_site_permission)}`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

fixCompanySitePermissions().catch(console.error);


