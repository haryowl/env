const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Allowed origins for CORS, CSP connect-src, and Socket.IO.
// Env CORS_ORIGINS is merged with defaults so a minimal production list does not strip CSP entries
// needed when the built client still calls an IP or alternate hostname.
const getAllowedOrigins = () => {
  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://81.17.100.7:3000',
    'http://109.123.255.169:3000',
    'http://env.aksadata.id',
    'https://env.aksadata.id',
    'http://env.aksadata.id:3000',
    'https://env.aksadata.id:3000',
  ];
  if (process.env.CORS_ORIGINS) {
    const fromEnv = process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    return [...new Set([...defaults, ...fromEnv])];
  }
  return defaults;
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
const tenantsRoutes = require('./routes/tenants');
const companiesRoutes = require('./routes/companies');
const sitesRoutes = require('./routes/sites');
const sensorDatabaseRoutes = require('./routes/sensorDatabase');
const sensorSitesRoutes = require('./routes/sensorSites');
const maintenanceRoutes = require('./routes/maintenance');
const technicianRoutes = require('./routes/technician');
const deviceDataRoutes = require('./routes/deviceData');
const systemInfoRoutes = require('./routes/systemInfo');
const mqttPublisherRoutes = require('./routes/mqttPublisher');
const mqttConfigRoutes = require('./routes/mqttConfig');
const featuresRoutes = require('./routes/features');
const liveTrackingRoutes = require('./routes/liveTracking');
const dataCleanupRoutes = require('./routes/dataCleanup');
const dataImportRoutes = require('./routes/dataImport');
const deploymentSettingsRoutes = require('./routes/deploymentSettings');
const dataCleanupService = require('./services/dataCleanupService');
const { ensureCoreSchema } = require('./utils/ensureCoreSchema');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocket(server);

// Store io instance globally for use in other modules
global.io = io;

