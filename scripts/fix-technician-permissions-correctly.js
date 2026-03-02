require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function fixTechnicianPermissionsCorrectly() {
  console.log('🔧 Fixing technician permissions CORRECTLY...\n');

  try {
    // Get technician role
    const technicianRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['technician']);
    
    if (!technicianRole) {
      console.log('❌ Technician role not found');
      return;
    }

    console.log(`✅ Found technician role (ID: ${technicianRole.role_id})`);

    // REMOVE incorrect permissions that technician should NOT have
    const incorrectPermissions = ['/dashboard', '/data', '/data-dash', '/devices'];
    
    console.log('\n🗑️  Removing incorrect permissions...');
    for (const menuPath of incorrectPermissions) {
      await query('DELETE FROM menu_permissions WHERE role_id = $1 AND menu_path = $2', 
        [technicianRole.role_id, menuPath]);
      console.log(`   ❌ Removed ${menuPath} permission`);
    }

    // ENSURE technician has ONLY the correct permissions
    const correctPermissions = [
      { path: '/technician', name: 'Technician Dashboard', access: true, create: true, read: true, update: true, delete: false },
      { path: '/maintenance', name: 'Maintenance', access: true, create: false, read: true, update: true, delete: false }
    ];

    console.log('\n✅ Ensuring correct permissions...');
    for (const perm of correctPermissions) {
      // Check if permission exists
      const existing = await getRow('SELECT permission_id FROM menu_permissions WHERE role_id = $1 AND menu_path = $2', 
        [technicianRole.role_id, perm.path]);
      
      if (!existing) {
        // Add missing permission
        await query(`
          INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [technicianRole.role_id, perm.path, perm.name, perm.access, perm.create, perm.read, perm.update, perm.delete]);
        console.log(`   ✅ Added ${perm.path} permission`);
      } else {
        console.log(`   ✅ ${perm.path} permission already exists`);
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

    finalPermissions.forEach(perm => {
      console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ACCESS ${perm.can_access ? '✅' : '❌'}`);
    });

    console.log('\n🎯 Technician should now ONLY see:');
    console.log('   • Field Operations → Technician Dashboard');
    console.log('   • In Addition → Maintenance (read-only)');

  } catch (error) {
    console.error('❌ Error fixing technician permissions:', error);
  }
}

fixTechnicianPermissionsCorrectly();


