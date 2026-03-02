require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function checkAdminPermissions() {
  console.log('🔍 Checking admin permissions...\n');

  try {
    // Check admin user
    console.log('1️⃣ Checking admin user...');
    const adminUser = await getRow('SELECT user_id, username, role FROM users WHERE username = $1', ['admin']);
    
    if (!adminUser) {
      console.log('❌ Admin user not found');
      return;
    }
    
    console.log(`✅ Admin user: ${adminUser.username} (ID: ${adminUser.user_id}, Role: ${adminUser.role})`);

    // Check admin role assignments
    console.log('\n2️⃣ Checking admin role assignments...');
    const adminRoles = await getRows(`
      SELECT r.role_name, r.role_id, ur.assigned_by
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
    `, [adminUser.user_id]);

    console.log('Admin role assignments:');
    adminRoles.forEach(role => {
      console.log(`   - ${role.role_name} (ID: ${role.role_id})`);
    });

    // Check if admin has super_admin role
    const hasSuperAdminRole = adminRoles.some(role => role.role_name === 'super_admin');
    console.log(`\n   Has super_admin role: ${hasSuperAdminRole ? '✅' : '❌'}`);

    // Check menu permissions for super_admin role
    console.log('\n3️⃣ Checking super_admin menu permissions...');
    const superAdminRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['super_admin']);
    
    if (superAdminRole) {
      const permissions = await getRows(`
        SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
        FROM menu_permissions 
        WHERE role_id = $1
        ORDER BY menu_path
      `, [superAdminRole.role_id]);

      console.log('Super admin permissions:');
      permissions.forEach(perm => {
        console.log(`   • ${perm.menu_name} (${perm.menu_path}): ${perm.can_access ? '✅' : '❌'}`);
      });

      // Check specific missing menus
      const missingMenus = [
        '/company-site',
        '/sensor-management', 
        '/maintenance',
        '/scheduled-exports'
      ];

      console.log('\n4️⃣ Checking for missing menu permissions...');
      missingMenus.forEach(menu => {
        const hasPermission = permissions.some(p => p.menu_path === menu && p.can_access);
        console.log(`   • ${menu}: ${hasPermission ? '✅' : '❌'}`);
      });

    } else {
      console.log('❌ Super admin role not found');
    }

    // Check if admin user has direct role in users table
    console.log('\n5️⃣ Checking admin user role in users table...');
    console.log(`   Admin user role field: ${adminUser.role}`);

    // If admin doesn't have super_admin role assignment, fix it
    if (!hasSuperAdminRole) {
      console.log('\n🔧 FIXING: Adding super_admin role to admin user...');
      
      const superAdminRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['super_admin']);
      if (superAdminRole) {
        await query(`
          INSERT INTO user_roles (user_id, role_id, assigned_by)
          VALUES ($1, $2, $1)
          ON CONFLICT (user_id, role_id) DO NOTHING
        `, [adminUser.user_id, superAdminRole.role_id]);
        console.log('✅ Added super_admin role to admin user');
      }
    }

    console.log('\n🎯 Summary:');
    console.log(`   - Admin user exists: ${adminUser ? '✅' : '❌'}`);
    console.log(`   - Has super_admin role: ${hasSuperAdminRole ? '✅' : '❌'}`);
    console.log(`   - Super admin permissions: ${permissions ? permissions.length : 0} menus`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkAdminPermissions();


