const express = require('express');
const Joi = require('joi');
const { getRow, getRows, query } = require('../config/database');
const mqttService = require('../services/mqttService');
const { authenticateToken, authorizeMenuAccess } = require('../middleware/auth');
const { filterDataByRole, filterDeviceData } = require('../middleware/dataFilter');

const router = express.Router();

function getEffectiveAllowedDeviceIds(req) {
  // null means full access
  if (req.allowedDeviceIds !== undefined && req.allowedDeviceIds !== null) return req.allowedDeviceIds;
  return null;
}

function requireDeviceAccess(req, res, deviceId) {
  const allowed = getEffectiveAllowedDeviceIds(req);
  if (allowed === null) return true;
  if (!Array.isArray(allowed) || allowed.length === 0) {
    res.status(403).json({ error: 'Access denied for device', code: 'DEVICE_ACCESS_DENIED' });
    return false;
  }
  if (!allowed.includes(deviceId)) {
    res.status(403).json({ error: 'Access denied for device', code: 'DEVICE_ACCESS_DENIED' });
    return false;
  }
  return true;
}

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS mqtt_publish_history (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id INT,
      device_id VARCHAR(255) NOT NULL,
      topic TEXT NOT NULL,
      tag_name TEXT NOT NULL,
      tag_value TEXT NOT NULL,
      qos INT NOT NULL DEFAULT 1,
      retain BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'published',
      error TEXT
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS mqtt_publish_presets (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INT,
      name TEXT NOT NULL,
      device_id VARCHAR(255),
      tag_name TEXT NOT NULL,
      tag_value_default TEXT NOT NULL
    )
  `);
}

function buildTopic({ project_code, group_identifier, terminal_code }) {
  return `data/${project_code}/${group_identifier}/${terminal_code}`;
}

const topicConfigSchema = Joi.object({
  project_code: Joi.string().trim().min(1).max(64).required(),
  group_identifier: Joi.string().trim().min(1).max(64).required(),
  terminal_code: Joi.string().trim().min(1).max(64).required(),
});

const publishSchema = Joi.object({
  deviceId: Joi.string().trim().min(1).required(),
  tag_name: Joi.string().trim().min(1).max(64).pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).required(),
  value: Joi.string().allow('').max(512).required(),
  qos: Joi.number().integer().min(0).max(2).default(1),
  retain: Joi.boolean().default(false),
});

const presetCreateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  device_id: Joi.string().trim().min(1).optional().allow(null, ''),
  tag_name: Joi.string().trim().min(1).max(64).pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).required(),
  tag_value_default: Joi.string().allow('').max(512).required(),
});

router.use(authenticateToken, filterDataByRole, filterDeviceData);

// GET device publish-topic config (stored inside devices.config.mqtt_publish)
router.get(
  '/devices/:deviceId/config',
  authorizeMenuAccess('/mqtt-publisher', 'read'),
  async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      if (!requireDeviceAccess(req, res, deviceId)) return;
      const device = await getRow('SELECT device_id, name, config FROM devices WHERE device_id = $1', [deviceId]);
      if (!device) return res.status(404).json({ error: 'Device not found', code: 'NOT_FOUND' });
      const cfg = device.config && typeof device.config === 'string' ? JSON.parse(device.config) : (device.config || {});
      const mqttPublish = cfg.mqtt_publish || null;
      res.json({ device_id: device.device_id, name: device.name, mqtt_publish: mqttPublish });
    } catch (e) {
      console.error('mqtt-publisher get device config error:', e);
      res.status(500).json({ error: 'Failed to load device config', code: 'MQTT_PUBLISH_CONFIG_GET_ERROR' });
    }
  }
);

// PUT device publish-topic config
router.put(
  '/devices/:deviceId/config',
  authorizeMenuAccess('/mqtt-publisher', 'update'),
  async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      if (!requireDeviceAccess(req, res, deviceId)) return;
      const { error, value } = topicConfigSchema.validate(req.body, { stripUnknown: true });
      if (error) return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });

      const device = await getRow('SELECT device_id, config FROM devices WHERE device_id = $1', [deviceId]);
      if (!device) return res.status(404).json({ error: 'Device not found', code: 'NOT_FOUND' });

      const existing = device.config && typeof device.config === 'string' ? JSON.parse(device.config) : (device.config || {});
      const next = { ...(existing || {}), mqtt_publish: value };

      await query('UPDATE devices SET config = $1, updated_at = NOW() WHERE device_id = $2', [JSON.stringify(next), deviceId]);
      res.json({ success: true, device_id: deviceId, mqtt_publish: value, topic: buildTopic(value) });
    } catch (e) {
      console.error('mqtt-publisher save device config error:', e);
      res.status(500).json({ error: 'Failed to save device config', code: 'MQTT_PUBLISH_CONFIG_SAVE_ERROR' });
    }
  }
);

// POST publish a single tag/value to the configured topic for device
router.post(
  '/publish',
  authorizeMenuAccess('/mqtt-publisher', 'create'),
  async (req, res) => {
    await ensureTables();
    const { error, value } = publishSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });

    const deviceId = value.deviceId;
    if (!requireDeviceAccess(req, res, deviceId)) return;

    const device = await getRow('SELECT device_id, config FROM devices WHERE device_id = $1', [deviceId]);
    if (!device) return res.status(404).json({ error: 'Device not found', code: 'NOT_FOUND' });
    const cfg = device.config && typeof device.config === 'string' ? JSON.parse(device.config) : (device.config || {});
    const mqttPublish = cfg.mqtt_publish;
    if (!mqttPublish || !mqttPublish.project_code || !mqttPublish.group_identifier || !mqttPublish.terminal_code) {
      return res.status(400).json({ error: 'Device publish topic is not configured', code: 'TOPIC_NOT_CONFIGURED' });
    }

    const topic = buildTopic(mqttPublish);
    const payloadObj = { [value.tag_name]: value.value };
    let status = 'published';
    let errMsg = null;

    try {
      await mqttService.publishJSON(topic, payloadObj, { qos: value.qos, retain: value.retain });
    } catch (e) {
      status = 'failed';
      errMsg = e?.message || String(e);
    }

    const row = await getRow(
      `INSERT INTO mqtt_publish_history (user_id, device_id, topic, tag_name, tag_value, qos, retain, status, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, created_at, status, error`,
      [req.user?.user_id || null, deviceId, topic, value.tag_name, value.value, value.qos, value.retain, status, errMsg]
    );

    if (status === 'failed') {
      return res.status(502).json({ success: false, status, error: errMsg, history: row });
    }
    res.json({ success: true, status, topic, payload: payloadObj, history: row });
  }
);

// GET history (optionally filter by deviceId)
router.get(
  '/history',
  authorizeMenuAccess('/mqtt-publisher', 'read'),
  async (req, res) => {
    await ensureTables();
    try {
      const { deviceId, limit } = req.query;
      const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);

      const allowed = getEffectiveAllowedDeviceIds(req);
      const params = [];
      const where = [];
      let idx = 1;

      if (deviceId) {
        if (!requireDeviceAccess(req, res, deviceId)) return;
        where.push(`device_id = $${idx++}`);
        params.push(deviceId);
      } else if (allowed !== null) {
        if (!Array.isArray(allowed) || allowed.length === 0) return res.json({ history: [] });
        where.push(`device_id = ANY($${idx++})`);
        params.push(allowed);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      params.push(lim);
      const rows = await getRows(
        `SELECT id, created_at, user_id, device_id, topic, tag_name, tag_value, qos, retain, status, error
         FROM mqtt_publish_history
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${idx}`,
        params
      );
      res.json({ history: rows });
    } catch (e) {
      console.error('mqtt-publisher history error:', e);
      res.status(500).json({ error: 'Failed to load history', code: 'HISTORY_LOAD_ERROR' });
    }
  }
);

// GET presets (global + optional device scoped)
router.get(
  '/presets',
  authorizeMenuAccess('/mqtt-publisher', 'read'),
  async (req, res) => {
    await ensureTables();
    try {
      const { deviceId } = req.query;
      const params = [];
      let where = '';
      if (deviceId) {
        if (!requireDeviceAccess(req, res, deviceId)) return;
        where = 'WHERE device_id IS NULL OR device_id = $1';
        params.push(deviceId);
      }
      const rows = await getRows(
        `SELECT id, created_at, created_by, name, device_id, tag_name, tag_value_default
         FROM mqtt_publish_presets
         ${where}
         ORDER BY created_at DESC
         LIMIT 500`,
        params
      );
      res.json({ presets: rows });
    } catch (e) {
      console.error('mqtt-publisher presets error:', e);
      res.status(500).json({ error: 'Failed to load presets', code: 'PRESET_LOAD_ERROR' });
    }
  }
);

// POST presets
router.post(
  '/presets',
  authorizeMenuAccess('/mqtt-publisher', 'create'),
  async (req, res) => {
    await ensureTables();
    const { error, value } = presetCreateSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });

    const deviceId = value.device_id ? String(value.device_id).trim() : null;
    if (deviceId) {
      if (!requireDeviceAccess(req, res, deviceId)) return;
    }
    const row = await getRow(
      `INSERT INTO mqtt_publish_presets (created_by, name, device_id, tag_name, tag_value_default)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, created_at, created_by, name, device_id, tag_name, tag_value_default`,
      [req.user?.user_id || null, value.name, deviceId || null, value.tag_name, value.tag_value_default]
    );
    res.status(201).json({ success: true, preset: row });
  }
);

// DELETE preset (allow if admin/super_admin or creator)
router.delete(
  '/presets/:id',
  authorizeMenuAccess('/mqtt-publisher', 'delete'),
  async (req, res) => {
    await ensureTables();
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
      const preset = await getRow('SELECT id, created_by FROM mqtt_publish_presets WHERE id = $1', [id]);
      if (!preset) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      // If not admin/super_admin, enforce ownership
      if (!['admin', 'super_admin'].includes(req.user?.role) && preset.created_by && preset.created_by !== req.user?.user_id) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
      await query('DELETE FROM mqtt_publish_presets WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (e) {
      console.error('mqtt-publisher delete preset error:', e);
      res.status(500).json({ error: 'Failed to delete preset', code: 'PRESET_DELETE_ERROR' });
    }
  }
);

module.exports = router;

