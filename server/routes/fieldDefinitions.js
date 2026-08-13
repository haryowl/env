const express = require('express');
const { authorizeRole } = require('../middleware/auth');
const { getRow, getRows, query } = require('../config/database');
const { ensureFieldDefinitionsSchema } = require('../utils/ensureFieldDefinitionsSchema');
const { normalizeValueKind } = require('../utils/valueKind');

const router = express.Router();

let schemaReady = false;
async function ensureSchema() {
  if (!schemaReady) {
    await ensureFieldDefinitionsSchema();
    schemaReady = true;
  }
}

/** Coerce an optional numeric range bound to a finite number or null. */
function toRangeBound(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// GET /api/field-definitions - Get all field definitions
router.get('/', async (req, res) => {
  try {
    await ensureSchema();
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

    // Ensure core GPS fields exist in metadata even if not seeded in DB.
    // This keeps DataDash/QuickView pickers stable when gps_tracks is enabled.
    const gpsDefaults = [
      { field_name: 'latitude', display_name: 'Latitude', data_type: 'number', unit: 'deg', description: 'GPS latitude', category: 'GPS', is_standard: true },
      { field_name: 'longitude', display_name: 'Longitude', data_type: 'number', unit: 'deg', description: 'GPS longitude', category: 'GPS', is_standard: true },
      { field_name: 'speed', display_name: 'Speed', data_type: 'number', unit: 'm/s', description: 'GPS speed', category: 'GPS', is_standard: true },
      { field_name: 'altitude', display_name: 'Altitude', data_type: 'number', unit: 'm', description: 'GPS altitude', category: 'GPS', is_standard: true },
      { field_name: 'heading', display_name: 'Heading', data_type: 'number', unit: 'deg', description: 'GPS heading/bearing', category: 'GPS', is_standard: true },
      { field_name: 'accuracy', display_name: 'Accuracy', data_type: 'number', unit: 'm', description: 'GPS horizontal accuracy', category: 'GPS', is_standard: true },
      { field_name: 'satellites', display_name: 'Satellites', data_type: 'number', unit: '', description: 'GPS satellites used', category: 'GPS', is_standard: true },
    ];

    const existing = new Set((result.rows || []).map((r) => r.field_name));
    for (const def of gpsDefaults) {
      if (!existing.has(def.field_name)) {
        result.rows.push({
          field_id: null,
          created_by: null,
          created_at: null,
          updated_at: null,
          ...def,
        });
      }
    }

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
    await ensureSchema();

    const { 
      field_name, 
      display_name, 
      data_type, 
      unit, 
      description, 
      category, 
      is_standard,
      status_keywords,
      display_min,
      display_max,
      value_kind,
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
        category, is_standard, status_keywords, display_min, display_max, value_kind, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      field_name,
      display_name,
      data_type,
      unit || null,
      description || null,
      category || null,
      is_standard !== false,
      status_keywords || null,
      toRangeBound(display_min),
      toRangeBound(display_max),
      normalizeValueKind(value_kind),
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
    await ensureSchema();

    const { 
      display_name, 
      data_type, 
      unit, 
      description, 
      category, 
      is_standard,
      status_keywords,
      display_min,
      display_max,
      value_kind,
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
          category = $5, is_standard = $6, status_keywords = $7,
          display_min = $8, display_max = $9, value_kind = $10, updated_at = NOW()
      WHERE field_id = $11
      RETURNING *
    `, [
      display_name,
      data_type,
      unit || null,
      description || null,
      category || null,
      is_standard !== false,
      status_keywords || null,
      toRangeBound(display_min),
      toRangeBound(display_max),
      normalizeValueKind(value_kind),
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