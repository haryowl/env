const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function createTables() {
  const client = await pool.connect();
  
  try {
    console.log('Creating In Addition tables...');

    // 1. Companies table
    await client.query(`
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
    console.log('✅ Created companies table');

    // 2. Sites table
    await client.query(`
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
    console.log('✅ Created sites table');

    // 3. Sensor database table (sensor types/brands)
    await client.query(`
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
    console.log('✅ Created sensor_database table');

    // 4. Sensor sites table (actual sensor installations)
    await client.query(`
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
    console.log('✅ Created sensor_sites table');

    // 5. Maintenance schedules table
    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_schedules (
        maintenance_id SERIAL PRIMARY KEY,
        sensor_site_id INTEGER REFERENCES sensor_sites(sensor_site_id) ON DELETE CASCADE,
        maintenance_type VARCHAR(50) NOT NULL, -- 'visit', 'maintenance', 'calibration'
        planned_date DATE NOT NULL,
        actual_date DATE,
        assigned_person VARCHAR(255),
        status VARCHAR(20) DEFAULT 'planned', -- 'planned', 'in_progress', 'completed', 'cancelled'
        description TEXT,
        maintenance_notes TEXT,
        reminder_sent BOOLEAN DEFAULT FALSE,
        reminder_sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
      );
    `);
    console.log('✅ Created maintenance_schedules table');

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(company_name);
      CREATE INDEX IF NOT EXISTS idx_sites_company ON sites(company_id);
      CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
      CREATE INDEX IF NOT EXISTS idx_sites_device ON sites(device_id);
      CREATE INDEX IF NOT EXISTS idx_sensor_database_brand ON sensor_database(brand_name);
      CREATE INDEX IF NOT EXISTS idx_sensor_database_type ON sensor_database(sensor_type);
      CREATE INDEX IF NOT EXISTS idx_sensor_sites_device ON sensor_sites(device_id);
      CREATE INDEX IF NOT EXISTS idx_sensor_sites_site ON sensor_sites(site_id);
      CREATE INDEX IF NOT EXISTS idx_sensor_sites_parameter ON sensor_sites(parameter);
      CREATE INDEX IF NOT EXISTS idx_maintenance_sensor_site ON maintenance_schedules(sensor_site_id);
      CREATE INDEX IF NOT EXISTS idx_maintenance_planned_date ON maintenance_schedules(planned_date);
      CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_schedules(status);
    `);
    console.log('✅ Created indexes');

    // Create function to calculate sensor status
    await client.query(`
      CREATE OR REPLACE FUNCTION get_sensor_status(p_device_id VARCHAR, p_parameter VARCHAR)
      RETURNS VARCHAR AS $$
      DECLARE
        last_update TIMESTAMP;
        avg_value NUMERIC;
        status VARCHAR(20);
      BEGIN
        -- Get last update time and average value from last 6 hours
        SELECT MAX(timestamp), AVG(value) 
        INTO last_update, avg_value
        FROM sensor_readings 
        WHERE device_id = p_device_id 
        AND sensor_type = p_parameter 
        AND timestamp >= NOW() - INTERVAL '6 hours';
        
        -- Determine status based on last update
        IF last_update IS NULL THEN
          status := 'red'; -- No data
        ELSIF last_update < NOW() - INTERVAL '3 hours' THEN
          status := 'red'; -- No update for 3+ hours
        ELSIF last_update < NOW() - INTERVAL '1 hour' THEN
          status := 'yellow'; -- Data older than 1 hour
        ELSE
          status := 'green'; -- Recent data
        END IF;
        
        RETURN status;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created sensor status function');

    // Create view for sensor sites with status
    await client.query(`
      CREATE OR REPLACE VIEW sensor_sites_with_status AS
      SELECT 
        ss.*,
        sd.brand_name,
        sd.sensor_type,
        s.site_name,
        c.company_name,
        d.name as device_name,
        get_sensor_status(ss.device_id, ss.parameter) as sensor_status,
        CASE 
          WHEN get_sensor_status(ss.device_id, ss.parameter) = 'green' THEN 'Online'
          WHEN get_sensor_status(ss.device_id, ss.parameter) = 'yellow' THEN 'Warning'
          ELSE 'Offline'
        END as status_text
      FROM sensor_sites ss
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN companies c ON s.company_id = c.company_id
      LEFT JOIN devices d ON ss.device_id = d.device_id;
    `);
    console.log('✅ Created sensor sites with status view');

    console.log('\n🎉 All In Addition tables created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createTables().catch(console.error);
