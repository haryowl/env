const socketIo = require('socket.io');

let io = null;

// Allowed origins for Socket.IO (must match server CORS; use CORS_ORIGINS env)
const getSocketOrigins = () => {
  if (process.env.NODE_ENV !== 'production') return '*';
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://109.123.255.169:3000',
    'http://env.aksadata.id', 'https://env.aksadata.id'
  ];
};

// Initialize Socket.IO
const initializeSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: getSocketOrigins(),
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Socket connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle device data subscriptions
    socket.on('subscribe_device', (deviceId) => {
      socket.join(`device_${deviceId}`);
      console.log(`Client ${socket.id} subscribed to device ${deviceId}`);
    });

    socket.on('unsubscribe_device', (deviceId) => {
      socket.leave(`device_${deviceId}`);
      console.log(`Client ${socket.id} unsubscribed from device ${deviceId}`);
    });

    // Handle dashboard subscriptions
    socket.on('subscribe_dashboard', (dashboardId) => {
      socket.join(`dashboard_${dashboardId}`);
      console.log(`Client ${socket.id} subscribed to dashboard ${dashboardId}`);
    });

    socket.on('unsubscribe_dashboard', (dashboardId) => {
      socket.leave(`dashboard_${dashboardId}`);
      console.log(`Client ${socket.id} unsubscribed from dashboard ${dashboardId}`);
    });

    // Handle real-time data requests
    socket.on('get_latest_data', async (deviceId) => {
      try {
        const { query } = require('./config/database');
        const latestData = await query(`
          SELECT * FROM (
            SELECT 'sensor' as type, device_id, sensor_type, value, unit, timestamp, metadata
            FROM sensor_readings 
            WHERE device_id = $1
            UNION ALL
            SELECT 'gps' as type, device_id, 'location' as sensor_type, 
                   CONCAT(latitude, ',', longitude) as value, 'coordinates' as unit, 
                   timestamp, metadata
            FROM gps_tracks 
            WHERE device_id = $1
          ) combined_data
          ORDER BY timestamp DESC
          LIMIT 10
        `, [deviceId]);

        socket.emit('latest_data', {
          deviceId,
          data: latestData.rows
        });
      } catch (error) {
        console.error('Error fetching latest data:', error);
        socket.emit('error', { message: 'Failed to fetch latest data' });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

// Get Socket.IO instance
const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
};

// Emit event to all connected clients
const emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

// Emit event to specific room
const emitToRoom = (room, event, data) => {
  if (io) {
    io.to(room).emit(event, data);
  }
};

// Emit event to specific device
const emitToDevice = (deviceId, event, data) => {
  emitToRoom(`device_${deviceId}`, event, data);
};

// Emit event to specific dashboard
const emitToDashboard = (dashboardId, event, data) => {
  emitToRoom(`dashboard_${dashboardId}`, event, data);
};

// Get connected clients count
const getConnectedClientsCount = () => {
  if (io) {
    return io.engine.clientsCount;
  }
  return 0;
};

// Get all connected socket IDs
const getConnectedSocketIds = () => {
  if (io) {
    return Array.from(io.sockets.sockets.keys());
  }
  return [];
};

module.exports = {
  initializeSocket,
  getIO,
  emitToAll,
  emitToRoom,
  emitToDevice,
  emitToDashboard,
  getConnectedClientsCount,
  getConnectedSocketIds
}; 