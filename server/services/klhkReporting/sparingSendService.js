const crypto = require('crypto');
const { URL } = require('url');
const { query, getRow, getRows } = require('../../config/database');
const klhkConfig = require('./klhkConfigService');
const {
  collectHourlyData,
  collect2MinData,
  getEnabledSparingMappings,
} = require('./klhkDataCollector');
const { httpRequest, probeHttpOriginReachable } = require('./klhkHttp');
const {
  DEFAULT_SPARING_API_BASE,
  MAX_PERIOD_HOURLY_SLOTS,
  MAX_PERIOD_2MIN_SLOTS,
} = require('./klhkConstants');

const HOUR_MS = 60 * 60 * 1000;
const SLOT_MS = 2 * 60 * 1000;

const lastHostReachableByDevice = new Map();

function getApiUrls(config) {
  const base = (
    config?.api_base?.trim() || DEFAULT_SPARING_API_BASE
  ).replace(/\/+$/, '');
  return {
    BASE: base,
    SECRET_URL: config?.api_secret_url?.trim() || `${base}/secret-sensor`,
    TESTING_URL: config?.api_testing_url?.trim() || `${base}/testing`,
    SEND_2MIN_URL: config?.api_send_2min_url?.trim() || `${base}/send`,
    SEND_HOURLY_URL: config?.api_send_hourly_url?.trim() || `${base}/send-hourly`,
  };
}

function normalizeApiSecret(raw) {
  let secret = String(raw ?? '').trim();
  if (
    secret.length >= 2 &&
    ((secret.startsWith('"') && secret.endsWith('"')) ||
      (secret.startsWith("'") && secret.endsWith("'")))
  ) {
    secret = secret.slice(1, -1).trim();
  }
  return secret;
}

function parseApiSecretResponse(response) {
  const trimmed = String(response).trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return normalizeApiSecret(parsed);
    if (parsed && typeof parsed === 'object') {
      const fromField = parsed.secret ?? parsed.api_secret;
      if (fromField != null && String(fromField).length > 0) {
        return normalizeApiSecret(String(fromField));
      }
    }
  } catch {
    // plain text
  }
  return normalizeApiSecret(trimmed);
}

