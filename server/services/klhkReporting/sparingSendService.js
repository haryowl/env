const crypto = require('crypto');
const { URL } = require('url');
const { query, getRow, getRows } = require('../../config/database');
const klhkConfig = require('./klhkConfigService');
const { collectHourlyData, collect2MinData } = require('./klhkDataCollector');
const { httpRequest, probeHttpOriginReachable } = require('./klhkHttp');
const { DEFAULT_SPARING_API_BASE } = require('./klhkConstants');

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
  const recordsCount = payloadData.data?.length ?? 0;

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

async function requireSparingReady(deviceId, requireRunning = false) {
  const config = await klhkConfig.getConfig(deviceId);
  if (!config || config.reporting_type !== 'sparing') {
    throw new Error('Device is not configured for SPARING');
  }
  if (requireRunning && !config.backup_running) {
    throw new Error('Backup reporting is not running for this device');
  }
  const apiSecret = await klhkConfig.getApiSecret(deviceId);
  if (!apiSecret) throw new Error('API Secret not configured — fetch secret first');
  if (!config.logger_id?.trim()) throw new Error('Logger ID not configured');
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

async function processQueue(deviceId) {
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

  const items = await getRows(
    `SELECT * FROM klhk_send_queue
     WHERE device_id = $1 AND protocol = 'sparing' AND status = 'pending'
     ORDER BY created_at ASC LIMIT 10`,
    [deviceId]
  );

  let processed = 0;
  for (const item of items) {
    await sendOneQueueItem(deviceId, item, config);
    processed += 1;
  }
  return { processed };
}

async function backfillHour(deviceId, hourStartMs, triggeredBy = null) {
  return sendHourlyBatch(deviceId, hourStartMs, triggeredBy);
}

module.exports = {
  fetchApiSecret,
  sendHourlyBatch,
  send2MinBatch,
  processQueue,
  backfillHour,
  getApiUrls,
  isSparingHostReachable,
};
