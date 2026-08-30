const { getRow, getRows, query } = require('../config/database');
const { getAlertDeviceIds, alertAppliesToDevice } = require('../utils/alertDevices');

const DEFAULT_BODY_TEMPLATE = {
  data: [
    {
      phone: '{{phone}}',
      message: '{{message}}',
    },
  ],
};

/** Normalize phone for Wablas-style APIs (Indonesia-friendly). */
function normalizePhone(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  s = s.replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  s = s.replace(/\D/g, '');
  if (s.startsWith('0') && s.length >= 9) {
    s = `62${s.slice(1)}`;
  }
  return s;
}

function isValidNormalizedPhone(phone) {
  return /^62\d{8,15}$/.test(phone) || /^\d{10,16}$/.test(phone);
}

/** Split comma/newline/semicolon-separated phone input; dedupe by normalized number. */
function parsePhoneList(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    const merged = [];
    for (const item of raw) {
      merged.push(...parsePhoneList(item));
    }
    return merged;
  }
  const s = String(raw).trim();
  if (!s) return [];
  const parts = s.split(/[,;\n\r]+/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const normalized = normalizePhone(part);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function getProviderConfig() {
  const row = await getRow('SELECT * FROM whatsapp_provider_config WHERE id = 1');
  if (!row) {
    return {
      id: 1,
      enabled: false,
      url: 'https://jogja.wablas.com/api/v2/send-message',
      method: 'POST',
      headers: {},
      body_template: DEFAULT_BODY_TEMPLATE,
    };
  }
  return {
    ...row,
    headers: parseJsonField(row.headers, {}),
    body_template:
      row.body_template == null
        ? DEFAULT_BODY_TEMPLATE
        : parseJsonField(row.body_template, DEFAULT_BODY_TEMPLATE),
  };
}

async function upsertProviderConfig(payload, userId) {
  const enabled = Boolean(payload.enabled);
  const url = String(payload.url || '').trim();
  const method = String(payload.method || 'POST').trim().toUpperCase() || 'POST';
  let headers = payload.headers;
  if (typeof headers === 'string') {
    headers = headers.trim() ? JSON.parse(headers) : {};
  }
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    headers = {};
  }
  let bodyTemplate = payload.body_template;
  if (bodyTemplate === undefined || bodyTemplate === null || bodyTemplate === '') {
    bodyTemplate = DEFAULT_BODY_TEMPLATE;
  } else if (typeof bodyTemplate === 'string') {
    bodyTemplate = JSON.parse(bodyTemplate);
  }
  if (!url) {
    const err = new Error('URL is required');
    err.status = 400;
    throw err;
  }

  await query(
    `INSERT INTO whatsapp_provider_config (id, enabled, url, method, headers, body_template, updated_by, updated_at)
     VALUES (1, $1, $2, $3, $4::jsonb, $5::jsonb, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       url = EXCLUDED.url,
       method = EXCLUDED.method,
       headers = EXCLUDED.headers,
       body_template = EXCLUDED.body_template,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [enabled, url, method, JSON.stringify(headers), JSON.stringify(bodyTemplate), userId || null]
  );
  return getProviderConfig();
}

function userCanAccessDevice(req, deviceId) {
  if (!deviceId) return false;
  if (req.allowedDeviceIds === null || req.allowedDeviceIds === undefined) return true;
  return req.allowedDeviceIds.map(String).includes(String(deviceId));
}

async function listSubscriptionsForUser(userId) {
  return getRows(
    `SELECT ws.*, d.name AS device_name, a.name AS alert_name, a.parameter AS alert_parameter
     FROM whatsapp_subscriptions ws
     LEFT JOIN devices d ON d.device_id = ws.device_id
     LEFT JOIN alerts a ON a.alert_id = ws.alert_id
     WHERE ws.user_id = $1
     ORDER BY ws.created_at DESC`,
    [userId]
  );
}

async function getAlertForSubscription(alertId) {
  return getRow(
    `SELECT alert_id, name, device_id, device_ids, parameter, actions, created_by
     FROM alerts WHERE alert_id = $1`,
    [alertId]
  );
}

async function addSubscription({ userId, deviceId, alertId, phone, req }) {
  const normalized = normalizePhone(phone);
  if (!isValidNormalizedPhone(normalized)) {
    const err = new Error('Invalid phone number. Use digits, e.g. 0812… or 62812…');
    err.status = 400;
    throw err;
  }
  if (!userCanAccessDevice(req, deviceId)) {
    const err = new Error('Device not allowed');
    err.status = 403;
    throw err;
  }
  const alert = await getAlertForSubscription(alertId);
  if (!alert) {
    const err = new Error('Alert not found');
    err.status = 404;
    throw err;
  }
  if (!alertAppliesToDevice(alert, deviceId)) {
    const err = new Error('Selected alert does not apply to this device');
    err.status = 400;
    throw err;
  }

  try {
    const result = await query(
      `INSERT INTO whatsapp_subscriptions (user_id, device_id, alert_id, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, String(deviceId), alertId, normalized]
    );
    return result.rows[0];
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error('This phone is already subscribed for that alert on this device');
      err.status = 409;
      err.code = 'duplicate';
      throw err;
    }
    throw e;
  }
}

