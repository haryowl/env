const mqtt = require('mqtt');
const { getRow, query } = require('../config/database');
const { processDeviceData } = require('./deviceMapper');
const { evaluateThresholdAlertsOnData } = require('./alertEvaluationService');
const bufferDataConfig = require('../config/bufferDataConfig');

class MQTTService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.subscribedTopics = new Set();
    this.deviceConnections = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectInterval = 5000; // 5 seconds
    this.isShuttingDown = false; // Add shutdown flag
    // Explicitly bind handleMessage to this instance
    this.handleMessage = this.handleMessage.bind(this);
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
      
      const options = {
        clientId: process.env.MQTT_CLIENT_ID || `monitoring_server_${Date.now()}`,
        clean: true,
        reconnectPeriod: 0, // We'll handle reconnection manually
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
        this.subscribeToAllDevices();
      });

      this.client.on('message', (topic, message) => {
        console.log(`MQTT: Raw message received on topic: ${topic}`);
        console.log(`MQTT: Message content: ${message.toString()}`);
        // Defensive: ensure handleMessage is called if defined
        if (typeof this.handleMessage === 'function') {
          this.handleMessage(topic, message);
        } else {
          console.error('handleMessage is not a function!', this.handleMessage);
        }
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

    } catch (error) {
      console.error('Failed to connect to MQTT broker:', error);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    // Don't reconnect if MQTT is disabled in development or if shutting down
    if (this.isShuttingDown || (process.env.NODE_ENV === 'development' && (!process.env.MQTT_BROKER_URL || process.env.MQTT_BROKER_URL.trim() === ''))) {
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Scheduling MQTT reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectInterval}ms`);
      
      setTimeout(() => {
        if (!this.isShuttingDown) {
          this.connect();
        }
      }, this.reconnectInterval);
    } else {
      console.error('Max MQTT reconnection attempts reached');
      console.log('MQTT service will remain offline. Restart the server to retry connection.');
    }
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
          'SELECT device_id, config FROM devices WHERE protocol = $1 AND status != $2',
          ['mqtt', 'deleted']
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

      // Subscribe to wildcard topics for dynamic device discovery
      console.log('MQTT: Subscribing to wildcard topics for device discovery');
      this.subscribeToTopic('devices/+/data');
      this.subscribeToTopic('sensors/+/reading');
      this.subscribeToTopic('gps/+/location');
      
      // Subscribe to user's specific topic pattern
      console.log('MQTT: Subscribing to user-specific topic patterns');
      this.subscribeToTopic('data/sparing/sparing/+');
      this.subscribeToTopic('data/+/+/+');
      
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
      this.client.subscribe(topic, (err) => {
        if (err) {
          console.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`Subscribed to topic: ${topic}`);
        }
      });
    }
  }

  async handleMessage(topic, message) {
    console.log('handleMessage called', topic);
    try {
      console.log(`Received message on topic: ${topic}`);
      
      // Parse message
      let data;
      try {
        data = JSON.parse(message.toString());
      } catch (error) {
        console.error('Failed to parse MQTT message as JSON:', error);
        return;
      }

      // Extract device ID from topic
      const deviceId = this.extractDeviceIdFromTopic(topic);
      console.log(`MQTT: Extracted device ID: ${deviceId} from topic: ${topic}`);
      if (!deviceId) {
        console.error('Could not extract device ID from topic:', topic);
        return;
      }

      // Get device configuration
      const device = await getRow(
        'SELECT * FROM devices WHERE device_id = $1',
        [deviceId]
      );

      if (!device) {
        console.log(`Device ${deviceId} not found in database, creating new device`);
        await this.createNewDevice(deviceId, topic, data);
        return;
      }

      // Process data through device mapper
      const processedData = await processDeviceData(device, data);
      console.log('MQTT: Processed data:', processedData);
      
      // Store data in database
      await this.storeDeviceData(device, processedData);

      // Update device status
      await this.updateDeviceStatus(deviceId, 'online');

      // Evaluate alerts immediately with real-time data
      console.log('MQTT: About to evaluate alerts with real-time data...');
      await this.evaluateAlertsWithRealTimeData(deviceId, processedData);
      console.log('MQTT: Finished evaluating alerts with real-time data.');

      // Emit real-time data to connected clients
      this.emitRealTimeData(deviceId, processedData);

    } catch (error) {
      console.error('Error handling MQTT message:', error);
    }
  }

  extractDeviceIdFromTopic(topic) {
    // Extract device ID from various topic patterns
    const patterns = [
      /^devices\/(.+)\/data$/,
      /^sensors\/(.+)\/reading$/,
      /^gps\/(.+)\/location$/,
      /^data\/sparing\/sparing\/(.+)$/,  // User's specific pattern
      /^data\/.+\/.+\/(.+)$/,            // Generic data pattern
      /^(.+)\/data$/,
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
    try {
      // Determine device type based on data structure
      const deviceType = this.determineDeviceType(data);
      
      // Create new device record
      await query(`
        INSERT INTO devices (device_id, device_type, protocol, name, config, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        deviceId,
        deviceType,
        'mqtt',
        `Auto-discovered ${deviceType}`,
        JSON.stringify({ topics: [topic] }),
        'online'
      ]);

      console.log(`Created new device: ${deviceId} (${deviceType})`);

    } catch (error) {
      console.error('Failed to create new device:', error);
    }
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

  async storeDeviceData(device, data) {
    try {
      console.log('storeDeviceData: data received for storage:', data);
      
      // Get device timestamp from data (for buffered data detection)
      const deviceTimestamp = data.datetime ? new Date(data.datetime) : new Date();
      const serverTimestamp = new Date();
      
      // Validate data freshness and get age information
      const freshnessInfo = this.validateDataFreshness(deviceTimestamp, serverTimestamp, device.device_id);
      
      console.log('storeDeviceData: Processing data for device', device.device_id);
      console.log('storeDeviceData: Device timestamp:', deviceTimestamp);
      console.log('storeDeviceData: Server timestamp:', serverTimestamp);
      console.log('storeDeviceData: Data age:', freshnessInfo.ageMinutes.toFixed(2), 'minutes');
      console.log('storeDeviceData: Is buffered data:', freshnessInfo.isBuffered);
      
      // Use device timestamp for data storage (preserves original timing)
      const timestamp = deviceTimestamp;
      
      if (device.device_type === 'gps' || (data.latitude && data.longitude)) {
        // Store GPS data
        await query(`
          INSERT INTO gps_tracks (device_id, latitude, longitude, altitude, speed, heading, timestamp, accuracy, satellites, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          device.device_id,
          data.latitude,
          data.longitude,
          data.altitude || null,
          data.speed || null,
          data.heading || null,
          timestamp,
          data.accuracy || null,
          data.satellites || null,
          JSON.stringify(data.metadata || {})
        ]);
      }

      // Store sensor data - handle both standard and custom fields
      const sensorFields = [
        'temperature', 'humidity', 'pressure', 'voltage', 'current', 'power', 'rssi',
        'TSS', 'COD', 'PH', 'Debit', // User's specific sensor fields
        'Dummy_ShowPH', 'Dummy_ShowCOD', 'Dummy_ShowTSS' // New fields from device
      ];
      
      // Store all fields from the payload as individual sensor readings
      for (const [field, value] of Object.entries(data)) {
        // Skip metadata fields and null/undefined values
        if (field === 'metadata' || value === null || value === undefined) {
          console.log('storeDeviceData: Skipping field', field, 'value:', value, '(metadata or null/undefined)');
          continue;
        }
        
        // Skip if it's a GPS field (handled separately)
        if (['latitude', 'longitude', 'altitude', 'speed', 'heading', 'accuracy', 'satellites'].includes(field)) {
          console.log('storeDeviceData: Skipping GPS field', field);
          continue;
        }

        // Convert numeric strings to numbers
        let numericValue = value;
        if (typeof value === 'string' && value.trim() !== '') {
          const parsedValue = Number(value);
          if (!isNaN(parsedValue)) {
            numericValue = parsedValue;
            console.log('storeDeviceData: Converted string', value, 'to number', numericValue);
          }
        }
        
        // Only insert if value is a valid number (including 0)
        if (typeof numericValue === 'number' && !isNaN(numericValue)) {
          // Check for duplicate data to avoid flooding database
          const isDuplicate = await this.checkForDuplicate(device.device_id, field, numericValue, timestamp);
          
          if (isDuplicate) {
            console.log('storeDeviceData: Skipping duplicate reading for', field, 'value', numericValue, 'at', timestamp);
            continue;
          }
          
          console.log('storeDeviceData: Inserting sensor reading for field', field, 'value', numericValue);
          await query(`
            INSERT INTO sensor_readings (device_id, sensor_type, value, unit, timestamp, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            device.device_id,
            field,
            numericValue,
            data[`${field}_unit`] || null,
            timestamp,
              JSON.stringify({
                ...data.metadata,
                datetime: data.datetime,
                _terminalTime: data._terminalTime,
                _groupName: data._groupName,
                payload: data,
                dataAgeMinutes: freshnessInfo.ageMinutes,
                dataAgeHours: freshnessInfo.ageHours,
                dataAgeDays: freshnessInfo.ageDays,
                isBufferedData: freshnessInfo.isBuffered,
                isOldData: freshnessInfo.isOld,
                isVeryOldData: freshnessInfo.isVeryOld,
                serverReceivedAt: serverTimestamp.toISOString()
              })
          ]);
        } else {
          console.log('storeDeviceData: Skipping field', field, 'value', value, 'numericValue', numericValue, '(not a valid number)');
        }
        // If field is _terminalTime and is a valid date, store as metadata only (not as a sensor reading)
      }

      // After storing sensor data, evaluate threshold alerts
      if (device.device_type === 'sensor' && data) {
        for (const [param, value] of Object.entries(data)) {
          if (typeof value === 'number') {
            console.log('Calling evaluateThresholdAlertsOnData for', device.device_id, param, value, timestamp);
            await evaluateThresholdAlertsOnData(device.device_id, param, value, timestamp);
          }
        }
      }

    } catch (error) {
      console.error('Failed to store device data:', error);
    }
  }

  async updateDeviceStatus(deviceId, status) {
    try {
      await query(
        'UPDATE devices SET status = $1, last_seen = NOW() WHERE device_id = $2',
        [status, deviceId]
      );
    } catch (error) {
      console.error('Failed to update device status:', error);
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
      
      if (bufferDataConfig.logging.LOG_DATA_AGE) {
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

  emitRealTimeData(deviceId, data) {
    try {
      console.log(`MQTT: Emitting real-time data for device ${deviceId}:`, data);
      
      // Get the global io instance
      const io = global.io;
      if (io) {
        // Emit device data
        io.emit('device_data', {
          deviceId,
          data,
          timestamp: new Date()
        });

        // Also emit as listener data for the Listeners component
        const listenerData = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          protocol: 'mqtt',
          topic: `data/sparing/sparing/${deviceId}`,
          client_id: deviceId,
          payload: data,
          source_ip: 'mqtt_broker',
          port: 1883,
          size: JSON.stringify(data).length,
          device_id: deviceId
        };

        console.log(`MQTT: Emitting listener_data:`, listenerData);
        io.emit('listener_data', listenerData);
      } else {
        console.log('MQTT: Global io instance not available');
      }
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
      
      if (this.client) {
        this.client.end();
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
      subscribedTopics: Array.from(this.subscribedTopics)
    };
  }

  async evaluateAlertsWithRealTimeData(deviceId, processedData) {
    try {
      console.log('MQTT: Evaluating alerts with real-time data for device:', deviceId);
      console.log('MQTT: Real-time data:', processedData);
      
      // Get all threshold alerts for this device
      const alerts = await query(
        `SELECT * FROM alerts WHERE device_id = $1 AND type = 'threshold'`,
        [deviceId]
      );
      
      if (alerts.rows.length === 0) {
        console.log('MQTT: No threshold alerts found for device:', deviceId);
        return;
      }
      
      console.log('MQTT: Found alerts for device:', alerts.rows);
      
      // Evaluate each alert with the real-time data
      for (const alert of alerts.rows) {
        const value = processedData[alert.parameter];
        
        // Convert string to number if needed
        const numericValue = typeof value === 'string' ? parseFloat(value) : value;
        
        if (typeof numericValue === 'number' && !isNaN(numericValue)) {
          console.log(`MQTT: Evaluating alert ${alert.alert_id} (${alert.parameter}) with real-time value:`, numericValue);
          
          // Check if alert threshold is exceeded
          if ((alert.min !== null && numericValue < alert.min) || (alert.max !== null && numericValue > alert.max)) {
            console.log(`MQTT: Alert ${alert.alert_id} triggered! Value ${numericValue} exceeds threshold (min: ${alert.min}, max: ${alert.max})`);
            
            // Call the alert evaluation function with real-time data
            await evaluateThresholdAlertsOnData(deviceId, alert.parameter, numericValue, new Date());
          } else {
            console.log(`MQTT: Alert ${alert.alert_id} not triggered. Value ${numericValue} within threshold (min: ${alert.min}, max: ${alert.max})`);
          }
        } else {
          console.log(`MQTT: Parameter ${alert.parameter} not found in real-time data or not a valid number:`, value);
        }
      }
    } catch (error) {
      console.error('MQTT: Error evaluating alerts with real-time data:', error);
    }
  }
}

// Create singleton instance
const mqttService = new MQTTService();

module.exports = mqttService; 