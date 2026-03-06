const express = require('express');
const { authorizeRole } = require('../middleware/auth');
const { getRow, getRows, query } = require('../config/database');
const Joi = require('joi');

const router = express.Router();

// Helper function to get menu name from path
const getMenuName = (menuPath) => {
  const menuMap = {
    '/dashboard': 'Dashboard',
    '/quick-view': 'Quick View',
    '/devices': 'Devices',
    '/users': 'Users',
    '/roles': 'Roles',
    '/field-creator': 'Field Creator',
    '/mapper': 'Device Mapper',
    '/listeners': 'Listeners',
    '/data': 'Data',
    '/data-dash': 'Data Dashboard',
    '/data-dash-2': 'Data Dashboard 2',
    '/alerts': 'Alerts',
    '/alert-settings': 'Alert Settings',
    '/notification-config': 'Notification Config',
    '/scheduled-exports': 'Scheduled Exports',
    '/company-site': 'Company and Site',
    '/sensor-management': 'Sensor Management',
    '/maintenance': 'Maintenance',
    '/technician': 'Technician Dashboard',
    '/settings': 'Settings'
  };
  return menuMap[menuPath] || menuPath;
};

// Helper function to save menu permissions to menu_permissions table
const saveMenuPermissions = async (roleId, menuPermissions) => {
  if (!menuPermissions || typeof menuPermissions !== 'object') {
    return;
  }

  try {
    // First, delete existing menu permissions for this role
    await query('DELETE FROM menu_permissions WHERE role_id = $1', [roleId]);

    // Then, insert new menu permissions
    for (const [menuPath, permissions] of Object.entries(menuPermissions)) {
      if (permissions && typeof permissions === 'object') {
        const menuName = getMenuName(menuPath);
        await query(`
          INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (role_id, menu_path) DO UPDATE SET
            menu_name = $3,
            can_access = $4,
            can_create = $5,
            can_read = $6,
            can_update = $7,
            can_delete = $8
        `, [
          roleId,
          menuPath,
          menuName,
          permissions.access || permissions.can_access || false,
          permissions.create || permissions.can_create || false,
          permissions.read || permissions.can_read || false,
          permissions.update || permissions.can_update || false,
          permissions.delete || permissions.can_delete || false
        ]);
      }
    }
  } catch (error) {
    console.error('Error saving menu permissions:', error);
    // Don't fail the entire operation if menu permissions fail
    throw error; // Re-throw to let caller handle it
  }
};

// Role creation schema
const createRoleSchema = Joi.object({
  role_name: Joi.string().min(3).max(30).required(),
  display_name: Joi.string().min(3).max(100).required(),
  description: Joi.string().optional(),
  template_name: Joi.string().optional(),
  permissions: Joi.object().optional(),
  menu_permissions: Joi.object().optional(),
  device_permissions: Joi.object().optional()
});

// Update role schema
const updateRoleSchema = Joi.object({
  display_name: Joi.string().min(3).max(100).optional(),
  description: Joi.string().optional().allow(null, ''),
  permissions: Joi.object().optional(),
  menu_permissions: Joi.object().optional(),
  device_permissions: Joi.object().pattern(Joi.string(), Joi.any()).optional()
}).options({ stripUnknown: true, allowUnknown: true });

