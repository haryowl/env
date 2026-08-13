const express = require('express');
const Joi = require('joi');
const { getRow } = require('../config/database');
const { authenticateToken, authorizeMenuAccess, authorizeRole } = require('../middleware/auth');
const { filterDataByRole, filterDeviceData } = require('../middleware/dataFilter');
const klhkConfig = require('../services/klhkReporting/klhkConfigService');
const klhkScheduler = require('../services/klhkReporting/klhkScheduler');
const tmatSend = require('../services/klhkReporting/tmatSendService');
const { SPARING_PARAMS, TMAT_PARAMS } = require('../services/klhkReporting/klhkConstants');

const router = express.Router();

function envFlagEnabled(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return defaultValue;
  const s = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'disable', 'disabled'].includes(s)) return false;
  return defaultValue;
}

function klhkFeatureEnabled() {
  return envFlagEnabled('ENABLE_SPARING', false) || envFlagEnabled('ENABLE_TMAT', false);
}

function requireKlhkFeature(req, res, next) {
  if (!klhkFeatureEnabled()) {
    return res.status(503).json({
      error: 'KLHK Reporting is disabled on this server',
      code: 'FEATURE_DISABLED',
      feature: 'klhkReporting',
    });
  }
  next();
}

function getAllowedDeviceIds(req) {
  if (req.allowedDeviceIds !== undefined && req.allowedDeviceIds !== null) {
    return req.allowedDeviceIds;
  }
  return null;
}

function requireDeviceAccess(req, res, deviceId) {
  const allowed = getAllowedDeviceIds(req);
  if (allowed === null) return true;
  if (!Array.isArray(allowed) || !allowed.includes(deviceId)) {
    res.status(403).json({ error: 'Access denied for device', code: 'DEVICE_ACCESS_DENIED' });
    return false;
  }
  return true;
}

async function assertDeviceExists(deviceId) {
  const device = await getRow(
    'SELECT device_id, name FROM devices WHERE device_id = $1 AND COALESCE(is_deleted, false) = false',
    [deviceId]
  );
  if (!device) {
    const err = new Error('Device not found');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return device;
}

const configSchema = Joi.object({
  reporting_type: Joi.string().valid('off', 'sparing', 'tmat'),
  retry_max_attempts: Joi.number().integer().min(0).max(100).allow(null),
  retry_interval_minutes: Joi.number().integer().min(1).max(1440).allow(null),
  logger_id: Joi.string().trim().max(256).allow('', null),
  api_secret: Joi.string().trim().max(512).allow('', null),
  api_base: Joi.string().trim().max(512).allow('', null),
  api_secret_url: Joi.string().trim().max(512).allow('', null),
  api_send_hourly_url: Joi.string().trim().max(512).allow('', null),
  api_send_2min_url: Joi.string().trim().max(512).allow('', null),
  api_testing_url: Joi.string().trim().max(512).allow('', null),
  send_mode: Joi.string().valid('hourly', '2min', 'both'),
  retry_all_failed_on_reconnect: Joi.boolean(),
  device_id_unik: Joi.string().trim().max(256).allow('', null),
  api_key: Joi.string().trim().max(512).allow('', null),
  api_url: Joi.string().trim().max(512).allow('', null),
  push_interval_seconds: Joi.number().integer().min(15).max(86400),
}).min(1);

const sparingMappingSchema = Joi.object({
  sparing_param: Joi.string().valid(...SPARING_PARAMS).required(),
  sensor_field: Joi.string().trim().min(1).max(255).required(),
  enabled: Joi.boolean().default(true),
});

const tmatMappingSchema = Joi.object({
  tmat_param: Joi.string().valid(...TMAT_PARAMS).required(),
  sensor_field: Joi.string().trim().min(1).max(255).required(),
  enabled: Joi.boolean().default(true),
});

router.use(authenticateToken, filterDataByRole, filterDeviceData, requireKlhkFeature);

router.get('/meta', authorizeMenuAccess('/klhk-reporting', 'read'), (_req, res) => {
  res.json({
    sparing_params: SPARING_PARAMS,
    tmat_params: TMAT_PARAMS,
    features: {
      sparing: envFlagEnabled('ENABLE_SPARING', false),
      tmat: envFlagEnabled('ENABLE_TMAT', false),
    },
  });
});

router.get('/devices', authorizeMenuAccess('/klhk-reporting', 'read'), async (req, res) => {
  try {
    const allowed = getAllowedDeviceIds(req);
    const devices = await klhkConfig.listDeviceSummaries(allowed);
    res.json({ devices });
  } catch (e) {
    console.error('klhk list devices error:', e);
    res.status(500).json({ error: 'Failed to list devices', code: 'KLHK_LIST_ERROR' });
  }
});

router.get('/devices/:deviceId', authorizeMenuAccess('/klhk-reporting', 'read'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!requireDeviceAccess(req, res, deviceId)) return;
    await assertDeviceExists(deviceId);
    const config = await klhkConfig.getOrCreateConfig(deviceId);
    const sparing_mappings = await klhkConfig.getSparingMappings(deviceId);
    const tmat_mappings = await klhkConfig.getTmatMappings(deviceId);
    const queue_depth = await klhkConfig.getQueueDepth(deviceId);
    res.json({
      config,
      sparing_mappings,
      tmat_mappings,
      queue_depth,
      scheduler_running: klhkScheduler.isDeviceSchedulerRunning(deviceId),
    });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: e.message, code: e.code });
    console.error('klhk get device error:', e);
    res.status(500).json({ error: 'Failed to load KLHK config', code: 'KLHK_GET_ERROR' });
  }
});

