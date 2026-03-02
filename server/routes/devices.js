const express = require('express');
const Joi = require('joi');
const { authorizeRole, authorizeDeviceAccess } = require('../middleware/auth');
const { getRow, getRows, query } = require('../config/database');
const mqttService = require('../services/mqttService');
const { authenticateToken } = require('../middleware/auth'); // Added missing import
const { filterDeviceData } = require('../middleware/dataFilter');

const router = express.Router();

// Validation schemas
const createDeviceSchema = Joi.object({
  device_id: Joi.string().required(),
  device_type: Joi.string().valid('sensor', 'gps', 'hybrid').required(),
  protocol: Joi.string().valid('mqtt', 'nmea', 'http', 'tcp', 'udp', 'modbus', 'custom').required(),
  name: Joi.string().required(),
  description: Joi.string().optional(),
  location: Joi.string().optional(),
  timezone: Joi.string().default('UTC'), // Default to UTC if not provided
  group_id: Joi.number().integer().optional(),
  config: Joi.object().optional(),
  field_mappings: Joi.object().optional()
});

const updateDeviceSchema = Joi.object({
  name: Joi.string().optional(),
  description: Joi.string().optional(),
  location: Joi.string().optional(),
  timezone: Joi.string().default('UTC'), // Default to UTC if not provided
  group_id: Joi.number().integer().optional(),
  config: Joi.object().optional(),
  field_mappings: Joi.object().optional(),
  status: Joi.string().valid('online', 'offline', 'error', 'maintenance').optional()
});

const devicePermissionSchema = Joi.object({
  user_id: Joi.number().integer().required(),
  permissions: Joi.object({
    read: Joi.boolean().default(true),
    write: Joi.boolean().default(false),
    configure: Joi.boolean().default(false),
    delete: Joi.boolean().default(false)
  }).required()
});

// Get devices for dropdowns (accessible by authenticated users)
router.get('/dropdown', authenticateToken, async (req, res) => {
  try {
    const devices = await getRows(`
      SELECT device_id, name, device_type, protocol, status
      FROM devices 
      ORDER BY name ASC
    `);
    res.json(devices);
  } catch (error) {
    console.error('Get devices dropdown error:', error);
    res.status(500).json({
      error: 'Failed to get devices for dropdown',
      code: 'GET_DEVICES_DROPDOWN_ERROR',
      details: error.message
    });
  }
});

// Get all devices (with pagination and filtering)
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Ensure soft delete column exists
    await query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false`);

    const { 
      page = 1, 
      limit = 20, 
      status, 
      protocol, 
      device_type, 
      group_id,
      search 
    } = req.query;

    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramCount = 1;

    // Build WHERE clause based on filters
    if (status) {
      conditions.push(`d.status = $${paramCount++}`);
      params.push(status);
    }

    if (protocol) {
      conditions.push(`d.protocol = $${paramCount++}`);
      params.push(protocol);
    }

    if (device_type) {
      conditions.push(`d.device_type = $${paramCount++}`);
      params.push(device_type);
    }

    if (group_id) {
      conditions.push(`d.group_id = $${paramCount++}`);
      params.push(group_id);
    }

    if (search) {
      conditions.push(`(d.name ILIKE $${paramCount++} OR d.device_id ILIKE $${paramCount++} OR d.description ILIKE $${paramCount++})`);
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (req.query.includeDeleted !== 'true') {
      conditions.push('d.is_deleted = false');
    }

    // Add user permission filter using the new middleware system
    if (req.allowedDeviceIds !== null) {
      // If allowedDeviceIds is an array, filter by those devices
      if (req.allowedDeviceIds && req.allowedDeviceIds.length > 0) {
        const deviceIds = req.allowedDeviceIds.map((_, index) => `$${paramCount + index}`).join(',');
        conditions.push(`d.device_id IN (${deviceIds})`);
        params.push(...req.allowedDeviceIds);
        paramCount += req.allowedDeviceIds.length;
      } else {
        // No devices allowed
        conditions.push('1 = 0'); // Always false
      }
    }
    // If req.allowedDeviceIds is null, it means full access (no filtering needed)

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await getRow(`
      SELECT COUNT(*) as total
      FROM devices d
      ${whereClause}
    `, params);

    // Get devices with pagination
    const devices = await getRows(`
      SELECT 
        d.*,
        dg.name as group_name,
        COALESCE(udp.permissions, '{}'::jsonb) as user_permissions
      FROM devices d
      LEFT JOIN device_groups dg ON d.group_id = dg.group_id
      LEFT JOIN user_device_permissions udp ON d.device_id = udp.device_id AND udp.user_id = $${paramCount}
      ${whereClause}
      ORDER BY d.name ASC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...params, req.user.user_id, limit, offset]);

    res.json({
      devices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.total),
        pages: Math.ceil(countResult.total / limit)
      }
    });

  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({
      error: 'Failed to get devices',
      code: 'GET_DEVICES_ERROR'
    });
  }
});

