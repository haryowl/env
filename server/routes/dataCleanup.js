const express = require('express');
const Joi = require('joi');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const dataCleanupService = require('../services/dataCleanupService');

const router = express.Router();

const policySchema = Joi.object({
  enabled: Joi.boolean().required(),
  retention_value: Joi.number().integer().min(1).max(3650).required(),
  retention_unit: Joi.string().valid('days', 'months').required(),
});

const settingsSchema = Joi.object({
  policies: Joi.object({
    sensor_readings: policySchema,
    gps_tracks: policySchema,
    alert_logs: policySchema,
    device_events: policySchema,
  }).required(),
  auto_cleanup_enabled: Joi.boolean().required(),
  auto_cleanup_interval_hours: Joi.number().integer().min(1).max(168).required(),
});

const runSchema = Joi.object({
  dry_run: Joi.boolean().default(true),
  mode: Joi.string().valid('retention', 'purge_devices').default('retention'),
  device_ids: Joi.array().items(Joi.string().max(100)).max(500).optional(),
  policy_overrides: Joi.object().pattern(Joi.string(), policySchema).optional(),
});

router.use(authenticateToken);
router.use(authorizeRole(['super_admin', 'admin']));

router.get('/settings', async (req, res) => {
  try {
    const settings = await dataCleanupService.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Get data cleanup settings error:', error);
    res.status(500).json({ error: 'Failed to load retention settings', details: error.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const { error, value } = settingsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid settings',
        details: error.details,
      });
    }
    const settings = await dataCleanupService.updateSettings(value, req.user.user_id);
    res.json({ message: 'Retention settings saved', settings });
  } catch (err) {
    console.error('Update data cleanup settings error:', err);
    res.status(500).json({ error: 'Failed to save retention settings', details: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const deviceIds = req.query.deviceIds
      ? String(req.query.deviceIds).split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    const stats = await dataCleanupService.getStorageOverview(deviceIds);
    res.json({ stats });
  } catch (error) {
    console.error('Data cleanup stats error:', error);
    res.status(500).json({ error: 'Failed to load storage stats', details: error.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const history = await dataCleanupService.getRunHistory(limit);
    res.json({ history });
  } catch (error) {
    console.error('Data cleanup history error:', error);
    res.status(500).json({ error: 'Failed to load cleanup history', details: error.message });
  }
});

router.post('/preview', async (req, res) => {
  try {
    const { error, value } = runSchema.validate({ ...req.body, dry_run: true });
    if (error) {
      return res.status(400).json({ error: 'Invalid request', details: error.details });
    }
    const result = await dataCleanupService.runCleanup({
      dryRun: true,
      mode: value.mode,
      deviceIds: value.device_ids,
      policyOverrides: value.policy_overrides,
      triggeredBy: 'manual',
      userId: req.user.user_id,
    });
    res.json(result);
  } catch (err) {
    if (err.code === 'DEVICE_IDS_REQUIRED') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Data cleanup preview error:', err);
    res.status(500).json({ error: 'Preview failed', details: err.message });
  }
});

router.post('/run', async (req, res) => {
  try {
    const { error, value } = runSchema.validate({ ...req.body, dry_run: false });
    if (error) {
      return res.status(400).json({ error: 'Invalid request', details: error.details });
    }
    const result = await dataCleanupService.runCleanup({
      dryRun: false,
      mode: value.mode,
      deviceIds: value.device_ids,
      policyOverrides: value.policy_overrides,
      triggeredBy: 'manual',
      userId: req.user.user_id,
    });
    res.json({
      message: 'Data cleanup completed',
      ...result,
    });
  } catch (err) {
    if (err.code === 'DEVICE_IDS_REQUIRED') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Data cleanup run error:', err);
    res.status(500).json({ error: 'Cleanup failed', details: err.message });
  }
});

module.exports = router;
