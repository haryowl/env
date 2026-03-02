require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function checkAllRolesPermissions() {
  console.log('🔍 Checking ALL roles permissions...\n');

  try {
    // Get all roles
    const allRoles = await getRows('SELECT role_id, role_name, display_name FROM roles ORDER BY role_id');
    
    console.log('📋 All roles in system:');
    allRoles.forEach(role => {
      console.log(`  • ${role.role_name} (ID: ${role.role_id}) - ${role.display_name}`);
    });

    console.log('\n📊 Permissions for each role:');
    
    for (const role of allRoles) {
      console.log(`\n🔸 ${role.role_name.toUpperCase()} (ID: ${role.role_id}):`);
      
      const permissions = await getRows(`
        SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
        FROM menu_permissions 
        WHERE role_id = $1
        ORDER BY menu_path
      `, [role.role_id]);

      if (permissions.length === 0) {
        console.log('   ❌ No permissions found');
      } else {
        permissions.forEach(perm => {
          console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ACCESS ${perm.can_access ? '✅' : '❌'}`);
        });
      }
    }

    // Check specific users
    console.log('\n👥 Checking specific users:');
    const testUsers = ['admin', 'tech111', 'operator', 'viewer'];
    
    for (const username of testUsers) {
      const user = await getRow('SELECT user_id, username, role FROM users WHERE username = $1', [username]);
      
      if (user) {
        console.log(`\n🔸 User: ${user.username} (ID: ${user.user_id}, Role: ${user.role})`);
        
        // Check user role assignments
        const userRoles = await getRows(`
          SELECT r.role_name, r.role_id, ur.is_primary
          FROM user_roles ur
          JOIN roles r ON ur.role_id = r.role_id
          WHERE ur.user_id = $1
        `, [user.user_id]);

        if (userRoles.length === 0) {
          console.log('   ❌ No role assignments in user_roles table');
        } else {
          console.log('   📋 Role assignments:');
          userRoles.forEach(ur => {
            console.log(`      • ${ur.role_name} (ID: ${ur.role_id}) ${ur.is_primary ? '[PRIMARY]' : ''}`);
          });
        }
      } else {
        console.log(`\n❌ User ${username} not found`);
      }
    }

  } catch (error) {
    console.error('❌ Error checking permissions:', error);
  }
}

checkAllRolesPermissions();