function base64UrlEncode(data) {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function encryptJWT(payload, apiSecret) {
  const secret = normalizeApiSecret(apiSecret);
  const header = { typ: 'JWT', alg: 'HS256' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `${dataToSign}.${signature}`;
}

async function sendToSparing(endpoint, jwtToken) {
  const raw = await httpRequest(endpoint, 'POST', { token: jwtToken }, {
    acceptText: true,
    returnErrorBody: true,
  });
  let responseData;
  try {
    responseData = JSON.parse(raw);
  } catch {
    responseData = { status: false, desc: raw };
  }
  return {
    status: Boolean(responseData?.status),
    desc: responseData?.desc != null ? String(responseData.desc) : String(raw),
    raw,
  };
}

async function writeLog(deviceId, entry) {
  await query(
    `INSERT INTO klhk_send_logs
     (device_id, protocol, send_type, hour_timestamp, records_count, status, response, duration_ms, triggered_by)
     VALUES ($1, 'sparing', $2, $3, $4, $5, $6, $7, $8)`,
    [
      deviceId,
      entry.send_type,
      entry.hour_timestamp,
      entry.records_count ?? 0,
      entry.status,
      entry.response,
      entry.duration_ms ?? 0,
      entry.triggered_by ?? null,
    ]
  );
}

async function hasAlreadySent(deviceId, sendType, hourTimestamp) {
  const config = await klhkConfig.getConfig(deviceId);
  if (sendType === 'hourly' && config?.last_hourly_send) {
    const lastMs = new Date(config.last_hourly_send).getTime();
    const lastBucket = Math.floor(lastMs / (60 * 60 * 1000)) * 60 * 60 * 1000;
    if (lastBucket === hourTimestamp) return true;
  }
  if (sendType === '2min' && config?.last_2min_send) {
    const lastMs = new Date(config.last_2min_send).getTime();
    const lastSlot = lastMs - (lastMs % (2 * 60 * 1000));
    const thisSlot = hourTimestamp - (hourTimestamp % (2 * 60 * 1000));
    if (lastSlot === thisSlot) return true;
  }

  const queueSent = await getRow(
    `SELECT 1 AS ok FROM klhk_send_queue
     WHERE device_id = $1 AND protocol = 'sparing' AND send_type = $2
       AND hour_timestamp = $3 AND status = 'sent' LIMIT 1`,
    [deviceId, sendType, hourTimestamp]
  );
  if (queueSent) return true;

  const logOk = await getRow(
    `SELECT 1 AS ok FROM klhk_send_logs
     WHERE device_id = $1 AND protocol = 'sparing' AND send_type = $2
       AND hour_timestamp = $3 AND status = 'success' LIMIT 1`,
    [deviceId, sendType, hourTimestamp]
  );
  return Boolean(logOk);
}

async function markSlotSent(deviceId, sendType, hourTimestamp) {
  if (sendType === 'hourly') {
    await klhkConfig.updateConfig(deviceId, { last_hourly_send: new Date(hourTimestamp).toISOString() });
  } else if (sendType === '2min') {
    await klhkConfig.updateConfig(deviceId, { last_2min_send: new Date(hourTimestamp).toISOString() });
  }
}

function isLikelyTransientNetworkError(message) {
  if (!message) return false;
  const m = String(message).toLowerCase();
  const hints = [
    'econnrefused', 'etimedout', 'enotfound', 'econnreset', 'network', 'timeout', 'fetch failed',
  ];
  return hints.some((h) => m.includes(h));
}

async function isSparingHostReachable(config) {
  try {
    const { BASE } = getApiUrls(config);
    const base = BASE.startsWith('http') ? BASE : `https://${BASE}`;
    const u = new URL(base);
    return probeHttpOriginReachable(`${u.protocol}//${u.host}`);
  } catch {
    return false;
  }
}

async function addToQueue(deviceId, sendType, hourTimestamp, errorMessage, opts = {}) {
  const config = await klhkConfig.getConfig(deviceId);
  const apiSecret = await klhkConfig.getApiSecret(deviceId);
  if (!apiSecret || !config?.logger_id) return;

  if (await hasAlreadySent(deviceId, sendType, hourTimestamp)) return;

  const payloadData =
    sendType === '2min'
      ? await collect2MinData(deviceId, config.logger_id, hourTimestamp, { quiet: opts.quietCollect })
      : await collectHourlyData(deviceId, config.logger_id, hourTimestamp, { quiet: opts.quietCollect });
  if (!payloadData) return;

  const jwtToken = encryptJWT(payloadData, apiSecret);
  const recordsCount = sendType === '2min' ? 1 : (payloadData.data?.length ?? 0);

  const existing = await getRow(
    `SELECT id, status FROM klhk_send_queue
     WHERE device_id = $1 AND protocol = 'sparing' AND send_type = $2 AND hour_timestamp = $3
       AND status IN ('pending', 'sending', 'failed')
     ORDER BY created_at DESC LIMIT 1`,
    [deviceId, sendType, hourTimestamp]
  );

  const payloadJson = { jwt: jwtToken, records_count: recordsCount };

  if (existing) {
    await query(
      `UPDATE klhk_send_queue
       SET payload = $1, records_count = $2, status = 'pending', retry_count = 0,
           last_attempt_at = NOW(), error_message = $3
       WHERE id = $4`,
      [JSON.stringify(payloadJson), recordsCount, errorMessage, existing.id]
    );
    return;
  }

  await query(
    `INSERT INTO klhk_send_queue
     (device_id, protocol, send_type, hour_timestamp, payload, records_count, status, error_message)
     VALUES ($1, 'sparing', $2, $3, $4, $5, 'pending', $6)`,
    [deviceId, sendType, hourTimestamp, JSON.stringify(payloadJson), recordsCount, errorMessage]
  );
}

function getQueueEndpoint(sendType, config) {
  const urls = getApiUrls(config);
  if (sendType === '2min') return urls.SEND_2MIN_URL;
  if (sendType === 'testing') return urls.TESTING_URL;
  return urls.SEND_HOURLY_URL;
}

function extractJwtFromPayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return parsed.jwt || parsed.token || (typeof parsed === 'string' ? parsed : null);
    } catch {
      return payload;
    }
  }
  return payload.jwt || payload.token || null;
}

