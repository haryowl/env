const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const testPermissionsAPI = async () => {
  try {
    console.log('Testing permissions API logic...');

    // Test for different users
    const testUsers = [
      { user_id: 1, username: 'admin' },
      { user_id: 10, username: 'admin0' },
      { user_id: 5, username: 'admins' }
    ];

    for (const testUser of testUsers) {
      console.log(`\n=== Testing permissions for ${testUser.username} ===`);
      
      // Get user's roles
      const userRoles = await pool.query(`
        SELECT 
          r.role_id,
          r.role_name,
          r.display_name,
          r.permissions,
          r.menu_permissions,
          r.device_permissions,
          ur.is_primary
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = $1
        ORDER BY ur.is_primary DESC, r.display_name ASC
      `, [testUser.user_id]);

      console.log('User roles:', userRoles.rows.map(r => ({
        role_name: r.role_name,
        is_primary: r.is_primary,
        has_menu_permissions: !!r.menu_permissions,
        has_device_permissions: !!r.device_permissions
      })));

      // Get role-based device permissions
      const roleDevicePermissions = await pool.query(`
        SELECT 
          rdp.role_id,
          rdp.device_id,
          rdp.permissions
        FROM role_device_permissions rdp
        JOIN user_roles ur ON rdp.role_id = ur.role_id
        WHERE ur.user_id = $1
      `, [testUser.user_id]);

      console.log('Role device permissions:', roleDevicePermissions.rows.map(rdp => ({
        device_id: rdp.device_id,
        permissions: rdp.permissions
      })));

      // Get user-specific device permissions
      const userDevicePermissions = await pool.query(`
        SELECT device_id, permissions
        FROM user_device_permissions
        WHERE user_id = $1
      `, [testUser.user_id]);

      console.log('User device permissions:', userDevicePermissions.rows.map(udp => ({
        device_id: udp.device_id,
        permissions: udp.permissions
      })));

      // Simulate the new permission merging logic
      const devicePermissions = {};
      
      // First, get device permissions from roles table
      userRoles.rows.forEach(role => {
        if (role.device_permissions) {
          Object.keys(role.device_permissions).forEach(deviceId => {
            if (!devicePermissions[deviceId] || role.is_primary) {
              devicePermissions[deviceId] = role.device_permissions[deviceId];
            }
          });
        }
      });

      // Then, override with role_device_permissions
      roleDevicePermissions.rows.forEach(rdp => {
        const role = userRoles.rows.find(r => r.role_id === rdp.role_id);
        if (role && (!devicePermissions[rdp.device_id] || role.is_primary)) {
          devicePermissions[rdp.device_id] = rdp.permissions;
        }
      });

      // Finally, merge with user-specific device permissions (highest priority)
      userDevicePermissions.rows.forEach(udp => {
        if (devicePermissions[udp.device_id]) {
          // Merge permissions, user-specific permissions take precedence
          devicePermissions[udp.device_id] = {
            ...devicePermissions[udp.device_id],
            ...udp.permissions
          };
        } else {
          // User has permission but role doesn't, add it
          devicePermissions[udp.device_id] = udp.permissions;
        }
      });

      console.log('Final merged device permissions:', devicePermissions);
    }

  } catch (error) {
    console.error('Failed to test permissions API:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
testPermissionsAPI(); 