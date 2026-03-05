const express = require('express');
const { authorizeRole, authenticateToken } = require('../middleware/auth');
const { getRow, getRows, query } = require('../config/database');
const Joi = require('joi');
const bcrypt = require('bcryptjs');

const router = express.Router();

// GET /api/users/me/context - Get current user's assigned company/site context
// Note: This router is already mounted behind authenticateToken in server/index.js
router.get('/me/context', async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED'
      });
    }

    const sites = await getRows(
      `
      SELECT
        s.site_id,
        s.site_name,
        s.company_id,
        c.company_name
      FROM user_sites us
      JOIN sites s ON us.site_id = s.site_id
      LEFT JOIN companies c ON s.company_id = c.company_id
      WHERE us.user_id = $1
      ORDER BY c.company_name NULLS LAST, s.site_name
      `,
      [userId]
    );

    res.json({
      user_id: userId,
      sites: Array.isArray(sites) ? sites : []
    });
  } catch (error) {
    console.error('Get user context error:', error);
    res.status(500).json({
      error: 'Failed to get user context',
      code: 'GET_USER_CONTEXT_ERROR'
    });
  }
});

// GET /api/users/by-role/:roleName - Get users by specific role
router.get('/by-role/:roleName', authenticateToken, async (req, res) => {
  try {
    const { roleName } = req.params;
    
    const users = await getRows(`
      SELECT DISTINCT u.user_id, u.username, u.email, u.status
      FROM users u
      JOIN user_roles ur ON u.user_id = ur.user_id
      JOIN roles r ON ur.role_id = r.role_id
      WHERE r.role_name = $1 AND u.status = 'active'
      ORDER BY u.username
    `, [roleName]);

    res.json(users);
  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({
      error: 'Failed to get users by role',
      code: 'GET_USERS_BY_ROLE_ERROR'
    });
  }
});


// User creation schema
const createUserSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().required(),
  status: Joi.string().valid('active', 'inactive', 'suspended').default('active')
});

// Get all users (admin only)
router.get('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const users = await getRows(`
      SELECT user_id, username, email, role, status, timezone, created_at, last_login
      FROM users 
      ORDER BY created_at DESC
    `);

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to get users',
      code: 'GET_USERS_ERROR'
    });
  }
});

// Get users for dropdowns (accessible by authenticated users)
router.get('/dropdown', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching users for dropdown...');
    const users = await getRows(`
      SELECT user_id, username, email
      FROM users 
      ORDER BY username ASC
    `);
    console.log('Users fetched successfully:', users.length, 'users');
    res.json(users);
  } catch (error) {
    console.error('Get users dropdown error:', error);
    res.status(500).json({
      error: 'Failed to get users for dropdown',
      code: 'GET_USERS_DROPDOWN_ERROR',
      details: error.message
    });
  }
});

// Get single user
router.get('/:userId', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await getRow(`
      SELECT user_id, username, email, role, status, timezone, preferences, created_at, last_login
      FROM users WHERE user_id = $1
    `, [userId]);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      code: 'GET_USER_ERROR'
    });
  }
});

// POST /api/users - Create a new user
router.post('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    console.log('User creation request received:', req.body);
    
    // Validate input
    const { error, value } = createUserSchema.validate(req.body);
    if (error) {
      console.log('Validation error:', error.details);
      return res.status(400).json({
        error: 'Invalid input data',
        code: 'VALIDATION_ERROR',
        details: error.details
      });
    }
    const { username, email, password, role } = value;
    
    console.log('Validated data:', { username, email, role, passwordLength: password.length });
    
    // Check if role exists in roles table
    const existingRole = await getRow(
      'SELECT role_id, role_name FROM roles WHERE role_name = $1',
      [role]
    );
    if (!existingRole) {
      // Get available roles for better error message
      const availableRoles = await getRows('SELECT role_name FROM roles ORDER BY role_name');
      console.log('Role not found:', role, 'Available roles:', availableRoles.map(r => r.role_name));
      return res.status(400).json({
        error: 'Invalid role. Role does not exist.',
        code: 'INVALID_ROLE',
        available_roles: availableRoles.map(r => r.role_name)
      });
    }
    
    console.log('Role found:', existingRole);
    
    // Check for existing user
    const existingUser = await getRow(
      'SELECT user_id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    if (existingUser) {
      console.log('User already exists:', { username, email });
      return res.status(409).json({
        error: 'Username or email already exists',
        code: 'USER_EXISTS'
      });
    }
    
    // Hash password (use BCRYPT_ROUNDS from env for consistency with auth)
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Insert user with status
    const result = await query(`
      INSERT INTO users (username, email, password_hash, role, status, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING user_id, username, email, role, status, created_at
    `, [username, email, passwordHash, role, value.status || 'active']);
    
    const newUser = result.rows[0];
    console.log('User created successfully:', newUser);
    
    // IMPORTANT: Also add the user to the user_roles table for the new role system
    try {
      await query(`
        INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by, assigned_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [newUser.user_id, existingRole.role_id, true, req.user.user_id]);
      
      console.log('User role assignment created successfully:', {
        user_id: newUser.user_id,
        role_id: existingRole.role_id,
        role_name: existingRole.role_name
      });
    } catch (roleError) {
      console.error('Failed to assign role in user_roles table:', roleError);
      // Note: We could rollback the user creation here, but for now just log the error
    }
    
    res.status(201).json({
      message: 'User created successfully',
      user: newUser
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      error: 'Failed to create user',
      code: 'CREATE_USER_ERROR'
    });
  }
});