// Security middleware (CSP allows configured origins)
// Disable headers that break HTTP access (IP:port without TLS)
const cspOrigins = ["'self'", ...allowedOrigins];
app.use(helmet({
  hsts: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  originAgentCluster: false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: cspOrigins,
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      // Live tracking Windy drawer (iframe); not covered by defaultSrc origins alone in strict CSP
      frameSrc: ["'self'", 'https://embed.windy.com', 'https://www.windy.com'],
      objectSrc: ["'none'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", ...cspOrigins],
      scriptSrc: ["'self'", "'unsafe-inline'", ...cspOrigins],
      imgSrc: ["'self'", "data:", "https:", "http:", ...cspOrigins],
      connectSrc: ["'self'", "ws:", "wss:", "https://fonts.googleapis.com", "https://fonts.gstatic.com", ...cspOrigins],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://fonts.googleapis.com", ...cspOrigins],
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

// Static files (profile photos, maintenance images, etc.)
const uploadsAbs = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsAbs));
// Same tree under /api/uploads so proxies that only forward /api still serve files
app.use('/api/uploads', express.static(uploadsAbs));
const clientDist = path.join(__dirname, '../client/dist');
const publicDir = path.join(__dirname, '../public');
// Serve built React app (full UI) if it exists; else fall back to simple public page
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}
app.use(express.static(publicDir));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await query('SELECT 1');

    // Check MQTT connection / ingest pressure
    const mqttStatus = mqttService.getConnectionStatus();
    const mqttConfigured = Boolean(process.env.MQTT_BROKER_URL && process.env.MQTT_BROKER_URL.trim());
    const mqttOk = !mqttConfigured || mqttStatus.isConnected;
    const queuePressure =
      mqttStatus.maxIngestQueue > 0 &&
      mqttStatus.ingestQueueDepth >= Math.floor(mqttStatus.maxIngestQueue * 0.8);
    const dropping = (mqttStatus.droppedIngestMessages || 0) > 0;

    let status = 'healthy';
    if (!mqttOk || queuePressure || dropping) {
      status = 'degraded';
    }

    res.status(mqttOk ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        mqtt: mqttConfigured
          ? (mqttStatus.isConnected ? 'connected' : 'disconnected')
          : 'not_configured',
        mqttReconnectAttempts: mqttStatus.reconnectAttempts,
        mqttIngestQueueDepth: mqttStatus.ingestQueueDepth,
        mqttIngestActive: mqttStatus.ingestActive,
        mqttDroppedMessages: mqttStatus.droppedIngestMessages,
        mqttLastMessageAt: mqttStatus.lastMessageAt,
        mqttLastIngestOkAt: mqttStatus.lastIngestOkAt,
        mqttConnectedAt: mqttStatus.connectedAt,
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
app.use('/api/device-data', deviceDataRoutes);
console.log('✓ /api/device-data route registered (HTTP ingestion)');
app.use('/api/users', authenticateToken, filterDataByRole, userRoutes);
console.log('✓ /api/users route registered');
app.use('/api/roles', authenticateToken, filterDataByRole, roleRoutes);
console.log('✓ /api/roles route registered');
app.use('/api/devices', authenticateToken, filterDataByRole, filterDeviceData, deviceRoutes);
console.log('✓ /api/devices route registered');
app.use('/api/live-tracking', authenticateToken, filterDataByRole, filterDeviceData, liveTrackingRoutes);
console.log('✓ /api/live-tracking route registered');
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
app.use('/api/alert-logs', authenticateToken, filterDataByRole, filterDeviceData, alertLogsRoutes);
console.log('✓ /api/alert-logs route registered');
app.use('/api/features', authenticateToken, filterDataByRole, featuresRoutes);
console.log('✓ /api/features route registered');
app.use('/api/mqtt-publisher', mqttPublisherRoutes);
console.log('✓ /api/mqtt-publisher route registered');
app.use('/api/mqtt-config', mqttConfigRoutes);
console.log('✓ /api/mqtt-config route registered');
app.use('/api/notification-config', authenticateToken, filterDataByRole, notificationConfigRoutes);
console.log('✓ /api/notification-config route registered');
app.use('/api/alert-settings', authenticateToken, filterDataByRole, alertSettingsRoutes);
console.log('✓ /api/alert-settings route registered');
app.use('/api/scheduled-exports', authenticateToken, filterDataByRole, scheduledExportsRoutes);
console.log('✓ /api/scheduled-exports route registered');
app.use('/api/tenants', authenticateToken, filterDataByRole, tenantsRoutes);
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
app.use('/api/system-info', authenticateToken, filterDataByRole, systemInfoRoutes);
console.log('✓ /api/system-info route registered');
app.use('/api/data-cleanup', authenticateToken, filterDataByRole, dataCleanupRoutes);
console.log('✓ /api/data-cleanup route registered');
app.use('/api/data-import', authenticateToken, filterDataByRole, dataImportRoutes);
console.log('✓ /api/data-import route registered');
app.use('/api/deployment-settings', authenticateToken, filterDataByRole, deploymentSettingsRoutes);
console.log('✓ /api/deployment-settings route registered');
console.log('All API routes registered successfully');

// Serve the main application - React SPA if built, else simple public page
// SPA fallback: serve index.html for all non-API/health/uploads GET requests (client-side routing)
app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/health') ||
    req.path.startsWith('/uploads')
  ) {
    return next();
  }
  if (fs.existsSync(clientDist)) {
    return res.sendFile(path.join(clientDist, 'index.html'));
  }
  return res.sendFile(path.join(publicDir, 'index.html'));
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

    await ensureCoreSchema();
    console.log('Database schema verified (core tables/columns)');

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

// Scheduled data retention cleanup (checks interval in DB settings)
setInterval(() => {
  dataCleanupService.maybeRunScheduledCleanup().catch((err) => {
    console.error('Scheduled data cleanup error:', err);
  });
}, 60 * 60 * 1000);

// Poll latest DB rows for threshold alerts (backup to MQTT real-time evaluation)
const ALERT_POLL_MS = Math.max(60_000, parseInt(process.env.ALERT_POLL_INTERVAL_MS, 10) || 60_000);
setInterval(() => {
  pollLatestDataAndEvaluateAlerts().catch((error) => {
    if (error.message && error.message.includes('Cannot use a pool after calling end')) {
      console.log('Alert evaluation skipped - database pool not available');
    } else {
      console.error('Alert evaluation error:', error);
    }
  });
}, ALERT_POLL_MS);

// Start maintenance reminder service
maintenanceReminderService.start();

module.exports = { app, server, io }; 