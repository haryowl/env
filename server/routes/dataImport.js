const express = require('express');
const Joi = require('joi');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const dataImportService = require('../services/dataImportService');

const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRole(['super_admin', 'admin']));

const rowsBodySchema = Joi.object({
  deviceId: Joi.string().max(100).required(),
  rows: Joi.array().items(Joi.object().unknown(true)).min(1).max(dataImportService.MAX_IMPORT_ROWS).required(),
});

let menuEnsured = false;
async function ensureMenuOnce() {
  if (menuEnsured) return;
  await dataImportService.ensureAdminMenuAccess();
  menuEnsured = true;
}

router.get('/template/:deviceId', async (req, res) => {
  try {
    await ensureMenuOnce();
    const template = await dataImportService.getTemplate(req.params.deviceId);
    const download = String(req.query.download || '') === '1';
    if (download) {
      const safeName = String(template.device.name || template.device.device_id)
        .replace(/[^\w\-]+/g, '_')
        .slice(0, 40);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="data-import-${safeName}.csv"`
      );
      return res.send(template.csv);
    }
    res.json(template);
  } catch (error) {
    console.error('Data import template error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to build import template',
    });
  }
});

router.post('/preview', async (req, res) => {
  try {
    await ensureMenuOnce();
    const { error, value } = rowsBodySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: 'Invalid request', details: error.details });
    }
    const preview = await dataImportService.previewImport(value.deviceId, value.rows);
    res.json(preview);
  } catch (err) {
    console.error('Data import preview error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Failed to preview import',
      preview: err.preview || undefined,
    });
  }
});

router.post('/commit', async (req, res) => {
  try {
    await ensureMenuOnce();
    const { error, value } = rowsBodySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: 'Invalid request', details: error.details });
    }
    const result = await dataImportService.commitImport(value.deviceId, value.rows, req.user || {});
    res.json({
      message: 'Import completed',
      ...result,
    });
  } catch (err) {
    console.error('Data import commit error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Failed to commit import',
      preview: err.preview || undefined,
    });
  }
});

module.exports = router;
