const express = require('express');
const { query, getRow, getRows } = require('../config/database');
const { authenticateToken, authorizeMenuAccess } = require('../middleware/auth');
const { ensureAlertsSchema } = require('../utils/ensureAlertsSchema');
const { normalizeDeviceIdsInput } = require('../utils/alertDevices');
const router = express.Router();
const { processDeviceData } = require('../services/deviceMapper');

router.use(async (req, res, next) => {
  try {
    await ensureAlertsSchema();
    next();
  } catch (e) {
    console.error('ensureAlertsSchema:', e);
    res.status(500).json({
      error: 'Database initialization failed for alerts',
      code: 'ALERTS_SCHEMA_ERROR',
      details: e.message,
    });
  }
});

async function validateDevicesExistAndAccessible(deviceIds, req) {
  if (!deviceIds.length) {
    return { error: 'Missing required fields', details: 'At least one device is required', status: 400 };
  }
  const placeholders = deviceIds.map((_, i) => `$${i + 1}`).join(', ');
  const found = await getRows(
    `SELECT device_id FROM devices WHERE device_id IN (${placeholders})`,
    deviceIds
  );
  const foundIds = new Set((found || []).map((d) => String(d.device_id)));
  const missing = deviceIds.filter((id) => !foundIds.has(id));
  if (missing.length) {
    return {
      error: 'Invalid device_id',
      details: `Device(s) not found: ${missing.join(', ')}`,
      status: 400,
    };
  }
  const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';
  if (!isAdmin) {
    const allowedIds = req.allowedDeviceIds;
    if (allowedIds !== null) {
      const allowed = new Set((Array.isArray(allowedIds) ? allowedIds : []).map(String));
      const denied = deviceIds.filter((id) => !allowed.has(id));
      if (denied.length) {
        return {
          error: 'No access to this device',
          code: 'DEVICE_ACCESS_DENIED',
          details: `You can only create alerts for devices assigned to your role. Denied: ${denied.join(', ')}`,
          status: 403,
        };
      }
    }
  }
  return null;
}

function normalizeAlertRow(row) {
  if (!row) return row;
  const device_ids =
    Array.isArray(row.device_ids) && row.device_ids.length > 0
      ? row.device_ids.map(String)
      : row.device_id
        ? [String(row.device_id)]
        : [];
  const trigger_mode = ['every_reading', 'consecutive', 'on_enter'].includes(row.trigger_mode)
    ? row.trigger_mode
    : 'on_enter';
  const consecutive_count = Number(row.consecutive_count);
  return {
    ...row,
    device_ids,
    device_id: row.device_id || device_ids[0] || null,
    trigger_mode,
    consecutive_count: Number.isFinite(consecutive_count) && consecutive_count >= 2
      ? Math.min(100, Math.floor(consecutive_count))
      : 3,
  };
}

function parseTriggerFields(body, type) {
  if (type === 'inactivity') {
    return { trigger_mode: 'on_enter', consecutive_count: 3 };
  }
  const mode = String(body.trigger_mode || 'on_enter').trim();
  const trigger_mode = ['every_reading', 'consecutive', 'on_enter'].includes(mode) ? mode : 'on_enter';
  const n = Number(body.consecutive_count);
  const consecutive_count = Number.isFinite(n) && n >= 2 ? Math.min(100, Math.floor(n)) : 3;
  return { trigger_mode, consecutive_count };
}

