const express = require('express');
const Joi = require('joi');
const { authorizeDeviceAccess } = require('../middleware/auth');
const { getRow, getRows, query } = require('../config/database');

const router = express.Router();

const GPS_MAX_LIMIT = 20000;

const DEFAULT_SETTINGS = {
  moveSpeedThreshold: 3,
  stopSpeedThreshold: 1,
  stopMinutes: 3,
  parkMinutes: 15,
  sensorSnapshotWindowMs: 300000,
  /** Map outlier filter (client uses for polyline; stored for consistency) */
  gpsFilterEnabled: false,
  /** Max distance from previous kept point (meters); jumps larger are dropped */
  gpsMaxJumpMeters: 500,
  /** Drop points with speed above this (same unit as gps_tracks.speed); 0 = off */
  gpsMaxSpeed: 0,
  /** Drop points with GPS accuracy worse than this (meters); 0 = off */
  gpsMaxAccuracyMeters: 0,
};

function parsePreferences(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw;
  return {};
}

function mergeSettings(stored) {
  return { ...DEFAULT_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) };
}

// GET /api/live-tracking/settings
router.get('/settings', async (req, res) => {
  try {
    const row = await getRow('SELECT preferences FROM users WHERE user_id = $1', [req.user.user_id]);
    const prefs = parsePreferences(row?.preferences);
    res.json({ settings: mergeSettings(prefs.liveTracking) });
  } catch (error) {
    console.error('live-tracking settings GET:', error);
    res.status(500).json({ error: 'Failed to load tracking settings', code: 'LIVE_TRACKING_SETTINGS_ERROR' });
  }
});

const settingsFullSchema = Joi.object({
  moveSpeedThreshold: Joi.number().min(0).max(500).required(),
  stopSpeedThreshold: Joi.number().min(0).max(500).required(),
  stopMinutes: Joi.number().min(0).max(10080).required(),
  parkMinutes: Joi.number().min(0).max(10080).required(),
  sensorSnapshotWindowMs: Joi.number().min(60000).max(3600000).required(),
  gpsFilterEnabled: Joi.boolean().required(),
  gpsMaxJumpMeters: Joi.number().min(10).max(500000).required(),
  gpsMaxSpeed: Joi.number().min(0).max(2000).required(),
  gpsMaxAccuracyMeters: Joi.number().min(0).max(5000).required(),
}).custom((value, helpers) => {
  if (value.moveSpeedThreshold < value.stopSpeedThreshold) {
    return helpers.error('any.invalid');
  }
  if (value.parkMinutes < value.stopMinutes) {
    return helpers.error('any.invalid');
  }
  return value;
});

// PUT /api/live-tracking/settings — stores under users.preferences.liveTracking (partial body merges into current)
router.put('/settings', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'JSON body required', code: 'VALIDATION_ERROR' });
    }

    const row = await getRow('SELECT preferences FROM users WHERE user_id = $1', [req.user.user_id]);
    const prefs = parsePreferences(row?.preferences);
    if (typeof prefs !== 'object' || prefs === null) {
      return res.status(500).json({ error: 'Invalid preferences state', code: 'PREFS_INVALID' });
    }

    const nextLt = mergeSettings({ ...(prefs.liveTracking || {}), ...req.body });
    const { error, value } = settingsFullSchema.validate(nextLt, { abortEarly: false });
    if (error) {
      const msg = error.details.map((d) => d.message).join('; ');
      return res.status(400).json({
        error: msg.includes('fails to match')
          ? 'moveSpeedThreshold must be >= stopSpeedThreshold and parkMinutes must be >= stopMinutes'
          : msg,
        code: 'VALIDATION_ERROR',
      });
    }

    prefs.liveTracking = value;

    await query('UPDATE users SET preferences = $1::jsonb WHERE user_id = $2', [
      JSON.stringify(prefs),
      req.user.user_id,
    ]);

    res.json({ settings: value });
  } catch (error) {
    console.error('live-tracking settings PUT:', error);
    res.status(500).json({ error: 'Failed to save tracking settings', code: 'LIVE_TRACKING_SETTINGS_SAVE_ERROR' });
  }
});

