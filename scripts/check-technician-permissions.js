require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function checkTechnicianPermissions() {
  console.log('🔍 Checking technician permissions...\n');

  try {
    // Check technician role
    const technicianRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['technician']);
    
    if (!technicianRole) {
      console.log('❌ Technician role not found');
      return;
    }

    console.log(`✅ Found technician role (ID: ${technicianRole.role_id})`);

    // Check technician menu permissions
    const permissions = await getRows(`
      SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
      FROM menu_permissions 
      WHERE role_id = $1
      ORDER BY menu_path
    `, [technicianRole.role_id]);

    console.log('\n📋 Technician permissions:');
    if (permissions.length === 0) {
      console.log('❌ No permissions found for technician role');
    } else {
      permissions.forEach(perm => {
        console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ${perm.can_access ? 'ACCESS ✅' : 'NO ACCESS ❌'}`);
      });
    }

    // Check if technician user exists
    const technicianUser = await getRow('SELECT user_id, username, role FROM users WHERE username = $1', ['tech111']);
    
    if (!technicianUser) {
      console.log('\n❌ Technician user tech111 not found');
      return;
    }

    console.log(`\n✅ Found technician user: ${technicianUser.username} (ID: ${technicianUser.user_id}, Role: ${technicianUser.role})`);

    // Check user role assignments
    const userRoles = await getRows(`
      SELECT r.role_name, r.role_id, ur.assigned_by
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
    `, [technicianUser.user_id]);

    console.log('\n📋 User role assignments:');
    if (userRoles.length === 0) {
      console.log('❌ No role assignments found for technician user');
    } else {
      userRoles.forEach(role => {
        console.log(`   • ${role.role_name} (ID: ${role.role_id})`);
      });
    }

    // Test the permission logic for technician user
    console.log('\n🧪 Testing permission logic...');
    const mergedPermissions = {};

    for (const userRole of userRoles) {
      const menuPermissions = await getRows(`
        SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
        FROM menu_permissions 
        WHERE role_id = $1
      `, [userRole.role_id]);

      menuPermissions.forEach(perm => {
        if (!mergedPermissions[perm.menu_path]) {
          mergedPermissions[perm.menu_path] = {
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
        mergedPermissions[perm.menu_path].can_access = mergedPermissions[perm.menu_path].can_access || perm.can_access;
        mergedPermissions[perm.menu_path].can_create = mergedPermissions[perm.menu_path].can_create || perm.can_create;
        mergedPermissions[perm.menu_path].can_read = mergedPermissions[perm.menu_path].can_read || perm.can_read;
        mergedPermissions[perm.menu_path].can_update = mergedPermissions[perm.menu_path].can_update || perm.can_update;
        mergedPermissions[perm.menu_path].can_delete = mergedPermissions[perm.menu_path].can_delete || perm.can_delete;
      });
    }

    console.log('\n🎯 Final merged permissions for technician user:');
    Object.values(mergedPermissions).forEach(perm => {
      console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ${perm.can_access ? 'ACCESS ✅' : 'NO ACCESS ❌'}`);
    });

    // Check specifically for /technician permission
    const technicianPermission = mergedPermissions['/technician'];
    if (technicianPermission) {
      console.log(`\n✅ /technician permission: ${technicianPermission.can_access ? 'ACCESS ✅' : 'NO ACCESS ❌'}`);
    } else {
      console.log('\n❌ /technician permission: NOT FOUND');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkTechnicianPermissions();


