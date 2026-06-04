const express = require('express');
const Joi = require('joi');
const { getRow, getRows, query } = require('../config/database');
const mqttService = require('../services/mqttService');
const { authenticateToken, authorizeMenuAccess, authorizeRole } = require('../middleware/auth');
const { filterDataByRole, filterDeviceData } = require('../middleware/dataFilter');
const { getGlobalSettings, updateGlobalSettings } = require('../services/mqttSettingsService');
const {
  DEVICE_ID_SOURCES,
  VALIDATION_MODES,
  parseDeviceConfig,
  normalizeMqttIngestConfig,
} = require('../utils/mqttIngest');

const router = express.Router();

const topicSchema = Joi.string().trim().min(1).max(256).required();
const publishConfigSchema = Joi.object({
  project_code: Joi.string().trim().min(1).max(64).required(),
  group_identifier: Joi.string().trim().min(1).max(64).required(),
  terminal_code: Joi.string().trim().min(1).max(64).required(),
});

const flattenPathSchema = Joi.object({
  from: Joi.string().trim().min(1).max(128).required(),
  to: Joi.string().trim().min(1).max(64).required(),
});

const mqttIngestSchema = Joi.object({
  device_id_source: Joi.string().valid(...DEVICE_ID_SOURCES).optional(),
  device_id_json_field: Joi.string().trim().max(128).allow('').optional(),
  flatten_paths: Joi.array().items(flattenPathSchema).max(50).optional(),
  flatten_nested: Joi.boolean().optional(),
  flatten_depth: Joi.string().valid('shallow', 'deep').optional(),
  validation_mode: Joi.string().valid(...VALIDATION_MODES).optional(),
});

const saveConfigSchema = Joi.object({
  subscribe_topics: Joi.array().items(topicSchema).min(1).max(20).required(),
  mqtt_publish: publishConfigSchema.optional().allow(null),
  mqtt_ingest: mqttIngestSchema.optional().allow(null),
});

const globalSettingsSchema = Joi.object({
  custom_patterns: Joi.array().items(topicSchema).max(30).required(),
  use_builtin_defaults: Joi.boolean().required(),
});

function buildPublishTopic(cfg) {
  if (!cfg?.project_code || !cfg?.group_identifier || !cfg?.terminal_code) return null;
  return `data/${cfg.project_code}/${cfg.group_identifier}/${cfg.terminal_code}`;
}

function getEffectiveAllowedDeviceIds(req) {
  if (req.allowedDeviceIds !== undefined && req.allowedDeviceIds !== null) return req.allowedDeviceIds;
  return null;
}

function requireDeviceAccess(req, res, deviceId) {
  const allowed = getEffectiveAllowedDeviceIds(req);
  if (allowed === null) return true;
  if (!Array.isArray(allowed) || allowed.length === 0) {
    res.status(403).json({ error: 'Access denied for device', code: 'DEVICE_ACCESS_DENIED' });
    return false;
  }
  if (!allowed.includes(deviceId)) {
    res.status(403).json({ error: 'Access denied for device', code: 'DEVICE_ACCESS_DENIED' });
    return false;
  }
  return true;
}

function normalizeMappings(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed : [];
}

function extractPayloadFields(mappings) {
  return normalizeMappings(mappings)
    .filter((m) => m && String(m.source_field || '').trim())
    .map((m) => ({
      source_field: String(m.source_field).trim(),
      target_field: String(m.target_field || '').trim(),
      data_type: String(m.data_type || 'string').trim(),
      is_required: Boolean(m.is_required),
    }));
}

function buildExamplePayload(fields) {
  const payload = { datetime: new Date().toISOString() };
  for (const field of fields) {
    const type = (field.data_type || '').toLowerCase();
    if (type === 'float' || type === 'number' || type === 'integer' || type === 'int') {
      payload[field.source_field] = 0;
    } else if (type === 'boolean' || type === 'bool') {
      payload[field.source_field] = false;
    } else if (type === 'datetime' || type === 'date') {
      payload[field.source_field] = new Date().toISOString();
    } else {
      payload[field.source_field] = 'value';
    }
  }
  return payload;
}

