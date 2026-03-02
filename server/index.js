const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Allowed origins for CORS and Socket.IO (comma-separated; default includes localhost and common hosts)
const getAllowedOrigins = () => {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://109.123.255.169:3000',
    'http://env.aksadata.id',
    'https://env.aksadata.id'
  ];
};
const allowedOrigins = getAllowedOrigins();

// Import services and middleware
const mqttService = require('./services/mqttService');
const { NotificationService } = require('./services/notificationService');
const notificationService = NotificationService;
const simpleScheduledExportService = require('./services/simpleScheduledExportService');
const maintenanceReminderService = require('./services/maintenanceReminderService');
const { authenticateToken, createRateLimiter } = require('./middleware/auth');
const { filterDataByRole, filterDeviceData } = require('./middleware/dataFilter');
const { query } = require('./config/database');
const { initializeSocket } = require('./socket');
const { evaluateInactivityAlertsPeriodically, pollLatestDataAndEvaluateAlerts } = require('./services/alertEvaluationService');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const roleRoutes = require('./routes/roles');
const deviceRoutes = require('./routes/devices');
const deviceMapperRoutes = require('./routes/deviceMapper');
const fieldDefinitionsRoutes = require('./routes/fieldDefinitions');
const deviceMapperAssignmentsRoutes = require('./routes/deviceMapperAssignments');
const listenersRoutes = require('./routes/listeners');
const dataRoutes = require('./routes/data');
const dashboardRoutes = require('./routes/dashboard');
const alertsRoutes = require('./routes/alerts');
const alertLogsRoutes = require('./routes/alertLogs');
const notificationConfigRoutes = require('./routes/notificationConfig');
const alertSettingsRoutes = require('./routes/alertSettings');
const scheduledExportsRoutes = require('./routes/scheduledExports');
const companiesRoutes = require('./routes/companies');
const sitesRoutes = require('./routes/sites');
const sensorDatabaseRoutes = require('./routes/sensorDatabase');
const sensorSitesRoutes = require('./routes/sensorSites');
const maintenanceRoutes = require('./routes/maintenance');
const technicianRoutes = require('./routes/technician');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocket(server);

// Store io instance globally for use in other modules
global.io = io;

// Security middleware (CSP allows configured origins)
const cspOrigins = ["'self'", ...allowedOrigins];
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: cspOrigins,
      styleSrc: ["'self'", "'unsafe-inline'", ...cspOrigins],
      scriptSrc: ["'self'", "'unsafe-inline'", ...cspOrigins],
      imgSrc: ["'self'", "data:", "https:", "http:", ...cspOrigins],
      connectSrc: ["'self'", "ws:", "wss:", ...cspOrigins],
      fontSrc: ["'self'", "data:", ...cspOrigins],
    },
  },
}));

// CORS configuration (env-based in production)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
  credentials: true
}));

// Compression middleware
app.use(compression());