// POST /api/users/bulk-assign - Bulk assign users to roles
router.post('/bulk-assign', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { user_ids, role_id, is_primary = false } = req.body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({
        error: 'User IDs array is required',
        code: 'MISSING_USER_IDS'
      });
    }

    if (!role_id) {
      return res.status(400).json({
        error: 'Role ID is required',
        code: 'MISSING_ROLE_ID'
      });
    }

    // Validate role exists
    const role = await getRow('SELECT role_id, role_name FROM roles WHERE role_id = $1', [role_id]);
    if (!role) {
      return res.status(404).json({
        error: 'Role not found',
        code: 'ROLE_NOT_FOUND'
      });
    }

    // Validate all users exist
    const existingUsers = await getRows(
      'SELECT user_id, username FROM users WHERE user_id = ANY($1)',
      [user_ids]
    );

    if (existingUsers.length !== user_ids.length) {
      const existingUserIds = existingUsers.map(u => u.user_id);
      const invalidUserIds = user_ids.filter(id => !existingUserIds.includes(id));
      return res.status(400).json({
        error: 'Some users not found',
        code: 'INVALID_USER_IDS',
        invalid_user_ids: invalidUserIds
      });
    }

    // Begin transaction
    await query('BEGIN');

    try {
      const results = [];
      
      for (const userId of user_ids) {
        // Check if user-role assignment already exists
        const existingAssignment = await getRow(
          'SELECT user_id, role_id FROM user_roles WHERE user_id = $1 AND role_id = $2',
          [userId, role_id]
        );

        if (existingAssignment) {
          // Update existing assignment
          await query(`
            UPDATE user_roles 
            SET is_primary = $1, assigned_at = NOW()
            WHERE user_id = $2 AND role_id = $3
          `, [is_primary, userId, role_id]);
          
          results.push({
            user_id: userId,
            action: 'updated',
            username: existingUsers.find(u => u.user_id === userId)?.username
          });
        } else {
          // Create new assignment
          await query(`
            INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at)
            VALUES ($1, $2, $3, NOW())
          `, [userId, role_id, is_primary]);
          
          results.push({
            user_id: userId,
            action: 'created',
            username: existingUsers.find(u => u.user_id === userId)?.username
          });
        }
      }

      await query('COMMIT');

      res.json({
        message: 'Bulk assignment completed successfully',
        role: role.role_name,
        results: results,
        total_assigned: results.length
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Bulk assign users error:', error);
    res.status(500).json({
      error: 'Failed to bulk assign users',
      code: 'BULK_ASSIGN_ERROR'
    });
  }
});

// POST /api/users/bulk-remove - Bulk remove users from roles
router.post('/bulk-remove', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { user_ids, role_id } = req.body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({
        error: 'User IDs array is required',
        code: 'MISSING_USER_IDS'
      });
    }

    if (!role_id) {
      return res.status(400).json({
        error: 'Role ID is required',
        code: 'MISSING_ROLE_ID'
      });
    }

    // Validate role exists
    const role = await getRow('SELECT role_id, role_name FROM roles WHERE role_id = $1', [role_id]);
    if (!role) {
      return res.status(404).json({
        error: 'Role not found',
        code: 'ROLE_NOT_FOUND'
      });
    }

    // Get existing assignments
    const existingAssignments = await getRows(
      'SELECT ur.user_id, u.username FROM user_roles ur JOIN users u ON ur.user_id = u.user_id WHERE ur.user_id = ANY($1) AND ur.role_id = $2',
      [user_ids, role_id]
    );

    if (existingAssignments.length === 0) {
      return res.status(404).json({
        error: 'No user-role assignments found',
        code: 'NO_ASSIGNMENTS_FOUND'
      });
    }

    // Remove assignments
    await query(
      'DELETE FROM user_roles WHERE user_id = ANY($1) AND role_id = $2',
      [user_ids, role_id]
    );

    res.json({
      message: 'Bulk removal completed successfully',
      role: role.role_name,
      removed_count: existingAssignments.length,
      removed_users: existingAssignments.map(a => ({
        user_id: a.user_id,
        username: a.username
      }))
    });

  } catch (error) {
    console.error('Bulk remove users error:', error);
    res.status(500).json({
      error: 'Failed to bulk remove users',
      code: 'BULK_REMOVE_ERROR'
    });
  }
});

