require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function fixAdminPermissions() {
  console.log('🔧 Fixing admin permissions...\n');

  try {
    // Get super_admin role ID
    const superAdminRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['super_admin']);
    
    if (!superAdminRole) {
      console.log('❌ Super admin role not found');
      return;
    }

    console.log(`✅ Found super_admin role (ID: ${superAdminRole.role_id})`);

    // Check if scheduled-exports permission exists
    console.log('\n🔍 Checking scheduled-exports permission...');
    const existingPermission = await getRow(`
      SELECT permission_id FROM menu_permissions 
      WHERE role_id = $1 AND menu_path = $2
    `, [superAdminRole.role_id, '/scheduled-exports']);

    if (existingPermission) {
      console.log('✅ Scheduled exports permission already exists');
    } else {
      console.log('❌ Scheduled exports permission missing - adding it...');
      
      // Add scheduled-exports permission for super_admin
      await query(`
        INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        superAdminRole.role_id,
        '/scheduled-exports',
        'Scheduled Exports',
        true,  // can_access
        true,  // can_create
        true,  // can_read
        true,  // can_update
        true   // can_delete
      ]);
      
      console.log('✅ Added scheduled exports permission to super_admin role');
    }

    // Also check if admin role has scheduled-exports permission
    console.log('\n🔍 Checking admin role permissions...');
    const adminRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['admin']);
    
    if (adminRole) {
      const adminExistingPermission = await getRow(`
        SELECT permission_id FROM menu_permissions 
        WHERE role_id = $1 AND menu_path = $2
      `, [adminRole.role_id, '/scheduled-exports']);

      if (adminExistingPermission) {
        console.log('✅ Admin role already has scheduled exports permission');
      } else {
        console.log('❌ Admin role missing scheduled exports permission - adding it...');
        
        await query(`
          INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [
          adminRole.role_id,
          '/scheduled-exports',
          'Scheduled Exports',
          true,  // can_access
          true,  // can_create
          true,  // can_read
          true,  // can_update
          true   // can_delete
        ]);
        
        console.log('✅ Added scheduled exports permission to admin role');
      }
    }

    // Verify all permissions are now present
    console.log('\n📊 Verifying all super_admin permissions...');
    const allPermissions = await getRows(`
      SELECT menu_path, menu_name, can_access
      FROM menu_permissions 
      WHERE role_id = $1
      ORDER BY menu_path
    `, [superAdminRole.role_id]);

    console.log('Super admin permissions:');
    allPermissions.forEach(perm => {
      console.log(`   • ${perm.menu_name} (${perm.menu_path}): ${perm.can_access ? '✅' : '❌'}`);
    });

    // Check for all expected menus
    const expectedMenus = [
      '/company-site',
      '/sensor-management',
      '/maintenance',
      '/scheduled-exports',
      '/technician'
    ];

    console.log('\n🎯 Final verification:');
    expectedMenus.forEach(menu => {
      const hasPermission = allPermissions.some(p => p.menu_path === menu && p.can_access);
      console.log(`   • ${menu}: ${hasPermission ? '✅' : '❌'}`);
    });

    console.log('\n🎉 Admin permissions fix completed!');
    console.log('\n📝 Next steps:');
    console.log('   1. Clear browser cache (Ctrl+Shift+Delete)');
    console.log('   2. Logout and login again as admin');
    console.log('   3. Check if all menus appear in sidebar');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixAdminPermissions();


