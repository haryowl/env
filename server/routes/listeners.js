const express = require('express');
const router = express.Router();

// In-memory storage for listeners data (in production, use database)
let listenersData = [];
let simulationRunning = false;
let simulationInterval = null;

// GET /api/listeners - Get all listeners data
router.get('/', (req, res) => {
  try {
    res.json({
      success: true,
      data: listenersData,
      count: listenersData.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch listeners data'
    });
  }
});

// POST /api/listeners - Add new listener data
router.post('/', (req, res) => {
  try {
    const newData = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...req.body
    };
    
    listenersData.unshift(newData); // Add to beginning
    
    // Keep only last 1000 records
    if (listenersData.length > 1000) {
      listenersData = listenersData.slice(0, 1000);
    }
    
    res.status(201).json({
      success: true,
      data: newData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to add listener data'
    });
  }
});

// DELETE /api/listeners - Clear all data
router.delete('/', (req, res) => {
  try {
    listenersData = [];
    res.json({
      success: true,
      message: 'All listeners data cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear listeners data'
    });
  }
});

// Start data simulation for development
router.post('/simulation/start', async (req, res) => {
  try {
    const { deviceId = '7092139028080123021' } = req.body;
    
    // Start simulation by emitting test data every 5 seconds
    const simulationInterval = setInterval(() => {
      const testData = {
        _terminalTime: new Date().toISOString(),
        _groupName: 'Test Group',
        TSS: Math.random() * 100 + 50, // 50-150 mg/L
        COD: Math.random() * 200 + 100, // 100-300 mg/L
        PH: Math.random() * 4 + 6, // 6-10 pH
        Debit: Math.random() * 10 + 5, // 5-15 L/min
        temperature: Math.random() * 10 + 20, // 20-30°C
        humidity: Math.random() * 20 + 60, // 60-80%
        pressure: Math.random() * 50 + 1000 // 1000-1050 hPa
      };

      // Emit as MQTT data
      const io = global.io;
      if (io) {
        // Emit device data
        io.emit('device_data', {
          deviceId,
          data: testData,
          timestamp: new Date()
        });

        // Emit listener data
        const listenerData = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          protocol: 'mqtt',
          topic: `data/sparing/sparing/${deviceId}`,
          client_id: deviceId,
          payload: testData,
          source_ip: 'simulation',
          port: 1883,
          size: JSON.stringify(testData).length,
          device_id: deviceId
        };

        io.emit('listener_data', listenerData);
        console.log('Simulation: Emitted test data for device', deviceId);
      }
    }, 5000);

    // Store the interval ID globally so we can stop it later
    global.simulationInterval = simulationInterval;

    res.json({
      success: true,
      message: 'Data simulation started',
      deviceId,
      interval: '5 seconds'
    });

  } catch (error) {
    console.error('Failed to start simulation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start simulation'
    });
  }
});

// Stop data simulation
router.post('/simulation/stop', async (req, res) => {
  try {
    if (global.simulationInterval) {
      clearInterval(global.simulationInterval);
      global.simulationInterval = null;
      console.log('Simulation: Stopped data simulation');
    }

    res.json({
      success: true,
      message: 'Data simulation stopped'
    });

  } catch (error) {
    console.error('Failed to stop simulation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop simulation'
    });
  }
});

// Get simulation status
router.get('/simulation/status', async (req, res) => {
  try {
    const isRunning = global.simulationInterval !== null;
    
    res.json({
      success: true,
      isRunning,
      message: isRunning ? 'Simulation is running' : 'Simulation is stopped'
    });

  } catch (error) {
    console.error('Failed to get simulation status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get simulation status'
    });
  }
});

// Check device configuration
router.get('/device-config/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const device = await getRow(
      'SELECT * FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    res.json({
      success: true,
      device: {
        device_id: device.device_id,
        device_type: device.device_type,
        protocol: device.protocol,
        name: device.name,
        status: device.status,
        config: device.config,
        created_at: device.created_at
      }
    });

  } catch (error) {
    console.error('Device config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get device configuration',
      details: error.message
    });
  }
});

// Test MQTT message handling
router.post('/test-mqtt', async (req, res) => {
  try {
    const { topic, message } = req.body;
    
    if (!topic || !message) {
      return res.status(400).json({
        success: false,
        error: 'Topic and message are required'
      });
    }

    // Import MQTT service
    const mqttService = require('../services/mqttService');
    
    // Simulate MQTT message
    console.log(`Test: Simulating MQTT message on topic: ${topic}`);
    console.log(`Test: Message content: ${JSON.stringify(message)}`);
    
    await mqttService.handleMessage(topic, Buffer.from(JSON.stringify(message)));

    res.json({
      success: true,
      message: 'MQTT message test completed',
      topic,
      data: message
    });

  } catch (error) {
    console.error('MQTT test error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test MQTT message handling',
      details: error.message
    });
  }
});

// Helper function to generate mock payload data
function generateMockPayload(protocol) {
  const basePayload = {
    timestamp: new Date().toISOString(),
    device_id: `device_${Math.floor(Math.random() * 1000)}`,
    battery_level: Math.floor(Math.random() * 100),
    signal_strength: Math.floor(Math.random() * 100)
  };
  
  switch (protocol) {
    case 'mqtt':
      return {
        ...basePayload,
        temperature: (Math.random() * 50 - 10).toFixed(2),
        humidity: (Math.random() * 100).toFixed(2),
        pressure: (Math.random() * 1000 + 900).toFixed(2),
        topic: `sensor/${Math.floor(Math.random() * 10)}/data`
      };
    
    case 'http':
      return {
        ...basePayload,
        sensor_data: {
          temperature: (Math.random() * 50 - 10).toFixed(2),
          humidity: (Math.random() * 100).toFixed(2),
          pressure: (Math.random() * 1000 + 900).toFixed(2)
        },
        status: ['online', 'offline', 'error'][Math.floor(Math.random() * 3)]
      };
    
    case 'tcp':
      return {
        ...basePayload,
        raw_data: Buffer.from(`TCP_DATA_${Math.floor(Math.random() * 10000)}`).toString('base64'),
        sequence_number: Math.floor(Math.random() * 10000),
        checksum: Math.random().toString(16).substring(2, 10)
      };
    
    case 'udp':
      return {
        ...basePayload,
        datagram: Buffer.from(`UDP_DATA_${Math.floor(Math.random() * 10000)}`).toString('base64'),
        packet_number: Math.floor(Math.random() * 10000),
        priority: Math.floor(Math.random() * 10)
      };
    
    default:
      return basePayload;
  }
}

module.exports = router; 