async function addSubscriptionsBulk({ userId, deviceId, alertId, phones, req }) {
  const list = parsePhoneList(phones);
  if (!list.length) {
    const err = new Error('Enter at least one valid phone number');
    err.status = 400;
    throw err;
  }

  const added = [];
  const skipped = [];
  const failed = [];

  for (const phone of list) {
    try {
      const row = await addSubscription({ userId, deviceId, alertId, phone, req });
      added.push(row);
    } catch (e) {
      if (e.status === 409 || e.code === 'duplicate') {
        skipped.push({ phone, reason: e.message });
      } else {
        failed.push({ phone, error: e.message || 'Failed to add' });
      }
    }
  }

  if (!added.length && (skipped.length || failed.length)) {
    const err = new Error(
      failed.length
        ? `No phones added. ${failed.length} invalid, ${skipped.length} duplicate.`
        : 'All phone numbers are already subscribed for that alert on this device'
    );
    err.status = 400;
    err.details = { added, skipped, failed };
    throw err;
  }

  return { added, skipped, failed };
}

async function updateSubscription({ id, userId, deviceId, alertId, phone, req, isAdmin }) {
  const existing = await getRow('SELECT * FROM whatsapp_subscriptions WHERE id = $1', [id]);
  if (!existing) {
    const err = new Error('Subscription not found');
    err.status = 404;
    throw err;
  }
  if (!isAdmin && Number(existing.user_id) !== Number(userId)) {
    const err = new Error('Not allowed to edit this subscription');
    err.status = 403;
    throw err;
  }

  const normalized = normalizePhone(phone);
  if (!isValidNormalizedPhone(normalized)) {
    const err = new Error('Invalid phone number. Use digits, e.g. 0812… or 62812…');
    err.status = 400;
    throw err;
  }
  if (!userCanAccessDevice(req, deviceId)) {
    const err = new Error('Device not allowed');
    err.status = 403;
    throw err;
  }
  const alert = await getAlertForSubscription(alertId);
  if (!alert) {
    const err = new Error('Alert not found');
    err.status = 404;
    throw err;
  }
  if (!alertAppliesToDevice(alert, deviceId)) {
    const err = new Error('Selected alert does not apply to this device');
    err.status = 400;
    throw err;
  }

  try {
    const result = await query(
      `UPDATE whatsapp_subscriptions
       SET device_id = $1, alert_id = $2, phone = $3
       WHERE id = $4
       RETURNING *`,
      [String(deviceId), alertId, normalized, id]
    );
    return result.rows[0];
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error('This phone is already subscribed for that alert on this device');
      err.status = 409;
      throw err;
    }
    throw e;
  }
}

async function deleteSubscription(id, userId, isAdmin) {
  const row = await getRow('SELECT * FROM whatsapp_subscriptions WHERE id = $1', [id]);
  if (!row) {
    const err = new Error('Subscription not found');
    err.status = 404;
    throw err;
  }
  if (!isAdmin && Number(row.user_id) !== Number(userId)) {
    const err = new Error('Not allowed to delete this subscription');
    err.status = 403;
    throw err;
  }
  await query('DELETE FROM whatsapp_subscriptions WHERE id = $1', [id]);
  return true;
}

async function listAlertsForDevice(deviceId, req) {
  if (!userCanAccessDevice(req, deviceId)) {
    const err = new Error('Device not allowed');
    err.status = 403;
    throw err;
  }
  const rows = await getRows(
    `SELECT alert_id, name, device_id, device_ids, parameter, type, actions
     FROM alerts
     ORDER BY name ASC`
  );
  return (rows || []).filter((a) => alertAppliesToDevice(a, deviceId));
}

async function listPhonesForAlertFire(alertId, deviceId) {
  const rows = await getRows(
    `SELECT phone, device_id, user_id
     FROM whatsapp_subscriptions
     WHERE alert_id = $1`,
    [alertId]
  );
  const phones = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (deviceId && row.device_id && String(row.device_id) !== String(deviceId)) {
      continue;
    }
    const phone = normalizePhone(row.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
  }
  return phones;
}

module.exports = {
  DEFAULT_BODY_TEMPLATE,
  normalizePhone,
  parsePhoneList,
  isValidNormalizedPhone,
  getProviderConfig,
  upsertProviderConfig,
  listSubscriptionsForUser,
  addSubscription,
  addSubscriptionsBulk,
  updateSubscription,
  deleteSubscription,
  listAlertsForDevice,
  listPhonesForAlertFire,
  getAlertDeviceIds,
};
