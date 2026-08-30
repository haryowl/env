const { query, getRows, getRow } = require('../config/database');
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
    `SELECT alert_id, device_id, parameter, streak, in_breach, last_reading_at, last_fired_at, last_value
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
  lastValue = null,
}) {
  await query(
    `INSERT INTO alert_breach_streaks
       (alert_id, device_id, parameter, streak, in_breach, last_reading_at, last_fired_at, last_value, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (alert_id, device_id, parameter)
     DO UPDATE SET
       streak = EXCLUDED.streak,
       in_breach = EXCLUDED.in_breach,
       last_reading_at = EXCLUDED.last_reading_at,
       last_fired_at = EXCLUDED.last_fired_at,
       last_value = EXCLUDED.last_value,
       updated_at = NOW()`,
    [
      alertId,
      deviceId,
      parameter,
      streak,
      inBreach,
      lastReadingAt || null,
      lastFiredAt,
      lastValue,
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
    const ts = readingTimestampMs(timestamp);
    const prevTs = readingTimestampMs(state.last_reading_at);

    // Ignore older re-scans (poll) so they cannot reset an episode started by a newer ingest.
    if (ts != null && prevTs != null && ts < prevTs) {
      continue;
    }

    const newReading = isNewReading(state, timestamp);

    if (!outOfRange) {
      const lastStillOutOfRange =
        state.last_value != null
        && Number.isFinite(Number(state.last_value))
        && (
          (alert.min !== null && Number(state.last_value) < alert.min)
          || (alert.max !== null && Number(state.last_value) > alert.max)
        );
      // Poll/mapper can present a different field as this parameter. Do not close an
      // episode while the last known value for this alert is still out of range.
      if ((state.in_breach || active?.log_id) && lastStillOutOfRange && Number(state.last_value) !== Number(value)) {
        continue;
      }
      await upsertBreachState({
        alertId: alert.alert_id,
        deviceId: device_id,
        parameter,
        streak: 0,
        inBreach: false,
        lastReadingAt: timestamp,
        lastFiredAt: null,
        lastValue: value,
      });
      if (active?.log_id) await resolveActiveLog(active.log_id);
      continue;
    }

    let streak = Number(state.streak || 0);
    if (newReading) {
      streak = state.in_breach ? streak + 1 : 1;
    }

    const lastStillOutOfRange =
      state.last_value != null
      && Number.isFinite(Number(state.last_value))
      && (
        (alert.min !== null && Number(state.last_value) < alert.min)
        || (alert.max !== null && Number(state.last_value) > alert.max)
      );

    const inBreachEpisode = Boolean(
      state.in_breach
      || (active?.log_id && triggerMode !== TRIGGER_EVERY_READING)
      || (triggerMode === TRIGGER_ON_ENTER && lastStillOutOfRange)
    );

    let shouldFire = false;
    if (triggerMode === TRIGGER_EVERY_READING) {
      shouldFire = newReading;
    } else if (triggerMode === TRIGGER_CONSECUTIVE) {
      shouldFire = newReading && streak >= consecutiveCount && !inBreachEpisode;
    } else {
      // on_enter: one notification per continuous out-of-range episode.
      shouldFire = !inBreachEpisode;
    }

    if (!shouldFire) {
      await upsertBreachState({
        alertId: alert.alert_id,
        deviceId: device_id,
        parameter,
        streak,
        inBreach: true,
        lastReadingAt: timestamp,
        lastFiredAt: state.last_fired_at,
        lastValue: value,
      });
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
      lastValue: value,
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
    const template = await getDeviceMapperTemplate(device_id);
    let mappings = [];
    if (template?.mappings) {
      try {
        mappings = typeof template.mappings === 'string' ? JSON.parse(template.mappings) : template.mappings;
      } catch (e) {
        console.error('Failed to parse template mappings for device', device_id, e);
        mappings = [];
      }
    }
    const sourceByTarget = new Map(
      (Array.isArray(mappings) ? mappings : [])
        .filter((m) => m?.target || m?.target_field)
        .map((m) => [m.target || m.target_field, m.source || m.source_field])
    );

    for (const alert of alertsByDevice[device_id]) {
      const sourceField = sourceByTarget.get(alert.parameter);
      const candidates = [alert.parameter, sourceField].filter(Boolean);
      const placeholders = candidates.map((_, i) => `$${i + 2}`).join(', ');
      const row = await getRow(
        `SELECT sensor_type, value, timestamp
         FROM sensor_readings
         WHERE device_id = $1 AND sensor_type IN (${placeholders})
         ORDER BY timestamp DESC
         LIMIT 1`,
        [device_id, ...candidates]
      );
      if (!row) continue;
      const numericValue = Number(row.value);
      if (!Number.isFinite(numericValue)) continue;
      await evaluateThresholdAlertsOnData(device_id, alert.parameter, numericValue, row.timestamp);
    }
  }
}

module.exports = {
  evaluateThresholdAlertsOnData,
  evaluateInactivityAlertsPeriodically,
  pollLatestDataAndEvaluateAlerts
};
