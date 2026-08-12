const cron = require('node-cron');
const sparingSend = require('./sparingSendService');
const tmatSend = require('./tmatSendService');
const klhkConfig = require('./klhkConfigService');

const SCHEDULER_ENABLED = (() => {
  const raw = process.env.KLHK_SCHEDULER_ENABLED;
  if (raw == null || String(raw).trim() === '') return true;
  const s = String(raw).trim().toLowerCase();
  return !['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(s);
})();

/** @type {Map<string, { hourly?: import('node-cron').ScheduledTask, twoMin?: import('node-cron').ScheduledTask, retry?: NodeJS.Timeout }>} */
const deviceJobs = new Map();

async function runHourlyForDevice(deviceId) {
  try {
    const config = await klhkConfig.getConfig(deviceId);
    if (!config?.backup_running || config.reporting_type !== 'sparing') return;
    if (config.send_mode !== 'hourly' && config.send_mode !== 'both') return;

    await sparingSend.processQueue(deviceId);

    const now = Date.now();
    const HOUR_MS = 60 * 60 * 1000;
    const previousHour = Math.floor((now - HOUR_MS) / HOUR_MS) * HOUR_MS;
    await sparingSend.sendHourlyBatch(deviceId, previousHour);
  } catch (err) {
    console.error(`[KLHK] Hourly scheduler error for ${deviceId}:`, err?.message || err);
  }
}

async function run2MinForDevice(deviceId) {
  try {
    const config = await klhkConfig.getConfig(deviceId);
    if (!config?.backup_running || config.reporting_type !== 'sparing') return;
    if (config.send_mode !== '2min' && config.send_mode !== 'both') return;

    await sparingSend.processQueue(deviceId);

    const now = Date.now();
    const SLOT_MS = 2 * 60 * 1000;
    const slotTimestamp = now - (now % SLOT_MS);
    await sparingSend.send2MinBatch(deviceId, slotTimestamp);
  } catch (err) {
    console.error(`[KLHK] 2-min scheduler error for ${deviceId}:`, err?.message || err);
  }
}

function startRetryInterval(deviceId, config) {
  const minutes = config?.retry_interval_minutes || 5;
  const ms = Math.max(minutes, 1) * 60 * 1000;
  return setInterval(() => {
    sparingSend.processQueue(deviceId).catch((err) => {
      console.error(`[KLHK] Queue retry error for ${deviceId}:`, err?.message || err);
    });
  }, ms);
}

function stopDeviceSchedulers(deviceId) {
  const jobs = deviceJobs.get(deviceId);
  if (!jobs) return;
  jobs.hourly?.stop();
  jobs.twoMin?.stop();
  if (jobs.retry) clearInterval(jobs.retry);
  if (jobs.tmat) clearInterval(jobs.tmat);
  deviceJobs.delete(deviceId);
  console.log(`[KLHK] Scheduler stopped for ${deviceId}`);
}

function startTmatInterval(deviceId, config) {
  const seconds = Math.max(config?.push_interval_seconds || 60, 15);
  return setInterval(() => {
    tmatSend.sendRealtimePush(deviceId, null, true).catch((err) => {
      console.error(`[KLHK] TMAT push error for ${deviceId}:`, err?.message || err);
    });
    tmatSend.processQueue(deviceId).catch(() => {});
  }, seconds * 1000);
}

function startDeviceSchedulers(deviceId, config) {
  stopDeviceSchedulers(deviceId);

  if (!SCHEDULER_ENABLED) {
    console.warn(`[KLHK] Schedulers disabled (KLHK_SCHEDULER_ENABLED=false); not starting ${deviceId}`);
    return;
  }

  if (!config?.backup_running) return;

  const jobs = {};

  if (config.reporting_type === 'sparing') {
    if (config.send_mode === 'hourly' || config.send_mode === 'both') {
      jobs.hourly = cron.schedule('0 * * * *', () => runHourlyForDevice(deviceId));
    }
    if (config.send_mode === '2min' || config.send_mode === 'both') {
      jobs.twoMin = cron.schedule('*/2 * * * *', () => run2MinForDevice(deviceId));
    }
    jobs.retry = startRetryInterval(deviceId, config);
    console.log(
      `[KLHK] SPARING scheduler started for ${deviceId} (mode=${config.send_mode || 'hourly'})`
    );
  }

  if (config.reporting_type === 'tmat') {
    jobs.tmat = startTmatInterval(deviceId, config);
    console.log(`[KLHK] TMAT scheduler started for ${deviceId} (interval=${config.push_interval_seconds || 60}s)`);
  }

  deviceJobs.set(deviceId, jobs);
}

async function restoreRunningSchedulers() {
  try {
    const { getRows } = require('../../config/database');
    const { ensureKlhkReportingSchema } = require('../../utils/ensureKlhkReportingSchema');
    await ensureKlhkReportingSchema();
    const rows = await getRows(
      `SELECT device_id, reporting_type, send_mode, push_interval_seconds, backup_running
       FROM klhk_device_config WHERE backup_running = true AND reporting_type IN ('sparing', 'tmat')`
    );
    for (const row of rows) {
      startDeviceSchedulers(row.device_id, row);
    }
    if (rows.length) {
      console.log(`[KLHK] Restored ${rows.length} backup scheduler(s) on startup`);
    }
  } catch (err) {
    console.error('[KLHK] Failed to restore schedulers:', err?.message || err);
  }
}

function isDeviceSchedulerRunning(deviceId) {
  return deviceJobs.has(deviceId);
}

function shutdownAllSchedulers() {
  for (const deviceId of [...deviceJobs.keys()]) {
    stopDeviceSchedulers(deviceId);
  }
}

module.exports = {
  startDeviceSchedulers,
  stopDeviceSchedulers,
  restoreRunningSchedulers,
  isDeviceSchedulerRunning,
  shutdownAllSchedulers,
  runHourlyForDevice,
  run2MinForDevice,
};
