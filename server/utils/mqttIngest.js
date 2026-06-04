/**
 * MQTT/HTTP ingest helpers (Phase 3). Defaults preserve legacy behavior when config is empty.
 */

const DEFAULT_GLOBAL_SUBSCRIBE_PATTERNS = [
  'devices/+/data',
  'device/+/data',
  '+/data',
  'sensors/+/reading',
  'gps/+/location',
  '+/telemetry',
  '+/state',
  '+/message',
  'telemetry/+',
  'data/+/+',
  'data/sparing/sparing/+',
  'data/+/+/+',
];

const DEVICE_ID_SOURCES = new Set([
  'topic',
  'json',
  'topic_then_json',
  'json_then_topic',
  'both_must_match',
]);

const VALIDATION_MODES = new Set(['off', 'warn', 'reject']);

const METADATA_KEYS = new Set([
  'datetime',
  '_terminaltime',
  '_groupname',
  'metadata',
]);

function parseDeviceConfig(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw || {};
}

function normalizeMqttIngestConfig(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  let deviceIdSource = String(base.device_id_source || 'topic').trim().toLowerCase();
  if (!DEVICE_ID_SOURCES.has(deviceIdSource)) {
    deviceIdSource = 'topic';
  }
  let validationMode = String(base.validation_mode || 'off').trim().toLowerCase();
  if (!VALIDATION_MODES.has(validationMode)) {
    validationMode = 'off';
  }
  const flattenPaths = Array.isArray(base.flatten_paths)
    ? base.flatten_paths
        .map((row) => ({
          from: String(row?.from || '').trim(),
          to: String(row?.to || '').trim(),
        }))
        .filter((row) => row.from && row.to)
        .slice(0, 50)
    : [];
  const flattenDepth = base.flatten_nested === true || base.flatten_depth === 'deep' ? 'deep' : 'shallow';

  return {
    device_id_source: deviceIdSource,
    device_id_json_field: String(base.device_id_json_field || '').trim(),
    flatten_paths: flattenPaths,
    flatten_nested: flattenDepth === 'deep',
    flatten_depth: flattenDepth,
    validation_mode: validationMode,
  };
}

function getMqttIngestFromDeviceConfig(deviceConfig) {
  const cfg = parseDeviceConfig(deviceConfig);
  return normalizeMqttIngestConfig(cfg.mqtt_ingest);
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(cur, part)) {
      cur = cur[part];
      continue;
    }
    const lower = part.toLowerCase();
    const key = Object.keys(cur).find((k) => k.toLowerCase() === lower);
    if (key === undefined) return undefined;
    cur = cur[key];
  }
  return cur;
}

function extractDeviceIdFromJson(data, fieldName) {
  if (!fieldName || !data || typeof data !== 'object') return null;
  const direct = data[fieldName];
  if (direct != null && String(direct).trim() !== '') {
    return String(direct).trim();
  }
  const nested = getByPath(data, fieldName);
  if (nested != null && String(nested).trim() !== '') {
    return String(nested).trim();
  }
  const lower = fieldName.toLowerCase();
  for (const [k, v] of Object.entries(data)) {
    if (k.toLowerCase() === lower && v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return null;
}

function resolveDeviceId({ topicDeviceId, data, ingestConfig }) {
  const cfg = normalizeMqttIngestConfig(ingestConfig);
  const jsonId = cfg.device_id_json_field
    ? extractDeviceIdFromJson(data, cfg.device_id_json_field)
    : null;
  const topicId = topicDeviceId ? String(topicDeviceId).trim() : null;

  switch (cfg.device_id_source) {
    case 'json':
      return jsonId || null;
    case 'topic':
      return topicId || null;
    case 'json_then_topic':
      return jsonId || topicId || null;
    case 'topic_then_json':
      return topicId || jsonId || null;
    case 'both_must_match':
      if (!topicId || !jsonId) return null;
      return topicId === jsonId ? topicId : null;
    default:
      return topicId || null;
  }
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function shallowFlattenNested(data) {
  if (!isPlainObject(data)) return { ...data };
  const out = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (METADATA_KEYS.has(String(key).toLowerCase())) continue;
    if (!isPlainObject(value)) continue;
    for (const [innerKey, innerVal] of Object.entries(value)) {
      if (innerVal != null && typeof innerVal !== 'object') {
        if (out[innerKey] === undefined) out[innerKey] = innerVal;
      }
    }
    delete out[key];
  }
  return out;
}

function deepFlattenObject(obj, prefix = '', out = {}) {
  if (!isPlainObject(obj)) return out;
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (METADATA_KEYS.has(String(key).toLowerCase()) && !prefix) {
      out[key] = value;
      continue;
    }
    if (isPlainObject(value)) {
      deepFlattenObject(value, path, out);
    } else if (Array.isArray(value)) {
      out[path] = value;
    } else {
      out[path] = value;
    }
  }
  return out;
}

function applyFlattenPaths(data, paths) {
  const out = { ...data };
  for (const row of paths) {
    const val = getByPath(data, row.from);
    if (val !== undefined) {
      out[row.to] = val;
    }
  }
  return out;
}

function prepareIngestPayload(rawData, ingestConfig) {
  const cfg = normalizeMqttIngestConfig(ingestConfig);
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return { data: rawData, warnings: ['Payload is not a JSON object'] };
  }

  let data = { ...rawData };
  const warnings = [];

  if (cfg.flatten_paths.length) {
    data = applyFlattenPaths(data, cfg.flatten_paths);
  } else if (cfg.flatten_nested || cfg.flatten_depth === 'deep') {
    if (cfg.flatten_depth === 'deep') {
      const flat = deepFlattenObject(data);
      data = { ...flat };
      if (rawData.datetime != null) data.datetime = rawData.datetime;
      if (rawData._terminalTime != null) data._terminalTime = rawData._terminalTime;
      if (rawData._groupName != null) data._groupName = rawData._groupName;
      if (rawData.metadata != null) data.metadata = rawData.metadata;
    } else {
      data = shallowFlattenNested(data);
    }
  }

  return { data, warnings };
}

