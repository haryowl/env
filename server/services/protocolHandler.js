const axios = require('axios');

class ProtocolHandler {
  constructor() {
    this.baseUrl = `http://${process.env.SERVER_HOST || '109.123.255.169'}:${process.env.PORT || 3000}/api/listeners`;
    this.isRunning = false;
    this.interval = null;
  }

  // Simulate MQTT message
  async simulateMqttMessage() {
    const topics = [
      'sensors/temperature/001',
      'sensors/humidity/002',
      'sensors/pressure/003',
      'devices/status/001',
      'alerts/motion/001'
    ];

    const topic = topics[Math.floor(Math.random() * topics.length)];
    const clientId = `device_${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    const payload = {
      timestamp: new Date().toISOString(),
      value: Math.random() * 100,
      battery: Math.floor(Math.random() * 100),
      signal_strength: Math.floor(Math.random() * 100)
    };

    if (topic.includes('temperature')) {
      payload.temperature = 20 + Math.random() * 15;
    } else if (topic.includes('humidity')) {
      payload.humidity = 40 + Math.random() * 40;
    } else if (topic.includes('pressure')) {
      payload.pressure = 1000 + Math.random() * 50;
    } else if (topic.includes('status')) {
      payload.status = Math.random() > 0.5 ? 'online' : 'offline';
      payload.uptime = Math.floor(Math.random() * 86400);
    } else if (topic.includes('motion')) {
      payload.motion_detected = Math.random() > 0.7;
      payload.confidence = Math.random();
    }

    await this.sendListenerData({
      protocol: 'mqtt',
      topic,
      client_id: clientId,
      payload,
      source_ip: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
      port: 1883
    });
  }

  // Simulate HTTP request
  async simulateHttpRequest() {
    const endpoints = [
      '/api/sensor-data',
      '/api/device-status',
      '/api/telemetry',
      '/api/alert',
      '/api/heartbeat'
    ];

    const methods = ['GET', 'POST', 'PUT'];
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const method = methods[Math.floor(Math.random() * methods.length)];

    const payload = {
      device_id: `device_${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      timestamp: new Date().toISOString(),
      data: {
        sensor_readings: Math.random() * 100,
        status: Math.random() > 0.5 ? 'active' : 'inactive'
      }
    };

    if (endpoint.includes('alert')) {
      payload.alert_type = Math.random() > 0.5 ? 'warning' : 'error';
      payload.message = 'Device alert detected';
    } else if (endpoint.includes('heartbeat')) {
      payload.heartbeat = true;
      payload.sequence = Math.floor(Math.random() * 10000);
    }

    await this.sendListenerData({
      protocol: 'http',
      endpoint,
      method,
      payload,
      source_ip: `10.0.0.${Math.floor(Math.random() * 254) + 1}`,
      port: 80
    });
  }

  // Simulate TCP connection
  async simulateTcpConnection() {
    const connectionId = `tcp_conn_${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    const commands = ['STATUS', 'CONFIG', 'DATA', 'PING', 'RESET'];
    const command = commands[Math.floor(Math.random() * commands.length)];

    const payload = {
      command,
      device_id: `gateway_${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
      timestamp: new Date().toISOString(),
      sequence: Math.floor(Math.random() * 10000)
    };

    if (command === 'STATUS') {
      payload.uptime = Math.floor(Math.random() * 86400);
      payload.memory_usage = Math.random() * 100;
      payload.cpu_usage = Math.random() * 100;
    } else if (command === 'CONFIG') {
      payload.config = {
        polling_interval: 30 + Math.floor(Math.random() * 60),
        timeout: 5000 + Math.floor(Math.random() * 10000)
      };
    } else if (command === 'DATA') {
      payload.data_size = Math.floor(Math.random() * 1000);
      payload.data_type = 'telemetry';
    }

    await this.sendListenerData({
      protocol: 'tcp',
      connection_id: connectionId,
      payload,
      source_ip: `172.16.0.${Math.floor(Math.random() * 254) + 1}`,
      port: 8080
    });
  }

  // Simulate UDP packet
  async simulateUdpPacket() {
    const connectionId = `udp_conn_${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    const sensorTypes = ['temperature', 'humidity', 'pressure', 'light', 'noise'];
    const sensorType = sensorTypes[Math.floor(Math.random() * sensorTypes.length)];

    const payload = {
      sensor_type: sensorType,
      value: Math.random() * 100,
      unit: sensorType === 'temperature' ? '°C' : 
            sensorType === 'humidity' ? '%' : 
            sensorType === 'pressure' ? 'hPa' : 
            sensorType === 'light' ? 'lux' : 'dB',
      accuracy: Math.random() * 0.1,
      timestamp: new Date().toISOString()
    };

    await this.sendListenerData({
      protocol: 'udp',
      connection_id: connectionId,
      payload,
      source_ip: `192.168.2.${Math.floor(Math.random() * 254) + 1}`,
      port: 5000
    });
  }

  // Send listener data to the API
  async sendListenerData(data) {
    try {
      await axios.post(this.baseUrl, data);
      console.log(`Simulated ${data.protocol.toUpperCase()} data sent`);
    } catch (error) {
      console.error(`Failed to send ${data.protocol.toUpperCase()} data:`, error.message);
    }
  }

  // Start simulation
  startSimulation(intervalMs = 3000) {
    if (this.isRunning) {
      console.log('Simulation is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting protocol simulation (${intervalMs}ms interval)`);

    this.interval = setInterval(async () => {
      const protocols = ['mqtt', 'http', 'tcp', 'udp'];
      const randomProtocol = protocols[Math.floor(Math.random() * protocols.length)];

      switch (randomProtocol) {
        case 'mqtt':
          await this.simulateMqttMessage();
          break;
        case 'http':
          await this.simulateHttpRequest();
          break;
        case 'tcp':
          await this.simulateTcpConnection();
          break;
        case 'udp':
          await this.simulateUdpPacket();
          break;
      }
    }, intervalMs);
  }

  // Stop simulation
  stopSimulation() {
    if (!this.isRunning) {
      console.log('Simulation is not running');
      return;
    }

    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('Protocol simulation stopped');
  }

  // Get simulation status
  getStatus() {
    return {
      isRunning: this.isRunning,
      interval: this.interval ? 'active' : 'inactive'
    };
  }
}

module.exports = new ProtocolHandler(); 