// GET /api/alerts - List all alerts
router.get('/', authenticateToken, authorizeMenuAccess('/alerts', 'read'), async (req, res) => {
  try {
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';

    let sql = 'SELECT * FROM alerts';
    let params = [];

    if (!isAdmin) {
      const allowedDeviceIds = req.allowedDeviceIds;
      const hasDeviceAccess = Array.isArray(allowedDeviceIds) && allowedDeviceIds.length > 0;
      if (hasDeviceAccess) {
        sql += ` WHERE (
          created_by = $1
          OR created_by IS NULL
          OR device_id = ANY($2::text[])
          OR COALESCE(device_ids, ARRAY[]::text[]) && $2::text[]
        )`;
        params = [req.user.user_id, allowedDeviceIds.map(String)];
      } else {
        sql += ' WHERE (created_by = $1 OR created_by IS NULL)';
        params = [req.user.user_id];
      }
    }

    sql += ' ORDER BY created_at DESC';

    const result = await getRows(sql, params);
    res.json({ alerts: (result || []).map(normalizeAlertRow) });
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// POST /api/alerts - Create alert
router.post('/', authenticateToken, authorizeMenuAccess('/alerts', 'create'), async (req, res) => {
  try {
    const { name, parameter, min, max, type, threshold_time, actions, template } = req.body;
    const { deviceIds, primaryDeviceId } = normalizeDeviceIdsInput(req.body);
    const { trigger_mode, consecutive_count } = parseTriggerFields(req.body, type);

    if (!name || !primaryDeviceId || !parameter || !type) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Name, device(s), parameter, and type are required',
      });
    }

    const accessError = await validateDevicesExistAndAccessible(deviceIds, req);
    if (accessError) {
      return res.status(accessError.status).json(accessError);
    }

    const result = await query(
      `
      INSERT INTO alerts (name, device_id, device_ids, parameter, min, max, type, threshold_time, actions, template, trigger_mode, consecutive_count, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *
    `,
      [
        name,
        primaryDeviceId,
        deviceIds,
        parameter,
        min,
        max,
        type,
        threshold_time,
        actions ? JSON.stringify(actions) : '{}',
        template,
        trigger_mode,
        consecutive_count,
        req.user.user_id,
      ]
    );
    res.status(201).json({ alert: normalizeAlertRow(result.rows[0]) });
  } catch (error) {
    console.error('Failed to create alert:', error);
    res.status(500).json({
      error: 'Failed to create alert',
      code: 'CREATE_ALERT_ERROR',
      details: error.message,
    });
  }
});

// PUT /api/alerts/:id - Update alert
router.put('/:id', authenticateToken, authorizeMenuAccess('/alerts', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parameter, min, max, type, threshold_time, actions, template } = req.body;
    const { deviceIds, primaryDeviceId } = normalizeDeviceIdsInput(req.body);
    const { trigger_mode, consecutive_count } = parseTriggerFields(req.body, type);

    if (!name || !primaryDeviceId || !parameter || !type) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Name, device(s), parameter, and type are required',
      });
    }

    const accessError = await validateDevicesExistAndAccessible(deviceIds, req);
    if (accessError) {
      return res.status(accessError.status).json(accessError);
    }

    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';

    let sqlQuery = `
      UPDATE alerts SET
        name = $1,
        device_id = $2,
        device_ids = $3,
        parameter = $4,
        min = $5,
        max = $6,
        type = $7,
        threshold_time = $8,
        actions = $9,
        template = $10,
        trigger_mode = $11,
        consecutive_count = $12,
        updated_at = NOW()
      WHERE alert_id = $13
    `;
    let params = [
      name,
      primaryDeviceId,
      deviceIds,
      parameter,
      min,
      max,
      type,
      threshold_time,
      actions ? JSON.stringify(actions) : '{}',
      template,
      trigger_mode,
      consecutive_count,
      id,
    ];

    if (!isAdmin) {
      sqlQuery += ' AND (created_by = $14 OR created_by IS NULL)';
      params.push(req.user.user_id);
    }

    sqlQuery += ' RETURNING *';

    const result = await query(sqlQuery, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found or access denied' });
    }
    res.json({ alert: normalizeAlertRow(result.rows[0]) });
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

    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin';

    let deleteQuery = 'DELETE FROM alerts WHERE alert_id = $1';
    let params = [id];

    if (!isAdmin) {
      deleteQuery += ' AND (created_by = $2 OR created_by IS NULL)';
      params.push(req.user.user_id);
    }

    deleteQuery += ' RETURNING *';

    const result = await query(deleteQuery, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found or access denied' });
    }
    res.json({ message: 'Alert deleted', alert: normalizeAlertRow(result.rows[0]) });
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
    const device = await getRow('SELECT * FROM devices WHERE device_id = $1', [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
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
    let latestPayload = {};
    for (const row of rows) {
      if (row.metadata && typeof row.metadata === 'object') {
        latestPayload = { ...latestPayload, ...row.metadata };
      }
      latestPayload[row.sensor_type] = Number(row.value);
    }
    const mapped = await processDeviceData(device, latestPayload);
    res.json({ device_id, mapped });
  } catch (error) {
    console.error('Failed to get mapped data for alerts:', error);
    res.status(500).json({ error: 'Failed to get mapped data for alerts', details: error.message });
  }
});

module.exports = router;
