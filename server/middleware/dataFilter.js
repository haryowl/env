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
    let userRoles = await getRows(`
      SELECT r.role_name, r.role_id, r.device_permissions
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
    `, [user.user_id]);

    // Fallback: if no user_roles, use primary role from users.role
    if (Array.isArray(userRoles) && userRoles.length === 0 && user.role) {
      const primaryRole = await getRows(`
        SELECT role_id, role_name, device_permissions
        FROM roles
        WHERE role_name = $1
      `, [user.role]);
      userRoles = Array.isArray(primaryRole) ? primaryRole : [];
    }
    userRoles = Array.isArray(userRoles) ? userRoles : [];

    console.log('User roles:', userRoles.map(r => r && r.role_name).filter(Boolean));

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
      if (!userRole) continue;
      const roleId = userRole.role_id;
      if (roleId) {
        // Get device IDs from role_device_permissions table (always check - specific devices)
        const roleDevicePermissions = await getRows(`
          SELECT device_id FROM role_device_permissions 
          WHERE role_id = $1
          AND permissions->>'read' = 'true'
        `, [roleId]);
        allowedDeviceIds.push(...(roleDevicePermissions || []).map(d => d.device_id));

        // Check general device permissions (all_devices / all_groups)
        const devicePerms = userRole.device_permissions;
        if (devicePerms && (devicePerms.all_devices?.read === true || devicePerms.all_groups?.read === true)) {
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

      allowedDeviceIds.push(...(userDevicePermissions || []).map(d => d && d.device_id).filter(Boolean));
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
    // On error, fail open so dashboard/devices/data-dash continue to work (avoids empty devices / "failed to load" when middleware throws)
    req.allowedDeviceIds = null;
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