// Update user
router.put('/:userId', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { username, email, role, status, timezone, preferences } = req.body;

    // Check if user exists
    const existingUser = await getRow(
      'SELECT user_id FROM users WHERE user_id = $1',
      [userId]
    );

    if (!existingUser) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (username !== undefined) {
      updateFields.push(`username = $${paramCount++}`);
      updateValues.push(username);
    }

    if (email !== undefined) {
      updateFields.push(`email = $${paramCount++}`);
      updateValues.push(email);
    }

    if (role !== undefined) {
      updateFields.push(`role = $${paramCount++}`);
      updateValues.push(role);
    }

    if (status !== undefined) {
      updateFields.push(`status = $${paramCount++}`);
      updateValues.push(status);
    }

    if (timezone !== undefined) {
      updateFields.push(`timezone = $${paramCount++}`);
      updateValues.push(timezone);
    }

    if (preferences !== undefined) {
      updateFields.push(`preferences = $${paramCount++}`);
      updateValues.push(JSON.stringify(preferences));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No fields to update',
        code: 'NO_FIELDS_TO_UPDATE'
      });
    }

    updateValues.push(userId);

    // Update user
    const result = await query(`
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE user_id = $${paramCount}
      RETURNING user_id, username, email, role, status, timezone, preferences
    `, updateValues);

    // CRITICAL: If role was updated, also sync the user_roles table
    if (role !== undefined) {
      console.log(`Syncing user_roles table for user ${userId} to role ${role}`);
      
      // First, remove all existing role assignments for this user
      await query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      
      // Then, add the new role assignment
      const roleResult = await getRow('SELECT role_id FROM roles WHERE role_name = $1', [role]);
      if (roleResult) {
        await query(`
          INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by, assigned_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [userId, roleResult.role_id, true, req.user.user_id]);
        
        console.log(`User ${userId} successfully assigned to role ${role} (${roleResult.role_id})`);
      } else {
        console.error(`Role ${role} not found in roles table`);
      }
    }

    res.json({
      message: 'User updated successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      error: 'Failed to update user',
      code: 'UPDATE_USER_ERROR'
    });
  }
});

// PUT /api/users/:id/preferences
router.put('/:id/preferences', async (req, res) => {
  const userId = req.params.id;
  const preferences = req.body;
  try {
    // Check if user exists
    const userResult = await getRow('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (!userResult) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Check if preferences column exists
    const colCheck = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'preferences'`);
    if (!colCheck.rows.length) {
      return res.status(400).json({ error: "'preferences' column does not exist in users table. Please add a JSONB 'preferences' column to support this feature." });
    }
    // Update preferences
    await query('UPDATE users SET preferences = $1 WHERE user_id = $2', [preferences, userId]);
    res.json({ success: true, preferences });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences', details: error.message });
  }
});

