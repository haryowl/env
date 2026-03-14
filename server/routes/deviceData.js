/**
 * HTTP device data ingestion - POST /api/device-data/:deviceId
 * Accepts the same JSON format as MQTT and stores to sensor_readings / gps_tracks.
 * Use when devices cannot use MQTT (e.g. HTTP-only gateways).
 *
 * Optional API key: set DEVICE_DATA_API_KEY in .env; then send X-API-Key or Authorization: Bearer <key>
 */
const express = require('express');
const router = express.Router();
const mqttService = require('../services/mqttService');

function optionalApiKeyAuth(req, res, next) {
  const apiKey = process.env.DEVICE_DATA_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return next();
  }
  const provided = req.get('X-API-Key') || (req.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!provided || provided !== apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing API key',
      code: 'UNAUTHORIZED'
    });
  }
  next();
}

router.post('/:deviceId', optionalApiKeyAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const data = req.body;

    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required',
        code: 'INVALID_DEVICE_ID'
      });
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        error: 'JSON body with sensor/GPS fields is required',
        code: 'INVALID_PAYLOAD'
      });
    }

    await mqttService.ingestData(deviceId.trim(), data, 'http');

    res.status(201).json({
      success: true,
      message: 'Data ingested',
      deviceId: deviceId.trim()
    });
  } catch (error) {
    console.error('Device data ingestion error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to ingest data',
      code: 'INGEST_ERROR'
    });
  }
});

module.exports = router;