// GET /api/roles/templates - Get role templates
router.get('/templates', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const templates = [
      {
        name: 'Full Access',
        description: 'Complete system access with all permissions',
        permissions: {
          user_management: { create: true, read: true, update: true, delete: true },
          role_management: { create: true, read: true, update: true, delete: true },
          device_management: { create: true, read: true, update: true, delete: true },
          system_settings: { create: true, read: true, update: true, delete: true }
        },
        menu_permissions: {
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
          '/settings': { access: true, read: true, create: true, update: true, delete: true }
        },
        device_permissions: {
          read: true,
          write: true,
          configure: true,
          delete: true
        }
      },
      {
        name: 'Manager',
        description: 'Management access with user and device management',
        permissions: {
          user_management: { create: true, read: true, update: true, delete: false },
          role_management: { create: false, read: false, update: false, delete: false },
          device_management: { create: true, read: true, update: true, delete: false },
          system_settings: { create: false, read: false, update: true, delete: false }
        },
        menu_permissions: {
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
          '/settings': { access: true, read: false, create: false, update: true, delete: false }
        },
        device_permissions: {
          read: true,
          write: true,
          configure: true,
          delete: true
        }
      },
      {
        name: 'Operator',
        description: 'Device operation and monitoring access',
        permissions: {
          user_management: { create: false, read: false, update: false, delete: false },
          role_management: { create: false, read: false, update: false, delete: false },
          device_management: { create: false, read: true, update: true, delete: false },
          system_settings: { create: false, read: false, update: false, delete: false }
        },
        menu_permissions: {
          '/dashboard': { access: true, read: true, create: false, update: true, delete: false },
          '/quick-view': { access: true, read: true, create: false, update: false, delete: false },
          '/devices': { access: true, read: true, create: false, update: true, delete: false },
          '/users': { access: false, read: false, create: false, update: false, delete: false },
          '/roles': { access: false, read: false, create: false, update: false, delete: false },
          '/field-creator': { access: true, read: true, create: false, update: false, delete: false },
          '/mapper': { access: true, read: true, create: false, update: false, delete: false },
          '/listeners': { access: true, read: true, create: false, update: false, delete: false },
          '/data': { access: true, read: true, create: false, update: false, delete: false },
          '/data-dash': { access: true, read: true, create: false, update: false, delete: false },
          '/data-dash-2': { access: true, read: true, create: false, update: false, delete: false },
          '/alerts': { access: true, read: true, create: false, update: false, delete: false },
          '/alert-settings': { access: true, read: true, create: false, update: false, delete: false },
          '/notification-config': { access: true, read: true, create: false, update: false, delete: false },
          '/settings': { access: false, read: false, create: false, update: false, delete: false }
        },
        device_permissions: {
          read: true,
          write: true,
          configure: false,
          delete: false
        }
      },
      {
        name: 'Viewer',
        description: 'Read-only access for monitoring',
        permissions: {
          user_management: { create: false, read: false, update: false, delete: false },
          role_management: { create: false, read: false, update: false, delete: false },
          device_management: { create: false, read: true, update: false, delete: false },
          system_settings: { create: false, read: false, update: false, delete: false }
        },
        menu_permissions: {
          '/dashboard': { access: true, read: true, create: false, update: false, delete: false },
          '/quick-view': { access: true, read: true, create: false, update: false, delete: false },
          '/devices': { access: true, read: true, create: false, update: false, delete: false },
          '/users': { access: false, read: false, create: false, update: false, delete: false },
          '/roles': { access: false, read: false, create: false, update: false, delete: false },
          '/field-creator': { access: false, read: false, create: false, update: false, delete: false },
          '/mapper': { access: false, read: false, create: false, update: false, delete: false },
          '/listeners': { access: false, read: false, create: false, update: false, delete: false },
          '/data': { access: true, read: true, create: false, update: false, delete: false },
          '/data-dash': { access: true, read: true, create: false, update: false, delete: false },
          '/data-dash-2': { access: true, read: true, create: false, update: false, delete: false },
          '/alerts': { access: true, read: true, create: false, update: false, delete: false },
          '/alert-settings': { access: true, read: true, create: false, update: false, delete: false },
          '/notification-config': { access: false, read: false, create: false, update: false, delete: false },
          '/settings': { access: false, read: false, create: false, update: false, delete: false }
        },
        device_permissions: {
          read: true,
          write: false,
          configure: false,
          delete: false
        }
      },
      {
        name: 'Demo',
        description: 'Demo access with limited functionality',
        permissions: {
          user_management: { create: true, read: true, update: true, delete: false },
          role_management: { create: false, read: true, update: false, delete: false },
          device_management: { create: false, read: true, update: false, delete: false },
          system_settings: { create: false, read: false, update: false, delete: false }
        },
        menu_permissions: {
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
        device_permissions: {
          read: true,
          write: false,
          configure: false,
          delete: false
        }
      }
    ];

    res.json({ templates });
  } catch (error) {
    console.error('Get role templates error:', error);
    res.status(500).json({
      error: 'Failed to get role templates',
      code: 'GET_ROLE_TEMPLATES_ERROR'
    });
  }
});

