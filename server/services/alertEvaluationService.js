const { query, getRows, getRow } = require('../config/database');
const { processDeviceData } = require('./deviceMapper');
const { NotificationService } = require('./notificationService');

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

// Evaluate threshold alerts on new data ingest
async function evaluateThresholdAlertsOnData(device_id, parameter, value, timestamp) {
  console.log('Evaluating threshold alerts for', device_id, parameter, value, timestamp);
  // Get all active threshold alerts for this device/parameter
  const alerts = await getRows(
    `SELECT * FROM alerts WHERE device_id = $1 AND parameter = $2 AND type = 'threshold'`,
    [device_id, parameter]
  );
  
  for (const alert of alerts) {
    if ((alert.min !== null && value < alert.min) || (alert.max !== null && value > alert.max)) {
      const device = await getRow('SELECT name FROM devices WHERE device_id = $1', [device_id]);
      const deviceName = device ? device.name : device_id;
      const actions = typeof alert.actions === 'string' ? (() => { try { return JSON.parse(alert.actions); } catch { return {}; } })() : (alert.actions || {});
      
      console.log('Inserting into alert_logs:', { alert_id: alert.alert_id, device_id, parameter, value });
      await query(
        `INSERT INTO alert_logs (alert_id, device_id, parameter, value, detected_at, status, details) VALUES ($1, $2, $3, $4, NOW(), 'active', $5)`,
        [alert.alert_id, device_id, parameter, value, JSON.stringify({ triggered: 'threshold', min: alert.min, max: alert.max, at: timestamp })]
      );
      
      try {
        if (actions && (actions.email || actions.http)) {
          console.log('Sending notification for alert:', {
            alert_id: alert.alert_id,
            template: alert.template,
            current_value: value,
            parameter: parameter,
            device: deviceName
          });
          
          await NotificationService.sendNotification(
            { ...alert, actions },
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
      
      // Emit WebSocket event
      if (global.io) {
        global.io.emit('new_alert_log', {
          alert_id: alert.alert_id,
          device_id,
          parameter,
          value,
          detected_at: new Date().toISOString(),
          type: 'threshold',
          details: { min: alert.min, max: alert.max }
        });
      }
    }
  }
}

// Periodically check inactivity alerts
async function evaluateInactivityAlertsPeriodically() {
  // Get all active inactivity alerts
  const alerts = await getRows(`SELECT * FROM alerts WHERE type = 'inactivity'`);
  for (const alert of alerts) {
    // Get last data timestamp for this device
    const lastData = await getRows(
      `SELECT timestamp FROM sensor_readings WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 1`,
      [alert.device_id]
    );
    if (!lastData.length) continue;
    const lastTimestamp = new Date(lastData[0].timestamp);
    const now = new Date();
    const minutesSince = (now - lastTimestamp) / 60000;
    if (alert.threshold_time && minutesSince > alert.threshold_time) {
      // Get device name for notification
      const device = await getRow('SELECT name FROM devices WHERE device_id = $1', [alert.device_id]);
      const deviceName = device ? device.name : alert.device_id;
      
      // Log alert event
      await query(
        `INSERT INTO alert_logs (alert_id, device_id, parameter, value, detected_at, status, details) VALUES ($1, $2, $3, $4, NOW(), 'active', $5)`,
        [alert.alert_id, alert.device_id, alert.parameter, null, JSON.stringify({ triggered: 'inactivity', lastUpdate: lastTimestamp, threshold: alert.threshold_time })]
      );
      
      // Send notifications if configured
      try {
        if (alert.actions && (alert.actions.email || alert.actions.http)) {
          await NotificationService.sendNotification(
            alert,
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
      
      // Emit WebSocket event
      if (global.io) {
        global.io.emit('new_alert_log', {
          alert_id: alert.alert_id,
          device_id: alert.device_id,
          parameter: alert.parameter,
          value: null,
          detected_at: new Date().toISOString(),
          type: 'inactivity',
          details: { lastUpdate: lastTimestamp, threshold: alert.threshold_time }
        });
      }
    }
  }
}

async function pollLatestDataAndEvaluateAlerts() {
  console.log('Polling for alerts...');
  const alerts = await getRows(`SELECT * FROM alerts WHERE type = 'threshold'`);
  console.log('Fetched alerts:', alerts);
  // Group alerts by device for efficiency
  const alertsByDevice = {};
  for (const alert of alerts) {
    if (!alertsByDevice[alert.device_id]) alertsByDevice[alert.device_id] = [];
    alertsByDevice[alert.device_id].push(alert);
  }
  for (const device_id of Object.keys(alertsByDevice)) {
    // Get the latest value for each sensor_type for this device, including metadata
    const rows = await getRows(
      `SELECT DISTINCT ON (sensor_type) sensor_type, value, unit, timestamp, metadata
       FROM sensor_readings
       WHERE device_id = $1
       ORDER BY sensor_type, timestamp DESC`,
      [device_id]
    );
    console.log('Latest sensor rows for device', device_id, rows);
    if (rows.length) {
      // Build the latest payload (merge metadata and sensor_type values)
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
      console.log('Latest payload for device', device_id, latestPayload);
      // --- Use mapper template if available ---
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
        console.log('Mapped fields (template) for device', device_id, mapped);
      } else {
        // Fallback to processDeviceData (field_mappings)
        const device = await getRow('SELECT * FROM devices WHERE device_id = $1', [device_id]);
        if (!device) continue;
        mapped = await processDeviceData(device, latestPayload);
        console.log('Mapped fields (fallback) for device', device_id, mapped);
      }
      for (const alert of alertsByDevice[device_id]) {
        const value = mapped[alert.parameter];
        console.log('Evaluating alert', alert.parameter, 'with value', value, 'for device', device_id);
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