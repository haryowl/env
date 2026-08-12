const https = require('https');
const { URL } = require('url');
const { query, getRow, getRows } = require('../../config/database');
const klhkConfig = require('./klhkConfigService');
const { DEFAULT_TMAT_API_URL } = require('./klhkConstants');

function parseNumericValue(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : String(value ?? '');
}

async function getLatestReading(deviceId, sensorField) {
  const row = await getRow(
    `SELECT value FROM sensor_readings
     WHERE device_id = $1 AND lower(sensor_type) = lower($2)
     ORDER BY timestamp DESC LIMIT 1`,
    [deviceId, sensorField]
  );
  return row?.value ?? null;
}

async function collectRealtimePayload(deviceId) {
  const config = await klhkConfig.getConfig(deviceId);
  if (!config?.device_id_unik?.trim()) {
    throw new Error('TMAT device_id_unik not configured');
  }

  const mappings = (await klhkConfig.getTmatMappings(deviceId)).filter((m) => m.enabled);
  if (!mappings.length) {
    throw new Error('No TMAT mappings configured');
  }

  const body = { device_id_unik: config.device_id_unik.trim() };
  let hasAny = false;

  for (const m of mappings) {
    const raw = await getLatestReading(deviceId, m.sensor_field);
    if (raw == null) continue;
    const num = parseNumericValue(raw);
    body[m.tmat_param] = typeof num === 'number' ? String(num) : String(num);
    hasAny = true;
  }

  if (!hasAny) return null;
  return body;
}

function httpFormPost(url, apiKey, formBody) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyString = new URLSearchParams(formBody).toString();
    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-API-KEY': apiKey,
          'Content-Length': Buffer.byteLength(bodyString),
        },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c.toString();
        });
        res.on('end', () => {
          const code = res.statusCode ?? 0;
          if (code < 200 || code >= 300) {
            reject(new Error(`HTTP ${code}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ status: true, message: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(bodyString);
    req.end();
  });
}

async function writeLog(deviceId, status, response, durationMs, triggeredBy = null) {
  await query(
    `INSERT INTO klhk_send_logs
     (device_id, protocol, send_type, records_count, status, response, duration_ms, triggered_by)
     VALUES ($1, 'tmat', 'realtime', 1, $2, $3, $4, $5)`,
    [deviceId, status, String(response).substring(0, 4000), durationMs, triggeredBy]
  );
}

async function enqueueFailed(deviceId, formBody, errorMessage) {
  await query(
    `INSERT INTO klhk_send_queue (device_id, protocol, send_type, payload, status, error_message)
     VALUES ($1, 'tmat', 'realtime', $2, 'pending', $3)`,
    [deviceId, JSON.stringify(formBody), String(errorMessage).substring(0, 500)]
  );
}

async function sendRealtimePush(deviceId, triggeredBy = null, requireRunning = false) {
  const config = await klhkConfig.getConfig(deviceId);
  if (!config || config.reporting_type !== 'tmat') {
    throw new Error('Device is not configured for TMAT');
  }
  if (requireRunning && !config.backup_running) {
    throw new Error('Backup reporting is not running for this device');
  }
  const apiKey = await klhkConfig.getApiKey(deviceId);
  if (!apiKey?.trim()) throw new Error('TMAT API key not configured');

  const formBody = await collectRealtimePayload(deviceId);
  if (!formBody) {
    return { skipped: true, reason: 'no_data' };
  }

  const endpoint = (config.api_url?.trim() || DEFAULT_TMAT_API_URL).replace(/\/+$/, '');
  const start = Date.now();

  try {
    const response = await httpFormPost(endpoint, apiKey.trim(), formBody);
    const durationMs = Date.now() - start;
    await writeLog(deviceId, 'success', JSON.stringify(response), durationMs, triggeredBy);
    await klhkConfig.updateConfig(deviceId, { last_send: new Date().toISOString() });
    return { success: true, response, durationMs };
  } catch (error) {
    const durationMs = Date.now() - start;
    await writeLog(deviceId, 'failed', error.message, durationMs, triggeredBy);
    await enqueueFailed(deviceId, formBody, error.message);
    throw error;
  }
}

async function processQueue(deviceId) {
  const config = await klhkConfig.getConfig(deviceId);
  if (!config || config.reporting_type !== 'tmat') return { processed: 0 };

  const apiKey = await klhkConfig.getApiKey(deviceId);
  if (!apiKey?.trim()) return { processed: 0, error: 'no_api_key' };

  const endpoint = (config.api_url?.trim() || DEFAULT_TMAT_API_URL).replace(/\/+$/, '');
  const maxAttempts = config.retry_max_attempts || 5;

  const items = await getRows(
    `SELECT * FROM klhk_send_queue
     WHERE device_id = $1 AND protocol = 'tmat' AND status = 'pending'
     ORDER BY created_at ASC LIMIT 20`,
    [deviceId]
  );

  let processed = 0;
  for (const item of items) {
    let formBody;
    try {
      formBody = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
    } catch {
      await query(`UPDATE klhk_send_queue SET status = 'failed', error_message = $1 WHERE id = $2`, [
        'Invalid payload JSON',
        item.id,
      ]);
      continue;
    }

    await query(`UPDATE klhk_send_queue SET status = 'sending' WHERE id = $1`, [item.id]);
    const start = Date.now();
    try {
      const response = await httpFormPost(endpoint, apiKey.trim(), formBody);
      await query(`UPDATE klhk_send_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`, [item.id]);
      await writeLog(deviceId, 'success', JSON.stringify(response), Date.now() - start);
      processed += 1;
    } catch (error) {
      const newRetry = (item.retry_count || 0) + 1;
      const newStatus = newRetry >= maxAttempts ? 'failed' : 'pending';
      await query(
        `UPDATE klhk_send_queue SET status = $1, retry_count = $2, error_message = $3, last_attempt_at = NOW()
         WHERE id = $4`,
        [newStatus, newRetry, error.message, item.id]
      );
    }
  }
  return { processed };
}

module.exports = {
  collectRealtimePayload,
  sendRealtimePush,
  processQueue,
};
