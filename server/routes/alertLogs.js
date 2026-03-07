const express = require('express');
const { getRows } = require('../config/database');
const router = express.Router();

// GET /api/alert-logs/parameter-stats - Alert counts per parameter for today vs yesterday (for Parameter Overview cards)
router.get('/parameter-stats', async (req, res) => {
  try {
    const { deviceId, parameters } = req.query;
    if (!deviceId || !parameters) {
      return res.status(400).json({ error: 'deviceId and parameters are required' });
    }
    const paramList = (typeof parameters === 'string' ? parameters.split(',') : parameters).map(p => p.trim()).filter(Boolean);
    if (paramList.length === 0) {
      return res.json({ parameterStats: {} });
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const parameterStats = {};
    for (const param of paramList) {
      const [todayRows, yesterdayRows] = await Promise.all([
        getRows(`
          SELECT COUNT(*)::int as cnt FROM alert_logs
          WHERE device_id = $1 AND parameter = $2
          AND detected_at >= $3 AND detected_at < $4
        `, [deviceId, param, todayStart.toISOString(), todayEnd.toISOString()]),
        getRows(`
          SELECT COUNT(*)::int as cnt FROM alert_logs
          WHERE device_id = $1 AND parameter = $2
          AND detected_at >= $3 AND detected_at < $4
        `, [deviceId, param, yesterdayStart.toISOString(), todayStart.toISOString()]),
      ]);
      const todayCount = todayRows[0]?.cnt ?? 0;
      const yesterdayCount = yesterdayRows[0]?.cnt ?? 0;
      let pctChange = null;
      if (yesterdayCount > 0) {
        pctChange = ((todayCount - yesterdayCount) / yesterdayCount) * 100;
      } else if (todayCount > 0) {
        pctChange = 100; // yesterday had 0, today has some
      }
      parameterStats[param] = { todayCount, yesterdayCount, pctChange };
    }
    res.json({ parameterStats });
  } catch (error) {
    console.error('Failed to fetch alert parameter stats:', error);
    res.status(500).json({ error: 'Failed to fetch alert parameter stats' });
  }
});

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