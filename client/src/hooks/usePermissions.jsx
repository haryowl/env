import { useState, useEffect, useContext, createContext } from 'react';
import { API_BASE_URL } from '../config/api';

const PermissionContext = createContext();

export const PermissionProvider = ({ children }) => {
  const [userPermissions, setUserPermissions] = useState(null);
  const [loading, setLoading] = useState(true);

  // Add a refresh function that can be called after login
  const refreshPermissions = () => {
    setLoading(true);
    fetchUserPermissions();
  };

  useEffect(() => {
    fetchUserPermissions();
    
    // Listen for manual refresh events (e.g., after login)
    const handleRefreshEvent = () => {
      refreshPermissions();
    };
    
    window.addEventListener('refreshPermissions', handleRefreshEvent);
    
    return () => {
      window.removeEventListener('refreshPermissions', handleRefreshEvent);
    };
  }, []);

  const fetchUserPermissions = async (retryCount = 0) => {
    try {
      const token = localStorage.getItem('iot_token');
      const userData = localStorage.getItem('iot_user');
      
      if (!token || !userData) {
        setLoading(false);
        return;
      }

      const user = JSON.parse(userData);
      
      // Try to fetch dynamic permissions from the API
      try {
        const response = await fetch(`${API_BASE_URL}/users/me/permissions`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          console.log('🔍 API Permissions Response:', data);
          if (data.success && data.permissions) {
            const permissions = {
              role: user.role,
              roles: data.permissions.roles || [],
              menuPermissions: data.permissions.menu_permissions || {},
              devicePermissions: data.permissions.device_permissions || {}
            };
            console.log('🔍 Processed Permissions:', permissions);
            setUserPermissions(permissions);
            setLoading(false);
            return;
          }
        } else {
          // If unauthorized, maybe token expired
          if (response.status === 401 && retryCount < 1) {
            // Don't clear tokens immediately, just retry once
            setTimeout(() => fetchUserPermissions(retryCount + 1), 1000);
            return;
          }
        }
      } catch (apiError) {
        console.warn('Failed to fetch dynamic permissions, falling back to defaults:', apiError);
      }

      // Fallback to basic role system if API call fails
      const permissions = {
        role: user.role,
        roles: [{ role_name: user.role, display_name: user.role, is_primary: true }],
        menuPermissions: getDefaultMenuPermissions(user.role),
        devicePermissions: getDefaultDevicePermissions(user.role)
      };

      setUserPermissions(permissions);
    } catch (error) {
      console.error('Failed to fetch user permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultMenuPermissions = (role) => {
    // Default restrictive permissions
    const permissions = {
      '/dashboard': { access: true, read: true, create: false, update: false, delete: false },
      '/quick-view': { access: false, read: false, create: false, update: false, delete: false },
      '/devices': { access: false, read: false, create: false, update: false, delete: false },
      '/users': { access: false, read: false, create: false, update: false, delete: false },
      '/roles': { access: false, read: false, create: false, update: false, delete: false },
      '/field-creator': { access: false, read: false, create: false, update: false, delete: false },
      '/mapper': { access: false, read: false, create: false, update: false, delete: false },
      '/listeners': { access: false, read: false, create: false, update: false, delete: false },
      '/data': { access: false, read: false, create: false, update: false, delete: false },
      '/data-dash': { access: false, read: false, create: false, update: false, delete: false },
      '/data-dash-2': { access: false, read: false, create: false, update: false, delete: false },
      '/alerts': { access: false, read: false, create: false, update: false, delete: false },
      '/alert-settings': { access: false, read: false, create: false, update: false, delete: false },
      '/notification-config': { access: false, read: false, create: false, update: false, delete: false },
      '/settings': { access: false, read: false, create: false, update: false, delete: false }
    };

    // Dynamic role-based permissions - no more hardcoded switches!
    const rolePermissions = {
      'super_admin': {
        // Full access to everything
        '/dashboard': { access: true, read: true, create: true, update: true, delete: true },
        '/quick-view': { access: true, read: true, create: true, update: true, delete: true },
        '/devices': { access: true, read: true, create: true, update: true, delete: true },
        '/users': { access: true, read: true, create: true, update: true, delete: true },
        '/roles': { access: true, read: true, create: true, update: true, delete: true },
        '/field-creator': { access: true, read: true, create: true, update: true, delete: true },
        '/mapper': { access: true, read: true, create: true, update: true, delete: true },
        '/listeners': { access: true, read: true, create: true, update: true, delete: true },
        '/data': { access: true, read: true, create: true, update: true, delete: true },
        '/data-dash': { access: true, read: true, create: true, update: true, delete: true },
        '/data-dash-2': { access: true, read: true, create: true, update: true, delete: true },
        '/alerts': { access: true, read: true, create: true, update: true, delete: true },
        '/alert-settings': { access: true, read: true, create: true, update: true, delete: true },
        '/notification-config': { access: true, read: true, create: true, update: true, delete: true },
        '/scheduled-exports': { access: true, read: true, create: true, update: true, delete: true },
        '/company-site': { access: true, read: true, create: true, update: true, delete: true },
        '/sensor-management': { access: true, read: true, create: true, update: true, delete: true },
        '/maintenance': { access: true, read: true, create: true, update: true, delete: true },
        '/technician': { access: true, read: true, create: true, update: true, delete: true },
        '/settings': { access: true, read: true, create: true, update: true, delete: true }
      },
      'admin': {
        // Admin access - can manage most things but not roles
        '/dashboard': { access: true, read: true, create: true, update: true, delete: true },
        '/quick-view': { access: true, read: true, create: true, update: true, delete: true },
        '/devices': { access: true, read: true, create: true, update: true, delete: true },
        '/users': { access: true, read: true, create: true, update: true, delete: false },
        '/roles': { access: false, read: false, create: false, update: false, delete: false },
        '/field-creator': { access: true, read: true, create: true, update: true, delete: true },
        '/mapper': { access: true, read: true, create: true, update: true, delete: true },
        '/listeners': { access: true, read: true, create: true, update: true, delete: true },
        '/data': { access: true, read: true, create: true, update: true, delete: true },
        '/data-dash': { access: true, read: true, create: true, update: true, delete: true },
        '/data-dash-2': { access: true, read: true, create: true, update: true, delete: true },
        '/alerts': { access: true, read: true, create: true, update: true, delete: true },
        '/alert-settings': { access: true, read: true, create: true, update: true, delete: true },
        '/notification-config': { access: true, read: true, create: true, update: true, delete: true },
        '/scheduled-exports': { access: true, read: true, create: true, update: true, delete: true },
        '/company-site': { access: true, read: true, create: true, update: true, delete: true },
        '/sensor-management': { access: true, read: true, create: true, update: true, delete: true },
        '/maintenance': { access: true, read: true, create: true, update: true, delete: true },
        '/technician': { access: true, read: true, create: true, update: true, delete: true },
        '/settings': { access: true, read: false, create: false, update: true, delete: false }
      },
      'demo': {
        // Demo access - limited but functional
        '/dashboard': { access: true, read: true, create: false, update: true, delete: false },
        '/quick-view': { access: true, read: true, create: false, update: false, delete: false },
        '/devices': { access: true, read: true, create: false, update: false, delete: false },
        '/users': { access: true, read: true, create: true, update: true, delete: false },
        '/roles': { access: true, read: true, create: false, update: false, delete: false },
        '/field-creator': { access: true, read: true, create: false, update: false, delete: false },
        '/mapper': { access: true, read: true, create: false, update: false, delete: false },
        '/listeners': { access: true, read: true, create: false, update: false, delete: false },
        '/data': { access: false, read: false, create: false, update: false, delete: false },
        '/data-dash': { access: true, read: true, create: false, update: false, delete: false },
        '/data-dash-2': { access: true, read: true, create: false, update: false, delete: false },
        '/alerts': { access: true, read: true, create: false, update: false, delete: false },
        '/alert-settings': { access: true, read: true, create: false, update: false, delete: false },
        '/notification-config': { access: true, read: true, create: false, update: false, delete: false },
        '/settings': { access: false, read: false, create: false, update: false, delete: false }
      },
      'operator': {
        // Operator access - can configure devices and manage maintenance
        '/dashboard': { access: true, read: true, create: false, update: false, delete: false },
        '/quick-view': { access: true, read: true, create: false, update: false, delete: false },
        '/devices': { access: true, read: true, create: false, update: true, delete: false },
        '/mapper': { access: true, read: true, create: false, update: true, delete: false },
        '/listeners': { access: true, read: true, create: false, update: true, delete: false },
        '/data': { access: true, read: true, create: false, update: false, delete: false },
        '/data-dash': { access: true, read: true, create: false, update: false, delete: false },
        '/data-dash-2': { access: true, read: true, create: false, update: false, delete: false },
        '/alerts': { access: true, read: true, create: false, update: true, delete: false },
        '/alert-settings': { access: true, read: true, create: false, update: true, delete: false },
        '/scheduled-exports': { access: true, read: true, create: false, update: true, delete: false },
        '/maintenance': { access: true, read: true, create: true, update: true, delete: true },
        '/company-site': { access: true, read: true, create: true, update: true, delete: true },
        '/sensor-management': { access: true, read: true, create: true, update: true, delete: true }
      },
      'viewer': {
        // Read-only access
        '/dashboard': { access: true, read: true, create: false, update: false, delete: false },
        '/quick-view': { access: true, read: true, create: false, update: false, delete: false },
        '/devices': { access: true, read: true, create: false, update: false, delete: false },
        '/data': { access: true, read: true, create: false, update: false, delete: false },
        '/data-dash': { access: true, read: true, create: false, update: false, delete: false },
        '/data-dash-2': { access: true, read: true, create: false, update: false, delete: false },
        '/alerts': { access: true, read: true, create: false, update: false, delete: false },
        '/alert-settings': { access: true, read: true, create: false, update: false, delete: false },
        '/scheduled-exports': { access: true, read: true, create: false, update: false, delete: false },
        '/maintenance': { access: true, read: true, create: false, update: false, delete: false },
        '/company-site': { access: true, read: true, create: false, update: false, delete: false },
        '/sensor-management': { access: true, read: true, create: false, update: false, delete: false }
      },
      'technician': {
        // Technician access - ONLY Field Operations
        '/technician': { access: true, read: true, create: true, update: true, delete: false }
      },
      // Additional role fallbacks for custom roles
      'operate': {
        // Operate role - similar to operator but with full maintenance access
        '/dashboard': { access: true, read: true, create: false, update: false, delete: false },
        '/quick-view': { access: true, read: true, create: false, update: false, delete: false },
        '/devices': { access: true, read: true, create: false, update: true, delete: false },
        '/data': { access: true, read: true, create: false, update: false, delete: false },
        '/data-dash': { access: true, read: true, create: true, update: true, delete: false },
        '/alerts': { access: true, read: true, create: false, update: true, delete: false },
        '/alert-settings': { access: true, read: true, create: true, update: true, delete: false },
        '/scheduled-exports': { access: true, read: true, create: false, update: true, delete: false },
        '/maintenance': { access: true, read: true, create: true, update: true, delete: true },
        '/company-site': { access: true, read: true, create: true, update: true, delete: true },
        '/sensor-management': { access: true, read: true, create: true, update: true, delete: true }
      }
    };

    // Return role-specific permissions or default restrictive permissions
    return rolePermissions[role] || permissions;
  };

  const getDefaultDevicePermissions = (role) => {
    const permissions = {
      read: false,
      write: false,
      configure: false,
      delete: false
    };

    // Dynamic role-based device permissions
    const roleDevicePermissions = {
      'super_admin': { read: true, write: true, configure: true, delete: true },
      'admin': { read: true, write: true, configure: true, delete: true },
      'operator': { read: true, write: false, configure: true, delete: false },
      'demo': { read: true, write: false, configure: false, delete: false },
      'viewer': { read: true, write: false, configure: false, delete: false },
      'technician': { read: true, write: false, configure: false, delete: false }
    };

    // Return role-specific permissions or default restrictive permissions
    return roleDevicePermissions[role] || permissions;
  };

  const hasMenuPermission = (menuPath, permission = 'access') => {
    if (!userPermissions || !userPermissions.menuPermissions) {
      return false;
    }
    // Map frontend permission names to backend property names
    const permissionMap = {
      'access': 'can_access',
      'create': 'can_create',
      'read': 'can_read',
      'update': 'can_update',
      'delete': 'can_delete'
    };
    const backendPermission = permissionMap[permission] || permission;
    return userPermissions.menuPermissions[menuPath]?.[backendPermission] || false;
  };

  const hasDevicePermission = (permission = 'read') => {
    if (!userPermissions || !userPermissions.devicePermissions) {
      return false;
    }
    return userPermissions.devicePermissions[permission] || false;
  };

  const canAccessMenu = (menuPath) => {
    const result = hasMenuPermission(menuPath, 'access');
    console.log(`🔍 canAccessMenu(${menuPath}):`, result, 'userPermissions:', userPermissions);
    return result;
  };

  const canCreate = (menuPath) => {
    return hasMenuPermission(menuPath, 'create');
  };

  const canRead = (menuPath) => {
    return hasMenuPermission(menuPath, 'read');
  };

  const canUpdate = (menuPath) => {
    return hasMenuPermission(menuPath, 'update');
  };

  const canDelete = (menuPath) => {
    return hasMenuPermission(menuPath, 'delete');
  };

  const value = {
    userPermissions,
    loading,
    hasMenuPermission,
    hasDevicePermission,
    canAccessMenu,
    canCreate,
    canRead,
    canUpdate,
    canDelete,
    refreshPermissions
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
}; 