router.put('/devices/:deviceId/config', authorizeMenuAccess('/klhk-reporting', 'update'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!requireDeviceAccess(req, res, deviceId)) return;
    await assertDeviceExists(deviceId);
    const { error, value } = configSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });

    const patch = { ...value };
    if (patch.api_secret === '') patch.api_secret = null;
    if (patch.api_key === '') patch.api_key = null;

    const config = await klhkConfig.updateConfig(deviceId, patch);
    res.json({ config });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: e.message, code: e.code });
    console.error('klhk update config error:', e);
    res.status(400).json({ error: e.message || 'Failed to update config', code: 'KLHK_CONFIG_ERROR' });
  }
});

router.put('/devices/:deviceId/mappings/sparing', authorizeMenuAccess('/klhk-reporting', 'update'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!requireDeviceAccess(req, res, deviceId)) return;
    await assertDeviceExists(deviceId);
    const mappings = req.body?.mappings;
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ error: 'mappings array required', code: 'VALIDATION_ERROR' });
    }
    for (const m of mappings) {
      const { error } = sparingMappingSchema.validate(m);
      if (error) return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
    }
    const result = await klhkConfig.replaceSparingMappings(deviceId, mappings);
    res.json({ mappings: result });
  } catch (e) {
    console.error('klhk sparing mappings error:', e);
    res.status(400).json({ error: e.message || 'Failed to save mappings', code: 'KLHK_MAPPING_ERROR' });
  }
});

router.put('/devices/:deviceId/mappings/tmat', authorizeMenuAccess('/klhk-reporting', 'update'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!requireDeviceAccess(req, res, deviceId)) return;
    await assertDeviceExists(deviceId);
    const mappings = req.body?.mappings;
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ error: 'mappings array required', code: 'VALIDATION_ERROR' });
    }
    for (const m of mappings) {
      const { error } = tmatMappingSchema.validate(m);
      if (error) return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
    }
    const result = await klhkConfig.replaceTmatMappings(deviceId, mappings);
    res.json({ mappings: result });
  } catch (e) {
    console.error('klhk tmat mappings error:', e);
    res.status(400).json({ error: e.message || 'Failed to save mappings', code: 'KLHK_MAPPING_ERROR' });
  }
});

