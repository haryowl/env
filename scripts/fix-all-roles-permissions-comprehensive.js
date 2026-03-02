require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function fixAllRolesPermissions() {
  console.log('🔧 Fixing permissions for ALL roles comprehensively...\n');

  try {
    // Get all roles
    const allRoles = await getRows('SELECT role_id, role_name, display_name FROM roles ORDER BY role_id');
    
    console.log('📋 All roles in system:');
    allRoles.forEach(role => {
      console.log(`  • ${role.role_name} (ID: ${role.role_id}) - ${role.display_name}`);
    });

    // Define comprehensive permission sets for each role type
    const rolePermissionSets = {
      'super_admin': {
        // Full access to everything
        '/dashboard': { name: 'Dashboard', access: true, create: true, read: true, update: true, delete: true },
        '/quick-view': { name: 'Quick View', access: true, create: true, read: true, update: true, delete: true },
        '/devices': { name: 'Devices', access: true, create: true, read: true, update: true, delete: true },
        '/users': { name: 'Users', access: true, create: true, read: true, update: true, delete: true },
        '/roles': { name: 'Roles', access: true, create: true, read: true, update: true, delete: true },
        '/field-creator': { name: 'Field Creator', access: true, create: true, read: true, update: true, delete: true },
        '/mapper': { name: 'Device Mapper', access: true, create: true, read: true, update: true, delete: true },
        '/listeners': { name: 'Listeners', access: true, create: true, read: true, update: true, delete: true },
        '/data': { name: 'Data', access: true, create: true, read: true, update: true, delete: true },
        '/data-dash': { name: 'Data Dashboard', access: true, create: true, read: true, update: true, delete: true },
        '/data-dash-2': { name: 'Data Dashboard 2', access: true, create: true, read: true, update: true, delete: true },
        '/alerts': { name: 'Alerts', access: true, create: true, read: true, update: true, delete: true },
        '/alert-settings': { name: 'Alert Settings', access: true, create: true, read: true, update: true, delete: true },
        '/notification-config': { name: 'Notification Config', access: true, create: true, read: true, update: true, delete: true },
        '/scheduled-exports': { name: 'Scheduled Exports', access: true, create: true, read: true, update: true, delete: true },
        '/company-site': { name: 'Company and Site', access: true, create: true, read: true, update: true, delete: true },
        '/sensor-management': { name: 'Sensor Management', access: true, create: true, read: true, update: true, delete: true },
        '/maintenance': { name: 'Maintenance', access: true, create: true, read: true, update: true, delete: true },
        '/technician': { name: 'Technician Dashboard', access: true, create: true, read: true, update: true, delete: true },
        '/settings': { name: 'Settings', access: true, create: true, read: true, update: true, delete: true }
      },
      'admin': {
        // Admin access - can manage most things but not roles
        '/dashboard': { name: 'Dashboard', access: true, create: true, read: true, update: true, delete: true },
        '/quick-view': { name: 'Quick View', access: true, create: true, read: true, update: true, delete: true },
        '/devices': { name: 'Devices', access: true, create: true, read: true, update: true, delete: true },
        '/users': { name: 'Users', access: true, create: true, read: true, update: true, delete: false },
        '/field-creator': { name: 'Field Creator', access: true, create: true, read: true, update: true, delete: true },
        '/mapper': { name: 'Device Mapper', access: true, create: true, read: true, update: true, delete: true },
        '/listeners': { name: 'Listeners', access: true, create: true, read: true, update: true, delete: true },
        '/data': { name: 'Data', access: true, create: true, read: true, update: true, delete: true },
        '/data-dash': { name: 'Data Dashboard', access: true, create: true, read: true, update: true, delete: true },
        '/data-dash-2': { name: 'Data Dashboard 2', access: true, create: true, read: true, update: true, delete: true },
        '/alerts': { name: 'Alerts', access: true, create: true, read: true, update: true, delete: true },
        '/alert-settings': { name: 'Alert Settings', access: true, create: true, read: true, update: true, delete: true },
        '/notification-config': { name: 'Notification Config', access: true, create: true, read: true, update: true, delete: true },
        '/scheduled-exports': { name: 'Scheduled Exports', access: true, create: true, read: true, update: true, delete: true },
        '/company-site': { name: 'Company and Site', access: true, create: true, read: true, update: true, delete: true },
        '/sensor-management': { name: 'Sensor Management', access: true, create: true, read: true, update: true, delete: true },
        '/maintenance': { name: 'Maintenance', access: true, create: true, read: true, update: true, delete: true },
        '/technician': { name: 'Technician Dashboard', access: true, create: true, read: true, update: true, delete: true },
        '/settings': { name: 'Settings', access: true, create: false, read: true, update: true, delete: false }
      },
      'operator': {
        // Operator access - can configure devices and manage maintenance
        '/dashboard': { name: 'Dashboard', access: true, create: false, read: true, update: false, delete: false },
        '/quick-view': { name: 'Quick View', access: true, create: false, read: true, update: false, delete: false },
        '/devices': { name: 'Devices', access: true, create: false, read: true, update: true, delete: false },
        '/mapper': { name: 'Device Mapper', access: true, create: false, read: true, update: true, delete: false },
        '/listeners': { name: 'Listeners', access: true, create: false, read: true, update: true, delete: false },
        '/data': { name: 'Data', access: true, create: false, read: true, update: false, delete: false },
        '/data-dash': { name: 'Data Dashboard', access: true, create: false, read: true, update: false, delete: false },
        '/data-dash-2': { name: 'Data Dashboard 2', access: true, create: false, read: true, update: false, delete: false },
        '/alerts': { name: 'Alerts', access: true, create: false, read: true, update: true, delete: false },
        '/alert-settings': { name: 'Alert Settings', access: true, create: false, read: true, update: true, delete: false },
        '/scheduled-exports': { name: 'Scheduled Exports', access: true, create: false, read: true, update: true, delete: false },
        '/company-site': { name: 'Company and Site', access: true, create: true, read: true, update: true, delete: true },
        '/sensor-management': { name: 'Sensor Management', access: true, create: true, read: true, update: true, delete: true },
        '/maintenance': { name: 'Maintenance', access: true, create: true, read: true, update: true, delete: true }
      },
      'viewer': {
        // Read-only access
        '/dashboard': { name: 'Dashboard', access: true, create: false, read: true, update: false, delete: false },
        '/quick-view': { name: 'Quick View', access: true, create: false, read: true, update: false, delete: false },
        '/devices': { name: 'Devices', access: true, create: false, read: true, update: false, delete: false },
        '/data': { name: 'Data', access: true, create: false, read: true, update: false, delete: false },
        '/data-dash': { name: 'Data Dashboard', access: true, create: false, read: true, update: false, delete: false },
        '/data-dash-2': { name: 'Data Dashboard 2', access: true, create: false, read: true, update: false, delete: false },
        '/alerts': { name: 'Alerts', access: true, create: false, read: true, update: false, delete: false },
        '/alert-settings': { name: 'Alert Settings', access: true, create: false, read: true, update: false, delete: false },
        '/scheduled-exports': { name: 'Scheduled Exports', access: true, create: false, read: true, update: false, delete: false },
        '/company-site': { name: 'Company and Site', access: true, create: false, read: true, update: false, delete: false },
        '/sensor-management': { name: 'Sensor Management', access: true, create: false, read: true, update: false, delete: false },
        '/maintenance': { name: 'Maintenance', access: true, create: false, read: true, update: false, delete: false }
      },
      'technician': {
        // Technician access - ONLY Field Operations
        '/technician': { name: 'Technician Dashboard', access: true, create: true, read: true, update: true, delete: false }
      },
      'demo': {
        // Demo access - limited but functional
        '/dashboard': { name: 'Dashboard', access: true, create: false, read: true, update: true, delete: false },
        '/quick-view': { name: 'Quick View', access: true, create: false, read: true, update: false, delete: false },
        '/devices': { name: 'Devices', access: true, create: false, read: true, update: false, delete: false },
        '/users': { name: 'Users', access: true, create: true, read: true, update: true, delete: false },
        '/roles': { name: 'Roles', access: true, create: false, read: true, update: false, delete: false },
        '/field-creator': { name: 'Field Creator', access: true, create: false, read: true, update: false, delete: false },
        '/mapper': { name: 'Device Mapper', access: true, create: false, read: true, update: false, delete: false },
        '/listeners': { name: 'Listeners', access: true, create: false, read: true, update: false, delete: false },
        '/data-dash': { name: 'Data Dashboard', access: true, create: false, read: true, update: false, delete: false },
        '/data-dash-2': { name: 'Data Dashboard 2', access: true, create: false, read: true, update: false, delete: false },
        '/alerts': { name: 'Alerts', access: true, create: false, read: true, update: false, delete: false },
        '/alert-settings': { name: 'Alert Settings', access: true, create: false, read: true, update: false, delete: false },
        '/notification-config': { name: 'Notification Config', access: true, create: false, read: true, update: false, delete: false }
      }
    };

    // Custom roles inherit from operator by default
    const defaultCustomRolePermissions = rolePermissionSets['operator'];

    console.log('\n🔄 Processing each role...\n');

    for (const role of allRoles) {
      console.log(`\n🔸 Processing ${role.role_name} (ID: ${role.role_id}):`);
      
      // Get the permission set for this role
      let permissionSet = rolePermissionSets[role.role_name] || defaultCustomRolePermissions;
      
      // Delete all existing permissions for this role first
      await query('DELETE FROM menu_permissions WHERE role_id = $1', [role.role_id]);
      console.log('   🗑️  Cleared existing permissions');

      // Add all permissions for this role
      let addedCount = 0;
      for (const [menuPath, perm] of Object.entries(permissionSet)) {
        await query(`
          INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [role.role_id, menuPath, perm.name, perm.access, perm.create, perm.read, perm.update, perm.delete]);
        addedCount++;
      }
      console.log(`   ✅ Added ${addedCount} permissions`);
    }

    // Verify final permissions for each role
    console.log('\n\n📊 Final permissions verification:\n');
    
    for (const role of allRoles) {
      console.log(`\n🔸 ${role.role_name.toUpperCase()} (ID: ${role.role_id}):`);
      
      const permissions = await getRows(`
        SELECT menu_path, menu_name, can_access
        FROM menu_permissions 
        WHERE role_id = $1
        ORDER BY menu_path
      `, [role.role_id]);

      if (permissions.length === 0) {
        console.log('   ❌ NO PERMISSIONS FOUND');
      } else {
        permissions.forEach(perm => {
          console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ACCESS ${perm.can_access ? '✅' : '❌'}`);
        });
      }
    }

    console.log('\n\n🎉 All roles have been configured with appropriate permissions!');
    console.log('\n📝 Summary:');
    console.log('   • super_admin: Full access to all menus');
    console.log('   • admin: Full access except roles management');
    console.log('   • operator: Device configuration and maintenance management');
    console.log('   • viewer: Read-only access to most menus');
    console.log('   • technician: Only Technician Dashboard');
    console.log('   • demo: Limited functional access');
    console.log('   • Custom roles: Default to operator-level permissions');
    console.log('\n💡 Users should now see appropriate menus based on their roles!');

  } catch (error) {
    console.error('❌ Error fixing role permissions:', error);
  }
}

fixAllRolesPermissions();


