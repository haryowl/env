const { query, getRows, getRow } = require('../config/database');
const { processDeviceData } = require('./deviceMapper');
const { NotificationService } = require('./notificationService');
const { getAlertDeviceIds } = require('../utils/alertDevices');

// Helper: Get device mapper template (via device_mapper_assignments)
async function getDeviceMapperTemplate(device_id) {
  return await getRow(
    `SELECT mt.* FROM mapper_templates mt
     JOIN device_mapper_assignments dma ON dma.template_id = mt.template_id
     WHERE dma.device_id = $1
     ORDER BY mt.updated_at DESC LIMIT 1`,
    [device_id]
  );
}

// Helper: Apply template mapping
function applyTemplateMapping(rawPayload, mappings) {
  const mapped = {};
  for (const map of mappings) {
    const source = map.source || map.source_field;
    const target = map.target || map.target_field;
    if (rawPayload[source] !== undefined) {
      mapped[target] = rawPayload[source];
    }
  }
  return mapped;
}

const ALERT_MATCHES_DEVICE_SQL = `(
  device_id = $1
  OR COALESCE(device_ids, ARRAY[]::text[]) @> ARRAY[$1]::text[]
)`;

const TRIGGER_ON_ENTER = 'on_enter';
const TRIGGER_EVERY_READING = 'every_reading';
const TRIGGER_CONSECUTIVE = 'consecutive';

function parseAlertActions(alert) {
  if (typeof alert.actions === 'string') {
    try {
      return JSON.parse(alert.actions);
    } catch {
      return {};
    }
  }
  return alert.actions || {};
}

function normalizeTriggerMode(alert) {
  const mode = String(alert.trigger_mode || TRIGGER_ON_ENTER).trim();
  if (mode === TRIGGER_EVERY_READING || mode === TRIGGER_CONSECUTIVE) return mode;
  return TRIGGER_ON_ENTER;
}

function normalizeConsecutiveCount(alert) {
  const n = Number(alert.consecutive_count);
  if (!Number.isFinite(n) || n < 2) return 3;
  return Math.min(100, Math.floor(n));
}

function readingTimestampMs(timestamp) {
  if (timestamp == null) return null;
  const t = new Date(timestamp).getTime();
  return Number.isFinite(t) ? t : null;
}

function isNewReading(state, timestamp) {
  const ts = readingTimestampMs(timestamp);
  if (ts == null) return true;
  const prev = readingTimestampMs(state?.last_reading_at);
  if (prev == null) return true;
  return ts !== prev;
}

async function getBreachState(alertId, deviceId, parameter) {
  return getRow(
    `SELECT alert_id, device_id, parameter, streak, in_breach, last_reading_at, last_fired_at
     FROM alert_breach_streaks
     WHERE alert_id = $1 AND device_id = $2 AND parameter = $3`,
    [alertId, deviceId, parameter]
  );
}

async function upsertBreachState({
  alertId,
  deviceId,
  parameter,
  streak,
  inBreach,
  lastReadingAt,
  lastFiredAt = null,
}) {
  await query(
    `INSERT INTO alert_breach_streaks
       (alert_id, device_id, parameter, streak, in_breach, last_reading_at, last_fired_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (alert_id, device_id, parameter)
     DO UPDATE SET
       streak = EXCLUDED.streak,
       in_breach = EXCLUDED.in_breach,
       last_reading_at = EXCLUDED.last_reading_at,
       last_fired_at = COALESCE(EXCLUDED.last_fired_at, alert_breach_streaks.last_fired_at),
       updated_at = NOW()`,
    [
      alertId,
      deviceId,
      parameter,
      streak,
      inBreach,
      lastReadingAt || null,
      lastFiredAt,
    ]
  );
}

async function getActiveLog(alertId, deviceId, parameter) {
  return getRow(
    `SELECT log_id
     FROM alert_logs
     WHERE alert_id = $1 AND device_id = $2 AND parameter = $3 AND status = 'active'
     ORDER BY detected_at DESC
     LIMIT 1`,
    [alertId, deviceId, parameter]
  );
}

async function resolveActiveLog(logId) {
  if (!logId) return;
  await query(
    `UPDATE alert_logs
     SET status = 'resolved',
         details = jsonb_set(COALESCE(details, '{}'::jsonb), '{resolvedAt}', to_jsonb(NOW()), true)
     WHERE log_id = $1`,
    [logId]
  );
}