// Get current user's permissions
router.get('/me/permissions', async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    // Get user's primary role and all assigned roles with their permissions
    const userRoles = await getRows(`
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
    `, [userId]);

    // If no roles found, fall back to the user's primary role from users table
    if (userRoles.length === 0) {
      const user = await getRow('SELECT role FROM users WHERE user_id = $1', [userId]);
      if (user && user.role) {
        // Get the role_id for the user's primary role
        const roleRecord = await getRow('SELECT role_id, role_name, display_name FROM roles WHERE role_name = $1', [user.role]);
        if (roleRecord) {
          // Get menu permissions from the menu_permissions table
          const menuPermissions = await getRows(`
            SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
            FROM menu_permissions 
            WHERE role_id = $1
          `, [roleRecord.role_id]);

          // Convert to the expected format
          const menuPermissionsObj = {};
          menuPermissions.forEach(perm => {
            menuPermissionsObj[perm.menu_path] = {
              menu_path: perm.menu_path,
              menu_name: perm.menu_name,
              can_access: perm.can_access,
              can_create: perm.can_create,
              can_read: perm.can_read,
              can_update: perm.can_update,
              can_delete: perm.can_delete
            };
          });

          userRoles.push({
            role_id: roleRecord.role_id,
            role_name: roleRecord.role_name,
            display_name: roleRecord.display_name,
            permissions: {},
            menu_permissions: menuPermissionsObj,
            device_permissions: {},
            is_primary: true
          });
        }
      }
    }

    // Merge permissions from all roles (primary role takes precedence)
    const mergedPermissions = {
      menu_permissions: {},
      device_permissions: {},
      roles: userRoles.map(role => ({
        role_id: role.role_id,
        role_name: role.role_name,
        display_name: role.display_name,
        is_primary: role.is_primary
      }))
    };

    // Merge menu permissions from menu_permissions table (primary role permissions override others)
    for (const role of userRoles) {
      const menuPermissions = await getRows(`
        SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
        FROM menu_permissions 
        WHERE role_id = $1
      `, [role.role_id]);

      // If no menu permissions in table, fallback to JSONB column
      if (menuPermissions.length === 0 && role.menu_permissions && typeof role.menu_permissions === 'object') {
        // Convert JSONB format to table format
        for (const [menuPath, perms] of Object.entries(role.menu_permissions)) {
          if (perms && typeof perms === 'object') {
            if (!mergedPermissions.menu_permissions[menuPath] || role.is_primary) {
              mergedPermissions.menu_permissions[menuPath] = {
                menu_path: menuPath,
                menu_name: menuPath, // Fallback name
                can_access: perms.access || perms.can_access || false,
                can_create: perms.create || perms.can_create || false,
                can_read: perms.read || perms.can_read || false,
                can_update: perms.update || perms.can_update || false,
                can_delete: perms.delete || perms.can_delete || false
              };
            }
          }
        }
      } else {
        // Use permissions from menu_permissions table
        menuPermissions.forEach(perm => {
          const menuPath = perm.menu_path;
          if (!mergedPermissions.menu_permissions[menuPath] || role.is_primary) {
            mergedPermissions.menu_permissions[menuPath] = {
              menu_path: perm.menu_path,
              menu_name: perm.menu_name,
              can_access: perm.can_access,
              can_create: perm.can_create,
              can_read: perm.can_read,
              can_update: perm.can_update,
              can_delete: perm.can_delete
            };
          }
        });
      }
    }

    // Get role-based device permissions from role_device_permissions table
    const roleDevicePermissions = await getRows(`
      SELECT 
        rdp.role_id,
        rdp.device_id,
        rdp.permissions
      FROM role_device_permissions rdp
      JOIN user_roles ur ON rdp.role_id = ur.role_id
      WHERE ur.user_id = $1
    `, [userId]);

    // Get user-specific device permissions
    const userDevicePermissions = await getRows(`
      SELECT device_id, permissions
      FROM user_device_permissions
      WHERE user_id = $1
    `, [userId]);

    // Merge device permissions from multiple sources
    const devicePermissions = {};
    
    // First, get device permissions from roles table (legacy/fallback)
    userRoles.forEach(role => {
      if (role.device_permissions) {
        Object.keys(role.device_permissions).forEach(deviceId => {
          if (!devicePermissions[deviceId] || role.is_primary) {
            devicePermissions[deviceId] = role.device_permissions[deviceId];
          }
        });
      }
    });

    // Then, override with role_device_permissions (new system)
    roleDevicePermissions.forEach(rdp => {
      const role = userRoles.find(r => r.role_id === rdp.role_id);
      if (role && (!devicePermissions[rdp.device_id] || role.is_primary)) {
        devicePermissions[rdp.device_id] = rdp.permissions;
      }
    });

    // Finally, merge with user-specific device permissions (highest priority)
    userDevicePermissions.forEach(udp => {
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

    mergedPermissions.device_permissions = devicePermissions;

    res.json({
      success: true,
      permissions: mergedPermissions
    });
  } catch (error) {
    console.error('Get user permissions error:', error);
    res.status(500).json({ error: 'Failed to get user permissions', code: 'GET_USER_PERMISSIONS_ERROR' });
  }
});

// Delete user
router.delete('/:userId', authorizeRole(['super_admin']), async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await getRow(
      'SELECT user_id FROM users WHERE user_id = $1',
      [userId]
    );

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Soft delete - mark as suspended instead of actually deleting
    await query(
      'UPDATE users SET status = $1 WHERE user_id = $2',
      ['suspended', userId]
    );

    res.json({
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      code: 'DELETE_USER_ERROR'
    });
  }
});

module.exports = router; 