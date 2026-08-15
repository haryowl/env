const { getRows, getRow } = require('../../config/database');
const klhkConfig = require('./klhkConfigService');
const sparingSend = require('./sparingSendService');

const HOUR_MS = 60 * 60 * 1000;

function check(ok, label, detail) {
  return { ok, label, detail };
}

/**
 * Explains why a running SPARING device may not be transmitting: config gaps,
 * mapping mistakes, or simply no matching sensor readings in the target hour.
 */
async function buildSparingDiagnostics(deviceId, schedulerRunning) {
  const config = await klhkConfig.getConfig(deviceId);
  const checks = [];

  if (!config || config.reporting_type !== 'sparing') {
    checks.push(check(false, 'Reporting type', 'Device is not set to SPARING'));
    return { checks, ready: false };
  }

  checks.push(check(true, 'Reporting type', 'SPARING'));
  checks.push(
    check(
      Boolean(config.backup_running),
      'Backup running',
      config.backup_running ? 'Started' : 'Stopped — press Start backup reporting'
    )
  );
  checks.push(
    check(
      Boolean(schedulerRunning),
      'Scheduler active',
      schedulerRunning
        ? `In-memory jobs running (send mode: ${config.send_mode || 'hourly'})`
        : 'No scheduler job on this server process — restart server or press Stop then Start'
    )
  );
  checks.push(
    check(
      Boolean(config.logger_id?.trim()),
      'Logger ID',
      config.logger_id?.trim() ? config.logger_id : 'Missing'
    )
  );
  checks.push(
    check(
      Boolean(config.api_secret_set),
      'API secret',
      config.api_secret_set
        ? `Set (fetched ${config.api_secret_fetched_at || 'unknown'})`
        : 'Not set — press Fetch SPARING secret'
    )
  );

  const mappings = await klhkConfig.getSparingMappings(deviceId);
  const enabled = mappings.filter((m) => m.enabled);
  checks.push(
    check(
      enabled.length > 0,
      'Enabled mappings',
      enabled.length
        ? enabled.map((m) => `${m.sparing_param} ← ${m.sensor_field}`).join(', ')
        : 'None enabled'
    )
  );

  // Compare mapped sensor_field values against what the device actually stores.
  const availableRows = await getRows(
    `SELECT DISTINCT sensor_type FROM sensor_readings
     WHERE device_id = $1 AND timestamp >= NOW() - INTERVAL '24 hours'
     ORDER BY sensor_type`,
    [deviceId]
  );
  const available = availableRows.map((r) => r.sensor_type);
  const availableLower = new Set(available.map((s) => String(s).toLowerCase()));
  const unmatched = enabled.filter(
    (m) => !availableLower.has(String(m.sensor_field).toLowerCase())
  );
  checks.push(
    check(
      enabled.length > 0 && unmatched.length === 0,
      'Sensor field match',
      unmatched.length
        ? `No readings in 24h for: ${unmatched.map((m) => m.sensor_field).join(', ')}`
        : 'All mapped fields have recent readings'
    )
  );

  const previousHour = Math.floor((Date.now() - HOUR_MS) / HOUR_MS) * HOUR_MS;
  let hourRowCount = 0;
  if (enabled.length) {
    const row = await getRow(
      `SELECT COUNT(*)::int AS count FROM sensor_readings
       WHERE device_id = $1
         AND timestamp >= to_timestamp($2 / 1000.0)
         AND timestamp < to_timestamp($3 / 1000.0)
         AND lower(sensor_type) = ANY($4::text[])`,
      [
        deviceId,
        previousHour,
        previousHour + HOUR_MS,
        enabled.map((m) => String(m.sensor_field).toLowerCase()),
      ]
    );
    hourRowCount = row?.count ?? 0;
  }
  checks.push(
    check(
      hourRowCount > 0,
      'Data in previous UTC hour',
      `${hourRowCount} reading(s) between ${new Date(previousHour).toISOString()} and ${new Date(
        previousHour + HOUR_MS
      ).toISOString()}`
    )
  );

  let reachable = false;
  try {
    reachable = await sparingSend.isSparingHostReachable(config);
  } catch {
    reachable = false;
  }
  const urls = sparingSend.getApiUrls(config);
  checks.push(
    check(reachable, 'SPARING host reachable', reachable ? urls.BASE : `Cannot reach ${urls.BASE}`)
  );

  return {
    checks,
    ready: checks.every((c) => c.ok),
    endpoints: urls,
    available_sensor_types: available,
    previous_hour_utc: previousHour,
  };
}

module.exports = { buildSparingDiagnostics };