function defaultSubscribeTopics(deviceId) {
  return [`devices/${deviceId}/data`];
}

router.use(authenticateToken, filterDataByRole, filterDeviceData);

router.get('/status', authorizeMenuAccess('/mqtt-config', 'read'), async (req, res) => {
  try {
    const global = await getGlobalSettings();
    res.json({
      connected: Boolean(mqttService?.isConnected),
      brokerUrl: process.env.MQTT_BROKER_URL || '',
      subscribedTopics: mqttService?.subscribedTopics ? mqttService.subscribedTopics.size : 0,
      globalSubscribePatterns: global.effective_patterns,
      globalSettings: global,
      ingestOptions: {
        device_id_sources: DEVICE_ID_SOURCES,
        validation_modes: VALIDATION_MODES,
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load MQTT status', code: 'MQTT_CONFIG_STATUS_ERROR' });
  }
});

router.get('/global', authorizeMenuAccess('/mqtt-config', 'read'), async (req, res) => {
  try {
    const settings = await getGlobalSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load global MQTT settings', code: 'MQTT_GLOBAL_GET_ERROR' });
  }
});

router.put('/global', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { error, value } = globalSettingsSchema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
    }
    const settings = await updateGlobalSettings(value, req.user?.user_id);
    res.json({ success: true, ...settings });
  } catch (e) {
    console.error('mqtt-config global save error:', e);
    res.status(500).json({ error: 'Failed to save global MQTT settings', code: 'MQTT_GLOBAL_SAVE_ERROR' });
  }
});

router.get('/devices', authorizeMenuAccess('/mqtt-config', 'read'), async (req, res) => {
  try {
    const allowed = getEffectiveAllowedDeviceIds(req);
    let rows;
    if (allowed === null) {
      rows = await getRows(
        `SELECT device_id, name, protocol, config, status
         FROM devices
         WHERE protocol = 'mqtt' AND COALESCE(is_deleted, false) = false
         ORDER BY name NULLS LAST, device_id`
      );
    } else if (!allowed.length) {
      rows = [];
    } else {
      rows = await getRows(
        `SELECT device_id, name, protocol, config, status
         FROM devices
         WHERE protocol = 'mqtt' AND COALESCE(is_deleted, false) = false
           AND device_id = ANY($1::text[])
         ORDER BY name NULLS LAST, device_id`,
        [allowed]
      );
    }

    const devices = rows.map((row) => {
      const cfg = parseDeviceConfig(row.config);
      const topics = Array.isArray(cfg.topics) && cfg.topics.length
        ? cfg.topics
        : defaultSubscribeTopics(row.device_id);
      return {
        device_id: row.device_id,
        name: row.name,
        status: row.status,
        subscribe_topics: topics,
        publish_topic: buildPublishTopic(cfg.mqtt_publish),
        has_publish_config: Boolean(cfg.mqtt_publish?.project_code),
        has_ingest_rules: Boolean(cfg.mqtt_ingest && Object.keys(cfg.mqtt_ingest).length),
      };
    });

    res.json({ devices, count: devices.length });
  } catch (e) {
    console.error('mqtt-config list devices error:', e);
    res.status(500).json({ error: 'Failed to list MQTT devices', code: 'MQTT_CONFIG_LIST_ERROR' });
  }
});

