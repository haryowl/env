const express = require('express');
const { getRow, query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { filterDeviceData } = require('../middleware/dataFilter');
const { getCachedDashboardOverview } = require('../utils/dashboardOverviewCache');

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

async function loadDashboardOverviewPayload() {
  const [
    deviceCount,
    userCount,
    sensorDataCount,
    gpsDataCount,
    deviceStatus,
    recentEvents,
  ] = await Promise.all([
    getRow('SELECT COUNT(*) as count FROM devices WHERE COALESCE(is_deleted, false) = false'),
    getRow('SELECT COUNT(*) as count FROM users WHERE status = $1', ['active']),
    getRow('SELECT COUNT(*) as count FROM sensor_readings'),
    getRow('SELECT COUNT(*) as count FROM gps_tracks'),
    query(`
      SELECT status, COUNT(*) as count
      FROM devices
      WHERE COALESCE(is_deleted, false) = false
      GROUP BY status
    `),
    query(`
      SELECT * FROM device_events
      ORDER BY timestamp DESC
      LIMIT 10
    `),
  ]);

  return {
    overview: {
      totalDevices: parseInt(deviceCount.count, 10),
      totalUsers: parseInt(userCount.count, 10),
      totalSensorData: parseInt(sensorDataCount.count, 10),
      totalGpsData: parseInt(gpsDataCount.count, 10),
    },
    deviceStatus: deviceStatus.rows,
    recentEvents: recentEvents.rows,
  };
}

// Get system overview
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const payload = await getCachedDashboardOverview(loadDashboardOverviewPayload);
    res.json(payload);
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

    // Per-device counts via subqueries (avoids Cartesian inflation from dual LEFT JOIN)
    const topDevices = await query(`
      SELECT
        d.device_id,
        d.name,
        d.device_type,
        COALESCE(sr.cnt, 0)::bigint AS sensor_readings,
        COALESCE(gt.cnt, 0)::bigint AS gps_tracks
      FROM devices d
      LEFT JOIN (
        SELECT device_id, COUNT(*)::bigint AS cnt
        FROM sensor_readings
        GROUP BY device_id
      ) sr ON d.device_id = sr.device_id
      LEFT JOIN (
        SELECT device_id, COUNT(*)::bigint AS cnt
        FROM gps_tracks
        GROUP BY device_id
      ) gt ON d.device_id = gt.device_id
      WHERE d.status != 'deleted'${deviceFilter}
      ORDER BY (COALESCE(sr.cnt, 0) + COALESCE(gt.cnt, 0)) DESC
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