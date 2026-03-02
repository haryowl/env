/**
 * Buffer Data Configuration
 * 
 * This configuration controls how the system handles buffered/old data from devices.
 * The system is designed to accept ALL data (both real-time and buffered) while
 * providing intelligent duplicate detection and data validation.
 */

module.exports = {
  // Data Age Thresholds (in minutes)
  thresholds: {
    BUFFERED_DATA_MINUTES: 5,        // Data older than 5 minutes is considered buffered
    OLD_DATA_HOURS: 24,              // Data older than 24 hours is considered old
    VERY_OLD_DATA_DAYS: 7,           // Data older than 7 days is considered very old
    FUTURE_DATA_MINUTES: 5           // Data from future (more than 5 minutes ahead) is flagged
  },

  // Duplicate Detection Settings
  duplicateDetection: {
    ENABLED: true,
    WINDOW_SECONDS: 30,              // 30-second window for duplicate detection
    STRICT_MODE: false               // If true, rejects all duplicates. If false, logs but accepts
  },

  // Data Validation Settings
  validation: {
    ENABLED: true,
    ACCEPT_FUTURE_DATA: true,        // Accept data with future timestamps
    ACCEPT_OLD_DATA: true,           // Accept data with old timestamps
    ACCEPT_VERY_OLD_DATA: true,      // Accept data with very old timestamps
    LOG_WARNINGS: true               // Log warnings for unusual data
  },

  // Storage Settings
  storage: {
    PRESERVE_DEVICE_TIMESTAMP: true, // Use device timestamp instead of server timestamp
    STORE_AGE_METADATA: true,        // Store data age information in metadata
    STORE_SERVER_RECEIVED_TIME: true // Store when server received the data
  },

  // Logging Settings
  logging: {
    ENABLED: true,
    LOG_BUFFERED_DATA: true,         // Log when buffered data is received
    LOG_OLD_DATA: true,              // Log when old data is received
    LOG_VERY_OLD_DATA: true,         // Log when very old data is received
    LOG_FUTURE_DATA: true,           // Log when future data is received
    LOG_DUPLICATES: true,            // Log when duplicates are detected
    LOG_DATA_AGE: true               // Log data age information
  },

  // Alert Settings
  alerts: {
    ENABLED: true,
    ALERT_ON_VERY_OLD_DATA: false,   // Send alerts for very old data
    ALERT_ON_FUTURE_DATA: false,     // Send alerts for future data
    ALERT_ON_DUPLICATE_FLOOD: true   // Send alerts if too many duplicates detected
  },

  // Performance Settings
  performance: {
    BATCH_SIZE: 100,                 // Process data in batches
    DUPLICATE_CHECK_ENABLED: true,   // Enable duplicate checking (can be disabled for performance)
    INDEX_CLEANUP_INTERVAL_HOURS: 24 // How often to clean up old indexes
  }
};