// POST /api/roles/from-template - Create role from template
router.post('/from-template', authorizeRole(['super_admin']), async (req, res) => {
  try {
    const { role_name, display_name, description, template_name } = req.body;

    if (!role_name || !display_name || !template_name) {
      return res.status(400).json({
        error: 'Missing required fields',
        code: 'MISSING_FIELDS'
      });
    }

    // Define templates directly (same as in /templates endpoint)
    const templates = [
      {
        name: 'Full Access',
        description: 'Complete system access with all permissions',
        permissions: {
          user_management: { create: true, read: true, update: true, delete: true },
          role_management: { create: true, read: true, update: true, delete: true },
          device_management: { create: true, read: true, update: true, delete: true },
          system_settings: { create: true, read: true, update: true, delete: true }
        },
        menu_permissions: {
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
          '/settings': { access: true, read: true, create: true, update: true, delete: true }
        },
        device_permissions: {
          read: true,
          write: true,
          configure: true,
          delete: true
        }
      },
      {
        name: 'Manager',
        description: 'Management access with user and device management',
        permissions: {
          user_management: { create: true, read: true, update: true, delete: false },
          role_management: { create: false, read: false, update: false, delete: false },
          device_management: { create: true, read: true, update: true, delete: false },
          system_settings: { create: false, read: false, update: true, delete: false }
        },
        menu_permissions: {
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
          '/settings': { access: true, read: false, create: false, update: true, delete: false }
        },
        device_permissions: {
          read: true,
          write: true,
          configure: true,
          delete: true
        }
      },
      {
        name: 'Operator',
        description: 'Device operation and monitoring access',
        permissions: {
          user_management: { create: false, read: false, update: false, delete: false },
          role_management: { create: false, read: false, update: false, delete: false },
          device_management: { create: false, read: true, update: true, delete: false },
          system_settings: { create: false, read: false, update: false, delete: false }
        },
        menu_permissions: {
          '/dashboard': { access: true, read: true, create: false, update: true, delete: false },
          '/quick-view': { access: true, read: true, create: false, update: false, delete: false },
          '/devices': { access: true, read: true, create: false, update: true, delete: false },
          '/users': { access: false, read: false, create: false, update: false, delete: false },
          '/roles': { access: false, read: false, create: false, update: false, delete: false },
          '/field-creator': { access: true, read: true, create: false, update: false, delete: false },
          '/mapper': { access: true, read: true, create: false, update: false, delete: false },
          '/listeners': { access: true, read: true, create: false, update: false, delete: false },
          '/data': { access: true, read: true, create: false, update: false, delete: false },
          '/data-dash': { access: true, read: true, create: false, update: false, delete: false },
          '/data-dash-2': { access: true, read: true, create: false, update: false, delete: false },
          '/alerts': { access: true, read: true, create: false, update: false, delete: false },
          '/alert-settings': { access: true, read: true, create: false, update: false, delete: false },
          '/notification-config': { access: true, read: true, create: false, update: false, delete: false },
          '/settings': { access: false, read: false, create: false, update: false, delete: false }
        },
        device_permissions: {
          read: true,
          write: true,
          configure: false,
          delete: false
        }
      },
      {
        name: 'Viewer',
        description: 'Read-only access for monitoring',
        permissions: {
          user_management: { create: false, read: false, update: false, delete: false },
          role_management: { create: false, read: false, update: false, delete: false },
          device_management: { create: false, read: true, update: false, delete: false },
          system_settings: { create: false, read: false, update: false, delete: false }
        },
        menu_permissions: {
          '/dashboard': { access: true, read: true, create: false, update: false, delete: false },
          '/quick-view': { access: true, read: true, create: false, update: false, delete: false },
          '/devices': { access: true, read: true, create: false, update: false, delete: false },
          '/users': { access: false, read: false, create: false, update: false, delete: false },
          '/roles': { access: false, read: false, create: false, update: false, delete: false },
          '/field-creator': { access: false, read: false, create: false, update: false, delete: false },
          '/mapper': { access: false, read: false, create: false, update: false, delete: false },
          '/listeners': { access: false, read: false, create: false, update: false, delete: false },
          '/data': { access: true, read: true, create: false, update: false, delete: false },
          '/data-dash': { access: true, read: true, create: false, update: false, delete: false },
          '/data-dash-2': { access: true, read: true, create: false, update: false, delete: false },
          '/alerts': { access: true, read: true, create: false, update: false, delete: false },
          '/alert-settings': { access: true, read: true, create: false, update: false, delete: false },
          '/notification-config': { access: false, read: false, create: false, update: false, delete: false },
          '/settings': { access: false, read: false, create: false, update: false, delete: false }
        },
        device_permissions: {
          read: true,
          write: false,
          configure: false,
          delete: false
        }
      },
      {
        name: 'Demo',
        description: 'Demo access with limited functionality',
        permissions: {
          user_management: { create: true, read: true, update: true, delete: false },
          role_management: { create: false, read: true, update: false, delete: false },
          device_management: { create: false, read: true, update: false, delete: false },
          system_settings: { create: false, read: false, update: false, delete: false }
        },
        menu_permissions: {
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
        device_permissions: {
          read: true,
          write: false,
          configure: false,
          delete: false
        }
      }
    ];

    const template = templates.find(t => t.name === template_name);

    if (!template) {
      return res.status(404).json({
        error: 'Template not found',
        code: 'TEMPLATE_NOT_FOUND'
      });
    }

    // Check if role already exists
    const existingRole = await getRow(
      'SELECT role_id FROM roles WHERE role_name = $1',
      [role_name]
    );

    if (existingRole) {
      return res.status(409).json({
        error: 'Role already exists',
        code: 'ROLE_EXISTS'
      });
    }

    // Create role from template
    const result = await query(`
      INSERT INTO roles (role_name, display_name, description, permissions, menu_permissions, device_permissions, is_system_role, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, false, $7, NOW())
      RETURNING role_id, role_name, display_name, description, created_at
    `, [
      role_name,
      display_name,
      description || template.description,
      JSON.stringify(template.permissions),
      JSON.stringify(template.menu_permissions),
      JSON.stringify(template.device_permissions),
      req.user.user_id
    ]);

    const newRole = result.rows[0];

    // Save menu permissions to menu_permissions table
    if (template.menu_permissions && Object.keys(template.menu_permissions).length > 0) {
      try {
        await saveMenuPermissions(newRole.role_id, template.menu_permissions);
      } catch (menuError) {
        console.error('Error saving menu permissions:', menuError);
        // Don't fail the entire creation if menu permissions fail
      }
    }

    res.status(201).json({
      message: 'Role created successfully from template',
      role: newRole,
      template: template_name
    });
  } catch (error) {
    console.error('Create role from template error:', error);
    res.status(500).json({
      error: 'Failed to create role from template',
      code: 'CREATE_ROLE_FROM_TEMPLATE_ERROR'
    });
  }
});

// Get all roles (admin and super_admin only)
router.get('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const roles = await getRows(`
      SELECT 
        r.role_id,
        r.role_name,
        r.display_name,
        r.description,
        r.is_system_role,
        r.permissions,
        r.menu_permissions,
        r.device_permissions,
        r.created_at,
        r.updated_at,
        u.username as created_by_username,
        COUNT(ur.user_id) as user_count
      FROM roles r
      LEFT JOIN users u ON r.created_by = u.user_id
      LEFT JOIN user_roles ur ON r.role_id = ur.role_id
      GROUP BY r.role_id, r.role_name, r.display_name, r.description, r.is_system_role, 
               r.permissions, r.menu_permissions, r.device_permissions, r.created_at, 
               r.updated_at, u.username
      ORDER BY r.is_system_role DESC, r.display_name ASC
    `);

    res.json({ roles });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({
      error: 'Failed to get roles',
      code: 'GET_ROLES_ERROR'
    });
  }
});

// Get single role
router.get('/:roleId', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { roleId } = req.params;

    const role = await getRow(`
      SELECT 
        r.role_id,
        r.role_name,
        r.display_name,
        r.description,
        r.is_system_role,
        r.permissions,
        r.menu_permissions,
        r.device_permissions,
        r.created_at,
        r.updated_at,
        u.username as created_by_username
      FROM roles r
      LEFT JOIN users u ON r.created_by = u.user_id
      WHERE r.role_id = $1
    `, [roleId]);

    if (!role) {
      return res.status(404).json({
        error: 'Role not found',
        code: 'ROLE_NOT_FOUND'
      });
    }

    // Get users assigned to this role
    const users = await getRows(`
      SELECT 
        u.user_id,
        u.username,
        u.email,
        u.role as user_role,
        ur.is_primary,
        ur.assigned_at
      FROM user_roles ur
      JOIN users u ON ur.user_id = u.user_id
      WHERE ur.role_id = $1
      ORDER BY ur.is_primary DESC, u.username ASC
    `, [roleId]);

    // Get specific device permissions for this role
    const devicePermissions = await getRows(`
      SELECT 
        rdp.device_id,
        rdp.permissions,
        d.name as device_name
      FROM role_device_permissions rdp
      LEFT JOIN devices d ON rdp.device_id = d.device_id
      WHERE rdp.role_id = $1
    `, [roleId]);

    // Format device permissions as an object
    const specificDevicePermissions = {};
    devicePermissions.forEach(dp => {
      specificDevicePermissions[dp.device_id] = dp.permissions;
    });

    res.json({ 
      role: {
        ...role,
        specific_device_permissions: specificDevicePermissions
      },
      users: users
    });
  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({
      error: 'Failed to get role',
      code: 'GET_ROLE_ERROR'
    });
  }
});

// POST /api/roles - Create a new role
router.post('/', authorizeRole(['super_admin']), async (req, res) => {
  try {
    console.log('=== ROLE CREATION REQUEST ===');
    console.log('Raw request body:', JSON.stringify(req.body, null, 2));
    
    // TEMPORARILY BYPASS VALIDATION TO SEE WHAT'S HAPPENING
    const { role_name, display_name, description, permissions, menu_permissions, device_permissions } = req.body;
    
    console.log('Extracted data:', { role_name, display_name, description, permissions, menu_permissions, device_permissions });
    
    // Check if role already exists
    const existingRole = await getRow(
      'SELECT role_id FROM roles WHERE role_name = $1',
      [role_name]
    );

    if (existingRole) {
      return res.status(409).json({
        error: 'Role already exists',
        code: 'ROLE_EXISTS'
      });
    }

    // Insert new role
    const result = await query(`
      INSERT INTO roles (role_name, display_name, description, permissions, menu_permissions, device_permissions, is_system_role, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, false, $7, NOW())
      RETURNING role_id, role_name, display_name, description, created_at
    `, [
      role_name,
      display_name,
      description || '',
      JSON.stringify(permissions || {}),
      JSON.stringify(menu_permissions || {}),
      JSON.stringify(device_permissions || {}),
      req.user.user_id
    ]);

    const newRole = result.rows[0];

    // Save menu permissions to menu_permissions table
    if (menu_permissions && Object.keys(menu_permissions).length > 0) {
      try {
        await saveMenuPermissions(newRole.role_id, menu_permissions);
      } catch (menuError) {
        console.error('Error saving menu permissions:', menuError);
        // Don't fail the entire creation if menu permissions fail
      }
    }

    // Save device permissions to role_device_permissions table
    if (device_permissions && Object.keys(device_permissions).length > 0) {
      try {
        // Validate that all device IDs exist
        const deviceIds = Object.keys(device_permissions);
        const existingDevices = await getRows(`
          SELECT device_id FROM devices WHERE device_id = ANY($1)
        `, [deviceIds]);
        
        const existingDeviceIds = existingDevices.map(d => d.device_id);
        const invalidDeviceIds = deviceIds.filter(id => !existingDeviceIds.includes(id));
        
        if (invalidDeviceIds.length > 0) {
          console.warn('Invalid device IDs:', invalidDeviceIds);
          // Only insert permissions for valid device IDs
          for (const [deviceId, permissions] of Object.entries(device_permissions)) {
            if (existingDeviceIds.includes(deviceId)) {
              await query(`
                INSERT INTO role_device_permissions (role_id, device_id, permissions)
                VALUES ($1, $2, $3)
                ON CONFLICT (role_id, device_id) DO UPDATE SET permissions = $3
              `, [newRole.role_id, deviceId, JSON.stringify(permissions)]);
            }
          }
        } else {
          // All device IDs are valid, insert all permissions
          for (const [deviceId, permissions] of Object.entries(device_permissions)) {
            await query(`
              INSERT INTO role_device_permissions (role_id, device_id, permissions)
              VALUES ($1, $2, $3)
              ON CONFLICT (role_id, device_id) DO UPDATE SET permissions = $3
            `, [newRole.role_id, deviceId, JSON.stringify(permissions)]);
          }
        }
      } catch (deviceError) {
        console.error('Error saving device permissions:', deviceError);
        // Don't fail the entire creation if device permissions fail
      }
    }

    console.log('=== ROLE CREATED SUCCESSFULLY ===');
    console.log('New role:', newRole);

    res.status(201).json({
      message: 'Role created successfully',
      role: newRole
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({
      error: 'Failed to create role',
      code: 'CREATE_ROLE_ERROR'
    });
  }
});

// Update role (super_admin only, or admin for non-system roles)
router.put('/:roleId', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { roleId } = req.params;
    const { display_name, description, permissions, menu_permissions, device_permissions } = req.body;

    // Validate input
    const { error, value } = updateRoleSchema.validate(req.body, { abortEarly: false });
    if (error) {
      console.error('Update role validation failed:', error.details);
      return res.status(400).json({
        error: 'Invalid input data',
        code: 'VALIDATION_ERROR',
        details: error.details.map(d => ({ path: d.path.join('.'), message: d.message }))
      });
    }

    // Check if role exists
    const existingRole = await getRow(
      'SELECT role_id, is_system_role FROM roles WHERE role_id = $1',
      [roleId]
    );

    if (!existingRole) {
      return res.status(404).json({
        error: 'Role not found',
        code: 'ROLE_NOT_FOUND'
      });
    }

    // Only super_admin can modify system roles
    if (existingRole.is_system_role && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Only super admin can modify system roles',
        code: 'SYSTEM_ROLE_MODIFICATION_DENIED'
      });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (display_name !== undefined) {
      updateFields.push(`display_name = $${paramCount++}`);
      updateValues.push(display_name);
    }

    if (description !== undefined) {
      updateFields.push(`description = $${paramCount++}`);
      updateValues.push(description);
    }

    if (permissions !== undefined) {
      updateFields.push(`permissions = $${paramCount++}`);
      updateValues.push(JSON.stringify(permissions));
    }

    if (menu_permissions !== undefined) {
      updateFields.push(`menu_permissions = $${paramCount++}`);
      updateValues.push(JSON.stringify(menu_permissions));
    }

    if (device_permissions !== undefined) {
      updateFields.push(`device_permissions = $${paramCount++}`);
      updateValues.push(JSON.stringify(device_permissions));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No fields to update',
        code: 'NO_FIELDS_TO_UPDATE'
      });
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(roleId);

    // Update role
    const result = await query(`
      UPDATE roles 
      SET ${updateFields.join(', ')}
      WHERE role_id = $${paramCount}
      RETURNING *
    `, updateValues);

    // Update menu permissions in menu_permissions table
    if (menu_permissions !== undefined) {
      try {
        await saveMenuPermissions(roleId, menu_permissions);
      } catch (menuError) {
        console.error('Error updating menu permissions:', menuError);
        // Don't fail the entire update if menu permissions fail
      }
    }

    // Update device permissions in role_device_permissions table
    if (device_permissions !== undefined) {
      try {
        // First, remove all existing device permissions for this role
        await query('DELETE FROM role_device_permissions WHERE role_id = $1', [roleId]);
        
        // Then, insert the new device permissions
        if (device_permissions && Object.keys(device_permissions).length > 0) {
          // Validate that all device IDs exist
          const deviceIds = Object.keys(device_permissions);
          const existingDevices = await getRows(`
            SELECT device_id FROM devices WHERE device_id = ANY($1)
          `, [deviceIds]);
          
          const existingDeviceIds = existingDevices.map(d => d.device_id);
          const invalidDeviceIds = deviceIds.filter(id => !existingDeviceIds.includes(id));
          
          if (invalidDeviceIds.length > 0) {
            console.warn('Invalid device IDs:', invalidDeviceIds);
            // Only insert permissions for valid device IDs
            for (const [deviceId, permissions] of Object.entries(device_permissions)) {
              if (existingDeviceIds.includes(deviceId)) {
                await query(`
                  INSERT INTO role_device_permissions (role_id, device_id, permissions)
                  VALUES ($1, $2, $3)
                `, [roleId, deviceId, JSON.stringify(permissions)]);
              }
            }
          } else {
            // All device IDs are valid, insert all permissions
            for (const [deviceId, permissions] of Object.entries(device_permissions)) {
              await query(`
                INSERT INTO role_device_permissions (role_id, device_id, permissions)
                VALUES ($1, $2, $3)
              `, [roleId, deviceId, JSON.stringify(permissions)]);
            }
          }
        }
      } catch (deviceError) {
        console.error('Error updating device permissions:', deviceError);
        // Don't fail the entire update if device permissions fail
      }
    }

    res.json({
      message: 'Role updated successfully',
      role: result.rows[0]
    });

  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({
      error: 'Failed to update role',
      code: 'UPDATE_ROLE_ERROR'
    });
  }
});

// Delete role (super_admin only, and only non-system roles)
router.delete('/:roleId', authorizeRole(['super_admin']), async (req, res) => {
  try {
    const { roleId } = req.params;

    // Check if role exists and is not a system role
    const role = await getRow(
      'SELECT role_id, role_name, is_system_role FROM roles WHERE role_id = $1',
      [roleId]
    );

    if (!role) {
      return res.status(404).json({
        error: 'Role not found',
        code: 'ROLE_NOT_FOUND'
      });
    }

    if (role.is_system_role) {
      return res.status(400).json({
        error: 'Cannot delete system roles',
        code: 'SYSTEM_ROLE_DELETE_DENIED'
      });
    }

    // Check if role is assigned to any users
    const userCount = await getRow(
      'SELECT COUNT(*) as count FROM user_roles WHERE role_id = $1',
      [roleId]
    );

    if (parseInt(userCount.count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete role that is assigned to users',
        code: 'ROLE_IN_USE'
      });
    }

    // Delete role
    await query('DELETE FROM roles WHERE role_id = $1', [roleId]);

    res.json({
      message: 'Role deleted successfully'
    });

  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({
      error: 'Failed to delete role',
      code: 'DELETE_ROLE_ERROR'
    });
  }
});

// POST /api/roles/:roleId/inherit - Set role inheritance
router.post('/:roleId/inherit', authorizeRole(['super_admin']), async (req, res) => {
  try {
    const { roleId } = req.params;
    const { parent_role_id } = req.body;

    if (!parent_role_id) {
      return res.status(400).json({
        error: 'Parent role ID is required',
        code: 'MISSING_PARENT_ROLE'
      });
    }

    // Check if both roles exist
    const [role, parentRole] = await Promise.all([
      getRow('SELECT role_id, role_name FROM roles WHERE role_id = $1', [roleId]),
      getRow('SELECT role_id, role_name FROM roles WHERE role_id = $1', [parent_role_id])
    ]);

    if (!role) {
      return res.status(404).json({
        error: 'Role not found',
        code: 'ROLE_NOT_FOUND'
      });
    }

    if (!parentRole) {
      return res.status(404).json({
        error: 'Parent role not found',
        code: 'PARENT_ROLE_NOT_FOUND'
      });
    }

    // Check for circular inheritance
    if (roleId === parent_role_id) {
      return res.status(400).json({
        error: 'Role cannot inherit from itself',
        code: 'CIRCULAR_INHERITANCE'
      });
    }

    // Check if inheritance already exists
    const existingInheritance = await getRow(
      'SELECT * FROM role_inheritance WHERE child_role_id = $1 AND parent_role_id = $2',
      [roleId, parent_role_id]
    );

    if (existingInheritance) {
      return res.status(409).json({
        error: 'Inheritance relationship already exists',
        code: 'INHERITANCE_EXISTS'
      });
    }

    // Create inheritance relationship
    await query(`
      INSERT INTO role_inheritance (child_role_id, parent_role_id, created_at)
      VALUES ($1, $2, NOW())
    `, [roleId, parent_role_id]);

    res.json({
      message: 'Role inheritance set successfully',
      child_role: role.role_name,
      parent_role: parentRole.role_name
    });

  } catch (error) {
    console.error('Set role inheritance error:', error);
    res.status(500).json({
      error: 'Failed to set role inheritance',
      code: 'SET_INHERITANCE_ERROR'
    });
  }
});

// DELETE /api/roles/:roleId/inherit/:parentRoleId - Remove role inheritance
router.delete('/:roleId/inherit/:parentRoleId', authorizeRole(['super_admin']), async (req, res) => {
  try {
    const { roleId, parentRoleId } = req.params;

    const result = await query(`
      DELETE FROM role_inheritance 
      WHERE child_role_id = $1 AND parent_role_id = $2
    `, [roleId, parentRoleId]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Inheritance relationship not found',
        code: 'INHERITANCE_NOT_FOUND'
      });
    }

    res.json({
      message: 'Role inheritance removed successfully'
    });

  } catch (error) {
    console.error('Remove role inheritance error:', error);
    res.status(500).json({
      error: 'Failed to remove role inheritance',
      code: 'REMOVE_INHERITANCE_ERROR'
    });
  }
});

// GET /api/roles/:roleId/inheritance - Get role inheritance tree
router.get('/:roleId/inheritance', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { roleId } = req.params;

    // Get all parent roles (direct and indirect)
    const parentRoles = await getRows(`
      WITH RECURSIVE inheritance_tree AS (
        SELECT 
          ri.parent_role_id,
          r.role_name,
          r.display_name,
          1 as level
        FROM role_inheritance ri
        JOIN roles r ON ri.parent_role_id = r.role_id
        WHERE ri.child_role_id = $1
        
        UNION ALL
        
        SELECT 
          ri.parent_role_id,
          r.role_name,
          r.display_name,
          it.level + 1
        FROM role_inheritance ri
        JOIN roles r ON ri.parent_role_id = r.role_id
        JOIN inheritance_tree it ON ri.child_role_id = it.parent_role_id
      )
      SELECT DISTINCT parent_role_id, role_name, display_name, level
      FROM inheritance_tree
      ORDER BY level, role_name
    `, [roleId]);

    // Get all child roles (direct and indirect)
    const childRoles = await getRows(`
      WITH RECURSIVE inheritance_tree AS (
        SELECT 
          ri.child_role_id,
          r.role_name,
          r.display_name,
          1 as level
        FROM role_inheritance ri
        JOIN roles r ON ri.child_role_id = r.role_id
        WHERE ri.parent_role_id = $1
        
        UNION ALL
        
        SELECT 
          ri.child_role_id,
          r.role_name,
          r.display_name,
          it.level + 1
        FROM role_inheritance ri
        JOIN roles r ON ri.child_role_id = r.role_id
        JOIN inheritance_tree it ON ri.parent_role_id = it.child_role_id
      )
      SELECT DISTINCT child_role_id, role_name, display_name, level
      FROM inheritance_tree
      ORDER BY level, role_name
    `, [roleId]);

    res.json({
      role_id: roleId,
      parent_roles: parentRoles,
      child_roles: childRoles
    });

  } catch (error) {
    console.error('Get role inheritance error:', error);
    res.status(500).json({
      error: 'Failed to get role inheritance',
      code: 'GET_INHERITANCE_ERROR'
    });
  }
});

// GET /api/roles/audit-logs - Get role audit logs
router.get('/audit-logs', authorizeRole(['super_admin']), async (req, res) => {
  try {
    const { 
      role_id, 
      action, 
      user_id, 
      performed_by, 
      start_date, 
      end_date, 
      page = 1, 
      limit = 50 
    } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 1;

    if (role_id) {
      whereConditions.push(`ral.role_id = $${paramCount++}`);
      queryParams.push(role_id);
    }

    if (action) {
      whereConditions.push(`ral.action = $${paramCount++}`);
      queryParams.push(action);
    }

    if (user_id) {
      whereConditions.push(`ral.user_id = $${paramCount++}`);
      queryParams.push(user_id);
    }

    if (performed_by) {
      whereConditions.push(`ral.performed_by = $${paramCount++}`);
      queryParams.push(performed_by);
    }

    if (start_date) {
      whereConditions.push(`ral.created_at >= $${paramCount++}`);
      queryParams.push(start_date);
    }

    if (end_date) {
      whereConditions.push(`ral.created_at <= $${paramCount++}`);
      queryParams.push(end_date);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM role_audit_logs ral
      ${whereClause}
    `, queryParams);

    const total = parseInt(countResult.rows[0].total);
    const offset = (page - 1) * limit;

    // Get audit logs with pagination
    const logs = await query(`
      SELECT 
        ral.log_id,
        ral.action,
        ral.role_id,
        ral.user_id,
        ral.performed_by,
        ral.details,
        ral.ip_address,
        ral.user_agent,
        ral.created_at,
        r.role_name,
        u.username as user_username,
        p.username as performed_by_username
      FROM role_audit_logs ral
      LEFT JOIN roles r ON ral.role_id = r.role_id
      LEFT JOIN users u ON ral.user_id = u.user_id
      LEFT JOIN users p ON ral.performed_by = p.user_id
      ${whereClause}
      ORDER BY ral.created_at DESC
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `, [...queryParams, limit, offset]);

    res.json({
      logs: logs.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get role audit logs error:', error);
    res.status(500).json({
      error: 'Failed to get role audit logs',
      code: 'GET_AUDIT_LOGS_ERROR'
    });
  }
});

