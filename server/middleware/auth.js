const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getRow, getRows } = require('../config/database');

// JWT token verification middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database to ensure they still exist and are active
    const user = await getRow(
      'SELECT user_id, username, email, role, status, timezone, preferences FROM users WHERE user_id = $1',
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.status !== 'active') {
      return res.status(401).json({ 
        error: 'User account is not active',
        code: 'USER_INACTIVE'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'TOKEN_INVALID'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    console.error('Authentication error:', error);
    return res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Role-based authorization middleware
const authorizeRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // Check if user has the required role directly
      if (allowedRoles.includes(req.user.role)) {
        return next();
      }

      // Check if user has the required role through user_roles table
      const userRoles = await getRows(`
        SELECT r.role_name, r.permissions, r.menu_permissions, r.device_permissions
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = $1
      `, [req.user.user_id]);

      const hasRequiredRole = userRoles.some(userRole => 
        allowedRoles.includes(userRole.role_name)
      );

      if (hasRequiredRole) {
        // Add role permissions to request for later use
        req.userRoles = userRoles;
        return next();
      }

      // If no specific roles required, allow access (for general endpoints)
      if (allowedRoles.length === 0 || allowedRoles.includes('*')) {
        return next();
      }

      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: allowedRoles,
        current: req.user.role,
        userRoles: userRoles.map(r => r.role_name)
      });
    } catch (error) {
      console.error('Role authorization error:', error);
      return res.status(500).json({ 
        error: 'Authorization check failed',
        code: 'AUTH_CHECK_ERROR'
      });
    }
  };
};

// Menu access authorization middleware
const authorizeMenuAccess = (menuPath, requiredPermission = 'access') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // Super admin has access to all menus
      if (req.user.role === 'super_admin') {
        return next();
      }

      // Admin has access to most menus (including technician for management)
      if (req.user.role === 'admin') {
        return next();
      }

      // Check user's menu permissions through assigned roles
      let hasAccess = false;
      
      // Get user's role assignments
      const userRoles = await getRows(`
        SELECT r.role_id, r.role_name, r.menu_permissions
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = $1
      `, [req.user.user_id]);
      
      // If no roles in user_roles table, check user's primary role from users table
      if (userRoles.length === 0 && req.user.role) {
        const primaryRole = await getRow(`
          SELECT role_id, role_name, menu_permissions
          FROM roles
          WHERE role_name = $1
        `, [req.user.role]);
        
        if (primaryRole) {
          userRoles.push({
            role_id: primaryRole.role_id,
            role_name: primaryRole.role_name,
            menu_permissions: primaryRole.menu_permissions
          });
        }
      }
      
      // Check menu permissions for each role
      for (const userRole of userRoles) {
        // First, check menu_permissions table
        const menuPermission = await getRow(`
          SELECT can_access, can_create, can_read, can_update, can_delete
          FROM menu_permissions 
          WHERE role_id = $1 AND menu_path = $2
        `, [userRole.role_id, menuPath]);
        
        let permissionValue = null;
        
        if (menuPermission) {
          // Use permission from table
          if (requiredPermission === 'access') {
            permissionValue = menuPermission.can_access;
          } else if (requiredPermission === 'create') {
            permissionValue = menuPermission.can_create;
          } else if (requiredPermission === 'read') {
            permissionValue = menuPermission.can_read;
          } else if (requiredPermission === 'update') {
            permissionValue = menuPermission.can_update;
          } else if (requiredPermission === 'delete') {
            permissionValue = menuPermission.can_delete;
          }
        } else if (userRole.menu_permissions && typeof userRole.menu_permissions === 'object') {
          // Fallback to JSONB column if table is empty
          const menuPerms = userRole.menu_permissions[menuPath];
          if (menuPerms && typeof menuPerms === 'object') {
            if (requiredPermission === 'access') {
              permissionValue = menuPerms.access || menuPerms.can_access || false;
            } else if (requiredPermission === 'create') {
              permissionValue = menuPerms.create || menuPerms.can_create || false;
            } else if (requiredPermission === 'read') {
              permissionValue = menuPerms.read || menuPerms.can_read || false;
            } else if (requiredPermission === 'update') {
              permissionValue = menuPerms.update || menuPerms.can_update || false;
            } else if (requiredPermission === 'delete') {
              permissionValue = menuPerms.delete || menuPerms.can_delete || false;
            }
          }
        }
        
        if (permissionValue === true) {
          hasAccess = true;
          break;
        }
      }

      // Fallback: If requiredPermission is 'create' and user has can_read for /alerts, allow create (for device-assigned users)
      if (!hasAccess && requiredPermission === 'create' && menuPath === '/alerts') {
        for (const userRole of userRoles) {
          const menuPerm = userRole.menu_permissions && userRole.menu_permissions[menuPath];
          if (menuPerm && (menuPerm.read || menuPerm.can_read || menuPerm.access || menuPerm.can_access)) {
            hasAccess = true;
            break;
          }
          const dbPerm = await getRow('SELECT can_read, can_access FROM menu_permissions WHERE role_id = $1 AND menu_path = $2', [userRole.role_id, menuPath]);
          if (dbPerm && (dbPerm.can_read || dbPerm.can_access)) {
            hasAccess = true;
            break;
          }
        }
      }

      // Fallback: If no explicit permissions found, check role-based fallbacks
      if (!hasAccess) {
        const fallbackPermissions = {
          'operator': ['/dashboard', '/devices', '/data', '/data-dash', '/alerts', '/alert-settings', '/scheduled-exports', '/maintenance', '/company-site', '/sensor-management'],
          'operate': ['/dashboard', '/devices', '/data', '/data-dash', '/alerts', '/alert-settings', '/scheduled-exports', '/maintenance', '/company-site', '/sensor-management'],
          'viewer': ['/dashboard', '/devices', '/data', '/data-dash', '/alerts', '/alert-settings', '/scheduled-exports', '/maintenance', '/company-site', '/sensor-management'],
          'technician': ['/technician'],
          'admin': ['/technician'], // Admin can access technician menu for management
          'super_admin': ['/technician'] // Super admin can access technician menu for management
        };

        for (const userRole of userRoles) {
          const allowedMenus = fallbackPermissions[userRole.role_name];
          if (allowedMenus && allowedMenus.includes(menuPath)) {
            hasAccess = true;
            break;
          }
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ 
          error: `Insufficient permissions for ${menuPath}`,
          code: 'MENU_ACCESS_DENIED',
          required: requiredPermission,
          menu: menuPath
        });
      }

      next();
    } catch (error) {
      console.error('Menu authorization error:', error);
      return res.status(500).json({ 
        error: 'Menu authorization check failed',
        code: 'MENU_AUTH_CHECK_ERROR'
      });
    }
  };
};