// Get devices with coordinates for map display
router.get('/with-coordinates', authenticateToken, filterDeviceData, async (req, res) => {
  try {
    console.log('User accessing devices with coordinates:', req.user.username, 'Role:', req.user.role);
    console.log('Allowed device IDs for coordinates:', req.allowedDeviceIds);
    
    // First ensure device_coordinates table exists
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS device_coordinates (
          id SERIAL PRIMARY KEY,
          device_id VARCHAR(50) NOT NULL,
          latitude NUMERIC,
          longitude NUMERIC,
          source VARCHAR(20) NOT NULL DEFAULT 'manual',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(device_id, source)
        )
      `);
    } catch (error) {
      console.log('Error creating device_coordinates table:', error.message);
    }

    // Build WHERE clause based on device filtering
    // Ensure soft delete column exists
    await query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false');

    let whereClause = "WHERE COALESCE(d.is_deleted, false) = false";
    let queryParams = [];
    
    if (req.allowedDeviceIds && req.allowedDeviceIds.length > 0) {
      const placeholders = req.allowedDeviceIds.map((_, index) => `$${index + 1}`).join(',');
      whereClause += ` AND d.device_id IN (${placeholders})`;
      queryParams = req.allowedDeviceIds;
    } else if (req.allowedDeviceIds !== null) {
      // Empty array means no access
      return res.json({ devices: [] });
    }
    
    // Get devices with coordinates - filtered by user permissions
    const devices = await getRows(`
      SELECT 
        d.device_id,
        d.name,
        d.status,
        d.created_at,
        d.updated_at,
        -- Try to get manual coordinates first
        (SELECT latitude FROM device_coordinates WHERE device_id = d.device_id AND source = 'manual' ORDER BY updated_at DESC LIMIT 1) as manual_latitude,
        (SELECT longitude FROM device_coordinates WHERE device_id = d.device_id AND source = 'manual' ORDER BY updated_at DESC LIMIT 1) as manual_longitude,
        -- Try to get device data coordinates (using correct column names)
        (SELECT field_value::numeric FROM device_data WHERE device_id = d.device_id AND field_name = 'latitude' ORDER BY timestamp DESC LIMIT 1) as device_latitude,
        (SELECT field_value::numeric FROM device_data WHERE device_id = d.device_id AND field_name = 'longitude' ORDER BY timestamp DESC LIMIT 1) as device_longitude,
        (SELECT field_value::numeric FROM device_data WHERE device_id = d.device_id AND field_name = 'lat' ORDER BY timestamp DESC LIMIT 1) as device_lat,
        (SELECT field_value::numeric FROM device_data WHERE device_id = d.device_id AND field_name = 'lng' ORDER BY timestamp DESC LIMIT 1) as device_lng,
        (SELECT field_value::numeric FROM device_data WHERE device_id = d.device_id AND field_name = 'lon' ORDER BY timestamp DESC LIMIT 1) as device_lon
      FROM devices d
      ${whereClause}
      ORDER BY d.name ASC
    `, queryParams);

    // Process the results to determine final coordinates
    const processedDevices = devices.map(device => {
      // Priority: manual coordinates > device coordinates
      const latitude = device.manual_latitude || device.device_latitude || device.device_lat;
      const longitude = device.manual_longitude || device.device_longitude || device.device_lng || device.device_lon;
      
      return {
        device_id: device.device_id,
        name: device.name,
        status: device.status,
        created_at: device.created_at,
        updated_at: device.updated_at,
        latitude: latitude,
        longitude: longitude
      };
    }).filter(device => device.latitude && device.longitude); // Only return devices with coordinates

    res.json({ devices: processedDevices });
  } catch (error) {
    console.error('Get devices with coordinates error:', error);
    res.status(500).json({
      error: 'Failed to get devices with coordinates',
      code: 'GET_DEVICES_COORDINATES_ERROR',
      details: error.message
    });
  }
});

// Get single device
router.get('/:deviceId', authorizeDeviceAccess('read'), async (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = await getRow(`
      SELECT 
        d.*,
        dg.name as group_name,
        udp.permissions
      FROM devices d
      LEFT JOIN device_groups dg ON d.group_id = dg.group_id
      LEFT JOIN user_device_permissions udp ON d.device_id = udp.device_id AND udp.user_id = $2
      WHERE d.device_id = $1
    `, [deviceId, req.user.user_id]);

    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Get device statistics
    const stats = await getDeviceStats(deviceId);

    res.json({
      device,
      stats
    });

  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({
      error: 'Failed to get device',
      code: 'GET_DEVICE_ERROR'
    });
  }
});

// Create new device
router.post('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    // Validate input
    const { error, value } = createDeviceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input data',
        code: 'VALIDATION_ERROR',
        details: error.details
      });
    }

    const {
      device_id,
      device_type,
      protocol,
      name,
      description,
      location,
      timezone,
      group_id,
      config,
      field_mappings
    } = value;

    // Check if device already exists
    const existingDevice = await getRow(
      'SELECT device_id FROM devices WHERE device_id = $1',
      [device_id]
    );

    if (existingDevice) {
      return res.status(409).json({
        error: 'Device ID already exists',
        code: 'DEVICE_EXISTS'
      });
    }

    // Create device
    const result = await query(`
      INSERT INTO devices (
        device_id, device_type, protocol, name, description, location, 
        timezone, group_id, config, field_mappings, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'offline', NOW())
      RETURNING *
    `, [
      device_id, device_type, protocol, name, description, location,
      timezone || 'UTC', group_id, JSON.stringify(config || {}), 
      JSON.stringify(field_mappings || {})
    ]);

    const newDevice = result.rows[0];

    // Subscribe to MQTT topics if protocol is MQTT
    if (protocol === 'mqtt' && config?.topics) {
      await mqttService.subscribeToDevice(device_id, config);
    }

    // Grant permissions to creator
    await query(`
      INSERT INTO user_device_permissions (user_id, device_id, permissions)
      VALUES ($1, $2, $3)
    `, [
      req.user.user_id,
      device_id,
      JSON.stringify({ read: true, write: true, configure: true, delete: true })
    ]);

    res.status(201).json({
      message: 'Device created successfully',
      device: newDevice
    });

  } catch (error) {
    console.error('Create device error:', error);
    res.status(500).json({
      error: 'Failed to create device',
      code: 'CREATE_DEVICE_ERROR'
    });
  }
});

// Update device
router.put('/:deviceId', /* authorizeDeviceAccess('configure'), */ async (req, res) => {
  try {
    const { deviceId } = req.params;

    console.log('Backend: PUT /devices/:deviceId', {
      deviceId,
      body: req.body,
      user: req.user
    });

    // Validate input
    const { error, value } = updateDeviceSchema.validate(req.body);
    if (error) {
      console.log('Backend: Validation error:', error.details);
      return res.status(400).json({
        error: 'Invalid input data',
        code: 'VALIDATION_ERROR',
        details: error.details
      });
    }

    console.log('Backend: Validation passed, value:', value);

    // Check if device exists
    const existingDevice = await getRow(
      'SELECT * FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (!existingDevice) {
      return res.status(404).json({
        error: 'Device not found',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    Object.keys(value).forEach(key => {
      if (value[key] !== undefined) {
        updateFields.push(`${key} = $${paramCount++}`);
        updateValues.push(
          key === 'config' || key === 'field_mappings' 
            ? JSON.stringify(value[key]) 
            : value[key]
        );
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No fields to update',
        code: 'NO_FIELDS_TO_UPDATE'
      });
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(deviceId);

    // Update device
    const result = await query(`
      UPDATE devices 
      SET ${updateFields.join(', ')}
      WHERE device_id = $${paramCount}
      RETURNING *
    `, updateValues);

    const updatedDevice = result.rows[0];

    // Update MQTT subscriptions if config changed
    if (value.config && existingDevice.protocol === 'mqtt') {
      await mqttService.subscribeToDevice(deviceId, value.config);
    }

    res.json({
      message: 'Device updated successfully',
      device: updatedDevice
    });

  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({
      error: 'Failed to update device',
      code: 'UPDATE_DEVICE_ERROR'
    });
  }
});

// Delete device
router.delete('/:deviceId', authorizeDeviceAccess('delete'), async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Check if device exists
    const device = await getRow(
      'SELECT * FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Ensure soft delete column exists
    await query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false');

    // Soft delete - mark as deleted instead of actually deleting
    await query(
      'UPDATE devices SET status = $1, is_deleted = true, updated_at = NOW() WHERE device_id = $2',
      ['offline', deviceId]
    );

    // Clear any mapper assignments for this device (prevents stale references)
    await query('DELETE FROM device_mapper_assignments WHERE device_id = $1', [deviceId]);
    await query('DELETE FROM user_device_permissions WHERE device_id = $1', [deviceId]);

    // Remove MQTT subscriptions
    if (device.protocol === 'mqtt') {
      // Note: MQTT service will handle unsubscribing
    }

    res.json({
      message: 'Device deleted successfully'
    });

  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({
      error: 'Failed to delete device',
      code: 'DELETE_DEVICE_ERROR'
    });
  }
});

// Get device permissions
router.get('/:deviceId/permissions', authorizeDeviceAccess('read'), async (req, res) => {
  try {
    const { deviceId } = req.params;

    const permissions = await getRows(`
      SELECT 
        udp.*,
        u.username,
        u.email,
        u.role
      FROM user_device_permissions udp
      JOIN users u ON udp.user_id = u.user_id
      WHERE udp.device_id = $1
      ORDER BY u.username
    `, [deviceId]);

    res.json({
      permissions: permissions
    });

  } catch (error) {
    console.error('Get device permissions error:', error);
    res.status(500).json({
      error: 'Failed to get device permissions',
      code: 'GET_PERMISSIONS_ERROR'
    });
  }
});

// Set device permissions
router.post('/:deviceId/permissions', authorizeDeviceAccess('configure'), async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Validate input
    const { error, value } = devicePermissionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input data',
        code: 'VALIDATION_ERROR',
        details: error.details
      });
    }

    const { user_id, permissions } = value;

    // Check if user exists
    const user = await getRow(
      'SELECT user_id FROM users WHERE user_id = $1',
      [user_id]
    );

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if device exists
    const device = await getRow(
      'SELECT device_id FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    // Upsert permissions
    await query(`
      INSERT INTO user_device_permissions (user_id, device_id, permissions)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, device_id)
      DO UPDATE SET permissions = $3
    `, [user_id, deviceId, JSON.stringify(permissions)]);

    res.json({
      message: 'Device permissions updated successfully'
    });

  } catch (error) {
    console.error('Set device permissions error:', error);
    res.status(500).json({
      error: 'Failed to set device permissions',
      code: 'SET_PERMISSIONS_ERROR'
    });
  }
});

// Remove device permissions
router.delete('/:deviceId/permissions/:userId', authorizeDeviceAccess('configure'), async (req, res) => {
  try {
    const { deviceId, userId } = req.params;

    await query(
      'DELETE FROM user_device_permissions WHERE device_id = $1 AND user_id = $2',
      [deviceId, userId]
    );

    res.json({
      message: 'Device permissions removed successfully'
    });

  } catch (error) {
    console.error('Remove device permissions error:', error);
    res.status(500).json({
      error: 'Failed to remove device permissions',
      code: 'REMOVE_PERMISSIONS_ERROR'
    });
  }
});

// Get latest device data for popup
router.get('/:deviceId/latest-data', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Check device permissions using the new middleware system
    if (req.allowedDeviceIds !== null) {
      // If allowedDeviceIds is an array, check if device is in the allowed list
      if (!req.allowedDeviceIds.includes(deviceId)) {
        return res.status(403).json({
          error: 'Access denied to this device',
          code: 'DEVICE_ACCESS_DENIED'
        });
      }
    }
    // If req.allowedDeviceIds is null, it means full access (no filtering needed)

    // Get device mapper assignment to know which parameters to fetch
    const mapperAssignment = await getRow(`
      SELECT mappings FROM device_mapper_assignments dma
      JOIN mapper_templates mt ON dma.template_id = mt.template_id
      WHERE dma.device_id = $1
    `, [deviceId]);

    if (!mapperAssignment) {
      return res.json({ data: {} });
    }

    const mappings = mapperAssignment.mappings || [];
    const targetFields = mappings.map(m => m.target_field).filter(field => 
      field !== 'datetime' && field !== 'timestamp' && field !== 'device_id' && field !== 'device_name'
    );

    if (targetFields.length === 0) {
      return res.json({ data: {} });
    }

    // Get latest data for each parameter
    const latestData = {};
    
    for (const field of targetFields) {
      const result = await getRow(`
        SELECT value, timestamp
        FROM sensor_readings 
        WHERE device_id = $1 AND sensor_type = $2
        ORDER BY timestamp DESC 
        LIMIT 1
      `, [deviceId, field]);
      
      if (result) {
        // Try to convert to number if possible
        const numValue = parseFloat(result.value);
        latestData[field] = isNaN(numValue) ? result.value : numValue;
      }
    }

    res.json({ data: latestData });
  } catch (error) {
    console.error('Get latest device data error:', error);
    res.status(500).json({
      error: 'Failed to get latest device data',
      code: 'GET_DEVICE_DATA_ERROR'
    });
  }
});

// Get device coordinates
router.get('/:deviceId/coordinates', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Check device permissions using the new middleware system
    if (req.allowedDeviceIds !== null) {
      // If allowedDeviceIds is an array, check if device is in the allowed list
      if (!req.allowedDeviceIds.includes(deviceId)) {
        return res.status(403).json({
          error: 'Access denied to this device',
          code: 'DEVICE_ACCESS_DENIED'
        });
      }
    }
    // If req.allowedDeviceIds is null, it means full access (no filtering needed)

    // First check if device_coordinates table exists and has manual coordinates
    let coordinates = null;
    
    try {
      // Check if device_coordinates table exists
      await query(`
        CREATE TABLE IF NOT EXISTS device_coordinates (
          id SERIAL PRIMARY KEY,
          device_id VARCHAR(50) NOT NULL,
          latitude NUMERIC,
          longitude NUMERIC,
          source VARCHAR(20) NOT NULL DEFAULT 'manual',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(device_id, source)
        )
      `);
      
      // Get manual coordinates first
      coordinates = await getRow(`
        SELECT latitude, longitude, source
        FROM device_coordinates 
        WHERE device_id = $1 AND source = 'manual'
        ORDER BY updated_at DESC 
        LIMIT 1
      `, [deviceId]);
      
      if (coordinates) {
        // Manual coordinates found, return them
        return res.json({
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          source: 'manual'
        });
      }
    } catch (error) {
      console.log('No manual coordinates found or table doesn\'t exist:', error.message);
    }

    // If no manual coordinates, try to get from device data
    try {
      coordinates = await getRow(`
        SELECT 
          COALESCE(
            (SELECT value::numeric FROM device_data WHERE device_id = $1 AND field_name = 'latitude' ORDER BY timestamp DESC LIMIT 1),
            (SELECT value::numeric FROM device_data WHERE device_id = $1 AND field_name = 'lat' ORDER BY timestamp DESC LIMIT 1)
          ) as latitude,
          COALESCE(
            (SELECT value::numeric FROM device_data WHERE device_id = $1 AND field_name = 'longitude' ORDER BY timestamp DESC LIMIT 1),
            (SELECT value::numeric FROM device_data WHERE device_id = $1 AND field_name = 'lng' ORDER BY timestamp DESC LIMIT 1),
            (SELECT value::numeric FROM device_data WHERE device_id = $1 AND field_name = 'lon' ORDER BY timestamp DESC LIMIT 1)
          ) as longitude
        FROM devices WHERE device_id = $1
      `, [deviceId]);
      
      if (coordinates && (coordinates.latitude || coordinates.longitude)) {
        return res.json({
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          source: 'device'
        });
      }
    } catch (error) {
      console.log('No device coordinates found:', error.message);
    }

    // No coordinates found
    res.json({
      latitude: null,
      longitude: null,
      source: 'device'
    });
  } catch (error) {
    console.error('Get device coordinates error:', error);
    res.status(500).json({
      error: 'Failed to get device coordinates',
      code: 'GET_DEVICE_COORDINATES_ERROR'
    });
  }
});

// Update device coordinates
router.put('/:deviceId/coordinates', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { latitude, longitude, source } = req.body;
    
    // Check device permissions
    if (req.user.role !== 'super_admin') {
      const hasPermission = await getRow(`
        SELECT 1 FROM user_device_permissions 
        WHERE user_id = $1 AND device_id = $2
      `, [req.user.user_id, deviceId]);
      
      if (!hasPermission) {
        return res.status(403).json({
          error: 'Access denied to this device',
          code: 'DEVICE_ACCESS_DENIED'
        });
      }
    }

    // Validate coordinates
    if (source === 'manual') {
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({
          error: 'Invalid coordinates',
          code: 'INVALID_COORDINATES'
        });
      }
      
      if (latitude < -90 || latitude > 90) {
        return res.status(400).json({
          error: 'Latitude must be between -90 and 90',
          code: 'INVALID_LATITUDE'
        });
      }
      
      if (longitude < -180 || longitude > 180) {
        return res.status(400).json({
          error: 'Longitude must be between -180 and 180',
          code: 'INVALID_LONGITUDE'
        });
      }
    }

    // Create device_coordinates table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS device_coordinates (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(50) NOT NULL,
        latitude NUMERIC,
        longitude NUMERIC,
        source VARCHAR(20) NOT NULL DEFAULT 'manual',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(device_id, source)
      )
    `);

    // Insert or update coordinates
    if (source === 'manual') {
      await query(`
        INSERT INTO device_coordinates (device_id, latitude, longitude, source)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (device_id, source) 
        DO UPDATE SET 
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          updated_at = NOW()
      `, [deviceId, latitude, longitude, source]);
    } else {
      // Remove manual coordinates if switching to device data
      await query(`
        DELETE FROM device_coordinates 
        WHERE device_id = $1 AND source = 'manual'
      `, [deviceId]);
    }

    res.json({
      success: true,
      message: 'Coordinates updated successfully'
    });
  } catch (error) {
    console.error('Update device coordinates error:', error);
    res.status(500).json({
      error: 'Failed to update device coordinates',
      code: 'UPDATE_DEVICE_COORDINATES_ERROR'
    });
  }
});