router.post(
  '/devices/:deviceId/start',
  authorizeRole(['super_admin', 'admin']),
  authorizeMenuAccess('/klhk-reporting', 'update'),
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      if (!requireDeviceAccess(req, res, deviceId)) return;
      await assertDeviceExists(deviceId);
      const config = await klhkConfig.startBackup(deviceId, req.user?.user_id);
      const fresh = await klhkConfig.getConfig(deviceId);
      klhkScheduler.startDeviceSchedulers(deviceId, fresh || config);
      res.json({ config: fresh || config, scheduler_running: klhkScheduler.isDeviceSchedulerRunning(deviceId) });
    } catch (e) {
      if (e.status === 404) return res.status(404).json({ error: e.message, code: e.code });
      console.error('klhk start error:', e);
      res.status(400).json({ error: e.message || 'Failed to start backup', code: 'KLHK_START_ERROR' });
    }
  }
);

router.post(
  '/devices/:deviceId/stop',
  authorizeRole(['super_admin', 'admin']),
  authorizeMenuAccess('/klhk-reporting', 'update'),
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      if (!requireDeviceAccess(req, res, deviceId)) return;
      await assertDeviceExists(deviceId);
      const config = await klhkConfig.stopBackup(deviceId, req.user?.user_id);
      klhkScheduler.stopDeviceSchedulers(deviceId);
      res.json({ config, scheduler_running: false });
    } catch (e) {
      if (e.status === 404) return res.status(404).json({ error: e.message, code: e.code });
      console.error('klhk stop error:', e);
      res.status(500).json({ error: 'Failed to stop backup', code: 'KLHK_STOP_ERROR' });
    }
  }
);

router.get('/devices/:deviceId/logs', authorizeMenuAccess('/klhk-reporting', 'read'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!requireDeviceAccess(req, res, deviceId)) return;
    const limit = Number(req.query.limit) || 50;
    const logs = await klhkConfig.getSendLogs(deviceId, limit);
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load logs', code: 'KLHK_LOGS_ERROR' });
  }
});

router.get('/devices/:deviceId/queue', authorizeMenuAccess('/klhk-reporting', 'read'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!requireDeviceAccess(req, res, deviceId)) return;
    const limit = Number(req.query.limit) || 50;
    const queue = await klhkConfig.getQueueItems(deviceId, limit);
    res.json({ queue });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load queue', code: 'KLHK_QUEUE_ERROR' });
  }
});

router.post(
  '/devices/:deviceId/fetch-secret',
  authorizeRole(['super_admin', 'admin']),
  authorizeMenuAccess('/klhk-reporting', 'update'),
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      if (!requireDeviceAccess(req, res, deviceId)) return;
      await assertDeviceExists(deviceId);
      await sparingSend.fetchApiSecret(deviceId);
      const config = await klhkConfig.getConfig(deviceId);
      res.json({ ok: true, config });
    } catch (e) {
      console.error('klhk fetch-secret error:', e);
      res.status(400).json({ error: e.message || 'Failed to fetch secret', code: 'KLHK_SECRET_ERROR' });
    }
  }
);

const sendNowSchema = Joi.object({
  mode: Joi.string().valid('hourly', '2min', 'realtime').optional(),
  hour_start: Joi.number().integer().optional(),
  slot_timestamp: Joi.number().integer().optional(),
});

router.post(
  '/devices/:deviceId/send-now',
  authorizeRole(['super_admin', 'admin']),
  authorizeMenuAccess('/klhk-reporting', 'update'),
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      if (!requireDeviceAccess(req, res, deviceId)) return;
      await assertDeviceExists(deviceId);
      const { error, value } = sendNowSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });

      const userId = req.user?.user_id;
      const deviceConfig = await klhkConfig.getConfig(deviceId);

      if (deviceConfig?.reporting_type === 'tmat') {
        const result = await tmatSend.sendRealtimePush(deviceId, userId, false);
        return res.json({ ok: true, result });
      }

      const mode = value.mode || 'hourly';
      let result;
      if (mode === 'hourly') {
        const HOUR_MS = 60 * 60 * 1000;
        const hourTs =
          value.hour_start ??
          Math.floor((Date.now() - HOUR_MS) / HOUR_MS) * HOUR_MS;
        result = await sparingSend.sendHourlyBatch(deviceId, hourTs, userId);
      } else {
        const SLOT_MS = 2 * 60 * 1000;
        const slotTs = value.slot_timestamp ?? Date.now() - (Date.now() % SLOT_MS);
        result = await sparingSend.send2MinBatch(deviceId, slotTs, userId);
      }
      res.json({ ok: true, result });
    } catch (e) {
      console.error('klhk send-now error:', e);
      res.status(400).json({ error: e.message || 'Send failed', code: 'KLHK_SEND_ERROR' });
    }
  }
);

