const express = require('express');
const { authorizeRole } = require('../middleware/auth');
const { getRow, getRows, query } = require('../config/database');

const router = express.Router();

// GET /api/field-definitions - Get all field definitions
router.get('/', async (req, res) => {
  try {
    const { category, is_standard } = req.query;
    
    let conditions = [];
    let params = [];
    let paramCount = 0;

    if (category) {
      conditions.push(`category = $${++paramCount}`);
      params.push(category);
    }

    if (is_standard !== undefined) {
      conditions.push(`is_standard = $${++paramCount}`);
      params.push(is_standard === 'true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(`
      SELECT * FROM field_definitions 
      ${whereClause}
      ORDER BY category, field_name
    `, params);

    res.json({
      success: true,
      fields: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching field definitions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch field definitions'
    });
  }
});

// POST /api/field-definitions - Create a new field definition
router.post('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { 
      field_name, 
      display_name, 
      data_type, 
      unit, 
      description, 
      category, 
      is_standard 
    } = req.body;

    // Validate required fields
    if (!field_name || !display_name || !data_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: field_name, display_name, data_type'
      });
    }

    // Check if field name already exists
    const existingField = await getRow(
      'SELECT field_id FROM field_definitions WHERE field_name = $1',
      [field_name]
    );

    if (existingField) {
      return res.status(409).json({
        success: false,
        error: 'Field name already exists'
      });
    }

    // Create new field definition
    const result = await query(`
      INSERT INTO field_definitions (
        field_name, display_name, data_type, unit, description, 
        category, is_standard, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      field_name,
      display_name,
      data_type,
      unit || null,
      description || null,
      category || null,
      is_standard !== false,
      req.user.user_id
    ]);

    res.status(201).json({
      success: true,
      field: result.rows[0],
      message: 'Field definition created successfully'
    });

  } catch (error) {
    console.error('Error creating field definition:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create field definition'
    });
  }
});

// PUT /api/field-definitions/:id - Update a field definition
router.put('/:id', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      display_name, 
      data_type, 
      unit, 
      description, 
      category, 
      is_standard 
    } = req.body;

    // Validate required fields
    if (!display_name || !data_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: display_name, data_type'
      });
    }

    // Check if field exists
    const existingField = await getRow(
      'SELECT field_id FROM field_definitions WHERE field_id = $1',
      [id]
    );

    if (!existingField) {
      return res.status(404).json({
        success: false,
        error: 'Field definition not found'
      });
    }

    // Update field definition
    const result = await query(`
      UPDATE field_definitions 
      SET display_name = $1, data_type = $2, unit = $3, description = $4, 
          category = $5, is_standard = $6, updated_at = NOW()
      WHERE field_id = $7
      RETURNING *
    `, [
      display_name,
      data_type,
      unit || null,
      description || null,
      category || null,
      is_standard !== false,
      id
    ]);

    res.json({
      success: true,
      field: result.rows[0],
      message: 'Field definition updated successfully'
    });

  } catch (error) {
    console.error('Error updating field definition:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update field definition'
    });
  }
});

// DELETE /api/field-definitions/:id - Delete a field definition
router.delete('/:id', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if field exists
    const existingField = await getRow(
      'SELECT field_id FROM field_definitions WHERE field_id = $1',
      [id]
    );

    if (!existingField) {
      return res.status(404).json({
        success: false,
        error: 'Field definition not found'
      });
    }

    // Check if field is being used in any mappings
    const usedInMappings = await getRow(`
      SELECT COUNT(*) as count FROM mapper_templates 
      WHERE mappings::text LIKE '%"target_field": "' || (SELECT field_name FROM field_definitions WHERE field_id = $1) || '"%'
    `, [id]);

    if (parseInt(usedInMappings.count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete field definition that is used in mapper templates'
      });
    }

    // Delete field definition
    await query(
      'DELETE FROM field_definitions WHERE field_id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Field definition deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting field definition:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete field definition'
    });
  }
});

module.exports = router; 