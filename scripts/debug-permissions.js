require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function debugPermissions() {
  console.log('🔍 Debugging permission system...\n');

  try {
    // Check admin user
    const adminUser = await getRow('SELECT user_id, username, role FROM users WHERE username = $1', ['admin']);
    console.log(`Admin user: ${adminUser.username} (ID: ${adminUser.user_id}, Role: ${adminUser.role})`);

    // Check all menu permissions for super_admin role
    const superAdminRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['super_admin']);
    console.log(`\nSuper admin role ID: ${superAdminRole.role_id}`);

    const allPermissions = await getRows(`
      SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
      FROM menu_permissions 
      WHERE role_id = $1
      ORDER BY menu_path
    `, [superAdminRole.role_id]);

    console.log('\n📋 All super_admin permissions:');
    allPermissions.forEach(perm => {
      console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ${perm.can_access ? 'ACCESS ✅' : 'NO ACCESS ❌'}`);
    });

    // Test the /users/me/permissions endpoint simulation
    console.log('\n🧪 Testing /users/me/permissions endpoint logic...');
    
    // Get user's role assignments
    const userRoles = await getRows(`
      SELECT r.role_id, r.role_name, r.display_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
    `, [adminUser.user_id]);

    console.log('\nUser role assignments:');
    userRoles.forEach(role => {
      console.log(`   - ${role.role_name} (ID: ${role.role_id})`);
    });

    // Get menu permissions for each role (simulating the API endpoint)
    const permissions = {};
    
    for (const userRole of userRoles) {
      const menuPermissions = await getRows(`
        SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
        FROM menu_permissions 
        WHERE role_id = $1
      `, [userRole.role_id]);

      console.log(`\nPermissions for ${userRole.role_name}:`);
      menuPermissions.forEach(perm => {
        console.log(`   - ${perm.menu_path}: access=${perm.can_access}, read=${perm.can_read}`);
      });

      // Merge permissions (OR logic - if any role has permission, grant it)
      menuPermissions.forEach(perm => {
        if (!permissions[perm.menu_path]) {
          permissions[perm.menu_path] = {
            menu_path: perm.menu_path,
            menu_name: perm.menu_name,
            can_access: false,
            can_create: false,
            can_read: false,
            can_update: false,
            can_delete: false
          };
        }
        
        // OR logic - if any role has permission, grant it
        permissions[perm.menu_path].can_access = permissions[perm.menu_path].can_access || perm.can_access;
        permissions[perm.menu_path].can_create = permissions[perm.menu_path].can_create || perm.can_create;
        permissions[perm.menu_path].can_read = permissions[perm.menu_path].can_read || perm.can_read;
        permissions[perm.menu_path].can_update = permissions[perm.menu_path].can_update || perm.can_update;
        permissions[perm.menu_path].can_delete = permissions[perm.menu_path].can_delete || perm.can_delete;
      });
    }

    console.log('\n🎯 Final merged permissions (what the API should return):');
    Object.values(permissions).forEach(perm => {
      console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ${perm.can_access ? 'ACCESS ✅' : 'NO ACCESS ❌'}`);
    });

    // Check specifically for In Addition menus
    const inAdditionMenus = ['/company-site', '/sensor-management', '/maintenance'];
    console.log('\n🔍 Checking In Addition menus specifically:');
    inAdditionMenus.forEach(menu => {
      const perm = permissions[menu];
      if (perm) {
        console.log(`   • ${menu}: ${perm.can_access ? 'ACCESS ✅' : 'NO ACCESS ❌'}`);
      } else {
        console.log(`   • ${menu}: NOT FOUND ❌`);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugPermissions();


