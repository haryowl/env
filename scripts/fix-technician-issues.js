require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function fixTechnicianIssues() {
  console.log('🔧 Fixing technician issues...\n');

  try {
    // 1. Check if technician role exists
    const technicianRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['technician']);
    
    if (!technicianRole) {
      console.log('❌ Technician role not found - creating it...');
      const newRole = await query(`
        INSERT INTO roles (role_name, display_name, description, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING role_id
      `, ['technician', 'Field Technician', 'Field technician for maintenance operations']);
      
      console.log(`✅ Created technician role (ID: ${newRole.rows[0].role_id})`);
    } else {
      console.log(`✅ Technician role exists (ID: ${technicianRole.role_id})`);
    }

    const roleId = technicianRole ? technicianRole.role_id : (await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['technician'])).role_id;

    // 2. Add missing permissions for technician role
    const requiredPermissions = [
      { path: '/technician', name: 'Technician Dashboard', access: true, create: true, read: true, update: true, delete: false },
      { path: '/maintenance', name: 'Maintenance', access: true, create: false, read: true, update: true, delete: false },
      { path: '/dashboard', name: 'Dashboard', access: true, create: false, read: true, update: false, delete: false },
      { path: '/devices', name: 'Devices', access: true, create: false, read: true, update: false, delete: false },
      { path: '/data', name: 'Data', access: true, create: false, read: true, update: false, delete: false },
      { path: '/data-dash', name: 'Data Dashboard', access: true, create: false, read: true, update: false, delete: false }
    ];

    console.log('\n📝 Adding technician permissions...');
    
    for (const perm of requiredPermissions) {
      // Check if permission already exists
      const existing = await getRow(`
        SELECT permission_id FROM menu_permissions 
        WHERE role_id = $1 AND menu_path = $2
      `, [roleId, perm.path]);

      if (existing) {
        console.log(`   ✅ ${perm.path} permission already exists`);
      } else {
        await query(`
          INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [roleId, perm.path, perm.name, perm.access, perm.create, perm.read, perm.update, perm.delete]);
        
        console.log(`   ✅ Added ${perm.path} permission`);
      }
    }

    // 3. Check if technician user exists and has role assignment
    const technicianUser = await getRow('SELECT user_id, username, role FROM users WHERE username = $1', ['tech111']);
    
    if (!technicianUser) {
      console.log('\n❌ Technician user tech111 not found');
      console.log('Please create the technician user first');
      return;
    }

    console.log(`\n✅ Found technician user: ${technicianUser.username} (ID: ${technicianUser.user_id})`);

    // Check if user has technician role assignment
    const userRoleAssignment = await getRow(`
      SELECT ur.user_id FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1 AND r.role_name = $2
    `, [technicianUser.user_id, 'technician']);

    if (!userRoleAssignment) {
      console.log('   ❌ Technician user not assigned technician role - fixing...');
      await query(`
        INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at)
        VALUES ($1, $2, $3, NOW())
      `, [technicianUser.user_id, roleId, 1]); // Assigned by admin (user_id: 1)
      
      console.log('   ✅ Assigned technician role to tech111 user');
    } else {
      console.log('   ✅ Technician user already has technician role assignment');
    }

    // 4. Verify final permissions
    console.log('\n📊 Verifying technician permissions...');
    const finalPermissions = await getRows(`
      SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
      FROM menu_permissions 
      WHERE role_id = $1
      ORDER BY menu_path
    `, [roleId]);

    console.log('Final technician permissions:');
    finalPermissions.forEach(perm => {
      console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ${perm.can_access ? 'ACCESS ✅' : 'NO ACCESS ❌'}`);
    });

    console.log('\n🎉 Technician issues fix completed!');
    console.log('\n📝 Next steps:');
    console.log('   1. Clear browser cache (Ctrl+Shift+Delete)');
    console.log('   2. Logout and login again as tech111');
    console.log('   3. Check if "Field Operations" menu appears');
    console.log('   4. Test the "Assigned Person" dropdown in maintenance form');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixTechnicianIssues();