router.post(
  '/devices/:deviceId/backfill',
  authorizeRole(['super_admin', 'admin']),
  authorizeMenuAccess('/klhk-reporting', 'update'),
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      if (!requireDeviceAccess(req, res, deviceId)) return;
      await assertDeviceExists(deviceId);
      const hourStart = req.body?.hour_start;
      if (!hourStart || !Number.isFinite(Number(hourStart))) {
        return res.status(400).json({ error: 'hour_start (unix ms) required', code: 'VALIDATION_ERROR' });
      }
      const result = await sparingSend.backfillHour(deviceId, Number(hourStart), req.user?.user_id);
      res.json({ ok: true, result });
    } catch (e) {
      console.error('klhk backfill error:', e);
      res.status(400).json({ error: e.message || 'Backfill failed', code: 'KLHK_BACKFILL_ERROR' });
    }
  }
);

const sparingPeriodSchema = Joi.object({
  period_from: Joi.number().integer().required(),
  period_to: Joi.number().integer().required(),
  mode: Joi.string().valid('hourly', '2min', 'both').default('hourly'),
  skip_already_sent: Joi.boolean().default(true),
});

const sparingPeriodSendSchema = sparingPeriodSchema.keys({
  action: Joi.string().valid('send', 'queue').default('send'),
});

router.post(
  '/devices/:deviceId/sparing/period/preview',
  authorizeRole(['super_admin', 'admin']),
  authorizeMenuAccess('/klhk-reporting', 'read'),
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      if (!requireDeviceAccess(req, res, deviceId)) return;
      await assertDeviceExists(deviceId);
      const { error, value } = sparingPeriodSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
      const preview = await sparingSend.previewSendPeriod(deviceId, value);
      res.json({ ok: true, preview });
    } catch (e) {
      console.error('klhk period preview error:', e);
      res.status(400).json({ error: e.message || 'Preview failed', code: 'KLHK_PERIOD_PREVIEW_ERROR' });
    }
  }
);

router.post(
  '/devices/:deviceId/sparing/period/send',
  authorizeRole(['super_admin', 'admin']),
  authorizeMenuAccess('/klhk-reporting', 'update'),
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      if (!requireDeviceAccess(req, res, deviceId)) return;
      await assertDeviceExists(deviceId);
      const { error, value } = sparingPeriodSendSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
      const summary = await sparingSend.sendPeriod(deviceId, value, req.user?.user_id);
      res.json({ ok: true, summary });
    } catch (e) {
      console.error('klhk period send error:', e);
      res.status(400).json({ error: e.message || 'Period send failed', code: 'KLHK_PERIOD_SEND_ERROR' });
    }
  }
);

router.post(
  '/devices/:deviceId/process-queue',
  authorizeRole(['super_admin', 'admin']),
  authorizeMenuAccess('/klhk-reporting', 'update'),
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      if (!requireDeviceAccess(req, res, deviceId)) return;
      await assertDeviceExists(deviceId);
      const config = await klhkConfig.getConfig(deviceId);
      const periodOpts = {
        period_from: req.body?.period_from,
        period_to: req.body?.period_to,
        limit: req.body?.limit,
      };
      let result;
      if (config?.reporting_type === 'sparing') {
        result = await sparingSend.processQueue(deviceId, periodOpts);
      } else if (config?.reporting_type === 'tmat') {
        result = await tmatSend.processQueue(deviceId);
      } else {
        return res.status(400).json({ error: 'Device reporting type not configured', code: 'VALIDATION_ERROR' });
      }
      res.json({ ok: true, result });
    } catch (e) {
      console.error('klhk process-queue error:', e);
      res.status(500).json({ error: e.message || 'Process queue failed', code: 'KLHK_QUEUE_ERROR' });
    }
  }
);

module.exports = router;
