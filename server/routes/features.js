const express = require('express');
const router = express.Router();

function envFlagEnabled(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return defaultValue;
  const s = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'disable', 'disabled'].includes(s)) return false;
  return defaultValue;
}

// GET /api/features - runtime feature flags (auth handled at app level)
router.get('/', async (_req, res) => {
  res.json({
    features: {
      mqttPublisher: envFlagEnabled('ENABLE_MQTT_PUBLISHER', true),
      sparing: envFlagEnabled('ENABLE_SPARING', false),
      tmat: envFlagEnabled('ENABLE_TMAT', false),
      klhkReporting:
        envFlagEnabled('ENABLE_SPARING', false) || envFlagEnabled('ENABLE_TMAT', false),
    },
  });
});

module.exports = router;

