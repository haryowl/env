require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function addTechnicianRole() {
  console.log('👨‍🔧 Adding technician role to the system...\n');

  try {
    // Check existing roles
    console.log('📋 Current roles in the system:');
    const existingRoles = await getRows('SELECT role_id, role_name, description FROM roles ORDER BY role_id');
    
    existingRoles.forEach(role => {
      console.log(`  • ${role.role_name} (ID: ${role.role_id}) - ${role.description || 'No description'}`);
    });

    // Check if technician role already exists
    const existingTechnician = await getRow('SELECT role_id, role_name FROM roles WHERE role_name = $1', ['technician']);
    
    if (existingTechnician) {
      console.log(`\n⚠️  Technician role already exists (ID: ${existingTechnician.role_id})`);
    } else {
      // Create technician role
      console.log('\n🔧 Creating technician role...');
      const roleResult = await query(`
        INSERT INTO roles (role_name, display_name, description, created_at)
        VALUES ('technician', 'Field Technician', 'Field technician for maintenance operations', NOW())
        RETURNING role_id, role_name, display_name, description
      `);
      
      const technicianRoleId = roleResult.rows[0].role_id;
      console.log(`✅ Created technician role: ${roleResult.rows[0].role_name} (ID: ${technicianRoleId})`);
    }

    // Add technician permissions for maintenance menu
    console.log('\n📝 Adding technician permissions for maintenance menu...');
    
    const technicianRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['technician']);
    const technicianRoleId = technicianRole.role_id;

    // Check if permissions already exist
    const existingPermission = await getRow(`
      SELECT permission_id FROM menu_permissions 
      WHERE role_id = $1 AND menu_path = $2
    `, [technicianRoleId, '/maintenance']);

    if (existingPermission) {
      console.log('⚠️  Technician maintenance permissions already exist');
    } else {
      // Add technician permissions for maintenance
      await query(`
        INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        technicianRoleId,
        '/maintenance',
        'Maintenance',
        true,  // can_access
        false, // can_create (technicians don't create schedules)
        true,  // can_read (can view their assigned maintenance)
        true,  // can_update (can update status, add notes, upload photos)
        false  // can_delete (technicians don't delete schedules)
      ]);
      console.log('✅ Added technician maintenance permissions');
    }

    // Add technician permissions for technician-specific menu
    console.log('\n📝 Adding technician permissions for technician menu...');
    
    const existingTechMenuPermission = await getRow(`
      SELECT permission_id FROM menu_permissions 
      WHERE role_id = $1 AND menu_path = $2
    `, [technicianRoleId, '/technician']);

    if (existingTechMenuPermission) {
      console.log('⚠️  Technician menu permissions already exist');
    } else {
      // Add technician-specific menu permissions
      await query(`
        INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        technicianRoleId,
        '/technician',
        'Technician Dashboard',
        true,  // can_access
        false, // can_create
        true,  // can_read
        true,  // can_update
        false  // can_delete
      ]);
      console.log('✅ Added technician dashboard permissions');
    }

    // Verify permissions were added
    console.log('\n📊 Technician role permissions:');
    const technicianPermissions = await getRows(`
      SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
      FROM menu_permissions 
      WHERE role_id = $1
    `, [technicianRoleId]);

    technicianPermissions.forEach(perm => {
      console.log(`  • ${perm.menu_name} (${perm.menu_path}):`);
      console.log(`    - Access: ${perm.can_access ? '✅' : '❌'}`);
      console.log(`    - Create: ${perm.can_create ? '✅' : '❌'}`);
      console.log(`    - Read: ${perm.can_read ? '✅' : '❌'}`);
      console.log(`    - Update: ${perm.can_update ? '✅' : '❌'}`);
      console.log(`    - Delete: ${perm.can_delete ? '✅' : '❌'}`);
    });

    console.log('\n🎉 Technician role setup completed successfully!');
    console.log('\n📝 What was created:');
    console.log('  • technician role with appropriate permissions');
    console.log('  • Maintenance menu access (read, update)');
    console.log('  • Technician dashboard menu access');
    console.log('\n💡 Next steps:');
    console.log('  • Create users with technician role');
    console.log('  • Build technician-specific API routes');
    console.log('  • Create mobile-friendly technician interface');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

addTechnicianRole();
