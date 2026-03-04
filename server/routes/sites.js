const express = require('express');
const router = express.Router();
const { query, getRow, getRows } = require('../config/database');
const { authenticateToken, authorizeMenuAccess } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);
router.use(authorizeMenuAccess('/company-site'));

// GET /api/sites - Get all sites
router.get('/', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const role = req.user.role || '';
    const isFullAccess = role === 'super_admin' || role === 'admin';

    const sites = isFullAccess
      ? await getRows(`
          SELECT
            s.site_id,
            s.site_name,
            s.company_id,
            s.description,
            s.location,
            s.created_at,
            s.updated_at,
            s.created_by,
            c.company_name,
            array_agg(DISTINCT u.username) FILTER (WHERE u.username IS NOT NULL) as assigned_users,
            array_agg(DISTINCT d.name) FILTER (WHERE d.name IS NOT NULL) as assigned_devices
          FROM sites s
          LEFT JOIN companies c ON s.company_id = c.company_id
          LEFT JOIN user_sites us ON s.site_id = us.site_id
          LEFT JOIN users u ON us.user_id = u.user_id
          LEFT JOIN devices d ON s.site_id = d.site_id
          GROUP BY s.site_id, s.site_name, s.company_id, s.description, s.location, s.created_at, s.updated_at, s.created_by, c.company_name
          ORDER BY s.site_name
        `)
      : await getRows(`
      SELECT DISTINCT
        s.site_id,
        s.site_name,
        s.company_id,
        s.description,
        s.location,
        s.created_at,
        s.updated_at,
        s.created_by,
        c.company_name,
        array_agg(DISTINCT u.username) FILTER (WHERE u.username IS NOT NULL) as assigned_users,
        array_agg(DISTINCT d.name) FILTER (WHERE d.name IS NOT NULL) as assigned_devices
      FROM sites s
      LEFT JOIN companies c ON s.company_id = c.company_id
      LEFT JOIN user_sites us ON s.site_id = us.site_id
      LEFT JOIN users u ON us.user_id = u.user_id
      LEFT JOIN devices d ON s.site_id = d.site_id
      WHERE (s.created_by = $1 OR s.created_by IS NULL OR us.user_id = $1)
      GROUP BY s.site_id, s.site_name, s.company_id, s.description, s.location, s.created_at, s.updated_at, s.created_by, c.company_name
      ORDER BY s.site_name
    `, [userId]);

    res.json(sites);
  } catch (error) {
    console.error('Get sites error:', error);
    res.status(500).json({
      error: 'Failed to get sites',
      code: 'GET_SITES_ERROR'
    });
  }
});

// GET /api/sites/:id - Get site by ID
router.get('/:id', async (req, res) => {
  try {
    const site = await getRow(`
      SELECT 
        s.site_id,
        s.site_name,
        s.company_id,
        s.user_id,
        s.device_id,
        s.description,
        s.location,
        s.created_at,
        s.updated_at,
        s.created_by,
        c.company_name,
        u.username,
        d.name as device_name
      FROM sites s
      LEFT JOIN companies c ON s.company_id = c.company_id
      LEFT JOIN users u ON s.user_id = u.user_id
      LEFT JOIN devices d ON s.device_id = d.device_id
      WHERE s.site_id = $1 AND (s.created_by = $2 OR s.created_by IS NULL)
    `, [req.params.id, req.user.user_id]);

    if (!site) {
      return res.status(404).json({
        error: 'Site not found',
        code: 'SITE_NOT_FOUND'
      });
    }

    res.json(site);
  } catch (error) {
    console.error('Get site error:', error);
    res.status(500).json({
      error: 'Failed to get site',
      code: 'GET_SITE_ERROR'
    });
  }
});

