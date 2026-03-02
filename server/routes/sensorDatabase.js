const express = require('express');
const router = express.Router();
const { query, getRow, getRows } = require('../config/database');
const { authenticateToken, authorizeMenuAccess } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);
router.use(authorizeMenuAccess('/sensor-management'));

// GET /api/sensor-database - Get all sensor types
router.get('/', async (req, res) => {
  try {
    console.log('Fetching sensor database for user:', req.user.user_id);
    const sensors = await getRows(`
      SELECT 
        sensor_db_id,
        brand_name,
        sensor_type,
        sensor_parameter,
        description,
        specifications,
        created_at,
        updated_at,
        created_by
      FROM sensor_database 
      WHERE (created_by = $1 OR created_by IS NULL)
      ORDER BY brand_name, sensor_type
    `, [req.user.user_id]);
    console.log('Sensor database fetched:', sensors.length);
    res.json(sensors);
  } catch (error) {
    console.error('Get sensor database error:', error);
    res.status(500).json({
      error: 'Failed to get sensor database',
      code: 'GET_SENSOR_DATABASE_ERROR',
      details: error.message
    });
  }
});

// GET /api/sensor-database/:id - Get sensor type by ID
router.get('/:id', async (req, res) => {
  try {
    const sensor = await getRow(`
      SELECT 
        sensor_db_id,
        brand_name,
        sensor_type,
        sensor_parameter,
        description,
        specifications,
        created_at,
        updated_at,
        created_by
      FROM sensor_database 
      WHERE sensor_db_id = $1 AND (created_by = $2 OR created_by IS NULL)
    `, [req.params.id, req.user.user_id]);

    if (!sensor) {
      return res.status(404).json({
        error: 'Sensor not found',
        code: 'SENSOR_NOT_FOUND'
      });
    }

    res.json(sensor);
  } catch (error) {
    console.error('Get sensor error:', error);
    res.status(500).json({
      error: 'Failed to get sensor',
      code: 'GET_SENSOR_ERROR'
    });
  }
});

