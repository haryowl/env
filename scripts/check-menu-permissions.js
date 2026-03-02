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

const checkMenuPermissions = async () => {
  try {
    console.log('Checking role menu permissions...\n');

    // Check current menu permissions for all roles
    const roleMenuPermissions = await pool.query(`
      SELECT 
        role_id,
        role_name,
        display_name,
        menu_permissions
      FROM roles
      ORDER BY role_name
    `);

    console.log('=== Current Menu Permissions ===');
    roleMenuPermissions.rows.forEach(row => {
      console.log(`\n${row.role_name} (${row.display_name}):`);
      if (row.menu_permissions && Object.keys(row.menu_permissions).length > 0) {
        Object.entries(row.menu_permissions).forEach(([menuPath, permissions]) => {
          console.log(`  ${menuPath}: ${JSON.stringify(permissions)}`);
        });
      } else {
        console.log('  No menu permissions defined');
      }
    });

    // Check if /scheduled-exports is missing from super_admin role
    const superAdminRole = roleMenuPermissions.rows.find(role => role.role_name === 'super_admin');
    if (superAdminRole) {
      console.log('\n=== Super Admin Menu Permissions Check ===');
      const menuPerms = superAdminRole.menu_permissions || {};
      
      if (!menuPerms['/scheduled-exports']) {
        console.log('❌ /scheduled-exports is MISSING from super_admin role');
        console.log('Adding /scheduled-exports permission to super_admin role...');
        
        // Add the permission
        const updatedMenuPerms = {
          ...menuPerms,
          '/scheduled-exports': {
            access: true,
            create: true,
            read: true,
            update: true,
            delete: true
          }
        };
        
        await pool.query(`
          UPDATE roles 
          SET menu_permissions = $1 
          WHERE role_name = 'super_admin'
        `, [JSON.stringify(updatedMenuPerms)]);
        
        console.log('✅ Successfully added /scheduled-exports permission to super_admin role');
      } else {
        console.log('✅ /scheduled-exports is already present in super_admin role');
      }
    }

    // Also check other admin-level roles
    const adminRoles = ['super_admin', 'admin'];
    for (const roleName of adminRoles) {
      const role = roleMenuPermissions.rows.find(r => r.role_name === roleName);
      if (role) {
        const menuPerms = role.menu_permissions || {};
        if (!menuPerms['/scheduled-exports']) {
          console.log(`\nAdding /scheduled-exports permission to ${roleName} role...`);
          
          const updatedMenuPerms = {
            ...menuPerms,
            '/scheduled-exports': {
              access: true,
              create: true,
              read: true,
              update: true,
              delete: true
            }
          };
          
          await pool.query(`
            UPDATE roles 
            SET menu_permissions = $1 
            WHERE role_name = $2
          `, [JSON.stringify(updatedMenuPerms), roleName]);
          
          console.log(`✅ Successfully added /scheduled-exports permission to ${roleName} role`);
        }
      }
    }

    // Show final menu permissions
    console.log('\n=== Final Menu Permissions ===');
    const finalPermissions = await pool.query(`
      SELECT role_name, display_name, menu_permissions
      FROM roles
      WHERE role_name IN ('super_admin', 'admin')
      ORDER BY role_name
    `);

    finalPermissions.rows.forEach(row => {
      console.log(`\n${row.role_name} (${row.display_name}):`);
      if (row.menu_permissions && row.menu_permissions['/scheduled-exports']) {
        console.log(`  /scheduled-exports: ${JSON.stringify(row.menu_permissions['/scheduled-exports'])}`);
      }
    });

  } catch (error) {
    console.error('Failed to check/update menu permissions:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
checkMenuPermissions();