// Device access authorization middleware
const authorizeDeviceAccess = (permission = 'read') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const deviceId = req.params.deviceId || req.body.deviceId || req.query.device_id;
      
      if (!deviceId) {
        return res.status(400).json({ 
          error: 'Device ID required',
          code: 'DEVICE_ID_MISSING'
        });
      }

      // Super admins have access to all devices
      if (req.user.role === 'super_admin') {
        return next();
      }

      // Check user's device permissions
      const permissionRecord = await getRow(
        'SELECT permissions FROM user_device_permissions WHERE user_id = $1 AND device_id = $2',
        [req.user.user_id, deviceId]
      );

      if (!permissionRecord) {
        return res.status(403).json({ 
          error: 'No access to this device',
          code: 'DEVICE_ACCESS_DENIED'
        });
      }

      const permissions = permissionRecord.permissions;
      
      if (!permissions[permission]) {
        return res.status(403).json({ 
          error: `Insufficient permissions for ${permission} access`,
          code: 'INSUFFICIENT_DEVICE_PERMISSIONS',
          required: permission,
          available: permissions
        });
      }

      next();
    } catch (error) {
      console.error('Device authorization error:', error);
      return res.status(500).json({ 
        error: 'Authorization check failed',
        code: 'AUTH_CHECK_ERROR'
      });
    }
  };
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Hash password
const hashPassword = async (password) => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  return await bcrypt.hash(password, saltRounds);
};

// Compare password
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Update user's last login
const updateLastLogin = async (userId) => {
  try {
    await getRow(
      'UPDATE users SET last_login = NOW() WHERE user_id = $1',
      [userId]
    );
  } catch (error) {
    console.error('Failed to update last login:', error);
  }
};

// Rate limiting helper
const createRateLimiter = (windowMs, maxRequests) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    if (requests.has(key)) {
      requests.set(key, requests.get(key).filter(timestamp => timestamp > windowStart));
    }
    
    const currentRequests = requests.get(key) || [];
    
    if (currentRequests.length >= maxRequests) {
      return res.status(429).json({ 
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    currentRequests.push(now);
    requests.set(key, currentRequests);
    next();
  };
};

// Session validation middleware
const validateSession = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Session invalid',
        code: 'SESSION_INVALID'
      });
    }

    // Check if user session is still valid (optional additional checks)
    const user = await getRow(
      'SELECT status FROM users WHERE user_id = $1',
      [req.user.user_id]
    );

    if (!user || user.status !== 'active') {
      return res.status(401).json({ 
        error: 'Session expired',
        code: 'SESSION_EXPIRED'
      });
    }

    next();
  } catch (error) {
    console.error('Session validation error:', error);
    return res.status(500).json({ 
      error: 'Session validation failed',
      code: 'SESSION_VALIDATION_ERROR'
    });
  }
};

module.exports = {
  authenticateToken,
  authorizeRole,
  authorizeMenuAccess,
  authorizeDeviceAccess,
  generateToken,
  hashPassword,
  comparePassword,
  updateLastLogin,
  createRateLimiter,
  validateSession
}; 