function coerceType(value, dataType) {
  const t = String(dataType || '').toLowerCase();
  if (t === 'float' || t === 'number' || t === 'integer' || t === 'int') {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (t === 'boolean' || t === 'bool') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    return null;
  }
  if (value == null) return null;
  return value;
}

function validatePayload(data, payloadFields, validationMode) {
  const mode = VALIDATION_MODES.has(validationMode) ? validationMode : 'off';
  if (mode === 'off' || !Array.isArray(payloadFields) || !payloadFields.length) {
    return { ok: true, mode, errors: [], warnings: [] };
  }

  const errors = [];
  const warnings = [];

  for (const field of payloadFields) {
    if (!field.is_required) continue;
    const key = field.source_field;
    if (!key) continue;
    const val = getByPath(data, key) ?? data[key];
    if (val === undefined || val === null || val === '') {
      errors.push(`Missing required field: ${key}`);
      continue;
    }
    const coerced = coerceType(val, field.data_type);
    if (coerced === null && ['float', 'number', 'integer', 'int', 'boolean', 'bool'].includes(
      String(field.data_type || '').toLowerCase()
    )) {
      errors.push(`Invalid type for field: ${key}`);
    }
  }

  if (errors.length && mode === 'warn') {
    warnings.push(...errors);
    return { ok: true, mode, errors: [], warnings };
  }

  return { ok: errors.length === 0, mode, errors, warnings };
}

function normalizeGlobalPatterns(patterns) {
  if (!Array.isArray(patterns)) return [];
  const seen = new Set();
  const out = [];
  for (const p of patterns) {
    const t = String(p || '').trim();
    if (!t || t.includes('#') || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 30) break;
  }
  return out;
}

function getEffectiveGlobalPatterns(stored) {
  const custom = normalizeGlobalPatterns(stored?.patterns);
  if (stored?.use_builtin_defaults === false && custom.length) {
    return custom;
  }
  if (custom.length) {
    const merged = [...DEFAULT_GLOBAL_SUBSCRIBE_PATTERNS];
    for (const p of custom) {
      if (!merged.includes(p)) merged.push(p);
    }
    return merged;
  }
  return [...DEFAULT_GLOBAL_SUBSCRIBE_PATTERNS];
}

module.exports = {
  DEFAULT_GLOBAL_SUBSCRIBE_PATTERNS,
  DEVICE_ID_SOURCES: [...DEVICE_ID_SOURCES],
  VALIDATION_MODES: [...VALIDATION_MODES],
  parseDeviceConfig,
  normalizeMqttIngestConfig,
  getMqttIngestFromDeviceConfig,
  resolveDeviceId,
  prepareIngestPayload,
  validatePayload,
  normalizeGlobalPatterns,
  getEffectiveGlobalPatterns,
  getByPath,
};
