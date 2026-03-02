const { query } = require('../server/config/database');

async function addScheduledExportsPermissions() {
  try {
    console.log('Adding /scheduled-exports permissions to missing roles...');
    
    // Get all roles and check which ones don't have /scheduled-exports permission
    const allRoles = await query(`
      SELECT role_id, role_name, display_name, menu_permissions
      FROM roles
      ORDER BY role_name
    `);
    
    const rolesWithoutPermission = allRoles.rows.filter(role => {
      const menuPerms = role.menu_permissions || {};
      return !menuPerms['/scheduled-exports'];
    });
    
    console.log(`Found ${rolesWithoutPermission.length} roles without /scheduled-exports permission:`);
    rolesWithoutPermission.forEach(role => {
      console.log(`- ${role.role_name} (${role.display_name}) - ID: ${role.role_id}`);
    });
    
    // Define permission levels for different role types
    const getPermissionsForRole = (roleName) => {
      const roleLower = roleName.toLowerCase();
      
      // Super Admin and Admin already have permissions
      if (roleLower.includes('admin')) {
        return null; // Skip, already has permissions
      }
      
      // Manager roles - give read and access permissions
      if (roleLower.includes('manager') || roleLower.includes('manage')) {
        return {
          read: true,
          access: true,
          create: false,
          delete: false,
          update: false
        };
      }
      
      // Operator roles - give read and access permissions
      if (roleLower.includes('operat')) {
        return {
          read: true,
          access: true,
          create: false,
          delete: false,
          update: false
        };
      }
      
      // Viewer roles - give read and access permissions
      if (roleLower.includes('viewer')) {
        return {
          read: true,
          access: true,
          create: false,
          delete: false,
          update: false
        };
      }
      
      // Demo roles - give read and access permissions
      if (roleLower.includes('demo')) {
        return {
          read: true,
          access: true,
          create: false,
          delete: false,
          update: false
        };
      }
      
      // Default for other roles - give read and access permissions
      return {
        read: true,
        access: true,
        create: false,
        delete: false,
        update: false
      };
    };
    
    // Add permissions for each role
    for (const role of rolesWithoutPermission) {
      const permissions = getPermissionsForRole(role.role_name);
      
      if (permissions) {
        console.log(`Adding permissions for ${role.role_name}:`, permissions);
        
        // Get current menu permissions
        const currentMenuPerms = role.menu_permissions || {};
        
        // Add the new permission
        const updatedMenuPerms = {
          ...currentMenuPerms,
          '/scheduled-exports': permissions
        };
        
        // Update the role
        await query(`
          UPDATE roles 
          SET menu_permissions = $1 
          WHERE role_id = $2
        `, [JSON.stringify(updatedMenuPerms), role.role_id]);
        
        console.log(`✅ Added /scheduled-exports permissions for ${role.role_name}`);
      } else {
        console.log(`⏭️ Skipping ${role.role_name} (already has permissions)`);
      }
    }
    
    console.log('\n🎉 All scheduled exports permissions have been added!');
    
    // Verify the changes
    console.log('\n=== Verification ===');
    const verification = await query(`
      SELECT role_name, display_name, menu_permissions
      FROM roles
      ORDER BY role_name
    `);
    
    verification.rows.forEach(row => {
      const menuPerms = row.menu_permissions || {};
      if (menuPerms['/scheduled-exports']) {
        console.log(`✅ ${row.role_name} (${row.display_name}): ${JSON.stringify(menuPerms['/scheduled-exports'])}`);
      } else {
        console.log(`❌ ${row.role_name} (${row.display_name}): No /scheduled-exports permissions`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error adding scheduled exports permissions:', error);
  } finally {
    process.exit(0);
  }
}

addScheduledExportsPermissions();
