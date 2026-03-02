const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const setupDatabase = async () => {
  try {
    console.log('Setting up database...');

    // Check if PostGIS is available
    let hasPostGIS = false;
    try {
      await pool.query('SELECT PostGIS_Version();');
      hasPostGIS = true;
      console.log('PostGIS extension is available');
    } catch (error) {
      console.log('PostGIS extension not available - using regular coordinates');
    }

    // Create basic extensions (make TimescaleDB optional)
    try {
      await pool.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      `);
      console.log('Basic extensions created successfully');
    } catch (error) {
      console.log('Some extensions not available, continuing with basic setup...');
    }

    // Try to create PostGIS extension (optional)
    if (!hasPostGIS) {
      try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS "postgis";');
        hasPostGIS = true;
        console.log('PostGIS extension created successfully');
      } catch (error) {
        console.log('PostGIS extension not available - continuing without spatial features');
      }
    }

    // Try to create TimescaleDB extension (optional)
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS "timescaledb";');
      console.log('TimescaleDB extension created successfully');
    } catch (error) {
      console.log('TimescaleDB extension not available - continuing without time-series optimization');
    }

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ,
        timezone VARCHAR(50) DEFAULT 'UTC',
        preferences JSONB DEFAULT '{}'
      );
    `);

    // Roles table for custom role management
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        role_id SERIAL PRIMARY KEY,
        role_name VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        is_system_role BOOLEAN DEFAULT false,
        permissions JSONB DEFAULT '{}',
        menu_permissions JSONB DEFAULT '{}',
        device_permissions JSONB DEFAULT '{}',
        created_by INTEGER REFERENCES users(user_id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // User roles mapping table (for users with multiple roles)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
        role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
        is_primary BOOLEAN DEFAULT false,
        assigned_by INTEGER REFERENCES users(user_id),
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, role_id)
      );
    `);

    // Menu permissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_permissions (
        permission_id SERIAL PRIMARY KEY,
        role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
        menu_path VARCHAR(100) NOT NULL,
        menu_name VARCHAR(100) NOT NULL,
        can_access BOOLEAN DEFAULT false,
        can_create BOOLEAN DEFAULT false,
        can_read BOOLEAN DEFAULT false,
        can_update BOOLEAN DEFAULT false,
        can_delete BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(role_id, menu_path)
      );
    `);

    // Device groups (must exist before role_device_group_permissions and devices)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_groups (
        group_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(user_id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Enhanced devices table (must exist before role_device_permissions and other device FK tables)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        device_id VARCHAR(50) PRIMARY KEY,
        device_type VARCHAR(30) NOT NULL CHECK (device_type IN ('sensor', 'gps', 'hybrid')),
        protocol VARCHAR(20) NOT NULL CHECK (protocol IN ('mqtt', 'nmea', 'http', 'tcp', 'udp', 'modbus', 'custom')),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        location VARCHAR(200),
        timezone VARCHAR(50) DEFAULT 'UTC',
        group_id INTEGER REFERENCES device_groups(group_id),
        config JSONB DEFAULT '{}',
        field_mappings JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error', 'maintenance')),
        last_seen TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      );
    `);

    // Alerts table (required by alertEvaluationService, alerts routes)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        alert_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        device_id VARCHAR(50) REFERENCES devices(device_id) ON DELETE CASCADE,
        parameter VARCHAR(50),
        min DOUBLE PRECISION,
        max DOUBLE PRECISION,
        type VARCHAR(20) NOT NULL CHECK (type IN ('threshold', 'inactivity')),
        threshold_time INTEGER,
        actions JSONB DEFAULT '{}',
        template TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Alert logs (required by alertEvaluationService, alertLogs routes)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_logs (
        log_id SERIAL PRIMARY KEY,
        alert_id INTEGER REFERENCES alerts(alert_id) ON DELETE CASCADE,
        device_id VARCHAR(50),
        parameter VARCHAR(50),
        value DOUBLE PRECISION,
        detected_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        details JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Device permissions by role table (requires devices)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_device_permissions (
        role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
        device_id VARCHAR(50) REFERENCES devices(device_id) ON DELETE CASCADE,
        permissions JSONB DEFAULT '{"read": false, "write": false, "configure": false, "delete": false}',
        data_access JSONB DEFAULT '{"view_data": false, "export_data": false, "real_time": false}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (role_id, device_id)
      );
    `);

    // Device group permissions by role table (requires device_groups)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_device_group_permissions (
        role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
        group_id INTEGER REFERENCES device_groups(group_id) ON DELETE CASCADE,
        permissions JSONB DEFAULT '{"read": false, "write": false, "configure": false, "delete": false}',
        data_access JSONB DEFAULT '{"view_data": false, "export_data": false, "real_time": false}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (role_id, group_id)
      );
    `);

    // User-device permissions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_device_permissions (
        user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
        device_id VARCHAR(50) REFERENCES devices(device_id) ON DELETE CASCADE,
        permissions JSONB DEFAULT '{"read": true, "write": false, "configure": false, "delete": false}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, device_id)
      );
    `);

    // Field mappings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS field_mappings (
        mapping_id SERIAL PRIMARY KEY,
        device_id VARCHAR(50) REFERENCES devices(device_id) ON DELETE CASCADE,
        source_field VARCHAR(100) NOT NULL,
        target_field VARCHAR(100) NOT NULL,
        data_type VARCHAR(20) CHECK (data_type IN ('string', 'number', 'boolean', 'timestamp', 'json')),
        conversion_rule JSONB DEFAULT '{}',
        validation_rule JSONB DEFAULT '{}',
        default_value TEXT,
        is_required BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(device_id, source_field)
      );
    `);

    // Field definitions table (for standardized fields)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS field_definitions (
        field_id SERIAL PRIMARY KEY,
        field_name VARCHAR(100) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        data_type VARCHAR(20) NOT NULL CHECK (data_type IN ('string', 'number', 'boolean', 'timestamp', 'json')),
        unit VARCHAR(20),
        description TEXT,
        category VARCHAR(50),
        is_standard BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(user_id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Mapper templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mapper_templates (
        template_id SERIAL PRIMARY KEY,
        template_name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        device_id VARCHAR(50) REFERENCES devices(device_id),
        mappings JSONB NOT NULL,
        created_by INTEGER REFERENCES users(user_id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Device mapper assignments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_mapper_assignments (
        device_id VARCHAR(50) REFERENCES devices(device_id) ON DELETE CASCADE,
        template_id INTEGER REFERENCES mapper_templates(template_id) ON DELETE CASCADE,
        timezone VARCHAR(50) DEFAULT 'UTC',
        time_format VARCHAR(50) DEFAULT 'ISO8601',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (device_id)
      );
    `);

    // Unified device data table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_data (
        id BIGSERIAL PRIMARY KEY,
        device_id VARCHAR(50) NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        field_value TEXT,
        data_type VARCHAR(20),
        unit VARCHAR(20),
        timestamp TIMESTAMPTZ NOT NULL,
        utc_timestamp TIMESTAMPTZ NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_device_data_device_timestamp 
      ON device_data(device_id, timestamp DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_device_data_field_name 
      ON device_data(field_name);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_field_definitions_category 
      ON field_definitions(category);
    `);

    // Insert initial field definitions
    const initialFields = [
      // Water Quality Fields
      {
        field_name: 'tss_mg_l',
        display_name: 'Total Suspended Solids (mg/L)',
        data_type: 'number',
        unit: 'mg/L',
        description: 'Total suspended solids concentration in water',
        category: 'Water Quality',
        is_standard: true
      },
      {
        field_name: 'cod_mg_l',
        display_name: 'Chemical Oxygen Demand (mg/L)',
        data_type: 'number',
        unit: 'mg/L',
        description: 'Chemical oxygen demand measurement',
        category: 'Water Quality',
        is_standard: true
      },
      {
        field_name: 'ph_value',
        display_name: 'pH Value',
        data_type: 'number',
        unit: 'pH',
        description: 'pH level of water',
        category: 'Water Quality',
        is_standard: true
      },
      {
        field_name: 'flow_rate',
        display_name: 'Flow Rate',
        data_type: 'number',
        unit: 'L/min',
        description: 'Water flow rate',
        category: 'Flow',
        is_standard: true
      },
      {
        field_name: 'terminal_time',
        display_name: 'Terminal Time',
        data_type: 'timestamp',
        unit: null,
        description: 'Device terminal timestamp',
        category: 'Status',
        is_standard: true
      },
      {
        field_name: 'group_name',
        display_name: 'Group Name',
        data_type: 'string',
        unit: null,
        description: 'Data group identifier',
        category: 'Status',
        is_standard: true
      },
      // Temperature Fields
      {
        field_name: 'temperature_celsius',
        display_name: 'Temperature (°C)',
        data_type: 'number',
        unit: '°C',
        description: 'Temperature in Celsius',
        category: 'Temperature',
        is_standard: true
      },
      {
        field_name: 'temperature_fahrenheit',
        display_name: 'Temperature (°F)',
        data_type: 'number',
        unit: '°F',
        description: 'Temperature in Fahrenheit',
        category: 'Temperature',
        is_standard: true
      },
      // Humidity Fields
      {
        field_name: 'humidity_percent',
        display_name: 'Humidity (%)',
        data_type: 'number',
        unit: '%',
        description: 'Relative humidity percentage',
        category: 'Humidity',
        is_standard: true
      },
      // Pressure Fields
      {
        field_name: 'pressure_pa',
        display_name: 'Pressure (Pa)',
        data_type: 'number',
        unit: 'Pa',
        description: 'Atmospheric pressure in Pascals',
        category: 'Pressure',
        is_standard: true
      },
      {
        field_name: 'pressure_bar',
        display_name: 'Pressure (bar)',
        data_type: 'number',
        unit: 'bar',
        description: 'Pressure in bars',
        category: 'Pressure',
        is_standard: true
      },
      // Electrical Fields
      {
        field_name: 'voltage_v',
        display_name: 'Voltage (V)',
        data_type: 'number',
        unit: 'V',
        description: 'Electrical voltage',
        category: 'Electrical',
        is_standard: true
      },
      {
        field_name: 'current_a',
        display_name: 'Current (A)',
        data_type: 'number',
        unit: 'A',
        description: 'Electrical current in amperes',
        category: 'Electrical',
        is_standard: true
      },
      {
        field_name: 'power_w',
        display_name: 'Power (W)',
        data_type: 'number',
        unit: 'W',
        description: 'Electrical power in watts',
        category: 'Electrical',
        is_standard: true
      },
      // Location Fields
      {
        field_name: 'latitude',
        display_name: 'Latitude',
        data_type: 'number',
        unit: '°',
        description: 'Geographic latitude',
        category: 'Location',
        is_standard: true
      },
      {
        field_name: 'longitude',
        display_name: 'Longitude',
        data_type: 'number',
        unit: '°',
        description: 'Geographic longitude',
        category: 'Location',
        is_standard: true
      },
      {
        field_name: 'altitude_m',
        display_name: 'Altitude (m)',
        data_type: 'number',
        unit: 'm',
        description: 'Altitude in meters',
        category: 'Location',
        is_standard: true
      }
    ];

    // Insert initial field definitions if they don't exist
    for (const field of initialFields) {
      await pool.query(`
        INSERT INTO field_definitions (field_name, display_name, data_type, unit, description, category, is_standard)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (field_name) DO NOTHING
      `, [
        field.field_name,
        field.display_name,
        field.data_type,
        field.unit,
        field.description,
        field.category,
        field.is_standard
      ]);
    }

    console.log('Initial field definitions inserted successfully');

    // Sensor readings table (time-series) - with conditional PostGIS support
    if (hasPostGIS) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sensor_readings (
          id BIGSERIAL,
          device_id VARCHAR(50) NOT NULL,
          sensor_type VARCHAR(30) NOT NULL,
          value DECIMAL(15,6),
          unit VARCHAR(20),
          timestamp TIMESTAMPTZ NOT NULL,
          location GEOMETRY(POINT, 4326),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sensor_readings (
          id BIGSERIAL,
          device_id VARCHAR(50) NOT NULL,
          sensor_type VARCHAR(30) NOT NULL,
          value DECIMAL(15,6),
          unit VARCHAR(20),
          timestamp TIMESTAMPTZ NOT NULL,
          latitude DECIMAL(10,8),
          longitude DECIMAL(11,8),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    }

    // GPS tracks table (time-series)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gps_tracks (
        id BIGSERIAL,
        device_id VARCHAR(50) NOT NULL,
        latitude DECIMAL(10,8) NOT NULL,
        longitude DECIMAL(11,8) NOT NULL,
        altitude DECIMAL(8,2),
        speed DECIMAL(6,2),
        heading DECIMAL(5,2),
        timestamp TIMESTAMPTZ NOT NULL,
        accuracy DECIMAL(4,2),
        satellites INTEGER,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Device events/logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_events (
        event_id SERIAL PRIMARY KEY,
        device_id VARCHAR(50) REFERENCES devices(device_id),
        event_type VARCHAR(50) NOT NULL,
        event_data JSONB DEFAULT '{}',
        severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        user_id INTEGER REFERENCES users(user_id)
      );
    `);

    // System logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        log_id SERIAL PRIMARY KEY,
        level VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        user_id INTEGER REFERENCES users(user_id)
      );
    `);

    // Email config (required by NotificationService)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_config (
        config_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        smtp_host VARCHAR(255) NOT NULL,
        smtp_port INTEGER NOT NULL,
        smtp_secure BOOLEAN DEFAULT false,
        username VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        from_email VARCHAR(255) NOT NULL,
        from_name VARCHAR(255),
        is_default BOOLEAN DEFAULT false,
        created_by INTEGER REFERENCES users(user_id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Alert email config (required by AlertSettings)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_email_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        smtp_host VARCHAR(255),
        smtp_port INTEGER,
        smtp_secure BOOLEAN DEFAULT false,
        smtp_user VARCHAR(255),
        smtp_pass VARCHAR(255),
        from_email VARCHAR(255),
        from_name VARCHAR(255),
        enabled BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Companies (for maintenance/sensor sites)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        company_id SERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL UNIQUE,
        address TEXT,
        contact_person_name VARCHAR(255),
        contact_person_phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
      );
    `);

    // Sites (for maintenance/sensor sites)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sites (
        site_id SERIAL PRIMARY KEY,
        site_name VARCHAR(255) NOT NULL,
        company_id INTEGER REFERENCES companies(company_id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
        device_id VARCHAR(255) REFERENCES devices(device_id) ON DELETE SET NULL,
        description TEXT,
        location TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
      );
    `);

    // Sensor database (for maintenance/sensor sites)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sensor_database (
        sensor_db_id SERIAL PRIMARY KEY,
        brand_name VARCHAR(255) NOT NULL,
        sensor_type VARCHAR(255) NOT NULL,
        sensor_parameter VARCHAR(255) NOT NULL,
        description TEXT,
        specifications JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
      );
    `);

    // Sensor sites (required by maintenance_schedules)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sensor_sites (
        sensor_site_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sensor_db_id INTEGER REFERENCES sensor_database(sensor_db_id) ON DELETE CASCADE,
        device_id VARCHAR(255) REFERENCES devices(device_id) ON DELETE SET NULL,
        parameter VARCHAR(255) NOT NULL,
        site_id INTEGER REFERENCES sites(site_id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
        installation_date DATE,
        last_maintenance_date DATE,
        next_maintenance_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
      );
    `);

    // Maintenance schedules (required by MaintenanceReminderService)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS maintenance_schedules (
        maintenance_id SERIAL PRIMARY KEY,
        sensor_site_id INTEGER REFERENCES sensor_sites(sensor_site_id) ON DELETE CASCADE,
        maintenance_type VARCHAR(50) NOT NULL,
        planned_date DATE NOT NULL,
        actual_date DATE,
        assigned_person VARCHAR(255),
        status VARCHAR(20) DEFAULT 'planned',
        description TEXT,
        maintenance_notes TEXT,
        reminder_sent BOOLEAN DEFAULT FALSE,
        reminder_sent_at TIMESTAMP,
        reminder_days_before INTEGER DEFAULT 1,
        completion_notification_sent BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
      );
    `);
    try {
      await pool.query(`ALTER TABLE maintenance_schedules ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER DEFAULT 1`);
      await pool.query(`ALTER TABLE maintenance_schedules ADD COLUMN IF NOT EXISTS completion_notification_sent BOOLEAN DEFAULT FALSE`);
    } catch (_) { /* columns may already exist */ }

    // sensor_site_users junction (required by maintenance/sensorSites/technician)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sensor_site_users (
        sensor_site_id INTEGER NOT NULL REFERENCES sensor_sites(sensor_site_id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        assigned_at TIMESTAMP DEFAULT NOW(),
        assigned_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
        PRIMARY KEY (sensor_site_id, user_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sensor_site_users_sensor_site_id ON sensor_site_users(sensor_site_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sensor_site_users_user_id ON sensor_site_users(user_id)`);

    // Scheduled exports (required by SimpleScheduledExportService)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_exports (
        export_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
        cron_expression VARCHAR(100) NOT NULL,
        time_zone VARCHAR(50) DEFAULT 'UTC',
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS export_configurations (
        config_id SERIAL PRIMARY KEY,
        export_id INTEGER REFERENCES scheduled_exports(export_id) ON DELETE CASCADE,
        device_ids BIGINT[] NOT NULL,
        parameters TEXT[] NOT NULL,
        format VARCHAR(10) NOT NULL CHECK (format IN ('pdf', 'excel')),
        template VARCHAR(50) DEFAULT 'standard',
        date_range_days INTEGER DEFAULT 1 CHECK (date_range_days > 0),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS export_email_recipients (
        recipient_id SERIAL PRIMARY KEY,
        export_id INTEGER REFERENCES scheduled_exports(export_id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS export_execution_logs (
        log_id SERIAL PRIMARY KEY,
        export_id INTEGER REFERENCES scheduled_exports(export_id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'running')),
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        file_path VARCHAR(500),
        file_size BIGINT,
        recipients_count INTEGER DEFAULT 0,
        error_message TEXT,
        execution_time_ms BIGINT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Try to convert to hypertables for time-series optimization (only if TimescaleDB is available)
    try {
      await pool.query(`
        SELECT create_hypertable('sensor_readings', 'timestamp', if_not_exists => TRUE);
        SELECT create_hypertable('gps_tracks', 'timestamp', if_not_exists => TRUE);
      `);
      console.log('Time-series tables optimized with TimescaleDB');
    } catch (error) {
      console.log('TimescaleDB not available - using regular PostgreSQL tables');
    }

    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_timestamp ON sensor_readings (device_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_type ON sensor_readings (sensor_type);
      CREATE INDEX IF NOT EXISTS idx_gps_tracks_device_timestamp ON gps_tracks (device_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_device_events_device_timestamp ON device_events (device_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_device_events_type ON device_events (event_type);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
      CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);
      CREATE INDEX IF NOT EXISTS idx_devices_protocol ON devices (protocol);
    `);

    // Create PostGIS-specific indexes if available
    if (hasPostGIS) {
      try {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_gps_tracks_location ON gps_tracks USING GIST (location);
        `);
      } catch (error) {
        console.log('Could not create spatial index');
      }
    }

    // Create default super admin user
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    await pool.query(`
      INSERT INTO users (username, email, password_hash, role, status)
      VALUES ('admin', 'admin@system.local', $1, 'super_admin', 'active')
      ON CONFLICT (username) DO NOTHING;
    `, [hashedPassword]);

    // Create initial system roles
    const systemRoles = [
      {
        role_name: 'super_admin',
        display_name: 'Super Administrator',
        description: 'Full system access with all permissions',
        is_system_role: true,
        permissions: {
          user_management: { create: true, read: true, update: true, delete: true },
          role_management: { create: true, read: true, update: true, delete: true },
          device_management: { create: true, read: true, update: true, delete: true },
          system_settings: { create: true, read: true, update: true, delete: true }
        },
        menu_permissions: {
          '/dashboard': { access: true, create: true, read: true, update: true, delete: true },
          '/quick-view': { access: true, create: true, read: true, update: true, delete: true },
          '/devices': { access: true, create: true, read: true, update: true, delete: true },
          '/users': { access: true, create: true, read: true, update: true, delete: true },
          '/roles': { access: true, create: true, read: true, update: true, delete: true },
          '/field-creator': { access: true, create: true, read: true, update: true, delete: true },
          '/mapper': { access: true, create: true, read: true, update: true, delete: true },
          '/listeners': { access: true, create: true, read: true, update: true, delete: true },
          '/data': { access: true, create: true, read: true, update: true, delete: true },
          '/data-dash': { access: true, create: true, read: true, update: true, delete: true },
          '/data-dash-2': { access: true, create: true, read: true, update: true, delete: true },
          '/alerts': { access: true, create: true, read: true, update: true, delete: true },
          '/alert-settings': { access: true, create: true, read: true, update: true, delete: true },
          '/notification-config': { access: true, create: true, read: true, update: true, delete: true },
          '/settings': { access: true, create: true, read: true, update: true, delete: true }
        },
        device_permissions: {
          all_devices: { read: true, write: true, configure: true, delete: true },
          all_groups: { read: true, write: true, configure: true, delete: true }
        }
      },
      {
        role_name: 'admin',
        display_name: 'Administrator',
        description: 'System administration with user and device management',
        is_system_role: true,
        permissions: {
          user_management: { create: true, read: true, update: true, delete: false },
          role_management: { create: false, read: true, update: false, delete: false },
          device_management: { create: true, read: true, update: true, delete: true },
          system_settings: { create: false, read: true, update: true, delete: false }
        },
        menu_permissions: {
          '/dashboard': { access: true, create: true, read: true, update: true, delete: true },
          '/quick-view': { access: true, create: true, read: true, update: true, delete: true },
          '/devices': { access: true, create: true, read: true, update: true, delete: true },
          '/users': { access: true, create: true, read: true, update: true, delete: false },
          '/roles': { access: false, create: false, read: false, update: false, delete: false },
          '/field-creator': { access: true, create: true, read: true, update: true, delete: true },
          '/mapper': { access: true, create: true, read: true, update: true, delete: true },
          '/listeners': { access: true, create: true, read: true, update: true, delete: true },
          '/data': { access: true, create: true, read: true, update: true, delete: true },
          '/data-dash': { access: true, create: true, read: true, update: true, delete: true },
          '/data-dash-2': { access: true, create: true, read: true, update: true, delete: true },
          '/alerts': { access: true, create: true, read: true, update: true, delete: true },
          '/alert-settings': { access: true, create: true, read: true, update: true, delete: true },
          '/notification-config': { access: true, create: true, read: true, update: true, delete: true },
          '/settings': { access: true, create: false, read: true, update: true, delete: false }
        },
        device_permissions: {
          all_devices: { read: true, write: true, configure: true, delete: true },
          all_groups: { read: true, write: true, configure: true, delete: true }
        }
      },
      {
        role_name: 'operator',
        display_name: 'Operator',
        description: 'Device monitoring and basic configuration',
        is_system_role: true,
        permissions: {
          user_management: { create: false, read: false, update: false, delete: false },
          role_management: { create: false, read: false, update: false, delete: false },
          device_management: { create: false, read: true, update: true, delete: false },
          system_settings: { create: false, read: false, update: false, delete: false }
        },
        menu_permissions: {
          '/dashboard': { access: true, create: false, read: true, update: false, delete: false },
          '/quick-view': { access: true, create: false, read: true, update: false, delete: false },
          '/devices': { access: true, create: false, read: true, update: true, delete: false },
          '/users': { access: false, create: false, read: false, update: false, delete: false },
          '/roles': { access: false, create: false, read: false, update: false, delete: false },
          '/field-creator': { access: false, create: false, read: false, update: false, delete: false },
          '/mapper': { access: true, create: false, read: true, update: true, delete: false },
          '/listeners': { access: true, create: false, read: true, update: true, delete: false },
          '/data': { access: true, create: false, read: true, update: false, delete: false },
          '/data-dash': { access: true, create: false, read: true, update: false, delete: false },
          '/data-dash-2': { access: true, create: false, read: true, update: false, delete: false },
          '/alerts': { access: true, create: false, read: true, update: true, delete: false },
          '/alert-settings': { access: false, create: false, read: false, update: false, delete: false },
          '/notification-config': { access: false, create: false, read: false, update: false, delete: false },
          '/settings': { access: false, create: false, read: false, update: false, delete: false }
        },
        device_permissions: {
          assigned_devices: { read: true, write: false, configure: true, delete: false },
          assigned_groups: { read: true, write: false, configure: true, delete: false }
        }
      },
      {
        role_name: 'viewer',
        display_name: 'Viewer',
        description: 'Read-only access to assigned devices',
        is_system_role: true,
        permissions: {
          user_management: { create: false, read: false, update: false, delete: false },
          role_management: { create: false, read: false, update: false, delete: false },
          device_management: { create: false, read: true, update: false, delete: false },
          system_settings: { create: false, read: false, update: false, delete: false }
        },
        menu_permissions: {
          '/dashboard': { access: true, create: false, read: true, update: false, delete: false },
          '/quick-view': { access: true, create: false, read: true, update: false, delete: false },
          '/devices': { access: true, create: false, read: true, update: false, delete: false },
          '/users': { access: false, create: false, read: false, update: false, delete: false },
          '/roles': { access: false, create: false, read: false, update: false, delete: false },
          '/field-creator': { access: false, create: false, read: false, update: false, delete: false },
          '/mapper': { access: false, create: false, read: false, update: false, delete: false },
          '/listeners': { access: false, create: false, read: false, update: false, delete: false },
          '/data': { access: true, create: false, read: true, update: false, delete: false },
          '/data-dash': { access: true, create: false, read: true, update: false, delete: false },
          '/data-dash-2': { access: true, create: false, read: true, update: false, delete: false },
          '/alerts': { access: true, create: false, read: true, update: false, delete: false },
          '/alert-settings': { access: false, create: false, read: false, update: false, delete: false },
          '/notification-config': { access: false, create: false, read: false, update: false, delete: false },
          '/settings': { access: false, create: false, read: false, update: false, delete: false }
        },
        device_permissions: {
          assigned_devices: { read: true, write: false, configure: false, delete: false },
          assigned_groups: { read: true, write: false, configure: false, delete: false }
        }
      }
    ];

    // Insert system roles
    for (const role of systemRoles) {
      await pool.query(`
        INSERT INTO roles (role_name, display_name, description, is_system_role, permissions, menu_permissions, device_permissions, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
        ON CONFLICT (role_name) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          permissions = EXCLUDED.permissions,
          menu_permissions = EXCLUDED.menu_permissions,
          device_permissions = EXCLUDED.device_permissions,
          updated_at = NOW()
      `, [
        role.role_name,
        role.display_name,
        role.description,
        role.is_system_role,
        JSON.stringify(role.permissions),
        JSON.stringify(role.menu_permissions),
        JSON.stringify(role.device_permissions)
      ]);
    }

    // Assign super_admin role to the default admin user
    await pool.query(`
      INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
      SELECT 1, role_id, true, 1
      FROM roles WHERE role_name = 'super_admin'
      ON CONFLICT (user_id, role_id) DO NOTHING
    `);

    // Create default device group
    await pool.query(`
      INSERT INTO device_groups (name, description, created_by)
      VALUES ('Default Group', 'Default device group for all devices', 1)
      ON CONFLICT DO NOTHING
    `);

    // Role audit logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_audit_logs (
        log_id SERIAL PRIMARY KEY,
        action VARCHAR(50) NOT NULL,
        role_id INTEGER REFERENCES roles(role_id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
        performed_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
        details JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Index for role audit logs
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_role_audit_logs_role_id ON role_audit_logs(role_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_role_audit_logs_action ON role_audit_logs(action)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_role_audit_logs_created_at ON role_audit_logs(created_at)
    `);

    // Role inheritance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_inheritance (
        inheritance_id SERIAL PRIMARY KEY,
        child_role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
        parent_role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(child_role_id, parent_role_id)
      )
    `);

    // Index for role inheritance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_role_inheritance_child ON role_inheritance(child_role_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_role_inheritance_parent ON role_inheritance(parent_role_id)
    `);

    console.log('✓ Database setup completed successfully');
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the setup
setupDatabase();