// Rate limiting
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000 || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  });
  app.use('/api/', limiter);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static('uploads'));
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await query('SELECT 1');
    
    // Check MQTT connection
    const mqttStatus = mqttService.getConnectionStatus();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        mqtt: mqttStatus.isConnected ? 'connected' : 'disconnected',
        mqttReconnectAttempts: mqttStatus.reconnectAttempts
      },
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API routes
console.log('Registering API routes...');
app.use('/api/auth', authRoutes);
console.log('✓ /api/auth route registered');
app.use('/api/users', authenticateToken, filterDataByRole, userRoutes);
console.log('✓ /api/users route registered');
app.use('/api/roles', authenticateToken, filterDataByRole, roleRoutes);
console.log('✓ /api/roles route registered');
app.use('/api/devices', authenticateToken, filterDataByRole, filterDeviceData, deviceRoutes);
console.log('✓ /api/devices route registered');
app.use('/api/data', authenticateToken, filterDataByRole, filterDeviceData, dataRoutes);
console.log('✓ /api/data route registered');
app.use('/api/data-dash', authenticateToken, filterDataByRole, filterDeviceData, require('./routes/dataDash'));
console.log('✓ /api/data-dash route registered');
app.use('/api/device-mapper', authenticateToken, filterDataByRole, deviceMapperRoutes);
console.log('✓ /api/device-mapper route registered');
app.use('/api/field-definitions', authenticateToken, filterDataByRole, fieldDefinitionsRoutes);
console.log('✓ /api/field-definitions route registered');
app.use('/api/device-mapper-assignments', authenticateToken, filterDataByRole, deviceMapperAssignmentsRoutes);
console.log('✓ /api/device-mapper-assignments route registered');
app.use('/api/listeners', authenticateToken, filterDataByRole, listenersRoutes);
console.log('✓ /api/listeners route registered');
app.use('/api/dashboard', authenticateToken, filterDataByRole, dashboardRoutes);
console.log('✓ /api/dashboard route registered');
app.use('/api/alerts', authenticateToken, filterDataByRole, filterDeviceData, alertsRoutes);
console.log('✓ /api/alerts route registered');
app.use('/api/alert-logs', authenticateToken, filterDataByRole, alertLogsRoutes);
console.log('✓ /api/alert-logs route registered');
app.use('/api/notification-config', authenticateToken, filterDataByRole, notificationConfigRoutes);
console.log('✓ /api/notification-config route registered');
app.use('/api/alert-settings', authenticateToken, filterDataByRole, alertSettingsRoutes);
console.log('✓ /api/alert-settings route registered');
app.use('/api/scheduled-exports', authenticateToken, filterDataByRole, scheduledExportsRoutes);
console.log('✓ /api/scheduled-exports route registered');
app.use('/api/companies', authenticateToken, filterDataByRole, companiesRoutes);
console.log('✓ /api/companies route registered');
app.use('/api/sites', authenticateToken, filterDataByRole, sitesRoutes);
console.log('✓ /api/sites route registered');
app.use('/api/sensor-database', authenticateToken, filterDataByRole, sensorDatabaseRoutes);
console.log('✓ /api/sensor-database route registered');
app.use('/api/sensor-sites', authenticateToken, filterDataByRole, sensorSitesRoutes);
console.log('✓ /api/sensor-sites route registered');
app.use('/api/maintenance', authenticateToken, filterDataByRole, maintenanceRoutes);
console.log('✓ /api/maintenance route registered');
app.use('/api/technician', authenticateToken, technicianRoutes);
console.log('✓ /api/technician route registered');
console.log('All API routes registered successfully');

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON payload',
      code: 'INVALID_JSON'
    });
  }

  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: 'INTERNAL_ERROR'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.originalUrl
  });
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  
  // Close MQTT connection first
  await mqttService.disconnect();
  
  // Shutdown scheduled export service
    await simpleScheduledExportService.shutdown();
  
  // Small delay to ensure operations complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Close database connections
  const { pool } = require('./config/database');
  await pool.end();
  
  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Initialize services
const initializeServices = async () => {
  try {
    console.log('Initializing services...');
    
    // Test database connection
    await query('SELECT 1');
    console.log('Database connection established');
    
    // Connect to MQTT broker
    await mqttService.connect();
    
    // Initialize notification service
    await notificationService.initializeEmailTransporter();
    console.log('Notification service initialized');
    
    // Initialize scheduled export service
    await simpleScheduledExportService.initialize();
    console.log('Scheduled export service initialized');
    
    console.log('All services initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 3000;

// Production startup checks (warn on weak config)
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    console.warn('Warning: JWT_SECRET is missing or too short. Set a strong secret in .env');
  }
  if (secret && (secret === 'your_super_secret_jwt_key_here' || secret.includes('your_') || secret.includes('example'))) {
    console.warn('Warning: JWT_SECRET appears to be the default/example value. Change it for production.');
  }
}

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Local: http://localhost:${PORT}`);
  if (allowedOrigins.length > 0) {
    const firstOrigin = allowedOrigins[0];
    if (firstOrigin && !firstOrigin.includes('localhost')) {
      console.log(`Network: ${firstOrigin.replace(/:\d+$/, '')}:${PORT}`);
    }
  }
  await initializeServices();
});

// After server startup, start periodic inactivity check
setInterval(() => {
  evaluateInactivityAlertsPeriodically().catch(console.error);
}, 60 * 1000); // every 1 minute

// Every 30 seconds, poll latest data and evaluate threshold alerts
setInterval(() => {
  pollLatestDataAndEvaluateAlerts().catch(error => {
    if (error.message && error.message.includes('Cannot use a pool after calling end')) {
      console.log('Alert evaluation skipped - database pool not available');
    } else {
      console.error('Alert evaluation error:', error);
    }
  });
}, 30000);

// Start maintenance reminder service
maintenanceReminderService.start();

module.exports = { app, server, io }; 