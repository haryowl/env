require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function addTechnicianPermissionToAdmin() {
  console.log('🔧 Adding technician permission to admin/super_admin role...\n');

  try {
    // Get super_admin role
    const superAdminRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['super_admin']);
    
    if (!superAdminRole) {
      console.log('❌ Super admin role not found');
      return;
    }

    console.log(`✅ Found super_admin role (ID: ${superAdminRole.role_id})`);

    // Check if /technician permission already exists for super_admin
    const existingPermission = await getRow('SELECT permission_id FROM menu_permissions WHERE role_id = $1 AND menu_path = $2', 
      [superAdminRole.role_id, '/technician']);
    
    if (existingPermission) {
      console.log('✅ Super admin already has /technician permission');
    } else {
      // Add /technician permission to super_admin
      await query(`
        INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        superAdminRole.role_id,
        '/technician',
        'Technician Dashboard',
        true,  // can_access
        true,  // can_create
        true,  // can_read
        true,  // can_update
        true   // can_delete
      ]);
      console.log('✅ Added /technician permission to super_admin role');
    }

    // Also add to admin role if it exists
    const adminRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['admin']);
    
    if (adminRole) {
      console.log(`✅ Found admin role (ID: ${adminRole.role_id})`);
      
      const existingAdminPermission = await getRow('SELECT permission_id FROM menu_permissions WHERE role_id = $1 AND menu_path = $2', 
        [adminRole.role_id, '/technician']);
      
      if (existingAdminPermission) {
        console.log('✅ Admin already has /technician permission');
      } else {
        // Add /technician permission to admin
        await query(`
          INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [
          adminRole.role_id,
          '/technician',
          'Technician Dashboard',
          true,  // can_access
          true,  // can_create
          true,  // can_read
          true,  // can_update
          true   // can_delete
        ]);
        console.log('✅ Added /technician permission to admin role');
      }
    }

    // Verify final permissions
    console.log('\n📊 Super admin permissions:');
    const superAdminPermissions = await getRows(`
      SELECT menu_path, menu_name, can_access
      FROM menu_permissions 
      WHERE role_id = $1
      ORDER BY menu_path
    `, [superAdminRole.role_id]);

    superAdminPermissions.forEach(perm => {
      console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ${perm.can_access ? 'ACCESS ✅' : 'NO ACCESS ❌'}`);
    });

    console.log('\n🎯 Admin should now see:');
    console.log('   • Field Operations → Technician Dashboard (for management)');
    console.log('   • All other existing menus');

  } catch (error) {
    console.error('❌ Error adding technician permission to admin:', error);
  }
}

addTechnicianPermissionToAdmin();