// POST /api/sites - Create new site
router.post('/', async (req, res) => {
  try {
    const { site_name, company_id, user_ids, device_ids, description, location } = req.body;

    // Validation
    if (!site_name || site_name.trim() === '') {
      return res.status(400).json({
        error: 'Site name is required',
        code: 'SITE_NAME_REQUIRED'
      });
    }

    // Validate company_id if provided
    if (company_id) {
      const company = await getRow(`
        SELECT company_id FROM companies WHERE company_id = $1
      `, [company_id]);
      
      if (!company) {
        return res.status(400).json({
          error: 'Invalid company ID',
          code: 'INVALID_COMPANY_ID'
        });
      }
    }

    // Validate user_ids if provided
    if (user_ids && user_ids.length > 0) {
      const users = await getRows(`
        SELECT user_id FROM users WHERE user_id = ANY($1)
      `, [user_ids]);
      
      if (users.length !== user_ids.length) {
        return res.status(400).json({
          error: 'Some user IDs are invalid',
          code: 'INVALID_USER_IDS'
        });
      }
    }

    // Validate device_ids if provided
    if (device_ids && device_ids.length > 0) {
      const devices = await getRows(`
        SELECT device_id FROM devices WHERE device_id = ANY($1)
      `, [device_ids]);
      
      if (devices.length !== device_ids.length) {
        return res.status(400).json({
          error: 'Some device IDs are invalid',
          code: 'INVALID_DEVICE_IDS'
        });
      }
    }

    // Start transaction
    await query('BEGIN');

    try {
      // Create the site
      const result = await query(`
        INSERT INTO sites (site_name, company_id, description, location, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING site_id, site_name, company_id, description, location, created_at
      `, [site_name, company_id, description, location, req.user.user_id]);

      const siteId = result.rows[0].site_id;

      // Assign users to site if provided
      if (user_ids && user_ids.length > 0) {
        for (const userId of user_ids) {
          await query(`
            INSERT INTO user_sites (user_id, site_id, assigned_by)
            VALUES ($1, $2, $3)
          `, [userId, siteId, req.user.user_id]);
        }
      }

      // Assign devices to site if provided
      if (device_ids && device_ids.length > 0) {
        for (const deviceId of device_ids) {
          await query(`
            UPDATE devices SET site_id = $1 WHERE device_id = $2
          `, [siteId, deviceId]);
        }
      }

      await query('COMMIT');

      // Return the created site with additional info
      const siteWithDetails = await getRow(`
        SELECT 
          s.site_id,
          s.site_name,
          s.company_id,
          s.description,
          s.location,
          s.created_at,
          c.company_name,
          array_agg(DISTINCT u.username) FILTER (WHERE u.username IS NOT NULL) as assigned_users,
          array_agg(DISTINCT d.name) FILTER (WHERE d.name IS NOT NULL) as assigned_devices
        FROM sites s
        LEFT JOIN companies c ON s.company_id = c.company_id
        LEFT JOIN user_sites us ON s.site_id = us.site_id
        LEFT JOIN users u ON us.user_id = u.user_id
        LEFT JOIN devices d ON s.site_id = d.site_id
        WHERE s.site_id = $1
        GROUP BY s.site_id, s.site_name, s.company_id, s.description, s.location, s.created_at, c.company_name
      `, [siteId]);

      res.status(201).json(siteWithDetails);

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Create site error:', error);
    res.status(500).json({
      error: 'Failed to create site',
      code: 'CREATE_SITE_ERROR'
    });
  }
});

// PUT /api/sites/:id - Update site
router.put('/:id', async (req, res) => {
  try {
    const { site_name, company_id, user_id, device_id, description, location } = req.body;
    const siteId = req.params.id;

    // Validation
    if (!site_name || site_name.trim() === '') {
      return res.status(400).json({
        error: 'Site name is required',
        code: 'SITE_NAME_REQUIRED'
      });
    }

    // Check if site exists and user has permission
    const existingSite = await getRow(`
      SELECT site_id FROM sites 
      WHERE site_id = $1 AND (created_by = $2 OR created_by IS NULL)
    `, [siteId, req.user.user_id]);

    if (!existingSite) {
      return res.status(404).json({
        error: 'Site not found or access denied',
        code: 'SITE_NOT_FOUND'
      });
    }

    // Validate company_id if provided
    if (company_id) {
      const company = await getRow(`
        SELECT company_id FROM companies WHERE company_id = $1
      `, [company_id]);
      
      if (!company) {
        return res.status(400).json({
          error: 'Invalid company ID',
          code: 'INVALID_COMPANY_ID'
        });
      }
    }

    // Validate user_id if provided
    if (user_id) {
      const user = await getRow(`
        SELECT user_id FROM users WHERE user_id = $1
      `, [user_id]);
      
      if (!user) {
        return res.status(400).json({
          error: 'Invalid user ID',
          code: 'INVALID_USER_ID'
        });
      }
    }

    // Validate device_id if provided
    if (device_id) {
      const device = await getRow(`
        SELECT device_id FROM devices WHERE device_id = $1
      `, [device_id]);
      
      if (!device) {
        return res.status(400).json({
          error: 'Invalid device ID',
          code: 'INVALID_DEVICE_ID'
        });
      }
    }

    const result = await query(`
      UPDATE sites 
      SET 
        site_name = $1,
        company_id = $2,
        user_id = $3,
        device_id = $4,
        description = $5,
        location = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE site_id = $7 AND (created_by = $8 OR created_by IS NULL)
      RETURNING site_id, site_name, company_id, user_id, device_id, description, location, updated_at
    `, [site_name, company_id, user_id, device_id, description, location, siteId, req.user.user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Site not found or access denied',
        code: 'SITE_NOT_FOUND'
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update site error:', error);
    res.status(500).json({
      error: 'Failed to update site',
      code: 'UPDATE_SITE_ERROR'
    });
  }
});

// DELETE /api/sites/:id - Delete site
router.delete('/:id', async (req, res) => {
  try {
    const siteId = req.params.id;

    // Check if site exists and user has permission
    const existingSite = await getRow(`
      SELECT site_id FROM sites 
      WHERE site_id = $1 AND (created_by = $2 OR created_by IS NULL)
    `, [siteId, req.user.user_id]);

    if (!existingSite) {
      return res.status(404).json({
        error: 'Site not found or access denied',
        code: 'SITE_NOT_FOUND'
      });
    }

    // Check if site is referenced by sensor_sites
    const referencedSensors = await getRows(`
      SELECT COUNT(*) as count FROM sensor_sites WHERE site_id = $1
    `, [siteId]);

    if (referencedSensors[0].count > 0) {
      return res.status(409).json({
        error: 'Cannot delete site that has associated sensors',
        code: 'SITE_HAS_SENSORS'
      });
    }

    const result = await query(`
      DELETE FROM sites 
      WHERE site_id = $1 AND (created_by = $2 OR created_by IS NULL)
      RETURNING site_id
    `, [siteId, req.user.user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Site not found or access denied',
        code: 'SITE_NOT_FOUND'
      });
    }

    res.json({ message: 'Site deleted successfully' });
  } catch (error) {
    console.error('Delete site error:', error);
    res.status(500).json({
      error: 'Failed to delete site',
      code: 'DELETE_SITE_ERROR'
    });
  }
});

module.exports = router;