router.get('/devices/:deviceId', authorizeMenuAccess('/mqtt-config', 'read'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!requireDeviceAccess(req, res, deviceId)) return;

    const device = await getRow(
      `SELECT device_id, name, protocol, config
       FROM devices
       WHERE device_id = $1 AND COALESCE(is_deleted, false) = false`,
      [deviceId]
    );
    if (!device) {
      return res.status(404).json({ error: 'Device not found', code: 'NOT_FOUND' });
    }
    if (device.protocol !== 'mqtt') {
      return res.status(400).json({ error: 'Device is not an MQTT device', code: 'NOT_MQTT_DEVICE' });
    }

    const cfg = parseDeviceConfig(device.config);
    const subscribeTopics = Array.isArray(cfg.topics) && cfg.topics.length
      ? cfg.topics
      : defaultSubscribeTopics(deviceId);
    const mqttIngest = normalizeMqttIngestConfig(cfg.mqtt_ingest);

    const assignment = await getRow(
      `SELECT dma.device_id, dma.template_id, mt.template_name, mt.mappings
       FROM device_mapper_assignments dma
       LEFT JOIN mapper_templates mt ON dma.template_id = mt.template_id
       WHERE dma.device_id = $1`,
      [deviceId]
    );

    const payloadFields = assignment ? extractPayloadFields(assignment.mappings) : [];
    const examplePayload = buildExamplePayload(payloadFields);
    const sparingTopic = buildPublishTopic(cfg.mqtt_publish);
    const global = await getGlobalSettings();

    res.json({
      device_id: device.device_id,
      name: device.name,
      subscribe_topics: subscribeTopics,
      default_subscribe_topic: defaultSubscribeTopics(deviceId)[0],
      mqtt_publish: cfg.mqtt_publish || null,
      mqtt_ingest: mqttIngest,
      publish_topic: sparingTopic,
      suggested_sparing_subscribe_topic: sparingTopic,
      mapper: assignment
        ? {
            template_id: assignment.template_id,
            template_name: assignment.template_name,
          }
        : null,
      payload_fields: payloadFields,
      example_payload: examplePayload,
      globalSubscribePatterns: global.effective_patterns,
      ingestOptions: {
        device_id_sources: DEVICE_ID_SOURCES,
        validation_modes: VALIDATION_MODES,
      },
    });
  } catch (e) {
    console.error('mqtt-config get device error:', e);
    res.status(500).json({ error: 'Failed to load MQTT device config', code: 'MQTT_CONFIG_GET_ERROR' });
  }
});

router.put('/devices/:deviceId', authorizeMenuAccess('/mqtt-config', 'update'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!requireDeviceAccess(req, res, deviceId)) return;

    const { error, value } = saveConfigSchema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
    }

    const device = await getRow(
      'SELECT device_id, protocol, config FROM devices WHERE device_id = $1 AND COALESCE(is_deleted, false) = false',
      [deviceId]
    );
    if (!device) {
      return res.status(404).json({ error: 'Device not found', code: 'NOT_FOUND' });
    }
    if (device.protocol !== 'mqtt') {
      return res.status(400).json({ error: 'Device is not an MQTT device', code: 'NOT_MQTT_DEVICE' });
    }

    const existing = parseDeviceConfig(device.config);
    const next = {
      ...existing,
      topics: value.subscribe_topics,
    };
    if (value.mqtt_publish !== undefined) {
      if (value.mqtt_publish === null) {
        delete next.mqtt_publish;
      } else {
        next.mqtt_publish = value.mqtt_publish;
      }
    }
    if (value.mqtt_ingest !== undefined) {
      if (value.mqtt_ingest === null) {
        delete next.mqtt_ingest;
      } else {
        next.mqtt_ingest = normalizeMqttIngestConfig(value.mqtt_ingest);
      }
    }

    await query('UPDATE devices SET config = $1::jsonb, updated_at = NOW() WHERE device_id = $2', [
      JSON.stringify(next),
      deviceId,
    ]);

    if (mqttService?.subscribeToDevice) {
      await mqttService.subscribeToDevice(deviceId, next);
    }

    res.json({
      success: true,
      device_id: deviceId,
      subscribe_topics: next.topics,
      mqtt_publish: next.mqtt_publish || null,
      mqtt_ingest: next.mqtt_ingest || normalizeMqttIngestConfig(null),
      publish_topic: buildPublishTopic(next.mqtt_publish),
    });
  } catch (e) {
    console.error('mqtt-config save device error:', e);
    res.status(500).json({ error: 'Failed to save MQTT device config', code: 'MQTT_CONFIG_SAVE_ERROR' });
  }
});

module.exports = router;
