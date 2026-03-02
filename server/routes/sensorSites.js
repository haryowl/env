const express = require('express');
const router = express.Router();
const { query, getRow, getRows, transaction } = require('../config/database');
const { authenticateToken, authorizeMenuAccess } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);
router.use(authorizeMenuAccess('/sensor-management'));

// GET /api/sensor-sites - Get all sensor site installations
router.get('/', async (req, res) => {
  try {
    console.log('Fetching sensor sites for user:', req.user.user_id);
    const sensorSites = await getRows(`
      SELECT 
        ss.sensor_site_id,
        ss.name,
        ss.sensor_db_id,
        ss.site_id,
        ss.parameter,
        ss.device_id,
        ss.status,
        ss.installation_date,
        ss.last_maintenance_date,
        ss.next_maintenance_date,
        ss.notes,
        ss.created_at,
        ss.updated_at,
        ss.created_by,
        sd.brand_name,
        sd.sensor_type,
        sd.sensor_parameter,
        s.site_name,
        d.name as device_name,
        ARRAY_AGG(u.username) FILTER (WHERE u.username IS NOT NULL) as usernames,
        ARRAY_AGG(u.user_id) FILTER (WHERE u.user_id IS NOT NULL) as user_ids,
        CASE 
          WHEN sr.last_reading IS NULL THEN 'red'
          WHEN sr.last_reading < NOW() - INTERVAL '3 hours' THEN 'red'
          WHEN sr.last_reading < NOW() - INTERVAL '1 hour' THEN 'yellow'
          WHEN sr.avg_value_6h IS NULL THEN 'yellow'
          ELSE 'green'
        END as status_color,
        sr.last_reading,
        sr.avg_value_6h,
        ms.last_maintenance_date,
        ms.next_maintenance_date
      FROM sensor_sites ss
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN sensor_site_users ssu ON ss.sensor_site_id = ssu.sensor_site_id
      LEFT JOIN users u ON ssu.user_id = u.user_id
      LEFT JOIN devices d ON ss.device_id = d.device_id
      LEFT JOIN LATERAL (
        SELECT 
          MAX(timestamp) as last_reading,
          AVG(CAST(value AS NUMERIC)) as avg_value_6h
        FROM sensor_readings 
        WHERE device_id = ss.device_id 
          AND parameter = ss.parameter 
          AND timestamp >= NOW() - INTERVAL '6 hours'
      ) sr ON true
      LEFT JOIN LATERAL (
        SELECT 
          MAX(actual_date) as last_maintenance_date,
          MIN(planned_date) as next_maintenance_date
        FROM maintenance_schedules 
        WHERE sensor_site_id = ss.sensor_site_id
      ) ms ON true
      WHERE (ss.created_by = $1 OR ss.created_by IS NULL OR ssu.user_id = $1)
      GROUP BY ss.sensor_site_id, ss.name, ss.sensor_db_id, ss.site_id, ss.parameter, 
               ss.device_id, ss.status, ss.installation_date, ss.last_maintenance_date, 
               ss.next_maintenance_date, ss.notes, ss.created_at, ss.updated_at, ss.created_by,
               sd.brand_name, sd.sensor_type, sd.sensor_parameter, s.site_name, d.name,
               sr.last_reading, sr.avg_value_6h, ms.last_maintenance_date, ms.next_maintenance_date
      ORDER BY ss.name
    `, [req.user.user_id]);
    console.log('Sensor sites fetched:', sensorSites.length);
    res.json(sensorSites);
  } catch (error) {
    console.error('Get sensor sites error:', error);
    res.status(500).json({
      error: 'Failed to get sensor sites',
      code: 'GET_SENSOR_SITES_ERROR',
      details: error.message
    });
  }
});

// GET /api/sensor-sites/:id - Get sensor site by ID
router.get('/:id', async (req, res) => {
  try {
    const sensorSite = await getRow(`
      SELECT 
        ss.sensor_site_id,
        ss.name,
        ss.sensor_db_id,
        ss.site_id,
        ss.user_id,
        ss.parameter,
        ss.device_id,
        ss.status,
        ss.installation_date,
        ss.last_maintenance_date,
        ss.next_maintenance_date,
        ss.notes,
        ss.created_at,
        ss.updated_at,
        ss.created_by,
        sd.brand_name,
        sd.sensor_type,
        sd.sensor_parameter,
        s.site_name,
        u.username,
        d.name as device_name
      FROM sensor_sites ss
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN users u ON ss.user_id = u.user_id
      LEFT JOIN devices d ON ss.device_id = d.device_id
      WHERE ss.sensor_site_id = $1 AND (ss.created_by = $2 OR ss.created_by IS NULL OR EXISTS (
        SELECT 1 FROM sensor_site_users ssu WHERE ssu.sensor_site_id = ss.sensor_site_id AND ssu.user_id = $2
      ))
    `, [req.params.id, req.user.user_id]);

    if (!sensorSite) {
      return res.status(404).json({
        error: 'Sensor site not found',
        code: 'SENSOR_SITE_NOT_FOUND'
      });
    }

    res.json(sensorSite);
  } catch (error) {
    console.error('Get sensor site error:', error);
    res.status(500).json({
      error: 'Failed to get sensor site',
      code: 'GET_SENSOR_SITE_ERROR'
    });
  }
});