// POST /api/sensor-database - Create new sensor type
router.post('/', async (req, res) => {
  try {
    const { brand_name, sensor_type, sensor_parameter, description, specifications } = req.body;

    // Validation
    if (!brand_name || brand_name.trim() === '') {
      return res.status(400).json({
        error: 'Brand name is required',
        code: 'BRAND_NAME_REQUIRED'
      });
    }

    if (!sensor_type || sensor_type.trim() === '') {
      return res.status(400).json({
        error: 'Sensor type is required',
        code: 'SENSOR_TYPE_REQUIRED'
      });
    }

    if (!sensor_parameter || sensor_parameter.trim() === '') {
      return res.status(400).json({
        error: 'Sensor parameter is required',
        code: 'SENSOR_PARAMETER_REQUIRED'
      });
    }

    // Check if sensor already exists
    const existingSensor = await getRow(`
      SELECT sensor_db_id FROM sensor_database 
      WHERE brand_name = $1 AND sensor_type = $2 AND sensor_parameter = $3
    `, [brand_name, sensor_type, sensor_parameter]);

    if (existingSensor) {
      return res.status(409).json({
        error: 'Sensor with this combination already exists',
        code: 'SENSOR_EXISTS'
      });
    }

    const result = await query(`
      INSERT INTO sensor_database (brand_name, sensor_type, sensor_parameter, description, specifications, created_by)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      RETURNING sensor_db_id, brand_name, sensor_type, sensor_parameter, description, specifications, created_at
    `, [brand_name, sensor_type, sensor_parameter, description, specifications ? JSON.stringify(specifications) : null, req.user.user_id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create sensor error:', error);
    res.status(500).json({
      error: 'Failed to create sensor',
      code: 'CREATE_SENSOR_ERROR'
    });
  }
});

// PUT /api/sensor-database/:id - Update sensor type
router.put('/:id', async (req, res) => {
  try {
    const { brand_name, sensor_type, sensor_parameter, description, specifications } = req.body;
    const sensorId = req.params.id;

    // Validation
    if (!brand_name || brand_name.trim() === '') {
      return res.status(400).json({
        error: 'Brand name is required',
        code: 'BRAND_NAME_REQUIRED'
      });
    }

    if (!sensor_type || sensor_type.trim() === '') {
      return res.status(400).json({
        error: 'Sensor type is required',
        code: 'SENSOR_TYPE_REQUIRED'
      });
    }

    if (!sensor_parameter || sensor_parameter.trim() === '') {
      return res.status(400).json({
        error: 'Sensor parameter is required',
        code: 'SENSOR_PARAMETER_REQUIRED'
      });
    }

    // Check if sensor exists and user has permission
    const existingSensor = await getRow(`
      SELECT sensor_db_id FROM sensor_database 
      WHERE sensor_db_id = $1 AND (created_by = $2 OR created_by IS NULL)
    `, [sensorId, req.user.user_id]);

    if (!existingSensor) {
      return res.status(404).json({
        error: 'Sensor not found or access denied',
        code: 'SENSOR_NOT_FOUND'
      });
    }

    // Check if new combination already exists (excluding current sensor)
    const duplicateSensor = await getRow(`
      SELECT sensor_db_id FROM sensor_database 
      WHERE brand_name = $1 AND sensor_type = $2 AND sensor_parameter = $3 AND sensor_db_id != $4
    `, [brand_name, sensor_type, sensor_parameter, sensorId]);

    if (duplicateSensor) {
      return res.status(409).json({
        error: 'Sensor with this combination already exists',
        code: 'SENSOR_EXISTS'
      });
    }

    const result = await query(`
      UPDATE sensor_database 
      SET brand_name = $1, sensor_type = $2, sensor_parameter = $3, description = $4, specifications = $5::jsonb, updated_at = NOW()
      WHERE sensor_db_id = $6 AND (created_by = $7 OR created_by IS NULL)
      RETURNING sensor_db_id, brand_name, sensor_type, sensor_parameter, description, specifications, updated_at
    `, [brand_name, sensor_type, sensor_parameter, description, specifications ? JSON.stringify(specifications) : null, sensorId, req.user.user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Sensor not found or access denied',
        code: 'SENSOR_NOT_FOUND'
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update sensor error:', error);
    res.status(500).json({
      error: 'Failed to update sensor',
      code: 'UPDATE_SENSOR_ERROR'
    });
  }
});

// DELETE /api/sensor-database/:id - Delete sensor type
router.delete('/:id', async (req, res) => {
  try {
    const sensorId = req.params.id;

    // Check if sensor exists and user has permission
    const existingSensor = await getRow(`
      SELECT sensor_db_id FROM sensor_database 
      WHERE sensor_db_id = $1 AND (created_by = $2 OR created_by IS NULL)
    `, [sensorId, req.user.user_id]);

    if (!existingSensor) {
      return res.status(404).json({
        error: 'Sensor not found or access denied',
        code: 'SENSOR_NOT_FOUND'
      });
    }

    // Check if sensor is referenced by sensor sites
    const referencedSites = await getRows(`
      SELECT COUNT(*) as count FROM sensor_sites WHERE sensor_db_id = $1
    `, [sensorId]);

    if (referencedSites[0].count > 0) {
      return res.status(409).json({
        error: 'Cannot delete sensor that has associated sensor sites',
        code: 'SENSOR_HAS_SITES'
      });
    }

    const result = await query(`
      DELETE FROM sensor_database 
      WHERE sensor_db_id = $1 AND (created_by = $2 OR created_by IS NULL)
      RETURNING sensor_db_id
    `, [sensorId, req.user.user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Sensor not found or access denied',
        code: 'SENSOR_NOT_FOUND'
      });
    }

    res.json({ message: 'Sensor deleted successfully' });
  } catch (error) {
    console.error('Delete sensor error:', error);
    res.status(500).json({
      error: 'Failed to delete sensor',
      code: 'DELETE_SENSOR_ERROR'
    });
  }
});

module.exports = router;