async function fireThresholdAlert({ alert, deviceId, parameter, value, timestamp, streak = null }) {
  const device = await getRow('SELECT name FROM devices WHERE device_id = $1', [deviceId]);
  const deviceName = device ? device.name : deviceId;
  const actions = parseAlertActions(alert);
  const triggerMode = normalizeTriggerMode(alert);

  console.log('Inserting into alert_logs:', { alert_id: alert.alert_id, device_id: deviceId, parameter, value, triggerMode });
  await query(
    `INSERT INTO alert_logs (alert_id, device_id, parameter, value, detected_at, status, details)
     VALUES ($1, $2, $3, $4, NOW(), 'active', $5)`,
    [
      alert.alert_id,
      deviceId,
      parameter,
      value,
      JSON.stringify({
        triggered: 'threshold',
        min: alert.min,
        max: alert.max,
        at: timestamp,
        trigger_mode: triggerMode,
        streak,
      }),
    ]
  );

  try {
    if (actions && (actions.email || actions.http || actions.mqtt || actions.whatsapp)) {
      await NotificationService.sendNotification(
        { ...alert, actions, device_id: deviceId },
        deviceName,
        parameter,
        value,
        alert.min,
        alert.max,
        timestamp,
        null
      );
    }
  } catch (error) {
    console.error('Failed to send notification for alert', alert.alert_id, error);
  }

  if (global.io) {
    global.io.emit('new_alert_log', {
      alert_id: alert.alert_id,
      device_id: deviceId,
      parameter,
      value,
      detected_at: new Date().toISOString(),
      type: 'threshold',
      details: { min: alert.min, max: alert.max, trigger_mode: triggerMode, streak },
    });
  }
}

// Evaluate threshold alerts on new data ingest
async function evaluateThresholdAlertsOnData(device_id, parameter, value, timestamp) {
  console.log('Evaluating threshold alerts for', device_id, parameter, value, timestamp);
  const alerts = await getRows(
    `SELECT * FROM alerts
     WHERE ${ALERT_MATCHES_DEVICE_SQL}
       AND parameter = $2
       AND type = 'threshold'`,
    [device_id, parameter]
  );

  for (const alert of alerts) {
    const outOfRange = (alert.min !== null && value < alert.min) || (alert.max !== null && value > alert.max);
    const triggerMode = normalizeTriggerMode(alert);
    const consecutiveCount = normalizeConsecutiveCount(alert);
    const state = (await getBreachState(alert.alert_id, device_id, parameter)) || {};
    const active = await getActiveLog(alert.alert_id, device_id, parameter);
    const newReading = isNewReading(state, timestamp);

    if (!outOfRange) {
      await upsertBreachState({
        alertId: alert.alert_id,
        deviceId: device_id,
        parameter,
        streak: 0,
        inBreach: false,
        lastReadingAt: timestamp,
        lastFiredAt: null,
      });
      if (active?.log_id) await resolveActiveLog(active.log_id);
      continue;
    }

    let streak = Number(state.streak || 0);
    if (newReading) {
      streak = state.in_breach ? streak + 1 : 1;
    }

    // Sync episode state with an existing active log (e.g. after deploy / legacy data).
    const inBreachEpisode = Boolean(
      state.in_breach || (active?.log_id && triggerMode !== TRIGGER_EVERY_READING)
    );

    let shouldFire = false;
    if (triggerMode === TRIGGER_EVERY_READING) {
      // Only on a genuinely new reading — ignore poll re-scans of the same timestamp.
      shouldFire = newReading;
    } else if (triggerMode === TRIGGER_CONSECUTIVE) {
      shouldFire = newReading && streak >= consecutiveCount && !inBreachEpisode;
    } else {
      // on_enter: once per breach episode until value returns in range.
      shouldFire = newReading && !inBreachEpisode;
    }

    if (!shouldFire) {
      if (newReading || (inBreachEpisode && !state.in_breach)) {
        await upsertBreachState({
          alertId: alert.alert_id,
          deviceId: device_id,
          parameter,
          streak,
          inBreach: inBreachEpisode,
          lastReadingAt: timestamp,
          lastFiredAt: state.last_fired_at,
        });
      }
      continue;
    }

    if (triggerMode === TRIGGER_EVERY_READING && active?.log_id) {
      await resolveActiveLog(active.log_id);
    }

    await fireThresholdAlert({
      alert,
      deviceId: device_id,
      parameter,
      value,
      timestamp,
      streak,
    });

    await upsertBreachState({
      alertId: alert.alert_id,
      deviceId: device_id,
      parameter,
      streak,
      inBreach: true,
      lastReadingAt: timestamp,
      lastFiredAt: new Date(),
    });
  }
}