// POST /api/sensor-sites - Create new sensor site installation
router.post('/', async (req, res) => {
  try {
    const { name, sensor_db_id, site_id, user_ids, device_id, parameter } = req.body;

    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({
        error: 'Sensor site name is required',
        code: 'NAME_REQUIRED'
      });
    }

    if (!sensor_db_id) {
      return res.status(400).json({
        error: 'Sensor ID is required',
        code: 'SENSOR_ID_REQUIRED'
      });
    }

    if (!site_id) {
      return res.status(400).json({
        error: 'Site ID is required',
        code: 'SITE_ID_REQUIRED'
      });
    }

    if (!parameter || parameter.trim() === '') {
      return res.status(400).json({
        error: 'Parameter is required',
        code: 'PARAMETER_REQUIRED'
      });
    }

    // Validate sensor exists
    const sensor = await getRow(`
      SELECT sensor_db_id FROM sensor_database WHERE sensor_db_id = $1
    `, [sensor_db_id]);
    
    if (!sensor) {
      return res.status(400).json({
        error: 'Invalid sensor ID',
        code: 'INVALID_SENSOR_ID'
      });
    }

    // Validate site exists
    const site = await getRow(`
      SELECT site_id FROM sites WHERE site_id = $1
    `, [site_id]);
    
    if (!site) {
      return res.status(400).json({
        error: 'Invalid site ID',
        code: 'INVALID_SITE_ID'
      });
    }

    // Validate users exist if provided
    if (user_ids && user_ids.length > 0) {
      const userIds = Array.isArray(user_ids) ? user_ids : [user_ids];
      for (const userId of userIds) {
        const user = await getRow(`
          SELECT user_id FROM users WHERE user_id = $1
        `, [userId]);
        
        if (!user) {
          return res.status(400).json({
            error: `Invalid user ID: ${userId}`,
            code: 'INVALID_USER_ID'
          });
        }
      }
    }

    // Validate device exists if provided
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

    // Use transaction to create sensor site and user assignments
    const result = await transaction(async (client) => {
      // Create the sensor site (without user_id since we're using junction table)
      const sensorSiteResult = await client.query(`
        INSERT INTO sensor_sites (name, sensor_db_id, site_id, device_id, parameter, status, created_by)
        VALUES ($1, $2, $3, $4, $5, 'active', $6)
        RETURNING sensor_site_id, name, sensor_db_id, site_id, device_id, parameter, status, created_at
      `, [name, sensor_db_id, site_id, device_id, parameter, req.user.user_id]);

      const sensorSite = sensorSiteResult.rows[0];

      // Add user assignments to junction table if users provided
      if (user_ids && user_ids.length > 0) {
        const userIds = Array.isArray(user_ids) ? user_ids : [user_ids];
        for (const userId of userIds) {
          await client.query(`
            INSERT INTO sensor_site_users (sensor_site_id, user_id, assigned_by)
            VALUES ($1, $2, $3)
          `, [sensorSite.sensor_site_id, userId, req.user.user_id]);
        }
      }

      return sensorSite;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create sensor site error:', error);
    res.status(500).json({
      error: 'Failed to create sensor site',
      code: 'CREATE_SENSOR_SITE_ERROR'
    });
  }
});

// PUT /api/sensor-sites/:id - Update sensor site
router.put('/:id', async (req, res) => {
  try {
    const { name, sensor_db_id, site_id, user_ids, device_id, parameter, status } = req.body;
    const sensorSiteId = req.params.id;

    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({
        error: 'Sensor site name is required',
        code: 'NAME_REQUIRED'
      });
    }

    if (!sensor_db_id) {
      return res.status(400).json({
        error: 'Sensor ID is required',
        code: 'SENSOR_ID_REQUIRED'
      });
    }

    if (!site_id) {
      return res.status(400).json({
        error: 'Site ID is required',
        code: 'SITE_ID_REQUIRED'
      });
    }

    if (!parameter || parameter.trim() === '') {
      return res.status(400).json({
        error: 'Parameter is required',
        code: 'PARAMETER_REQUIRED'
      });
    }

    // Check if sensor site exists and user has permission
    const existingSensorSite = await getRow(`
      SELECT sensor_site_id FROM sensor_sites 
      WHERE sensor_site_id = $1 AND (created_by = $2 OR created_by IS NULL OR EXISTS (
        SELECT 1 FROM sensor_site_users ssu WHERE ssu.sensor_site_id = sensor_sites.sensor_site_id AND ssu.user_id = $2
      ))
    `, [sensorSiteId, req.user.user_id]);

    if (!existingSensorSite) {
      return res.status(404).json({
        error: 'Sensor site not found or access denied',
        code: 'SENSOR_SITE_NOT_FOUND'
      });
    }

    // Validate sensor exists
    const sensor = await getRow(`
      SELECT sensor_db_id FROM sensor_database WHERE sensor_db_id = $1
    `, [sensor_db_id]);
    
    if (!sensor) {
      return res.status(400).json({
        error: 'Invalid sensor ID',
        code: 'INVALID_SENSOR_ID'
      });
    }

    // Validate site exists
    const site = await getRow(`
      SELECT site_id FROM sites WHERE site_id = $1
    `, [site_id]);
    
    if (!site) {
      return res.status(400).json({
        error: 'Invalid site ID',
        code: 'INVALID_SITE_ID'
      });
    }

    // Validate users exist if provided
    if (user_ids && user_ids.length > 0) {
      const userIds = Array.isArray(user_ids) ? user_ids : [user_ids];
      for (const userId of userIds) {
        const user = await getRow(`
          SELECT user_id FROM users WHERE user_id = $1
        `, [userId]);
        
        if (!user) {
          return res.status(400).json({
            error: `Invalid user ID: ${userId}`,
            code: 'INVALID_USER_ID'
          });
        }
      }
    }

    // Validate device exists if provided
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

    // Use transaction to update sensor site and user assignments
    const result = await transaction(async (client) => {
      // Update the sensor site (without user_id since we're using junction table)
      const sensorSiteResult = await client.query(`
        UPDATE sensor_sites 
        SET name = $1, sensor_db_id = $2, site_id = $3, device_id = $4, parameter = $5, status = $6, updated_at = NOW()
        WHERE sensor_site_id = $7 AND (created_by = $8 OR created_by IS NULL OR EXISTS (
          SELECT 1 FROM sensor_site_users ssu WHERE ssu.sensor_site_id = sensor_sites.sensor_site_id AND ssu.user_id = $8
        ))
        RETURNING sensor_site_id, name, sensor_db_id, site_id, device_id, parameter, status, updated_at
      `, [name, sensor_db_id, site_id, device_id, parameter, status, sensorSiteId, req.user.user_id]);

      if (sensorSiteResult.rows.length === 0) {
        throw new Error('Sensor site not found or access denied');
      }

      // Remove existing user assignments
      await client.query(`
        DELETE FROM sensor_site_users WHERE sensor_site_id = $1
      `, [sensorSiteId]);

      // Add new user assignments if users provided
      if (user_ids && user_ids.length > 0) {
        const userIds = Array.isArray(user_ids) ? user_ids : [user_ids];
        for (const userId of userIds) {
          await client.query(`
            INSERT INTO sensor_site_users (sensor_site_id, user_id, assigned_by)
            VALUES ($1, $2, $3)
          `, [sensorSiteId, userId, req.user.user_id]);
        }
      }

      return sensorSiteResult.rows[0];
    });

    res.json(result);
  } catch (error) {
    console.error('Update sensor site error:', error);
    if (error.message === 'Sensor site not found or access denied') {
      return res.status(404).json({
        error: 'Sensor site not found or access denied',
        code: 'SENSOR_SITE_NOT_FOUND'
      });
    }
    res.status(500).json({
      error: 'Failed to update sensor site',
      code: 'UPDATE_SENSOR_SITE_ERROR'
    });
  }
});

