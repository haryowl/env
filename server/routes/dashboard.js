const express = require('express');
const { getRow, getRows, query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { filterDeviceData } = require('../middleware/dataFilter');

const router = express.Router();

// Apply authentication middleware to all dashboard routes
router.use(authenticateToken);

// Test route to verify authentication
router.get('/test-auth', (req, res) => {
  res.json({
    message: 'Authentication working',
    user: {
      user_id: req.user.user_id,
      username: req.user.username,
      role: req.user.role
    }
  });
});

// Get system overview - Simplified version for debugging
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    console.log('Dashboard overview accessed by:', req.user.username, 'Role:', req.user.role);
    
    // Simple overview without complex filtering for now
    const deviceCount = await getRow('SELECT COUNT(*) as count FROM devices WHERE status != $1', ['deleted']);
    const userCount = await getRow('SELECT COUNT(*) as count FROM users WHERE status = $1', ['active']);
    const sensorDataCount = await getRow('SELECT COUNT(*) as count FROM sensor_readings');
    const gpsDataCount = await getRow('SELECT COUNT(*) as count FROM gps_tracks');

    // Get device status breakdown
    const deviceStatus = await query(`
      SELECT status, COUNT(*) as count 
      FROM devices 
      WHERE status != 'deleted'
      GROUP BY status
    `);

    // Get recent activity
    const recentEvents = await query(`
      SELECT * FROM device_events 
      ORDER BY timestamp DESC 
      LIMIT 10
    `);

    res.json({
      overview: {
        totalDevices: parseInt(deviceCount.count),
        totalUsers: parseInt(userCount.count),
        totalSensorData: parseInt(sensorDataCount.count),
        totalGpsData: parseInt(gpsDataCount.count)
      },
      deviceStatus: deviceStatus.rows,
      recentEvents: recentEvents.rows
    });

  } catch (error) {
    console.error('Get dashboard overview error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to get dashboard overview',
      code: 'GET_OVERVIEW_ERROR',
      details: error.message
    });
  }
});

// Get device performance metrics
router.get('/performance', async (req, res) => {
  try {
    // Build device permission filter for performance metrics
    let deviceFilter = '';
    let deviceParams = [];
    
    if (req.user.role !== 'super_admin') {
      deviceFilter = `
        AND d.device_id IN (
          SELECT DISTINCT udp.device_id
          FROM user_device_permissions udp
          WHERE udp.user_id = $1
        )
      `;
      deviceParams = [req.user.user_id];
    }

    // Get devices with most data (filtered by permissions)
    const topDevices = await query(`
      SELECT 
        d.device_id,
        d.name,
        d.device_type,
        COUNT(sr.id) as sensor_readings,
        COUNT(gt.id) as gps_tracks
      FROM devices d
      LEFT JOIN sensor_readings sr ON d.device_id = sr.device_id
      LEFT JOIN gps_tracks gt ON d.device_id = gt.device_id
      WHERE d.status != 'deleted'${deviceFilter}
      GROUP BY d.device_id, d.name, d.device_type
      ORDER BY (COUNT(sr.id) + COUNT(gt.id)) DESC
      LIMIT 10
    `, deviceParams);

    // Get data volume over time (last 7 days) - filtered by device permissions
    const dataVolume = await query(`
      SELECT 
        DATE((metadata->>'datetime')::timestamp) as date,
        COUNT(*) as count
      FROM (
        SELECT metadata->>'datetime' as datetime FROM sensor_readings sr
        JOIN devices d ON sr.device_id = d.device_id
        WHERE (metadata->>'datetime')::timestamp >= NOW() - INTERVAL '7 days'
        ${deviceFilter ? 'AND d.device_id IN (SELECT DISTINCT udp.device_id FROM user_device_permissions udp WHERE udp.user_id = $1)' : ''}
        UNION ALL
        SELECT timestamp::text as datetime FROM gps_tracks gt
        JOIN devices d ON gt.device_id = d.device_id
        WHERE timestamp >= NOW() - INTERVAL '7 days'
        ${deviceFilter ? 'AND d.device_id IN (SELECT DISTINCT udp.device_id FROM user_device_permissions udp WHERE udp.user_id = $1)' : ''}
      ) combined_data
      GROUP BY DATE(datetime::timestamp)
      ORDER BY date
    `, deviceParams);

    res.json({
      topDevices: topDevices.rows,
      dataVolume: dataVolume.rows
    });

  } catch (error) {
    console.error('Get performance metrics error:', error);
    res.status(500).json({
      error: 'Failed to get performance metrics',
      code: 'GET_PERFORMANCE_ERROR'
    });
  }
});

// Get system health
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    const dbHealth = await query('SELECT 1 as status');
    
    // Get offline devices
    const offlineDevices = await query(`
      SELECT device_id, name, last_seen 
      FROM devices 
      WHERE status = 'offline' AND last_seen < NOW() - INTERVAL '1 hour'
      ORDER BY last_seen DESC
    `);

    // Get recent errors
    const recentErrors = await query(`
      SELECT * FROM device_events 
      WHERE severity IN ('error', 'critical')
      ORDER BY timestamp DESC 
      LIMIT 10
    `);

    res.json({
      database: dbHealth.rows.length > 0 ? 'healthy' : 'unhealthy',
      offlineDevices: offlineDevices.rows,
      recentErrors: recentErrors.rows
    });

  } catch (error) {
    console.error('Get system health error:', error);
    res.status(500).json({
      error: 'Failed to get system health',
      code: 'GET_HEALTH_ERROR'
    });
  }
});

module.exports = router; 