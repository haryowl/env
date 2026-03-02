require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function addMissingAdminPermissions() {
  console.log('🔧 Adding missing basic permissions to admin roles...\n');

  try {
    // Get super_admin and admin roles
    const adminRoles = await getRows('SELECT role_id, role_name FROM roles WHERE role_name IN ($1, $2)', ['super_admin', 'admin']);
    
    if (adminRoles.length === 0) {
      console.log('❌ No admin roles found');
      return;
    }

    console.log('📋 Found admin roles:');
    adminRoles.forEach(role => {
      console.log(`  • ${role.role_name} (ID: ${role.role_id})`);
    });

    // Define the missing basic permissions that all admin users should have
    const basicPermissions = [
      { path: '/dashboard', name: 'Dashboard', access: true, create: false, read: true, update: false, delete: false },
      { path: '/quick-view', name: 'Quick View', access: true, create: false, read: true, update: false, delete: false },
      { path: '/devices', name: 'Devices', access: true, create: true, read: true, update: true, delete: true },
      { path: '/users', name: 'Users', access: true, create: true, read: true, update: true, delete: true },
      { path: '/roles', name: 'Roles', access: true, create: true, read: true, update: true, delete: true },
      { path: '/field-creator', name: 'Field Creator', access: true, create: true, read: true, update: true, delete: true },
      { path: '/mapper', name: 'Device Mapper', access: true, create: true, read: true, update: true, delete: true },
      { path: '/listeners', name: 'Listeners', access: true, create: true, read: true, update: true, delete: true },
      { path: '/data', name: 'Data', access: true, create: false, read: true, update: false, delete: false },
      { path: '/data-dash', name: 'Data Dashboard', access: true, create: false, read: true, update: false, delete: false },
      { path: '/data-dash-2', name: 'Data Dashboard 2', access: true, create: false, read: true, update: false, delete: false },
      { path: '/alerts', name: 'Alerts', access: true, create: false, read: true, update: true, delete: false },
      { path: '/alert-settings', name: 'Alert Settings', access: true, create: true, read: true, update: true, delete: true },
      { path: '/notification-config', name: 'Notification Config', access: true, create: true, read: true, update: true, delete: true },
      { path: '/settings', name: 'Settings', access: true, create: false, read: true, update: true, delete: false }
    ];

    console.log('\n📝 Adding missing basic permissions...');
    
    for (const role of adminRoles) {
      console.log(`\n🔸 Processing ${role.role_name} (ID: ${role.role_id}):`);
      
      for (const perm of basicPermissions) {
        // Check if permission already exists
        const existing = await getRow('SELECT permission_id FROM menu_permissions WHERE role_id = $1 AND menu_path = $2', 
          [role.role_id, perm.path]);
        
        if (!existing) {
          // Add missing permission
          await query(`
            INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          `, [role.role_id, perm.path, perm.name, perm.access, perm.create, perm.read, perm.update, perm.delete]);
          console.log(`   ✅ Added: ${perm.path} - ${perm.name}`);
        } else {
          console.log(`   ⏭️  Already exists: ${perm.path}`);
        }
      }
    }

    // Verify final permissions
    console.log('\n📊 Final permissions for admin roles:');
    
    for (const role of adminRoles) {
      console.log(`\n🔸 ${role.role_name.toUpperCase()} (ID: ${role.role_id}):`);
      
      const permissions = await getRows(`
        SELECT menu_path, menu_name, can_access
        FROM menu_permissions 
        WHERE role_id = $1
        ORDER BY menu_path
      `, [role.role_id]);

      permissions.forEach(perm => {
        console.log(`   • ${perm.menu_path} - ${perm.menu_name}: ACCESS ${perm.can_access ? '✅' : '❌'}`);
      });
    }

    console.log('\n🎯 Admin users should now see all menus including Dashboard!');

  } catch (error) {
    console.error('❌ Error adding missing admin permissions:', error);
  }
}

addMissingAdminPermissions();