// DELETE /api/sensor-sites/:id - Delete sensor site
router.delete('/:id', async (req, res) => {
  try {
    const sensorSiteId = req.params.id;

    // Check if sensor site exists and user has permission
    const existingSensorSite = await getRow(`
      SELECT sensor_site_id FROM sensor_sites 
      WHERE sensor_site_id = $1 AND (created_by = $2 OR created_by IS NULL OR EXISTS (
        SELECT 1 FROM sensor_site_users ssu WHERE ssu.sensor_site_id = sensor_sites.sensor_site_id AND ssu.user_id = $2
      ))
    `, [sensorSiteId, req.user.user_id]);

    if (!existingSensorSite) {
      return res.status(404).json({
        error: 'Sensor site not found or access denied',
        code: 'SENSOR_SITE_NOT_FOUND'
      });
    }

    const result = await query(`
      DELETE FROM sensor_sites 
      WHERE sensor_site_id = $1 AND (created_by = $2 OR created_by IS NULL OR EXISTS (
        SELECT 1 FROM sensor_site_users ssu WHERE ssu.sensor_site_id = sensor_sites.sensor_site_id AND ssu.user_id = $2
      ))
      RETURNING sensor_site_id
    `, [sensorSiteId, req.user.user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Sensor site not found or access denied',
        code: 'SENSOR_SITE_NOT_FOUND'
      });
    }

    res.json({ message: 'Sensor site deleted successfully' });
  } catch (error) {
    console.error('Delete sensor site error:', error);
    res.status(500).json({
      error: 'Failed to delete sensor site',
      code: 'DELETE_SENSOR_SITE_ERROR'
    });
  }
});

module.exports = router;