async function sendOneQueueItem(deviceId, item, config, options = {}) {
  const maxAttempts = config?.retry_max_attempts || 5;
  const force = options.force ?? false;
  const startTime = Date.now();

  if (!force && (await hasAlreadySent(deviceId, item.send_type, Number(item.hour_timestamp)))) {
    await query(
      `UPDATE klhk_send_queue SET status = 'sent', sent_at = NOW(), error_message = NULL WHERE id = $1`,
      [item.id]
    );
    return { success: true };
  }

  const jwt = extractJwtFromPayload(item.payload);
  if (!jwt) {
    await query(
      `UPDATE klhk_send_queue SET status = 'failed', error_message = $1 WHERE id = $2`,
      ['Invalid queue payload', item.id]
    );
    return { success: false, error: 'Invalid queue payload' };
  }

  try {
    await query(`UPDATE klhk_send_queue SET status = 'sending' WHERE id = $1`, [item.id]);
    const endpoint = getQueueEndpoint(item.send_type, config);
    const response = await sendToSparing(endpoint, jwt);
    const durationMs = Date.now() - startTime;

    if (response.status) {
      await query(`UPDATE klhk_send_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`, [item.id]);
      await markSlotSent(deviceId, item.send_type, Number(item.hour_timestamp));
      await writeLog(deviceId, {
        send_type: item.send_type,
        hour_timestamp: Number(item.hour_timestamp),
        records_count: item.records_count,
        status: 'success',
        response: response.raw,
        duration_ms: durationMs,
      });
      return { success: true };
    }
    throw new Error(response.desc || 'Unknown error');
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const newRetryCount = (item.retry_count || 0) + 1;
    const newStatus = force || newRetryCount >= maxAttempts ? 'failed' : 'pending';
    await query(
      `UPDATE klhk_send_queue SET status = $1, retry_count = $2, error_message = $3, last_attempt_at = NOW()
       WHERE id = $4`,
      [newStatus, newRetryCount, error.message, item.id]
    );
    await writeLog(deviceId, {
      send_type: item.send_type,
      hour_timestamp: Number(item.hour_timestamp),
      records_count: item.records_count,
      status: 'failed',
      response: error.message,
      duration_ms: durationMs,
    });
    return { success: false, error: error.message };
  }
}

/** Config problems that stop a send before any HTTP call is attempted. */
function notReadyError(message) {
  const err = new Error(message);
  err.code = 'KLHK_NOT_READY';
  return err;
}

async function requireSparingReady(deviceId, requireRunning = false) {
  const config = await klhkConfig.getConfig(deviceId);
  if (!config || config.reporting_type !== 'sparing') {
    throw notReadyError('Device is not configured for SPARING');
  }
  if (requireRunning && !config.backup_running) {
    throw notReadyError('Backup reporting is not running for this device');
  }
  const apiSecret = await klhkConfig.getApiSecret(deviceId);
  if (!apiSecret) throw notReadyError('API Secret not configured — fetch secret first');
  if (!config.logger_id?.trim()) throw notReadyError('Logger ID not configured');

  const enabledMappings = await getEnabledSparingMappings(deviceId);
  if (!enabledMappings.length) {
    throw notReadyError('No enabled SPARING parameter mappings — configure Mappings first');
  }
  return { config, apiSecret };
}

async function sendHourlyBatch(deviceId, hourTimestampMs, triggeredBy = null) {
  const { config, apiSecret } = await requireSparingReady(deviceId, false);

  if (await hasAlreadySent(deviceId, 'hourly', hourTimestampMs)) {
    return { skipped: true, reason: 'already_sent' };
  }

  const hourlyData = await collectHourlyData(deviceId, config.logger_id, hourTimestampMs);
  if (!hourlyData) {
    return { skipped: true, reason: 'no_data' };
  }

  const jwtToken = encryptJWT(hourlyData, apiSecret);
  const startTime = Date.now();
  const { SEND_HOURLY_URL } = getApiUrls(config);

  try {
    const response = await sendToSparing(SEND_HOURLY_URL, jwtToken);
    const duration = Date.now() - startTime;
    await writeLog(deviceId, {
      send_type: 'hourly',
      hour_timestamp: hourTimestampMs,
      records_count: hourlyData.data.length,
      status: response.status ? 'success' : 'failed',
      response: response.raw,
      duration_ms: duration,
      triggered_by: triggeredBy,
    });

    if (response.status) {
      await markSlotSent(deviceId, 'hourly', hourTimestampMs);
      return { success: true, records: hourlyData.data.length, response };
    }
    throw new Error(response.desc || 'SPARING API error');
  } catch (error) {
    await addToQueue(deviceId, 'hourly', hourTimestampMs, error.message);
    throw error;
  }
}