// Get available menus for role configuration
router.get('/menus/available', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const availableMenus = [
      {
        path: '/dashboard',
        name: 'Dashboard',
        description: 'Main dashboard with system overview',
        category: 'Main'
      },
      {
        path: '/quick-view',
        name: 'Quick View',
        description: 'Quick data visualization and analysis',
        category: 'Data'
      },
      {
        path: '/devices',
        name: 'Devices',
        description: 'Device management and configuration',
        category: 'Management'
      },
      {
        path: '/users',
        name: 'Users',
        description: 'User management and administration',
        category: 'Management'
      },
      {
        path: '/roles',
        name: 'Roles',
        description: 'Role management and permissions',
        category: 'Management'
      },
      {
        path: '/field-creator',
        name: 'Field Creator',
        description: 'Create and manage data fields',
        category: 'Configuration'
      },
      {
        path: '/mapper',
        name: 'Device Mapper',
        description: 'Device data mapping and transformation',
        category: 'Configuration'
      },
      {
        path: '/listeners',
        name: 'Listeners',
        description: 'Data listener configuration',
        category: 'Configuration'
      },
      {
        path: '/data',
        name: 'Data',
        description: 'Data viewer and analysis',
        category: 'Data'
      },
      {
        path: '/data-dash',
        name: 'Data Dashboard',
        description: 'Data visualization dashboard',
        category: 'Data'
      },
      {
        path: '/data-dash-2',
        name: 'Data Dashboard 2',
        description: 'Advanced data visualization',
        category: 'Data'
      },
      {
        path: '/alerts',
        name: 'Alerts',
        description: 'Alert management and monitoring',
        category: 'Monitoring'
      },
      {
        path: '/alert-settings',
        name: 'Alert Settings',
        description: 'Alert configuration and rules',
        category: 'Configuration'
      },
      {
        path: '/notification-config',
        name: 'Notification Config',
        description: 'Notification system configuration',
        category: 'Configuration'
      },
      {
        path: '/scheduled-exports',
        name: 'Scheduled Exports',
        description: 'Scheduled report generation and delivery',
        category: 'Configuration'
      },
      {
        path: '/company-site',
        name: 'Company and Site',
        description: 'Company and site management',
        category: 'In Addition'
      },
      {
        path: '/sensor-management',
        name: 'Sensor Management',
        description: 'Sensor database and site management',
        category: 'In Addition'
      },
      {
        path: '/maintenance',
        name: 'Maintenance',
        description: 'Maintenance schedules and visit management',
        category: 'In Addition'
      },
      {
        path: '/settings',
        name: 'Settings',
        description: 'System settings and preferences',
        category: 'System'
      }
    ];

    res.json({ menus: availableMenus });
  } catch (error) {
    console.error('Get available menus error:', error);
    res.status(500).json({
      error: 'Failed to get available menus',
      code: 'GET_MENUS_ERROR'
    });
  }
});

