require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function cleanTechnicianPermissions() {
  console.log('🧹 Cleaning technician permissions...\n');

  try {
    // Get technician role ID
    const technicianRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['technician']);
    
    if (!technicianRole) {
      console.log('❌ Technician role not found');
      return;
    }

    console.log(`✅ Found technician role (ID: ${technicianRole.role_id})`);

    // Remove unwanted permissions for technician role
    const unwantedPermissions = ['/dashboard', '/data', '/data-dash', '/devices', '/maintenance'];
    
    console.log('\n🗑️ Removing unwanted permissions...');
    
    for (const permission of unwantedPermissions) {
      const result = await query(`
        DELETE FROM menu_permissions 
        WHERE role_id = $1 AND menu_path = $2
      `, [technicianRole.role_id, permission]);
      
      if (result.rowCount > 0) {
        console.log(`   ✅ Removed ${permission} permission`);
      } else {
        console.log(`   ⚠️ ${permission} permission not found`);
      }
    }

    // Verify final permissions
    console.log('\n📊 Final technician permissions:');
    const finalPermissions = await getRows(`
      SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
      FROM menu_permissions 
      WHERE role_id = $1
      ORDER BY menu_path
    `, [technicianRole.role_id]);

    if (finalPermissions.length === 0) {
      console.log('   ❌ No permissions found');
    } else {
      finalPermissions.forEach(perm => {
        console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ${perm.can_access ? 'ACCESS ✅' : 'NO ACCESS ❌'}`);
      });
    }

    console.log('\n🎉 Technician permissions cleaned!');
    console.log('\n📝 Next steps:');
    console.log('   1. Clear browser cache (Ctrl+Shift+Delete)');
    console.log('   2. Logout and login again as tech111');
    console.log('   3. Technician should now ONLY see "Field Operations" menu');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

cleanTechnicianPermissions();


