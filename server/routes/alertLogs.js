const express = require('express');
const { getRows } = require('../config/database');
const router = express.Router();

// GET /api/alert-logs - List recent alert logs
router.get('/', async (req, res) => {
  try {
    const { deviceId, startDate, endDate } = req.query;
    
    let where = [];
    let sqlParams = [];
    let paramIdx = 1;
    
    if (deviceId) {
      where.push(`l.device_id = $${paramIdx++}`);
      sqlParams.push(deviceId);
    }
    
    if (startDate) {
      where.push(`l.detected_at >= $${paramIdx++}`);
      sqlParams.push(startDate);
    }
    
    if (endDate) {
      where.push(`l.detected_at <= $${paramIdx++}`);
      sqlParams.push(endDate);
    }
    
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    
    const logs = await getRows(`
      SELECT l.*, a.name as alert_name, d.name as device_name
      FROM alert_logs l
      LEFT JOIN alerts a ON l.alert_id = a.alert_id
      LEFT JOIN devices d ON l.device_id = d.device_id
      ${whereClause}
      ORDER BY l.detected_at DESC
      LIMIT 100
    `, sqlParams);
    
    res.json({ logs });
  } catch (error) {
    console.error('Failed to fetch alert logs:', error);
    res.status(500).json({ error: 'Failed to fetch alert logs' });
  }
});

module.exports = router; 