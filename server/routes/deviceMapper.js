const express = require('express');
const { authorizeRole } = require('../middleware/auth');
const { getRow, getRows, query } = require('../config/database');
const mathFormulaService = require('../services/mathFormulaService');

const router = express.Router();

// In-memory storage for development (will be replaced with database)
let mappers = [];

// GET /api/device-mapper - Get all mappers
router.get('/', async (req, res) => {
  try {
    // Get mappers from database
    const result = await query(`
      SELECT 
        mt.template_id as id,
        mt.template_name as name,
        mt.description,
        mt.device_id,
        mt.mappings,
        mt.created_at,
        mt.updated_at,
        mt.created_by
      FROM mapper_templates mt
      ORDER BY mt.created_at DESC
    `);

    // Add device names to mappers
    const mappersWithDeviceNames = await Promise.all(
      result.rows.map(async (mapper) => {
        if (mapper.device_id) {
          const device = await getRow(
            'SELECT name FROM devices WHERE device_id = $1',
            [mapper.device_id]
          );
          return {
            ...mapper,
            device_name: device ? device.name : mapper.device_id,
          };
        } else {
          return {
            ...mapper,
            device_name: 'All Devices',
          };
        }
      })
    );

    res.json({
      success: true,
      mappers: mappersWithDeviceNames,
      count: mappersWithDeviceNames.length
    });

  } catch (error) {
    console.error('Error fetching mappers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch mappers'
    });
  }
});

// POST /api/device-mapper - Create a new mapper
router.post('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { name, device_id, description, mappings } = req.body;

    // Validate required fields
    if (!name || !device_id || !mappings || mappings.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, device_id, mappings'
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

    // Create new mapper template
    const result = await query(`
      INSERT INTO mapper_templates (
        template_name, description, device_id, mappings, created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      name,
      description || null,
      device_id,
      JSON.stringify(mappings),
      req.user.user_id
    ]);

    // Get the created mapper with device name
    const deviceInfo = await getRow(
      'SELECT name FROM devices WHERE device_id = $1',
      [device_id]
    );

    const newMapper = {
      id: result.rows[0].template_id,
      name: name,
      device_id: device_id,
      device_name: deviceInfo ? deviceInfo.name : device_id,
      description: description,
      mappings: mappings,
      created_at: result.rows[0].created_at
    };

    res.status(201).json({
      success: true,
      mapper: newMapper,
      message: 'Mapper created successfully'
    });

  } catch (error) {
    console.error('Error creating mapper:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create mapper'
    });
  }
});

// PUT /api/device-mapper/:id - Update a mapper
router.put('/:id', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, device_id, description, mappings } = req.body;

    // Validate required fields
    if (!name || !device_id || !mappings || mappings.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, device_id, mappings'
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

    // Update mapper template
    const result = await query(`
      UPDATE mapper_templates 
      SET template_name = $1, description = $2, device_id = $3, mappings = $4, updated_at = NOW()
      WHERE template_id = $5
      RETURNING *
    `, [
      name,
      description || null,
      device_id,
      JSON.stringify(mappings),
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Mapper not found'
      });
    }

    // Get updated mapper with device name
    const deviceInfo = await getRow(
      'SELECT name FROM devices WHERE device_id = $1',
      [device_id]
    );

    const updatedMapper = {
      id: result.rows[0].template_id,
      name: name,
      device_id: device_id,
      device_name: deviceInfo ? deviceInfo.name : device_id,
      description: description,
      mappings: mappings,
      updated_at: result.rows[0].updated_at
    };

    res.json({
      success: true,
      mapper: updatedMapper,
      message: 'Mapper updated successfully'
    });

  } catch (error) {
    console.error('Error updating mapper:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update mapper'
    });
  }
});

// DELETE /api/device-mapper/:id - Delete a mapper
router.delete('/:id', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if mapper exists in database
    const existingMapper = await getRow(
      'SELECT template_id FROM mapper_templates WHERE template_id = $1',
      [id]
    );

    if (!existingMapper) {
      return res.status(404).json({
        success: false,
        error: 'Mapper not found'
      });
    }

    // Check if mapper is assigned to any devices
    const assignedDevices = await getRow(
      'SELECT COUNT(*) as count FROM device_mapper_assignments WHERE template_id = $1',
      [id]
    );

    if (parseInt(assignedDevices.count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete mapper that is assigned to devices'
      });
    }

    // Delete from database
    await query(
      'DELETE FROM mapper_templates WHERE template_id = $1',
      [id]
    );

    // Remove from in-memory storage
    mappers = mappers.filter(m => m.id !== parseInt(id));

    res.json({
      success: true,
      message: 'Mapper deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting mapper:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete mapper'
    });
  }
});

// Validate math formula
router.post('/validate-formula', async (req, res) => {
  try {
    const { formula, testValue } = req.body;
    
    if (!formula) {
      return res.status(400).json({
        success: false,
        error: 'Formula is required'
      });
    }

    const validation = mathFormulaService.validateFormula(formula);
    
    if (validation.valid) {
      let result = null;
      if (testValue !== undefined) {
        try {
          result = mathFormulaService.evaluateFormula(formula, { value: testValue });
        } catch (error) {
          result = `Error: ${error.message}`;
        }
      }
      
      res.json({
        success: true,
        valid: true,
        message: validation.message,
        result,
        testValue
      });
    } else {
      res.json({
        success: false,
        valid: false,
        message: validation.message
      });
    }

  } catch (error) {
    console.error('Formula validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate formula',
      details: error.message
    });
  }
});

// Get available functions and examples
router.get('/formula-help', async (req, res) => {
  try {
    const help = mathFormulaService.getAvailableFunctions();
    
    res.json({
      success: true,
      help
    });

  } catch (error) {
    console.error('Formula help error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get formula help',
      details: error.message
    });
  }
});

module.exports = router; 