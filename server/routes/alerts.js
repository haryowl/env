const express = require('express');
const { query, getRow, getRows } = require('../config/database');
const { authenticateToken, authorizeMenuAccess } = require('../middleware/auth');
const router = express.Router();
const { processDeviceData } = require('../services/deviceMapper');

// GET /api/alerts - List all alerts
router.get('/', authenticateToken, authorizeMenuAccess('/alerts', 'read'), async (req, res) => {
  try {
    // Check if user is admin/super_admin - if so, show all alerts (including NULL created_by)
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
    let query = 'SELECT * FROM alerts';
    let params = [];
    
    if (!isAdmin) {
      // Non-admin users can only see alerts they created OR alerts with NULL created_by (existing records)
      query += ' WHERE (created_by = $1 OR created_by IS NULL)';
      params = [req.user.user_id];
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await getRows(query, params);
    res.json({ alerts: result });
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// POST /api/alerts - Create alert
router.post('/', authenticateToken, authorizeMenuAccess('/alerts', 'create'), async (req, res) => {
  try {
    const { name, device_id, parameter, min, max, type, threshold_time, actions, template } = req.body;
    
    // Validate required fields
    if (!name || !device_id || !parameter || !type) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        details: 'Name, device_id, parameter, and type are required' 
      });
    }
    
    // Validate device_id exists
    const deviceExists = await getRow('SELECT device_id FROM devices WHERE device_id = $1', [device_id]);
    if (!deviceExists) {
      return res.status(400).json({ 
        error: 'Invalid device_id', 
        details: `Device ${device_id} does not exist` 
      });
    }
    const result = await query(`
      INSERT INTO alerts (name, device_id, parameter, min, max, type, threshold_time, actions, template, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `, [name, device_id, parameter, min, max, type, threshold_time, actions ? JSON.stringify(actions) : '{}', template, req.user.user_id]);
    res.status(201).json({ alert: result.rows[0] });
  } catch (error) {
    console.error('Failed to create alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// PUT /api/alerts/:id - Update alert
router.put('/:id', authenticateToken, authorizeMenuAccess('/alerts', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, device_id, parameter, min, max, type, threshold_time, actions, template } = req.body;
    
    // Validate required fields
    if (!name || !device_id || !parameter || !type) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        details: 'Name, device_id, parameter, and type are required' 
      });
    }
    
    // Validate device_id exists
    const deviceExists = await getRow('SELECT device_id FROM devices WHERE device_id = $1', [device_id]);
    if (!deviceExists) {
      return res.status(400).json({ 
        error: 'Invalid device_id', 
        details: `Device ${device_id} does not exist` 
      });
    }
    
    // Check if user is admin/super_admin - if so, can update any alert
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
    let sqlQuery = `
      UPDATE alerts SET
        name = $1,
        device_id = $2,
        parameter = $3,
        min = $4,
        max = $5,
        type = $6,
        threshold_time = $7,
        actions = $8,
        template = $9,
        updated_at = NOW()
      WHERE alert_id = $10
    `;
    let params = [name, device_id, parameter, min, max, type, threshold_time, actions ? JSON.stringify(actions) : '{}', template, id];
    
    if (!isAdmin) {
      // Non-admin users can only update alerts they created OR alerts with NULL created_by (existing records)
      sqlQuery += ' AND (created_by = $11 OR created_by IS NULL)';
      params.push(req.user.user_id);
    }
    
    
    sqlQuery += ' RETURNING *';
    
    const result = await query(sqlQuery, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found or access denied' });
    }
    res.json({ alert: result.rows[0] });
  } catch (error) {
    console.error('Failed to update alert:', error);
    console.error('Alert ID:', req.params.id);
    console.error('Request body:', req.body);
    console.error('User:', req.user);
    res.status(500).json({ error: 'Failed to update alert', details: error.message });
  }
});

// DELETE /api/alerts/:id - Delete alert
router.delete('/:id', authenticateToken, authorizeMenuAccess('/alerts', 'delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is admin/super_admin - if so, can delete any alert
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
    let deleteQuery = 'DELETE FROM alerts WHERE alert_id = $1';
    let params = [id];
    
    if (!isAdmin) {
      // Non-admin users can only delete alerts they created OR alerts with NULL created_by (existing records)
      deleteQuery += ' AND (created_by = $2 OR created_by IS NULL)';
      params.push(req.user.user_id);
    }
    
    deleteQuery += ' RETURNING *';
    
    const result = await query(deleteQuery, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found or access denied' });
    }
    res.json({ message: 'Alert deleted', alert: result.rows[0] });
  } catch (error) {
    console.error('Failed to delete alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

// GET /api/alerts/mapped-data?device_id=xxx
router.get('/mapped-data', authenticateToken, authorizeMenuAccess('/alerts', 'read'), async (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) {
      return res.status(400).json({ error: 'device_id is required' });
    }
    // Get device info (for timezone, etc.)
    const device = await getRow('SELECT * FROM devices WHERE device_id = $1', [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    // Get latest sensor readings for this device (all sensor_types)
    const rows = await getRows(
      `SELECT DISTINCT ON (sensor_type) sensor_type, value, unit, timestamp, metadata
       FROM sensor_readings
       WHERE device_id = $1
       ORDER BY sensor_type, timestamp DESC`,
      [device_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No sensor data found for device' });
    }
    // Build latest raw payload
    let latestPayload = {};
    for (const row of rows) {
      // If metadata is present and is an object, merge it
      if (row.metadata && typeof row.metadata === 'object') {
        latestPayload = { ...latestPayload, ...row.metadata };
      }
      // Also include the main value under sensor_type
      latestPayload[row.sensor_type] = Number(row.value);
    }
    // Map to target fields
    const mapped = await processDeviceData(device, latestPayload);
    res.json({ device_id, mapped });
  } catch (error) {
    console.error('Failed to get mapped data for alerts:', error);
    res.status(500).json({ error: 'Failed to get mapped data for alerts', details: error.message });
  }
});

module.exports = router; 