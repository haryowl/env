const mqtt = require('mqtt');
const { getRow, query } = require('../config/database');
const { processDeviceData } = require('./deviceMapper');
const {
  getMqttIngestFromDeviceConfig,
  resolveDeviceId,
  prepareIngestPayload,
  validatePayload,
} = require('../utils/mqttIngest');
const { mergeObservedPayloadFields } = require('../utils/payloadFieldDiscovery');
const { normalizeDatetimeToUtc } = require('../utils/deviceTimezone');
const { evaluateThresholdAlertsOnData } = require('./alertEvaluationService');
const bufferDataConfig = require('../config/bufferDataConfig');

const MQTT_DEBUG = process.env.MQTT_DEBUG === 'true';
const PAYLOAD_FIELDS_CACHE_MS = 60_000;

class MQTTService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.subscribedTopics = new Set();
    this.globalSubscribePatterns = new Set();
    this.deviceConnections = new Map();
    this.reconnectAttempts = 0;
    // Never give up reconnecting — a hard cap left the process "up" but ingest dead for hours.
    this.reconnectIntervalMs = Math.max(
      1000,
      parseInt(process.env.MQTT_RECONNECT_MS, 10) || 5000
    );
    this.reconnectMaxDelayMs = Math.max(
      this.reconnectIntervalMs,
      parseInt(process.env.MQTT_RECONNECT_MAX_MS, 10) || 60000
    );
    this._reconnectTimer = null;
    this._watchdogTimer = null;
    this.isShuttingDown = false;
    this.ingestQueue = [];
    this.ingestActive = 0;
    this.maxIngestConcurrency = Math.max(
      1,
      parseInt(process.env.MQTT_INGEST_CONCURRENCY, 10) || 4
    );
    this.maxIngestQueue = Math.max(
      100,
      parseInt(process.env.MQTT_INGEST_QUEUE_MAX, 10) || 5000
    );
    this.droppedIngestMessages = 0;
    this.lastMessageAt = null;
    this.lastIngestOkAt = null;
    this.connectedAt = null;
    this.payloadFieldsCache = new Map();
    this.lastStatusUpdateAt = new Map();
    this.statusUpdateThrottleMs = Math.max(
      5000,
      parseInt(process.env.MQTT_STATUS_THROTTLE_MS, 10) || 30000
    );
    this.subscribeQos = Math.min(
      2,
      Math.max(0, parseInt(process.env.MQTT_SUBSCRIBE_QOS, 10) || 1)
    );
    this.handleMessage = this.handleMessage.bind(this);
  }

  logDebug(...args) {
    if (MQTT_DEBUG) console.log(...args);
  }

  enqueueIngest(topic, message) {
    this.lastMessageAt = new Date().toISOString();
    if (this.ingestQueue.length >= this.maxIngestQueue) {
      this.droppedIngestMessages += 1;
      if (this.droppedIngestMessages === 1 || this.droppedIngestMessages % 100 === 0) {
        console.warn(
          `MQTT ingest queue full (${this.maxIngestQueue}); dropped ${this.droppedIngestMessages} message(s) — data permanently lost`
        );
      }
      return;
    }
    // Copy buffer — mqtt.js may reuse the message buffer for the next packet
    const payload =
      Buffer.isBuffer(message) ? Buffer.from(message) : Buffer.from(String(message ?? ''), 'utf8');
    this.ingestQueue.push({ topic, message: payload });
    this.drainIngestQueue();
  }

  drainIngestQueue() {
    while (this.ingestActive < this.maxIngestConcurrency && this.ingestQueue.length > 0) {
      const { topic, message } = this.ingestQueue.shift();
      this.ingestActive += 1;
      this.handleMessage(topic, message)
        .catch((error) => {
          console.error('MQTT ingest job failed:', error);
        })
        .finally(() => {
          this.ingestActive -= 1;
          this.drainIngestQueue();
        });
    }
  }

  publish(topic, payload, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.client || !this.isConnected) {
          return reject(new Error('MQTT client is not connected'));
        }
        if (!topic || typeof topic !== 'string') {
          return reject(new Error('Invalid topic'));
        }
        const { qos = 1, retain = false } = options || {};
        this.client.publish(topic, payload, { qos, retain }, (err) => {
          if (err) return reject(err);
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async publishJSON(topic, obj, options = {}) {
    const payload = Buffer.from(JSON.stringify(obj));
    await this.publish(topic, payload, options);
  }

  async connect() {
    // Skip MQTT connection in development if MQTT_BROKER_URL is not set
    if (process.env.NODE_ENV === 'development' && (!process.env.MQTT_BROKER_URL || process.env.MQTT_BROKER_URL.trim() === '')) {
      console.log('MQTT broker URL not configured. Skipping MQTT connection in development mode.');
      console.log('To enable MQTT, set MQTT_BROKER_URL in your environment variables.');
      console.log('Options:');
      console.log('  - Install local Mosquitto broker');
      console.log('  - Use public broker: mqtt://test.mosquitto.org:1883');
      console.log('  - Use HiveMQ: mqtt://broker.hivemq.com:1883');
      return;
    }

    try {
      console.log('Connecting to MQTT broker...');
      console.log('MQTT_BROKER_URL:', process.env.MQTT_BROKER_URL);

      // Tear down previous client so reconnect does not leak sockets/handlers
      if (this.client) {
        try {
          this.client.removeAllListeners();
          this.client.end(true);
        } catch (e) {
          console.warn('MQTT: error ending previous client:', e?.message || e);
        }
        this.client = null;
      }

      const stableClientId = (process.env.MQTT_CLIENT_ID || '').trim();
      const usePersistentSession = Boolean(stableClientId);
      const options = {
        // Stable ID + clean:false lets the broker queue QoS1 messages while we are briefly offline
        clientId: stableClientId || `monitoring_server_${Date.now()}`,
        clean: !usePersistentSession,
        reconnectPeriod: 0, // We'll handle reconnection manually (infinite backoff)
        connectTimeout: 30000,
        username: process.env.MQTT_USERNAME || undefined,
        password: process.env.MQTT_PASSWORD || undefined,
        rejectUnauthorized: false
      };

      this.client = mqtt.connect(process.env.MQTT_BROKER_URL, options);

      this.client.on('connect', () => {
        console.log('Connected to MQTT broker');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.connectedAt = new Date().toISOString();
        if (this._reconnectTimer) {
          clearTimeout(this._reconnectTimer);
          this._reconnectTimer = null;
        }
        // Fresh subscribe set after reconnect (clean session clears broker-side subs)
        this.subscribedTopics.clear();
        this.subscribeToAllDevices();
      });

      this.client.on('message', (topic, message) => {
        this.logDebug(`MQTT: message on ${topic}`, message.toString().slice(0, 200));
        this.enqueueIngest(topic, message);
      });

      this.client.on('error', (error) => {
        console.error('MQTT connection error:', error);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.log('MQTT connection closed');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.client.on('offline', () => {
        console.log('MQTT client offline');
        this.isConnected = false;
      });

      this.startReconnectWatchdog();

    } catch (error) {
      console.error('Failed to connect to MQTT broker:', error);
      this.scheduleReconnect();
    }
  }

  /** Keep trying forever if something left us disconnected without a pending timer. */
  startReconnectWatchdog() {
    if (this._watchdogTimer || this.isShuttingDown) return;
    this._watchdogTimer = setInterval(() => {
      if (this.isShuttingDown) return;
      if (this.isConnected) return;
      if (process.env.NODE_ENV === 'development' && (!process.env.MQTT_BROKER_URL || process.env.MQTT_BROKER_URL.trim() === '')) {
        return;
      }
      if (!this._reconnectTimer) {
        console.warn('MQTT watchdog: disconnected with no pending reconnect — scheduling now');
        this.scheduleReconnect();
      }
    }, 30000);
    if (typeof this._watchdogTimer.unref === 'function') {
      this._watchdogTimer.unref();
    }
  }

  scheduleReconnect() {
    // Don't reconnect if MQTT is disabled in development or if shutting down
    if (this.isShuttingDown || (process.env.NODE_ENV === 'development' && (!process.env.MQTT_BROKER_URL || process.env.MQTT_BROKER_URL.trim() === ''))) {
      return;
    }

    if (this.isConnected) return;
    if (this._reconnectTimer) return; // already scheduled

    this.reconnectAttempts += 1;
    const exp = Math.min(this.reconnectAttempts - 1, 5);
    const delay = Math.min(
      this.reconnectMaxDelayMs,
      this.reconnectIntervalMs * Math.pow(2, exp)
    );

    console.log(
      `Scheduling MQTT reconnection attempt ${this.reconnectAttempts} in ${delay}ms (never gives up)`
    );

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this.isShuttingDown && !this.isConnected) {
        this.connect();
      }
    }, delay);
  }

  async subscribeToAllDevices() {
    try {
      // Don't subscribe if shutting down
      if (this.isShuttingDown) {
        console.log('MQTT: Skipping device subscription during shutdown');
        return;
      }

      // Get all MQTT devices from database
      let devices;
      try {
        devices = await query(
          `SELECT device_id, config FROM devices
           WHERE protocol = $1 AND COALESCE(is_deleted, false) = false`,
          ['mqtt']
        );
      } catch (error) {
        if (error.message.includes('Cannot use a pool after calling end')) {
          console.log('MQTT: Database pool closed, skipping device subscription');
          return;
        }
        throw error;
      }

      console.log(`MQTT: Found ${devices.rows.length} MQTT devices in database`);
      
      for (const device of devices.rows) {
        console.log(`MQTT: Subscribing to device: ${device.device_id}`);
        await this.subscribeToDevice(device.device_id, device.config);
      }

      // Subscribe to global wildcard topics (DB settings or built-in defaults)
      const { getGlobalSettings } = require('./mqttSettingsService');
      const globalSettings = await getGlobalSettings();
      console.log('MQTT: Subscribing to global wildcard topics for device discovery');
      for (const topic of globalSettings.effective_patterns) {
        if (!this.subscribedTopics.has(topic)) {
          this.subscribeToTopic(topic);
          this.subscribedTopics.add(topic);
          this.globalSubscribePatterns.add(topic);
          console.log(`MQTT: Global subscribe: ${topic}`);
        }
      }
      
      console.log('MQTT: All topic subscriptions completed');

    } catch (error) {
      console.error('Failed to subscribe to devices:', error);
    }
  }

  async subscribeToDevice(deviceId, config) {
    try {
      const topics = config.topics || [`devices/${deviceId}/data`];
      
      for (const topic of topics) {
        if (!this.subscribedTopics.has(topic)) {
          this.subscribeToTopic(topic);
          this.subscribedTopics.add(topic);
          console.log(`Subscribed to topic: ${topic}`);
        }
      }

      // Update device status to online
      await this.updateDeviceStatus(deviceId, 'online');

    } catch (error) {
      console.error(`Failed to subscribe to device ${deviceId}:`, error);
    }
  }

  subscribeToTopic(topic) {
    if (this.client && this.isConnected) {
      this.client.subscribe(topic, { qos: this.subscribeQos }, (err) => {
        if (err) {
          console.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`Subscribed to topic: ${topic} (qos=${this.subscribeQos})`);
        }
      });
    }
  }

  unsubscribeFromTopic(topic) {
    if (this.client && this.isConnected) {
      this.client.unsubscribe(topic, (err) => {
        if (err) {
          console.error(`Failed to unsubscribe from ${topic}:`, err);
        } else {
          console.log(`Unsubscribed from topic: ${topic}`);
        }
      });
    }
    this.subscribedTopics.delete(topic);
    this.globalSubscribePatterns.delete(topic);
  }

  async resyncGlobalSubscribePatterns(prevEffective, nextEffective) {
    const prev = prevEffective instanceof Set ? prevEffective : new Set(prevEffective || []);
    const next = nextEffective instanceof Set ? nextEffective : new Set(nextEffective || []);
    for (const topic of prev) {
      if (!next.has(topic)) {
        this.unsubscribeFromTopic(topic);
      }
    }
    for (const topic of next) {
      if (!this.subscribedTopics.has(topic)) {
        this.subscribeToTopic(topic);
        this.subscribedTopics.add(topic);
        this.globalSubscribePatterns.add(topic);
      }
    }
  }

  async getPayloadFieldsForDevice(deviceId) {
    const cached = this.payloadFieldsCache.get(deviceId);
    if (cached && Date.now() - cached.at < PAYLOAD_FIELDS_CACHE_MS) {
      return cached.fields;
    }

    const row = await getRow(
      `SELECT mt.mappings
       FROM device_mapper_assignments dma
       LEFT JOIN mapper_templates mt ON dma.template_id = mt.template_id
       WHERE dma.device_id = $1`,
      [deviceId]
    );
    if (!row?.mappings) return [];
    let mappings = row.mappings;
    if (typeof mappings === 'string') {
      try {
        mappings = JSON.parse(mappings);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(mappings)) return [];
    const fields = mappings
      .filter((m) => m && String(m.source_field || '').trim())
      .map((m) => ({
        source_field: String(m.source_field).trim(),
        target_field: String(m.target_field || '').trim(),
        data_type: String(m.data_type || 'string').trim(),
        is_required: Boolean(m.is_required),
      }));
    this.payloadFieldsCache.set(deviceId, { at: Date.now(), fields });
    return fields;
  }

  async runIngestPipeline(device, rawData, { rawPayload = null } = {}) {
    const ingestCfg = getMqttIngestFromDeviceConfig(device.config);
    const { data: flatData, warnings: flattenWarnings } = prepareIngestPayload(rawData, ingestCfg);
    for (const w of flattenWarnings) {
      console.warn(`MQTT ingest (${device.device_id}): ${w}`);
    }

    if (ingestCfg.validation_mode !== 'off') {
      const payloadFields = await this.getPayloadFieldsForDevice(device.device_id);
      const validation = validatePayload(flatData, payloadFields, ingestCfg.validation_mode);
      for (const w of validation.warnings) {
        console.warn(`MQTT validation warn (${device.device_id}): ${w}`);
      }
      if (!validation.ok) {
        console.warn(`MQTT validation rejected (${device.device_id}):`, validation.errors);
        return null;
      }
    }

    const rawForKeys = rawPayload || rawData;
    await mergeObservedPayloadFields(device.device_id, rawForKeys);

    const processedData = await processDeviceData(device, flatData);
    await this.storeDeviceData(device, processedData, rawForKeys);
    return processedData;
  }

  async handleMessage(topic, message) {
    this.logDebug('handleMessage', topic);
    try {
      // Parse message
      const rawString = message ? message.toString() : '';
      let data;
      try {
        data = JSON.parse(rawString);
      } catch (error) {
        console.error('Failed to parse MQTT message as JSON:', error);
        return;
      }

      const topicDeviceId = this.extractDeviceIdFromTopic(topic);
      let hintIngest = null;
      if (topicDeviceId) {
        const hintDevice = await this.getActiveDevice(topicDeviceId);
        if (hintDevice) {
          hintIngest = getMqttIngestFromDeviceConfig(hintDevice.config);
        }
      }

      const deviceId = resolveDeviceId({ topicDeviceId, data, ingestConfig: hintIngest });
      this.logDebug(`MQTT: device ${deviceId} from topic ${topic}`);
      if (!deviceId) {
        console.error('Could not resolve device ID from topic/payload:', topic);
        return;
      }

      const device = await this.ensureDeviceForIngestion(deviceId, 'mqtt', data, { topics: [topic] });
      if (!device) {
        console.error(`Device ${deviceId}: could not resolve or auto-discover device for ingestion`);
        return;
      }

      const processedData = await this.runIngestPipeline(device, data, { rawPayload: data });
      if (!processedData) {
        return;
      }

      this.lastIngestOkAt = new Date().toISOString();
      await this.updateDeviceStatus(deviceId, 'online');
      // Emit first so UI stays live even if alert/notification HTTP hangs
      this.emitRealTimeData(deviceId, processedData, {
        rawTopic: topic,
        rawString,
        rawPayload: data,
      });
      this.evaluateAlertsWithRealTimeData(deviceId, processedData).catch((err) => {
        console.error('MQTT: background alert evaluation failed:', err?.message || err);
      });

    } catch (error) {
      console.error('Error handling MQTT message:', error);
    }
  }

  extractDeviceIdFromTopic(topic) {
    // Extract device ID from various topic patterns (order can matter for overlapping patterns)
    const patterns = [
      /^devices\/(.+)\/data$/,
      /^device\/(.+)\/data$/,             // singular
      /^sensors\/(.+)\/reading$/,
      /^gps\/(.+)\/location$/,
      /^data\/sparing\/sparing\/(.+)$/,
      /^data\/.+\/.+\/(.+)$/,
      /^data\/.+\/(.+)$/,                 // data/<x>/<id>
      /^telemetry\/(.+)$/,                // telemetry/<id>
      /^(.+)\/data$/,                     // <id>/data
      /^(.+)\/telemetry$/,
      /^(.+)\/state$/,
      /^(.+)\/message$/,
      /^(.+)\/sensor$/,
      /^(.+)\/gps$/
    ];

    for (const pattern of patterns) {
      const match = topic.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  async createNewDevice(deviceId, topic, data) {
    return this.createDeviceFromIngestion(deviceId, 'mqtt', data, { topics: [topic] });
  }

  /** Active device only — soft-deleted rows are ignored so they can be re-discovered. */
  async getActiveDevice(deviceId) {
    return getRow(
      'SELECT * FROM devices WHERE device_id = $1 AND COALESCE(is_deleted, false) = false',
      [deviceId]
    );
  }

  buildAutoDiscoveryFields(deviceId, protocol, data, extraConfig = {}) {
    const deviceType = this.determineDeviceType(data);
    const config = protocol === 'mqtt' ? extraConfig : { source: 'http', ...extraConfig };
    const name = `Auto-discovered ${deviceType} (${protocol})`;
    return { deviceType, config, name, configJson: JSON.stringify(config) };
  }

  /** Re-activate a soft-deleted device (keeps permissions and history links). */
  async resurrectDevice(deviceId, protocol, data, extraConfig = {}) {
    const { deviceType, name, configJson } = this.buildAutoDiscoveryFields(deviceId, protocol, data, extraConfig);
    const result = await query(
      `UPDATE devices SET
         is_deleted = false,
         status = 'online',
         name = $1,
         device_type = $2,
         protocol = $3,
         config = $4::jsonb,
         last_seen = NOW(),
         updated_at = NOW()
       WHERE device_id = $5
       RETURNING *`,
      [name, deviceType, protocol, configJson, deviceId]
    );
    if (result.rows[0]) {
      console.log(`Re-activated deleted device ${deviceId} as auto-discovered`);
    }
    return result.rows[0] || null;
  }

  /**
   * Return active device or auto-discover after delete.
   * @returns {Promise<object|null>}
   */
  async ensureDeviceForIngestion(deviceId, protocol, data, extraConfig = {}) {
    let device = await this.getActiveDevice(deviceId);
    if (device) return device;

    const existing = await getRow('SELECT device_id FROM devices WHERE device_id = $1', [deviceId]);
    if (existing) {
      console.log(`Device ${deviceId} was deleted from the list; re-activating`);
      device = await this.resurrectDevice(deviceId, protocol, data, extraConfig);
    } else {
      console.log(`Device ${deviceId} not in database, auto-discovering`);
      device = await this.createDeviceFromIngestion(deviceId, protocol, data, extraConfig);
    }

    if (!device) {
      console.error(`Failed to auto-discover device ${deviceId}`);
      return null;
    }

    if (protocol === 'mqtt') {
      let config = device.config;
      if (typeof config === 'string') {
        try {
          config = JSON.parse(config);
        } catch {
          config = {};
        }
      }
      const merged = { ...(config || {}), ...extraConfig };
      if (!merged.topics?.length) {
        merged.topics = [`devices/${deviceId}/data`];
      }
      await this.subscribeToDevice(deviceId, merged);
    }

    return device;
  }

  async createDeviceFromIngestion(deviceId, protocol, data, extraConfig = {}) {
    const { deviceType, name, configJson } = this.buildAutoDiscoveryFields(deviceId, protocol, data, extraConfig);
    const result = await query(
      `INSERT INTO devices (device_id, device_type, protocol, name, config, status, is_deleted, timezone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'online', false, 'UTC', NOW(), NOW())
       ON CONFLICT (device_id) DO UPDATE SET
         device_type = EXCLUDED.device_type,
         protocol = EXCLUDED.protocol,
         name = EXCLUDED.name,
         config = EXCLUDED.config,
         status = 'online',
         is_deleted = false,
         last_seen = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [deviceId, deviceType, protocol, name, configJson]
    );
    console.log(`Created new device: ${deviceId} (${deviceType}, ${protocol})`);
    return result.rows[0];
  }

  /**
   * Ingest device data from HTTP or other non-MQTT source. Same pipeline as MQTT: process, store, alerts, emit.
   * @param {string} deviceId - Device ID
   * @param {object} data - JSON payload (datetime, sensor fields, etc.)
   * @param {string} source - 'http' | 'mqtt' (for auto-create)
   */
  async ingestData(deviceId, data, source = 'http') {
    const device = await this.ensureDeviceForIngestion(deviceId, source, data);
    if (!device) {
      throw new Error('Failed to create device');
    }
    const processedData = await this.runIngestPipeline(device, data, { rawPayload: data });
    if (!processedData) {
      throw new Error('Payload validation failed');
    }
    await this.updateDeviceStatus(deviceId, 'online');
    this.emitRealTimeData(deviceId, processedData);
    this.evaluateAlertsWithRealTimeData(deviceId, processedData).catch((err) => {
      console.error('HTTP ingest: background alert evaluation failed:', err?.message || err);
    });
    this.lastIngestOkAt = new Date().toISOString();
    return processedData;
  }

  determineDeviceType(data) {
    // Analyze data structure to determine device type
    if (data.latitude !== undefined && data.longitude !== undefined) {
      return 'gps';
    } else if (data.temperature !== undefined || data.humidity !== undefined || data.pressure !== undefined) {
      return 'sensor';
    } else {
      return 'hybrid';
    }
  }

  async storeDeviceData(device, data, rawPayload = null, options = {}) {
    const stats = {
      sensorInserted: 0,
      sensorSkippedDuplicate: 0,
      gpsInserted: 0,
      error: null,
    };
    const extraMetadata =
      options.extraMetadata && typeof options.extraMetadata === 'object'
        ? options.extraMetadata
        : {};

    try {
      const tz = device.timezone || device.effective_timezone || 'UTC';
      // `data` is processed/mapped payload — use mapper target field `datetime` only.
      const mappedDatetime = data?.datetime;
      let deviceTimestamp = new Date();
      let canonicalDatetime = null;

      if (mappedDatetime != null && mappedDatetime !== '') {
        const parsed = new Date(mappedDatetime);
        if (!Number.isNaN(parsed.getTime())) {
          canonicalDatetime =
            typeof mappedDatetime === 'string' ? mappedDatetime : parsed.toISOString();
          deviceTimestamp = parsed;
        } else {
          const normalized = normalizeDatetimeToUtc(mappedDatetime, tz);
          if (normalized) {
            canonicalDatetime = normalized;
            deviceTimestamp = new Date(normalized);
          }
        }
      }
      const serverTimestamp = new Date();
      
      // Validate data freshness and get age information
      const freshnessInfo = this.validateDataFreshness(deviceTimestamp, serverTimestamp, device.device_id);
      this.logDebug('storeDeviceData', device.device_id, freshnessInfo.ageMinutes.toFixed(2), 'min');
      // Use device timestamp for data storage (preserves original timing)
      const timestamp = deviceTimestamp;

      // Extract GPS coordinates from payload (case-insensitive; supports lat/lon/lng aliases).
      const lower = {};
      for (const [k, v] of Object.entries(data || {})) {
        lower[String(k).toLowerCase()] = v;
      }
      const toFiniteNumber = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const gpsLat = toFiniteNumber(lower.latitude ?? lower.lat);
      const gpsLon = toFiniteNumber(lower.longitude ?? lower.lng ?? lower.lon);
      const gpsAltitude = toFiniteNumber(lower.altitude ?? lower.alt);
      const gpsSpeed = toFiniteNumber(lower.speed ?? lower.spd);
      const gpsHeading = toFiniteNumber(lower.heading ?? lower.hdg);
      const gpsAccuracy = toFiniteNumber(lower.accuracy ?? lower.acc);
      const gpsSatellites = toFiniteNumber(lower.satellites ?? lower.sat);

      if (device.device_type === 'gps' || (gpsLat !== null && gpsLon !== null)) {
        await query(
          `
          INSERT INTO gps_tracks (device_id, latitude, longitude, altitude, speed, heading, timestamp, accuracy, satellites, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
          [
            device.device_id,
            gpsLat,
            gpsLon,
            gpsAltitude,
            gpsSpeed,
            gpsHeading,
            timestamp,
            gpsAccuracy,
            gpsSatellites,
            JSON.stringify({ ...(data.metadata || {}), ...extraMetadata }),
          ]
        );
        stats.gpsInserted += 1;
      }

      // Store sensor data - handle both standard and custom fields
      const sensorFields = [
        'temperature', 'humidity', 'pressure', 'voltage', 'current', 'power', 'rssi',
        'TSS', 'COD', 'PH', 'Debit', // User's specific sensor fields
        'Dummy_ShowPH', 'Dummy_ShowCOD', 'Dummy_ShowTSS' // New fields from device
      ];
      
      // Store all fields from the payload as individual sensor readings
      for (const [field, value] of Object.entries(data)) {
        // Skip metadata fields, mapped datetime, and null/undefined values
        if (
          field === 'metadata' ||
          field === 'datetime' ||
          value === null ||
          value === undefined
        ) {
          continue;
        }
        
        const fieldLower = String(field).toLowerCase();
        if (['latitude', 'longitude', 'lat', 'lon', 'lng', 'altitude', 'alt', 'speed', 'spd', 'heading', 'hdg', 'accuracy', 'acc', 'satellites', 'sat'].includes(fieldLower)) {
          continue;
        }

        let numericValue = value;
        if (typeof value === 'string' && value.trim() !== '') {
          const parsedValue = Number(value);
          if (!isNaN(parsedValue)) {
            numericValue = parsedValue;
          }
        }
        
        const readingMetadata = {
          ...data.metadata,
          ...extraMetadata,
          datetime: canonicalDatetime,
          _terminalTime: data._terminalTime,
          _groupName: data._groupName,
          payload: data,
          dataAgeMinutes: freshnessInfo.ageMinutes,
          dataAgeHours: freshnessInfo.ageHours,
          dataAgeDays: freshnessInfo.ageDays,
          isBufferedData: freshnessInfo.isBuffered,
          isOldData: freshnessInfo.isOld,
          isVeryOldData: freshnessInfo.isVeryOld,
          serverReceivedAt: serverTimestamp.toISOString(),
        };

        // Only insert if value is a valid number (including 0)
        if (typeof numericValue === 'number' && !isNaN(numericValue)) {
          // Check for duplicate data to avoid flooding database
          const isDuplicate = await this.checkForDuplicate(device.device_id, field, numericValue, timestamp);
          
          if (isDuplicate) {
            stats.sensorSkippedDuplicate += 1;
            continue;
          }

          await query(`
            INSERT INTO sensor_readings (device_id, sensor_type, value, unit, timestamp, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            device.device_id,
            field,
            numericValue,
            data[`${field}_unit`] || null,
            timestamp,
            JSON.stringify(readingMetadata),
          ]);
          stats.sensorInserted += 1;
        } else if (typeof value === 'string' && value.trim() !== '') {
          const stringValue = value.trim();
          const isDuplicate = await this.checkForDuplicateString(
            device.device_id,
            field,
            stringValue,
            timestamp
          );

          if (isDuplicate) {
            stats.sensorSkippedDuplicate += 1;
            continue;
          }

          await query(`
            INSERT INTO sensor_readings (device_id, sensor_type, value, unit, timestamp, metadata)
            VALUES ($1, $2, NULL, $3, $4, $5)
          `, [
            device.device_id,
            field,
            data[`${field}_unit`] || null,
            timestamp,
            JSON.stringify({ ...readingMetadata, string_value: stringValue }),
          ]);
          stats.sensorInserted += 1;
        }
      }

      return stats;
    } catch (error) {
      console.error('Failed to store device data:', error);
      stats.error = error?.message || String(error);
      return stats;
    }
  }

  async updateDeviceStatus(deviceId, status) {
    try {
      const now = Date.now();
      const last = this.lastStatusUpdateAt.get(deviceId) || 0;
      if (now - last < this.statusUpdateThrottleMs) {
        return;
      }
      this.lastStatusUpdateAt.set(deviceId, now);

      await query(
        'UPDATE devices SET status = $1, last_seen = NOW(), is_deleted = false WHERE device_id = $2',
        [status, deviceId]
      );
    } catch (error) {
      console.error('Failed to update device status:', error);
    }
  }

  async checkForDuplicateString(deviceId, sensorType, stringValue, timestamp) {
    try {
      if (!bufferDataConfig.duplicateDetection.ENABLED) {
        return false;
      }

      const DUPLICATE_WINDOW_SECONDS = bufferDataConfig.duplicateDetection.WINDOW_SECONDS;

      const existing = await query(
        `
        SELECT id FROM sensor_readings
        WHERE device_id = $1
          AND sensor_type = $2
          AND metadata->>'string_value' = $3
          AND timestamp BETWEEN $4 AND $5
        LIMIT 1
      `,
        [
          deviceId,
          sensorType,
          stringValue,
          new Date(timestamp.getTime() - DUPLICATE_WINDOW_SECONDS * 1000),
          new Date(timestamp.getTime() + DUPLICATE_WINDOW_SECONDS * 1000),
        ]
      );

      return existing.rows.length > 0;
    } catch (error) {
      console.error('Error checking for duplicate string data:', error);
      return false;
    }
  }

  // Check for duplicate data within a time window
  async checkForDuplicate(deviceId, sensorType, value, timestamp) {
    try {
      if (!bufferDataConfig.duplicateDetection.ENABLED) {
        return false; // Skip duplicate check if disabled
      }

      const DUPLICATE_WINDOW_SECONDS = bufferDataConfig.duplicateDetection.WINDOW_SECONDS;
      
      const existing = await query(`
        SELECT id FROM sensor_readings 
        WHERE device_id = $1 
        AND sensor_type = $2 
        AND value = $3
        AND timestamp BETWEEN $4 AND $5
        LIMIT 1
      `, [
        deviceId,
        sensorType,
        value,
        new Date(timestamp.getTime() - DUPLICATE_WINDOW_SECONDS * 1000),
        new Date(timestamp.getTime() + DUPLICATE_WINDOW_SECONDS * 1000)
      ]);
      
      return existing.rows.length > 0;
    } catch (error) {
      console.error('Error checking for duplicate data:', error);
      return false; // Allow insertion if check fails
    }
  }

  // Validate data freshness (accept all data but log warnings for very old data)
  validateDataFreshness(deviceTimestamp, serverTimestamp, deviceId) {
    if (!bufferDataConfig.validation.ENABLED) {
      return {
        ageMinutes: 0,
        ageHours: 0,
        ageDays: 0,
        isBuffered: false,
        isOld: false,
        isVeryOld: false
      };
    }

    const dataAgeMinutes = Math.abs(serverTimestamp - deviceTimestamp) / (1000 * 60);
    const dataAgeHours = dataAgeMinutes / 60;
    const dataAgeDays = dataAgeHours / 24;
    
    const isBuffered = dataAgeMinutes > bufferDataConfig.thresholds.BUFFERED_DATA_MINUTES;
    const isOld = dataAgeHours > bufferDataConfig.thresholds.OLD_DATA_HOURS;
    const isVeryOld = dataAgeDays > bufferDataConfig.thresholds.VERY_OLD_DATA_DAYS;
    const isFuture = deviceTimestamp > serverTimestamp && dataAgeMinutes > bufferDataConfig.thresholds.FUTURE_DATA_MINUTES;
    
    // Log warnings based on configuration
    if (bufferDataConfig.logging.ENABLED) {
      if (isVeryOld && bufferDataConfig.logging.LOG_VERY_OLD_DATA) {
        console.warn(`⚠️ VERY OLD DATA: Device ${deviceId} sent data ${dataAgeDays.toFixed(1)} days old`);
      } else if (isOld && bufferDataConfig.logging.LOG_OLD_DATA) {
        console.warn(`⚠️ OLD DATA: Device ${deviceId} sent data ${dataAgeHours.toFixed(1)} hours old`);
      } else if (isBuffered && bufferDataConfig.logging.LOG_BUFFERED_DATA) {
        console.log(`📦 BUFFERED DATA: Device ${deviceId} sent data ${dataAgeMinutes.toFixed(1)} minutes old`);
      }
      
      if (isFuture && bufferDataConfig.logging.LOG_FUTURE_DATA) {
        console.warn(`🔮 FUTURE DATA: Device ${deviceId} sent data ${dataAgeMinutes.toFixed(1)} minutes in the future`);
      }
      
      if (bufferDataConfig.logging.LOG_DATA_AGE && MQTT_DEBUG) {
        console.log(`📊 Data age: ${dataAgeMinutes.toFixed(2)} minutes (${isBuffered ? 'buffered' : 'real-time'})`);
      }
    }
    
    return {
      ageMinutes: dataAgeMinutes,
      ageHours: dataAgeHours,
      ageDays: dataAgeDays,
      isBuffered,
      isOld,
      isVeryOld,
      isFuture
    };
  }

  emitRealTimeData(deviceId, data, meta = {}) {
    try {
      const { emitToDevice, emitToRoom } = require('../socket');
      const { rawTopic = null, rawString = null, rawPayload = null } = meta;
      const devicePayload = {
        deviceId,
        data,
        timestamp: new Date(),
      };

      // Real size = byte length of the exact message received from the broker.
      const rawSize = typeof rawString === 'string'
        ? Buffer.byteLength(rawString, 'utf8')
        : JSON.stringify(data).length;

      const listenerData = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        protocol: 'mqtt',
        // Actual topic the broker delivered on (falls back to legacy synthetic value).
        topic: rawTopic || `data/sparing/sparing/${deviceId}`,
        client_id: deviceId,
        // Processed/mapped payload (kept for backward compatibility with the UI).
        payload: data,
        // Exact JSON the device sent, before mapping/flattening/formulas.
        raw_payload: rawPayload,
        raw_string: rawString,
        source_ip: 'mqtt_broker',
        port: 1883,
        size: rawSize,
        device_id: deviceId,
      };

      emitToDevice(deviceId, 'device_data', devicePayload);
      emitToDevice(deviceId, 'listener_data', listenerData);
      emitToRoom('listeners_feed', 'listener_data', listenerData);
    } catch (error) {
      console.error('MQTT: Failed to emit real-time data:', error);
    }
  }

  publishMessage(topic, message, options = {}) {
    if (this.client && this.isConnected) {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      this.client.publish(topic, payload, options, (err) => {
        if (err) {
          console.error(`Failed to publish to ${topic}:`, err);
        } else {
          console.log(`Published to topic: ${topic}`);
        }
      });
    } else {
      console.error('MQTT client not connected');
    }
  }

  async disconnect() {
    try {
      this.isShuttingDown = true; // Set shutdown flag
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
      if (this._watchdogTimer) {
        clearInterval(this._watchdogTimer);
        this._watchdogTimer = null;
      }

      if (this.client) {
        this.client.removeAllListeners();
        this.client.end(true);
        this.client = null;
      }
      this.isConnected = false;
      console.log('MQTT client disconnected');
    } catch (error) {
      console.error('Error disconnecting MQTT client:', error);
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      subscribedTopics: Array.from(this.subscribedTopics),
      ingestQueueDepth: this.ingestQueue.length,
      ingestActive: this.ingestActive,
      maxIngestQueue: this.maxIngestQueue,
      maxIngestConcurrency: this.maxIngestConcurrency,
      droppedIngestMessages: this.droppedIngestMessages,
      lastMessageAt: this.lastMessageAt,
      lastIngestOkAt: this.lastIngestOkAt,
      connectedAt: this.connectedAt,
    };
  }

  /** Get source field name for a given target parameter from device mapper (for alert lookup when data uses source keys) */
  async getSourceFieldForParameter(deviceId, targetParameter) {
    const row = await getRow(
      `SELECT mt.mappings FROM device_mapper_assignments dma
       JOIN mapper_templates mt ON dma.template_id = mt.template_id
       WHERE dma.device_id = $1`,
      [deviceId]
    );
    if (!row || !row.mappings) return null;
    const mappings = typeof row.mappings === 'string' ? JSON.parse(row.mappings) : row.mappings;
    const entry = (mappings || []).find(m => (m.target_field || m.target) === targetParameter);
    return entry ? (entry.source_field || entry.source) : null;
  }

  async evaluateAlertsWithRealTimeData(deviceId, processedData) {
    try {
      const readingAt = (() => {
        const mappedDatetime = processedData?.datetime;
        if (mappedDatetime != null && mappedDatetime !== '') {
          const parsed = new Date(mappedDatetime);
          if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        return new Date();
      })();

      const alertsResult = await query(
        `SELECT * FROM alerts
         WHERE type = 'threshold'
           AND (
             device_id = $1
             OR COALESCE(device_ids, ARRAY[]::text[]) @> ARRAY[$1]::text[]
           )`,
        [deviceId]
      );
      const alerts = alertsResult.rows || [];
      if (alerts.length === 0) return;

      const mappingRow = await getRow(
        `SELECT mt.mappings FROM device_mapper_assignments dma
         JOIN mapper_templates mt ON dma.template_id = mt.template_id
         WHERE dma.device_id = $1`,
        [deviceId]
      );
      let mappings = mappingRow?.mappings;
      if (typeof mappings === 'string') {
        try {
          mappings = JSON.parse(mappings);
        } catch {
          mappings = [];
        }
      }
      const sourceByTarget = new Map(
        (Array.isArray(mappings) ? mappings : [])
          .filter((m) => m?.target_field)
          .map((m) => [m.target_field, m.source_field || m.source])
      );

      for (const alert of alerts) {
        let value = processedData[alert.parameter];
        if (value === undefined) {
          const sourceField = sourceByTarget.get(alert.parameter);
          if (sourceField != null) value = processedData[sourceField];
        }

        const numericValue = typeof value === 'string' ? parseFloat(value) : value;
        if (typeof numericValue !== 'number' || Number.isNaN(numericValue)) continue;

        // Always evaluate so in-range readings can resolve active alerts and reset consecutive streaks.
        await evaluateThresholdAlertsOnData(deviceId, alert.parameter, numericValue, readingAt);
      }
    } catch (error) {
      console.error('MQTT: Error evaluating alerts with real-time data:', error);
    }
  }
}

// Create singleton instance
const mqttService = new MQTTService();

module.exports = mqttService; 