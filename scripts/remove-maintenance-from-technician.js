require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function removeMaintenanceFromTechnician() {
  console.log('🔧 Removing maintenance permission from technician role...\n');

  try {
    // Get technician role
    const technicianRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['technician']);
    
    if (!technicianRole) {
      console.log('❌ Technician role not found');
      return;
    }

    console.log(`✅ Found technician role (ID: ${technicianRole.role_id})`);

    // Remove /maintenance permission from technician role
    await query('DELETE FROM menu_permissions WHERE role_id = $1 AND menu_path = $2', 
      [technicianRole.role_id, '/maintenance']);
    console.log('❌ Removed /maintenance permission from technician role');

    // Verify final permissions
    console.log('\n📊 Final technician permissions:');
    const finalPermissions = await getRows(`
      SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
      FROM menu_permissions 
      WHERE role_id = $1
      ORDER BY menu_path
    `, [technicianRole.role_id]);

    finalPermissions.forEach(perm => {
      console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ACCESS ${perm.can_access ? '✅' : '❌'}`);
    });

    console.log('\n🎯 Technician should now ONLY see:');
    console.log('   • Field Operations → Technician Dashboard');

  } catch (error) {
    console.error('❌ Error removing maintenance permission from technician:', error);
  }
}

removeMaintenanceFromTechnician();