async function evaluateInactivityForDevice(alert, device_id) {
  const active = await getRow(
    `SELECT log_id
     FROM alert_logs
     WHERE alert_id = $1 AND device_id = $2 AND parameter = $3 AND status = 'active'
     ORDER BY detected_at DESC
     LIMIT 1`,
    [alert.alert_id, device_id, alert.parameter]
  );

  const lastData = await getRows(
    `SELECT timestamp FROM sensor_readings WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 1`,
    [device_id]
  );
  if (!lastData.length) return;

  const lastTimestamp = new Date(lastData[0].timestamp);
  const now = new Date();
  const minutesSince = (now - lastTimestamp) / 60000;
  if (!alert.threshold_time || !(minutesSince > alert.threshold_time)) return;
  if (active?.log_id) return;

  const device = await getRow('SELECT name FROM devices WHERE device_id = $1', [device_id]);
  const deviceName = device ? device.name : device_id;

  await query(
    `INSERT INTO alert_logs (alert_id, device_id, parameter, value, detected_at, status, details) VALUES ($1, $2, $3, $4, NOW(), 'active', $5)`,
    [alert.alert_id, device_id, alert.parameter, null, JSON.stringify({ triggered: 'inactivity', lastUpdate: lastTimestamp, threshold: alert.threshold_time })]
  );

  try {
    const actions = typeof alert.actions === 'string' ? (() => { try { return JSON.parse(alert.actions); } catch { return {}; } })() : (alert.actions || {});
    if (actions && (actions.email || actions.http || actions.mqtt || actions.whatsapp)) {
      await NotificationService.sendNotification(
        { ...alert, actions, device_id },
        deviceName,
        alert.parameter,
        null,
        null,
        null,
        lastTimestamp,
        alert.threshold_time
      );
    }
  } catch (error) {
    console.error('Failed to send notification for inactivity alert', alert.alert_id, error);
  }

  if (global.io) {
    global.io.emit('new_alert_log', {
      alert_id: alert.alert_id,
      device_id,
      parameter: alert.parameter,
      value: null,
      detected_at: new Date().toISOString(),
      type: 'inactivity',
      details: { lastUpdate: lastTimestamp, threshold: alert.threshold_time }
    });
  }
}

// Periodically check inactivity alerts
async function evaluateInactivityAlertsPeriodically() {
  const alerts = await getRows(`SELECT * FROM alerts WHERE type = 'inactivity'`);
  for (const alert of alerts) {
    const deviceIds = getAlertDeviceIds(alert);
    for (const device_id of deviceIds) {
      await evaluateInactivityForDevice(alert, device_id);
    }
  }
}

async function pollLatestDataAndEvaluateAlerts() {
  const alerts = await getRows(`SELECT * FROM alerts WHERE type = 'threshold'`);
  const alertsByDevice = {};
  for (const alert of alerts) {
    for (const device_id of getAlertDeviceIds(alert)) {
      if (!alertsByDevice[device_id]) alertsByDevice[device_id] = [];
      alertsByDevice[device_id].push(alert);
    }
  }
  for (const device_id of Object.keys(alertsByDevice)) {
    const rows = await getRows(
      `SELECT DISTINCT ON (sensor_type) sensor_type, value, unit, timestamp, metadata
       FROM sensor_readings
       WHERE device_id = $1
       ORDER BY sensor_type, timestamp DESC`,
      [device_id]
    );
    if (rows.length) {
      let latestPayload = {};
      let latestTimestamp = null;
      for (const row of rows) {
        if (row.metadata && typeof row.metadata === 'object') {
          latestPayload = { ...latestPayload, ...row.metadata };
        }
        latestPayload[row.sensor_type] = Number(row.value);
        if (!latestTimestamp || row.timestamp > latestTimestamp) {
          latestTimestamp = row.timestamp;
        }
      }
      let mapped;
      const template = await getDeviceMapperTemplate(device_id);
      if (template && template.mappings) {
        let mappings;
        try {
          mappings = typeof template.mappings === 'string' ? JSON.parse(template.mappings) : template.mappings;
        } catch (e) {
          console.error('Failed to parse template mappings for device', device_id, e);
          mappings = [];
        }
        mapped = applyTemplateMapping(latestPayload, mappings);
      } else {
        const device = await getRow('SELECT * FROM devices WHERE device_id = $1', [device_id]);
        if (!device) continue;
        mapped = await processDeviceData(device, latestPayload);
      }
      for (const alert of alertsByDevice[device_id]) {
        const value = mapped[alert.parameter];
        if (typeof value === 'number') {
          await evaluateThresholdAlertsOnData(device_id, alert.parameter, value, latestTimestamp);
        }
      }
    }
  }
}

module.exports = {
  evaluateThresholdAlertsOnData,
  evaluateInactivityAlertsPeriodically,
  pollLatestDataAndEvaluateAlerts
};