// Get device statistics
async function getDeviceStats(deviceId) {
  try {
    // Get sensor data count
    const sensorCount = await getRow(
      'SELECT COUNT(*) as count FROM sensor_readings WHERE device_id = $1',
      [deviceId]
    );

    // Get GPS data count
    const gpsCount = await getRow(
      'SELECT COUNT(*) as count FROM gps_tracks WHERE device_id = $1',
      [deviceId]
    );

    // Get latest sensor reading
    const latestSensor = await getRow(
      'SELECT *, (metadata->>\'datetime\') as datetime FROM sensor_readings WHERE device_id = $1 ORDER BY (metadata->>\'datetime\')::timestamp DESC LIMIT 1',
      [deviceId]
    );

    // Get latest GPS reading
    const latestGps = await getRow(
      'SELECT * FROM gps_tracks WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [deviceId]
    );

    // Get device events count
    const eventsCount = await getRow(
      'SELECT COUNT(*) as count FROM device_events WHERE device_id = $1',
      [deviceId]
    );

    return {
      sensor_readings: parseInt(sensorCount?.count || 0),
      gps_tracks: parseInt(gpsCount?.count || 0),
      events: parseInt(eventsCount?.count || 0),
      latest_sensor: latestSensor,
      latest_gps: latestGps
    };

  } catch (error) {
    console.error('Error getting device stats:', error);
    return {};
  }
}

module.exports = router; 