const express = require('express');
const { authorizeRole } = require('../middleware/auth');
const {
  getDeploymentSettings,
  updateDeploymentSettings,
} = require('../services/deploymentSettingsService');

const router = express.Router();

router.get('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const settings = await getDeploymentSettings(req);
    res.json(settings);
  } catch (error) {
    console.error('Deployment settings GET error:', error);
    res.status(500).json({
      error: 'Failed to load deployment settings',
      details: error.message,
    });
  }
});

router.put('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { cors_origins, allowed_logout_redirect_hosts } = req.body || {};
    const result = await updateDeploymentSettings({
      cors_origins,
      allowed_logout_redirect_hosts,
    });
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (error) {
    console.error('Deployment settings PUT error:', error);
    res.status(500).json({
      error: 'Failed to save deployment settings',
      details: error.message,
    });
  }
});

module.exports = router;
