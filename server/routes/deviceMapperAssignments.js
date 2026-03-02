const express = require('express');
const { authorizeRole, authenticateToken } = require('../middleware/auth');
const { getRow, getRows, query } = require('../config/database');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Test route to verify router is working
router.get('/test', (req, res) => {
  console.log('Test route hit: /api/device-mapper-assignments/test');
  res.json({ message: 'Device mapper assignments router is working' });
});

// GET /api/device-mapper-assignments - Get all device mapper assignments
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        dma.device_id,
        dma.template_id,
        dma.timezone,
        dma.time_format,
        dma.created_at,
        dma.updated_at,
        d.name as device_name,
        mt.template_name,
        mt.description as template_description
      FROM device_mapper_assignments dma
      LEFT JOIN devices d ON dma.device_id = d.device_id
      LEFT JOIN mapper_templates mt ON dma.template_id = mt.template_id
      ORDER BY dma.created_at DESC
    `);

    res.json({
      success: true,
      assignments: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching device mapper assignments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device mapper assignments'
    });
  }
});

// GET /api/device-mapper-assignments/:deviceId - Get assignment for specific device
router.get('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    const result = await query(`
      SELECT 
        dma.device_id,
        dma.template_id,
        dma.timezone,
        dma.time_format,
        dma.created_at,
        dma.updated_at,
        d.name as device_name,
        mt.template_name,
        mt.description as template_description,
        mt.mappings
      FROM device_mapper_assignments dma
      LEFT JOIN devices d ON dma.device_id = d.device_id
      LEFT JOIN mapper_templates mt ON dma.template_id = mt.template_id
      WHERE dma.device_id = $1
    `, [deviceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No mapper assignment found for this device'
      });
    }

    res.json({
      success: true,
      assignment: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching device mapper assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device mapper assignment'
    });
  }
});

// POST /api/device-mapper-assignments - Assign mapper template to device
router.post('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { device_id, template_id, timezone, time_format } = req.body;

    // Validate required fields
    if (!device_id || !template_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: device_id, template_id'
      });
    }

    // Check if device exists
    const device = await getRow(
      'SELECT device_id FROM devices WHERE device_id = $1',
      [device_id]
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Check if template exists
    const template = await getRow(
      'SELECT template_id FROM mapper_templates WHERE template_id = $1',
      [template_id]
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Mapper template not found'
      });
    }

    // Check if device already has an assignment
    const existingAssignment = await getRow(
      'SELECT device_id FROM device_mapper_assignments WHERE device_id = $1',
      [device_id]
    );

    if (existingAssignment) {
      return res.status(409).json({
        success: false,
        error: 'Device already has a mapper assignment'
      });
    }

    // Create assignment
    const result = await query(`
      INSERT INTO device_mapper_assignments (
        device_id, template_id, timezone, time_format
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      device_id,
      template_id,
      timezone || 'UTC',
      time_format || 'ISO8601'
    ]);

    res.status(201).json({
      success: true,
      assignment: result.rows[0],
      message: 'Mapper template assigned to device successfully'
    });

  } catch (error) {
    console.error('Error assigning mapper template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign mapper template'
    });
  }
});

// PUT /api/device-mapper-assignments/:deviceId - Update device mapper assignment
router.put('/:deviceId', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  console.log('PUT /api/device-mapper-assignments/:deviceId called with:', {
    deviceId: req.params.deviceId,
    body: req.body,
    user: req.user
  });
  
  try {
    const { deviceId } = req.params;
    const { template_id, timezone, time_format } = req.body;

    // Validate required fields
    if (!template_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: template_id'
      });
    }

    // Check if assignment exists
    const existingAssignment = await getRow(
      'SELECT device_id FROM device_mapper_assignments WHERE device_id = $1',
      [deviceId]
    );

    if (!existingAssignment) {
      return res.status(404).json({
        success: false,
        error: 'Device mapper assignment not found'
      });
    }

    // Check if template exists
    const template = await getRow(
      'SELECT template_id FROM mapper_templates WHERE template_id = $1',
      [template_id]
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Mapper template not found'
      });
    }

    // Update assignment
    const result = await query(`
      UPDATE device_mapper_assignments 
      SET template_id = $1, timezone = $2, time_format = $3, updated_at = NOW()
      WHERE device_id = $4
      RETURNING *
    `, [
      template_id,
      timezone || 'UTC',
      time_format || 'ISO8601',
      deviceId
    ]);

    res.json({
      success: true,
      assignment: result.rows[0],
      message: 'Device mapper assignment updated successfully'
    });

  } catch (error) {
    console.error('Error updating device mapper assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update device mapper assignment'
    });
  }
});

// DELETE /api/device-mapper-assignments/:deviceId - Remove device mapper assignment
router.delete('/:deviceId', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Check if assignment exists
    const existingAssignment = await getRow(
      'SELECT device_id FROM device_mapper_assignments WHERE device_id = $1',
      [deviceId]
    );

    if (!existingAssignment) {
      return res.status(404).json({
        success: false,
        error: 'Device mapper assignment not found'
      });
    }

    // Delete assignment
    await query(
      'DELETE FROM device_mapper_assignments WHERE device_id = $1',
      [deviceId]
    );

    res.json({
      success: true,
      message: 'Device mapper assignment removed successfully'
    });

  } catch (error) {
    console.error('Error removing device mapper assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove device mapper assignment'
    });
  }
});

module.exports = router; 