// GET /api/live-tracking/devices/:deviceId/gps-tracks?start=&end=&limit=
router.get('/devices/:deviceId/gps-tracks', authorizeDeviceAccess('read'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query parameters are required (ISO 8601)', code: 'MISSING_RANGE' });
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid start or end date', code: 'INVALID_RANGE' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start must be before end', code: 'INVALID_RANGE_ORDER' });
    }

    let limit = parseInt(req.query.limit, 10);
    if (Number.isNaN(limit) || limit < 1) limit = GPS_MAX_LIMIT;
    limit = Math.min(limit, GPS_MAX_LIMIT);

    const countRow = await getRow(
      `SELECT COUNT(*)::bigint AS c FROM gps_tracks WHERE device_id = $1 AND timestamp >= $2 AND timestamp <= $3`,
      [deviceId, startDate, endDate]
    );
    const total = Number(countRow?.c || 0);

    const rows = await getRows(
      `
      WITH ranked AS (
        SELECT
          id,
          device_id,
          latitude::float8 AS latitude,
          longitude::float8 AS longitude,
          altitude::float8 AS altitude,
          speed::float8 AS speed,
          heading::float8 AS heading,
          timestamp,
          accuracy::float8 AS accuracy,
          satellites,
          metadata,
          COUNT(*) OVER () AS tc,
          ROW_NUMBER() OVER (ORDER BY timestamp ASC) AS rn
        FROM gps_tracks
        WHERE device_id = $1 AND timestamp >= $2 AND timestamp <= $3
      )
      SELECT id, device_id, latitude, longitude, altitude, speed, heading, timestamp, accuracy, satellites, metadata, tc AS total_in_range
      FROM ranked
      WHERE tc <= $4
         OR (rn - 1) % GREATEST(1, CEIL(tc::numeric / $4)::int) = 0
         OR rn = tc
      ORDER BY timestamp ASC
      `,
      [deviceId, startDate, endDate, limit]
    );

    const points = rows.map((r) => ({
      id: r.id,
      device_id: r.device_id,
      latitude: r.latitude,
      longitude: r.longitude,
      altitude: r.altitude,
      speed: r.speed,
      heading: r.heading,
      timestamp: r.timestamp,
      accuracy: r.accuracy,
      satellites: r.satellites,
      metadata: r.metadata,
    }));

    const downsampled = total > limit;
    res.json({
      device_id: deviceId,
      points,
      total_in_range: total,
      returned: points.length,
      limit,
      downsampled,
      range: { start: startDate.toISOString(), end: endDate.toISOString() },
    });
  } catch (error) {
    console.error('gps-tracks GET:', error);
    res.status(500).json({ error: 'Failed to load GPS tracks', code: 'GPS_TRACKS_ERROR' });
  }
});

// GET /api/live-tracking/devices/:deviceId/sensor-snapshot?at=&windowMs=
router.get('/devices/:deviceId/sensor-snapshot', authorizeDeviceAccess('read'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { at } = req.query;
    if (!at) {
      return res.status(400).json({ error: 'at query parameter is required (ISO 8601)', code: 'MISSING_AT' });
    }
    const atDate = new Date(at);
    if (Number.isNaN(atDate.getTime())) {
      return res.status(400).json({ error: 'Invalid at timestamp', code: 'INVALID_AT' });
    }

    let windowMs = parseInt(req.query.windowMs, 10);
    if (Number.isNaN(windowMs)) windowMs = DEFAULT_SETTINGS.sensorSnapshotWindowMs;
    windowMs = Math.min(Math.max(windowMs, 60000), 3600000);

    const half = windowMs / 2;
    const from = new Date(atDate.getTime() - half);
    const to = new Date(atDate.getTime() + half);

    const rows = await getRows(
      `
      SELECT sensor_type, value::float8 AS value, unit, timestamp, metadata
      FROM sensor_readings
      WHERE device_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
      ORDER BY timestamp ASC
      LIMIT 8000
      `,
      [deviceId, from, to]
    );

    const atMs = atDate.getTime();
    const byType = new Map();
    for (const row of rows) {
      const t = new Date(row.timestamp).getTime();
      const dist = Math.abs(t - atMs);
      const prev = byType.get(row.sensor_type);
      if (!prev || dist < prev.dist_ms) {
        byType.set(row.sensor_type, {
          sensor_type: row.sensor_type,
          value: row.value,
          unit: row.unit,
          timestamp: row.timestamp,
          metadata: row.metadata,
          dist_ms: dist,
        });
      }
    }

    const readings = Array.from(byType.values()).sort((a, b) => a.sensor_type.localeCompare(b.sensor_type));

    res.json({
      device_id: deviceId,
      at: atDate.toISOString(),
      window: { from: from.toISOString(), to: to.toISOString() },
      readings,
    });
  } catch (error) {
    console.error('sensor-snapshot GET:', error);
    res.status(500).json({ error: 'Failed to load sensor snapshot', code: 'SENSOR_SNAPSHOT_ERROR' });
  }
});

module.exports = router;
module.exports.GPS_MAX_LIMIT = GPS_MAX_LIMIT;
module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