async function send2MinBatch(deviceId, slotTimestampMs, triggeredBy = null) {
  const { config, apiSecret } = await requireSparingReady(deviceId, false);

  if (await hasAlreadySent(deviceId, '2min', slotTimestampMs)) {
    return { skipped: true, reason: 'already_sent' };
  }

  const data = await collect2MinData(deviceId, config.logger_id, slotTimestampMs);
  if (!data) {
    return { skipped: true, reason: 'no_data' };
  }

  const jwtToken = encryptJWT(data, apiSecret);
  const startTime = Date.now();
  const { SEND_2MIN_URL } = getApiUrls(config);

  try {
    const response = await sendToSparing(SEND_2MIN_URL, jwtToken);
    const duration = Date.now() - startTime;
    await writeLog(deviceId, {
      send_type: '2min',
      hour_timestamp: slotTimestampMs,
      records_count: 1,
      status: response.status ? 'success' : 'failed',
      response: response.raw,
      duration_ms: duration,
      triggered_by: triggeredBy,
    });

    if (response.status) {
      await markSlotSent(deviceId, '2min', slotTimestampMs);
      return { success: true, response };
    }
    throw new Error(response.desc || 'SPARING API error');
  } catch (error) {
    await addToQueue(deviceId, '2min', slotTimestampMs, error.message);
    throw error;
  }
}

async function fetchApiSecret(deviceId) {
  const config = await klhkConfig.getConfig(deviceId);
  if (!config || config.reporting_type !== 'sparing') {
    throw new Error('Device is not configured for SPARING');
  }
  const { SECRET_URL } = getApiUrls(config);
  const response = await httpRequest(SECRET_URL, 'GET', undefined, { acceptText: true });
  const apiSecret = parseApiSecretResponse(response);
  await klhkConfig.updateConfig(deviceId, {
    api_secret: apiSecret,
    api_secret_fetched_at: new Date().toISOString(),
  });
  return apiSecret;
}

