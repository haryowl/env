require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function testTechnicianMiddleware() {
  console.log('🧪 Testing technician middleware logic...\n');

  try {
    // Get technician user
    const technicianUser = await getRow('SELECT user_id, username, role FROM users WHERE username = $1', ['tech111']);
    
    if (!technicianUser) {
      console.log('❌ Technician user tech111 not found');
      return;
    }

    console.log(`✅ Found technician user: ${technicianUser.username} (ID: ${technicianUser.user_id})`);

    // Simulate the middleware logic
    console.log('\n🔍 Simulating authorizeMenuAccess middleware for /technician...');
    
    // Get user's role assignments
    const userRoles = await getRows(`
      SELECT r.role_id, r.role_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
    `, [technicianUser.user_id]);

    console.log('\nUser role assignments:');
    userRoles.forEach(role => {
      console.log(`   • ${role.role_name} (ID: ${role.role_id})`);
    });

    // Check menu permissions for /technician
    const menuPath = '/technician';
    let hasAccess = false;

    for (const userRole of userRoles) {
      const menuPermission = await getRow(`
        SELECT can_access, can_create, can_read, can_update, can_delete
        FROM menu_permissions 
        WHERE role_id = $1 AND menu_path = $2
      `, [userRole.role_id, menuPath]);

      console.log(`\nChecking ${userRole.role_name} (ID: ${userRole.role_id}) for ${menuPath}:`);
      
      if (menuPermission) {
        console.log(`   ✅ Permission found:`, menuPermission);
        if (menuPermission.can_access) {
          hasAccess = true;
          console.log(`   🎉 User HAS ACCESS to ${menuPath}`);
          break;
        } else {
          console.log(`   ❌ User does NOT have access to ${menuPath}`);
        }
      } else {
        console.log(`   ❌ No permission found for ${menuPath}`);
      }
    }

    console.log(`\n🎯 Final Result: ${hasAccess ? '✅ ACCESS GRANTED' : '❌ ACCESS DENIED'}`);

    if (hasAccess) {
      console.log('\n✅ The technician middleware should work correctly!');
    } else {
      console.log('\n❌ The technician middleware will block access - this explains the 403 errors!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testTechnicianMiddleware();


