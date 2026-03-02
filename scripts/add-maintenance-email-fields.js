require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function addMaintenanceEmailFields() {
  try {
    console.log('🔧 Adding email reminder fields to maintenance_schedules table...');
    
    // Add reminder configuration fields
    await pool.query(`
      ALTER TABLE maintenance_schedules 
      ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS reminder_email_time TIME DEFAULT '09:00:00',
      ADD COLUMN IF NOT EXISTS reminder_recipients TEXT[],
      ADD COLUMN IF NOT EXISTS completion_notification_sent BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS completion_notification_sent_at TIMESTAMP
    `);
    
    console.log('✅ Added email reminder configuration fields');
    
    // Create index for reminder queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_maintenance_reminder_sent 
      ON maintenance_schedules(reminder_sent, planned_date)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_maintenance_completion_notification 
      ON maintenance_schedules(completion_notification_sent, actual_date)
    `);
    
    console.log('✅ Created indexes for reminder queries');
    
    // Update existing records to have default reminder settings
    await pool.query(`
      UPDATE maintenance_schedules 
      SET reminder_days_before = 1, 
          reminder_email_time = '09:00:00'
      WHERE reminder_days_before IS NULL
    `);
    
    console.log('✅ Updated existing records with default reminder settings');
    
    console.log('🎉 Maintenance email reminder fields setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error setting up maintenance email fields:', error.message);
  } finally {
    await pool.end();
  }
}

addMaintenanceEmailFields();


