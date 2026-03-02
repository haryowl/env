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

const createScheduledExportTables = async () => {
  try {
    console.log('Creating scheduled export tables...');

    // Check if tables already exist
    const checkTable = async (tableName) => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `, [tableName]);
      return result.rows[0].exists;
    };

    // 1. Create scheduled_exports table
    const scheduledExportsExists = await checkTable('scheduled_exports');
    if (!scheduledExportsExists) {
      await pool.query(`
        CREATE TABLE scheduled_exports (
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
        )
      `);
      console.log('✓ Created scheduled_exports table');
    } else {
      console.log('✓ scheduled_exports table already exists');
    }

    // 2. Create export_configurations table
    const exportConfigsExists = await checkTable('export_configurations');
    if (!exportConfigsExists) {
      await pool.query(`
        CREATE TABLE export_configurations (
          config_id SERIAL PRIMARY KEY,
          export_id INTEGER REFERENCES scheduled_exports(export_id) ON DELETE CASCADE,
          device_ids BIGINT[] NOT NULL,
          parameters TEXT[] NOT NULL,
          format VARCHAR(10) NOT NULL CHECK (format IN ('pdf', 'excel')),
          template VARCHAR(50) DEFAULT 'standard',
          date_range_days INTEGER DEFAULT 1 CHECK (date_range_days > 0),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✓ Created export_configurations table');
    } else {
      console.log('✓ export_configurations table already exists');
    }

    // 3. Create export_email_recipients table
    const exportRecipientsExists = await checkTable('export_email_recipients');
    if (!exportRecipientsExists) {
      await pool.query(`
        CREATE TABLE export_email_recipients (
          recipient_id SERIAL PRIMARY KEY,
          export_id INTEGER REFERENCES scheduled_exports(export_id) ON DELETE CASCADE,
          email VARCHAR(255) NOT NULL,
          name VARCHAR(255),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✓ Created export_email_recipients table');
    } else {
      console.log('✓ export_email_recipients table already exists');
    }

    // 4. Create export_execution_logs table
    const exportLogsExists = await checkTable('export_execution_logs');
    if (!exportLogsExists) {
      await pool.query(`
        CREATE TABLE export_execution_logs (
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
        )
      `);
      console.log('✓ Created export_execution_logs table');
    } else {
      console.log('✓ export_execution_logs table already exists');
    }

    // 5. Create indexes for better performance
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_scheduled_exports_active 
        ON scheduled_exports(is_active) WHERE is_active = true
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_scheduled_exports_frequency 
        ON scheduled_exports(frequency)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_export_configurations_export_id 
        ON export_configurations(export_id)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_export_recipients_export_id 
        ON export_email_recipients(export_id)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_export_logs_export_id 
        ON export_execution_logs(export_id)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_export_logs_status 
        ON export_execution_logs(status)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_export_logs_started_at 
        ON export_execution_logs(started_at)
      `);
      console.log('✓ Created performance indexes');
    } catch (error) {
      console.log('⚠ Index creation failed (non-critical):', error.message);
    }

    // 6. Create triggers for updated_at timestamps
    try {
      await pool.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql';
      `);

      await pool.query(`
        DROP TRIGGER IF EXISTS update_scheduled_exports_updated_at 
        ON scheduled_exports;
        CREATE TRIGGER update_scheduled_exports_updated_at 
        BEFORE UPDATE ON scheduled_exports 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);

      await pool.query(`
        DROP TRIGGER IF EXISTS update_export_configurations_updated_at 
        ON export_configurations;
        CREATE TRIGGER update_export_configurations_updated_at 
        BEFORE UPDATE ON export_configurations 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);
      console.log('✓ Created update triggers');
    } catch (error) {
      console.log('⚠ Trigger creation failed (non-critical):', error.message);
    }

    // 7. Insert default export templates (optional)
    try {
      const templatesResult = await pool.query(`
        SELECT COUNT(*) as count FROM scheduled_exports WHERE name LIKE 'Default%'
      `);
      
      if (parseInt(templatesResult.rows[0].count) === 0) {
        // Insert default templates (commented out for now to avoid clutter)
        console.log('ℹ No default templates inserted (can be added later if needed)');
      } else {
        console.log('✓ Default templates already exist');
      }
    } catch (error) {
      console.log('⚠ Template insertion failed (non-critical):', error.message);
    }

    console.log('\n🎉 Scheduled export tables setup completed successfully!');
    console.log('\n📋 Tables created:');
    console.log('  • scheduled_exports - Main export job definitions');
    console.log('  • export_configurations - Export settings and parameters');
    console.log('  • export_email_recipients - Email recipient lists');
    console.log('  • export_execution_logs - Execution history and status');

  } catch (error) {
    console.error('❌ Error creating scheduled export tables:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the setup if this file is executed directly
if (require.main === module) {
  createScheduledExportTables()
    .then(() => {
      console.log('Database setup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database setup failed:', error);
      process.exit(1);
    });
}

module.exports = { createScheduledExportTables };
