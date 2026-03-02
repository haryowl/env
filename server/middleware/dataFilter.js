const { getRows } = require('../config/database');

const filterDataByRole = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return next();
    }

    // Get user's role permissions
    const userRoles = await getRows(`
      SELECT r.role_name, r.menu_permissions, r.device_permissions
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
    `, [user.user_id]);

    if (userRoles.length === 0) {
      // No roles assigned, use default permissions
      req.userPermissions = {
        menu_permissions: {},
        device_permissions: {}
      };
      return next();
    }

    // Merge permissions from all roles
    const mergedPermissions = {
      menu_permissions: {},
      device_permissions: {}
    };

    userRoles.forEach(role => {
      if (role.menu_permissions) {
        Object.assign(mergedPermissions.menu_permissions, role.menu_permissions);
      }
      if (role.device_permissions) {
        Object.assign(mergedPermissions.device_permissions, role.device_permissions);
      }
    });

    req.userPermissions = mergedPermissions;
    next();
  } catch (error) {
    console.error('Data filter middleware error:', error);
    next();
  }
};

const filterDeviceData = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return next();
    }

    console.log('FilterDeviceData: User:', user.username, 'Role:', user.role);
    
    // Check if user has device read permissions through roles
    const userRoles = await getRows(`
      SELECT r.role_name, r.device_permissions
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
    `, [user.user_id]);

    console.log('User roles:', userRoles.map(r => r.role_name));

    // Check for super_admin or admin roles that have full access
    const hasFullAccess = user.role === 'super_admin' || user.role === 'admin';
    
    if (hasFullAccess) {
      console.log('User has full access (super_admin/admin)');
      req.allowedDeviceIds = null; // null means no filtering (full access)
      return next();
    }

    // Get devices from role permissions
    const allowedDeviceIds = [];
    
    for (const userRole of userRoles) {
      if (userRole.device_permissions) {
        // Check for specific device permissions
        const devicePerms = userRole.device_permissions;
        
        // Get device IDs from role_device_permissions table
        const roleDevicePermissions = await getRows(`
          SELECT device_id FROM role_device_permissions 
          WHERE role_id = (SELECT role_id FROM roles WHERE role_name = $1)
          AND permissions->>'read' = 'true'
        `, [userRole.role_name]);
        
        allowedDeviceIds.push(...roleDevicePermissions.map(d => d.device_id));
        
        // Also check for general device permissions
        if (devicePerms.all_devices?.read === true || devicePerms.all_groups?.read === true) {
          console.log('Role has full device access');
          req.allowedDeviceIds = null; // Full access
          return next();
        }
      }
    }

    // Only check direct user device permissions if NO role permissions exist
    // This prevents mixing role-based and direct permissions
    if (allowedDeviceIds.length === 0) {
      console.log('No role permissions found, checking direct user permissions');
      const userDevicePermissions = await getRows(`
        SELECT device_id FROM user_device_permissions 
        WHERE user_id = $1 AND permissions->>'read' = 'true'
      `, [user.user_id]);

      allowedDeviceIds.push(...userDevicePermissions.map(d => d.device_id));
      console.log('Using direct user permissions');
    } else {
      console.log('Using role permissions only, ignoring direct user permissions');
    }

    // Remove duplicates
    const uniqueDeviceIds = [...new Set(allowedDeviceIds)];
    
    console.log('Allowed device IDs:', uniqueDeviceIds);
    
    req.allowedDeviceIds = uniqueDeviceIds;
    next();
  } catch (error) {
    console.error('Device data filter error:', error);
    next();
  }
};

const filterMenuAccess = (menuPath) => {
  return (req, res, next) => {
    try {
      const user = req.user;
      if (!user || !req.userPermissions) {
        return res.status(403).json({
          error: 'Access denied',
          code: 'ACCESS_DENIED'
        });
      }

      const menuPermissions = req.userPermissions.menu_permissions;
      const hasAccess = menuPermissions[menuPath]?.access;

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Insufficient permissions to access this menu',
          code: 'MENU_ACCESS_DENIED',
          menu: menuPath
        });
      }

      next();
    } catch (error) {
      console.error('Menu access filter error:', error);
      res.status(500).json({
        error: 'Internal server error',
        code: 'MENU_FILTER_ERROR'
      });
    }
  };
};

module.exports = {
  filterDataByRole,
  filterDeviceData,
  filterMenuAccess
}; 