function alignHourStart(ms) {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

function align2MinSlot(ms) {
  return ms - (ms % SLOT_MS);
}

function buildPeriodSlots(periodFromMs, periodToMs, mode) {
  if (!Number.isFinite(periodFromMs) || !Number.isFinite(periodToMs)) {
    throw new Error('period_from and period_to must be valid unix timestamps (ms)');
  }
  if (periodToMs < periodFromMs) {
    throw new Error('period_to must be on or after period_from');
  }

  const slots = [];
  const sendMode = mode || 'hourly';

  if (sendMode === 'hourly' || sendMode === 'both') {
    const start = alignHourStart(periodFromMs);
    const end = alignHourStart(periodToMs);
    for (let ts = start; ts <= end; ts += HOUR_MS) {
      slots.push({ send_type: 'hourly', timestamp: ts });
    }
    if (slots.length > MAX_PERIOD_HOURLY_SLOTS) {
      throw new Error(`Hourly range exceeds maximum of ${MAX_PERIOD_HOURLY_SLOTS} hours`);
    }
  }

  if (sendMode === '2min' || sendMode === 'both') {
    const start = align2MinSlot(periodFromMs);
    const end = align2MinSlot(periodToMs);
    const twoMinSlots = [];
    for (let ts = start; ts <= end; ts += SLOT_MS) {
      twoMinSlots.push({ send_type: '2min', timestamp: ts });
    }
    if (twoMinSlots.length > MAX_PERIOD_2MIN_SLOTS) {
      throw new Error(`2-minute range exceeds maximum of ${MAX_PERIOD_2MIN_SLOTS} slots (~24 hours)`);
    }
    if (sendMode === '2min') return twoMinSlots;
    return [...slots, ...twoMinSlots];
  }

  return slots;
}

async function slotHasData(deviceId, slot, loggerId) {
  if (slot.send_type === 'hourly') {
    return Boolean(await collectHourlyData(deviceId, loggerId, slot.timestamp, { quiet: true }));
  }
  return Boolean(await collect2MinData(deviceId, loggerId, slot.timestamp, { quiet: true }));
}

async function previewSendPeriod(deviceId, { period_from, period_to, mode, skip_already_sent = true }) {
  await requireSparingReady(deviceId, false);
  const slots = buildPeriodSlots(period_from, period_to, mode);
  const config = await klhkConfig.getConfig(deviceId);
  let already_sent = 0;
  let no_data = 0;
  let to_send = 0;

  for (const slot of slots) {
    if (skip_already_sent && (await hasAlreadySent(deviceId, slot.send_type, slot.timestamp))) {
      already_sent += 1;
      continue;
    }
    const hasData = await slotHasData(deviceId, slot, config.logger_id);
    if (!hasData) no_data += 1;
    else to_send += 1;
  }

  return {
    period_from,
    period_to,
    mode: mode || 'hourly',
    total_slots: slots.length,
    already_sent,
    no_data,
    to_send,
  };
}

async function sendPeriod(deviceId, options, triggeredBy = null) {
  const {
    period_from,
    period_to,
    mode,
    skip_already_sent = true,
    action = 'send',
  } = options;

  const { config } = await requireSparingReady(deviceId, false);
  const slots = buildPeriodSlots(period_from, period_to, mode);

  const summary = {
    total_slots: slots.length,
    sent: 0,
    queued: 0,
    skipped_already_sent: 0,
    skipped_no_data: 0,
    failed: 0,
    results: [],
  };

  for (const slot of slots) {
    if (skip_already_sent && (await hasAlreadySent(deviceId, slot.send_type, slot.timestamp))) {
      summary.skipped_already_sent += 1;
      summary.results.push({
        ...slot,
        status: 'skipped',
        reason: 'already_sent',
      });
      continue;
    }

    const hasData = await slotHasData(deviceId, slot, config.logger_id);
    if (!hasData) {
      summary.skipped_no_data += 1;
      summary.results.push({ ...slot, status: 'skipped', reason: 'no_data' });
      continue;
    }

    if (action === 'queue') {
      await addToQueue(deviceId, slot.send_type, slot.timestamp, 'Manual period enqueue', {
        quietCollect: true,
      });
      summary.queued += 1;
      summary.results.push({ ...slot, status: 'queued' });
      continue;
    }

    try {
      const result =
        slot.send_type === 'hourly'
          ? await sendHourlyBatch(deviceId, slot.timestamp, triggeredBy)
          : await send2MinBatch(deviceId, slot.timestamp, triggeredBy);

      if (result?.skipped) {
        if (result.reason === 'already_sent') summary.skipped_already_sent += 1;
        else summary.skipped_no_data += 1;
        summary.results.push({ ...slot, status: 'skipped', reason: result.reason });
      } else {
        summary.sent += 1;
        summary.results.push({ ...slot, status: 'sent' });
      }
    } catch (error) {
      summary.failed += 1;
      summary.results.push({ ...slot, status: 'failed', error: error.message });
    }
  }

  return summary;
}

async function processQueue(deviceId, opts = {}) {
  const config = await klhkConfig.getConfig(deviceId);
  if (!config || config.reporting_type !== 'sparing') return { processed: 0 };

  const reachable = await isSparingHostReachable(config);
  const prev = lastHostReachableByDevice.get(deviceId);
  lastHostReachableByDevice.set(deviceId, reachable);

  if (!reachable) {
    return { processed: 0, offline: true };
  }

  if (config.retry_all_failed_on_reconnect && prev === false) {
    await query(
      `UPDATE klhk_send_queue SET status = 'pending', retry_count = 0
       WHERE device_id = $1 AND protocol = 'sparing' AND status = 'failed'`,
      [deviceId]
    );
  }

  const params = [deviceId];
  let sql = `SELECT * FROM klhk_send_queue
     WHERE device_id = $1 AND protocol = 'sparing' AND status = 'pending'`;
  if (opts.period_from != null && Number.isFinite(Number(opts.period_from))) {
    params.push(Number(opts.period_from));
    sql += ` AND hour_timestamp >= $${params.length}`;
  }
  if (opts.period_to != null && Number.isFinite(Number(opts.period_to))) {
    params.push(Number(opts.period_to));
    sql += ` AND hour_timestamp <= $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  sql += ` ORDER BY hour_timestamp ASC, created_at ASC LIMIT ${limit}`;

  const items = await getRows(sql, params);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  for (const item of items) {
    const outcome = await sendOneQueueItem(deviceId, item, config);
    processed += 1;
    if (outcome.success) succeeded += 1;
    else failed += 1;
  }
  return { processed, succeeded, failed };
}

async function backfillHour(deviceId, hourStartMs, triggeredBy = null) {
  return sendHourlyBatch(deviceId, hourStartMs, triggeredBy);
}

module.exports = {
  writeLog,
  requireSparingReady,
  fetchApiSecret,
  sendHourlyBatch,
  send2MinBatch,
  processQueue,
  backfillHour,
  previewSendPeriod,
  sendPeriod,
  buildPeriodSlots,
  getApiUrls,
  isSparingHostReachable,
};
