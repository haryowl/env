require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function testMePermissionsAPI() {
  console.log('🧪 Testing /me/permissions API logic...\n');

  try {
    // Test with admin user (ID: 1)
    const userId = 1;
    console.log(`Testing with admin user (ID: ${userId})...\n`);

    // Get user's primary role and all assigned roles with their permissions
    const userRoles = await getRows(`
      SELECT 
        r.role_id,
        r.role_name,
        r.display_name,
        r.permissions,
        r.menu_permissions,
        r.device_permissions,
        ur.is_primary
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
      ORDER BY ur.is_primary DESC, r.display_name ASC
    `, [userId]);

    console.log('1️⃣ User roles from user_roles table:');
    if (userRoles.length === 0) {
      console.log('   ❌ No roles found in user_roles table');
    } else {
      userRoles.forEach(role => {
        console.log(`   • ${role.role_name} (ID: ${role.role_id}) ${role.is_primary ? '[PRIMARY]' : ''}`);
      });
    }

    // If no roles found, fall back to the user's primary role from users table
    if (userRoles.length === 0) {
      console.log('\n2️⃣ Fallback: Checking users table...');
      const user = await getRow('SELECT role FROM users WHERE user_id = $1', [userId]);
      if (user && user.role) {
        console.log(`   Found user role: ${user.role}`);
        
        // Get the role_id for the user's primary role
        const roleRecord = await getRow('SELECT role_id, role_name, display_name FROM roles WHERE role_name = $1', [user.role]);
        if (roleRecord) {
          console.log(`   Found role record: ${roleRecord.role_name} (ID: ${roleRecord.role_id})`);
          
          // Get menu permissions from the menu_permissions table
          const menuPermissions = await getRows(`
            SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
            FROM menu_permissions 
            WHERE role_id = $1
          `, [roleRecord.role_id]);

          console.log(`   Menu permissions found: ${menuPermissions.length}`);
          menuPermissions.forEach(perm => {
            console.log(`      • ${perm.menu_path} - ${perm.menu_name}: ACCESS ${perm.can_access ? '✅' : '❌'}`);
          });

          userRoles.push({
            role_id: roleRecord.role_id,
            role_name: roleRecord.role_name,
            display_name: roleRecord.display_name,
            permissions: {},
            menu_permissions: {},
            device_permissions: {},
            is_primary: true
          });
        }
      }
    }

    // Merge permissions from all roles (primary role takes precedence)
    const mergedPermissions = {
      menu_permissions: {},
      device_permissions: {},
      roles: userRoles.map(role => ({
        role_id: role.role_id,
        role_name: role.role_name,
        display_name: role.display_name,
        is_primary: role.is_primary
      }))
    };

    console.log('\n3️⃣ Merging menu permissions...');
    
    // Merge menu permissions from menu_permissions table (primary role permissions override others)
    for (const role of userRoles) {
      console.log(`   Processing role: ${role.role_name} (ID: ${role.role_id})`);
      
      const menuPermissions = await getRows(`
        SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
        FROM menu_permissions 
        WHERE role_id = $1
      `, [role.role_id]);

      console.log(`   Found ${menuPermissions.length} menu permissions`);
      
      menuPermissions.forEach(perm => {
        const menuPath = perm.menu_path;
        if (!mergedPermissions.menu_permissions[menuPath] || role.is_primary) {
          mergedPermissions.menu_permissions[menuPath] = {
            menu_path: perm.menu_path,
            menu_name: perm.menu_name,
            can_access: perm.can_access,
            can_create: perm.can_create,
            can_read: perm.can_read,
            can_update: perm.can_update,
            can_delete: perm.can_delete
          };
          console.log(`      ✅ Added: ${perm.menu_path} - ${perm.menu_name}: ACCESS ${perm.can_access ? '✅' : '❌'}`);
        } else {
          console.log(`      ⏭️  Skipped (not primary): ${perm.menu_path}`);
        }
      });
    }

    console.log('\n4️⃣ Final merged permissions:');
    Object.keys(mergedPermissions.menu_permissions).forEach(menuPath => {
      const perm = mergedPermissions.menu_permissions[menuPath];
      console.log(`   • ${menuPath} - ${perm.menu_name}: ACCESS ${perm.can_access ? '✅' : '❌'}`);
    });

    console.log('\n5️⃣ API Response structure:');
    console.log(JSON.stringify({
      success: true,
      permissions: mergedPermissions
    }, null, 2));

  } catch (error) {
    console.error('❌ Error testing API:', error);
  }
}

testMePermissionsAPI();