// Get devices and groups for role configuration
router.get('/devices/available', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const devices = await getRows(`
      SELECT 
        device_id,
        name,
        device_type,
        protocol,
        status,
        group_id
      FROM devices 
      ORDER BY name ASC
    `);

    const groups = await getRows(`
      SELECT 
        group_id,
        name,
        description
      FROM device_groups 
      ORDER BY name ASC
    `);

    res.json({ 
      devices: devices,
      groups: groups
    });
  } catch (error) {
    console.error('Get available devices error:', error);
    res.status(500).json({
      error: 'Failed to get available devices',
      code: 'GET_DEVICES_ERROR'
    });
  }
});

// Test endpoint to check schema validation
router.post('/test-schema', authorizeRole(['super_admin']), async (req, res) => {
  try {
    console.log('Testing schema with data:', req.body);
    
    const { error, value } = createRoleSchema.validate(req.body);
    if (error) {
      console.log('Schema validation failed:', error.details);
      return res.status(400).json({
        error: 'Schema validation failed',
        details: error.details,
        schema: createRoleSchema.describe()
      });
    }
    
    console.log('Schema validation passed:', value);
    res.json({
      message: 'Schema validation passed',
      validatedData: value
    });
  } catch (error) {
    console.error('Schema test error:', error);
    res.status(500).json({
      error: 'Schema test failed',
      message: error.message
    });
  }
});

// Test endpoint to check role permissions
router.get('/test/:roleName/permissions', authorizeRole(['super_admin']), async (req, res) => {
  try {
    const { roleName } = req.params;
    
    const role = await getRow(`
      SELECT role_id, role_name, display_name, permissions, menu_permissions, device_permissions
      FROM roles WHERE role_name = $1
    `, [roleName]);
    
    if (!role) {
      return res.status(404).json({
        error: 'Role not found',
        code: 'ROLE_NOT_FOUND'
      });
    }
    
    // Get specific device permissions
    const devicePermissions = await getRows(`
      SELECT device_id, permissions FROM role_device_permissions WHERE role_id = $1
    `, [role.role_id]);
    
    res.json({
      role: {
        ...role,
        specific_device_permissions: devicePermissions
      }
    });
  } catch (error) {
    console.error('Test role permissions error:', error);
    res.status(500).json({
      error: 'Failed to get role permissions',
      code: 'GET_ROLE_PERMISSIONS_ERROR'
    });
  }
});

module.exports = router; 