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

const addUserPermissionColumns = async () => {
  try {
    console.log('🔧 Adding user permission columns for role-based access control...\n');

    // Check if columns already exist to avoid errors
    const checkColumn = async (tableName, columnName) => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = $1 
          AND column_name = $2
        )
      `, [tableName, columnName]);
      return result.rows[0].exists;
    };

    // 1. Add created_by to alerts table
    const alertsCreatedByExists = await checkColumn('alerts', 'created_by');
    if (!alertsCreatedByExists) {
      console.log('📝 Adding created_by column to alerts table...');
      await pool.query(`
        ALTER TABLE alerts 
        ADD COLUMN created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
      `);
      console.log('✅ Added created_by column to alerts table');
    } else {
      console.log('✅ created_by column already exists in alerts table');
    }

    // 2. Add created_by to alert_email_recipients table
    const recipientsCreatedByExists = await checkColumn('alert_email_recipients', 'created_by');
    if (!recipientsCreatedByExists) {
      console.log('📝 Adding created_by column to alert_email_recipients table...');
      await pool.query(`
        ALTER TABLE alert_email_recipients 
        ADD COLUMN created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
      `);
      console.log('✅ Added created_by column to alert_email_recipients table');
    } else {
      console.log('✅ created_by column already exists in alert_email_recipients table');
    }

    // 3. Add created_by to alert_notification_logs table
    const logsCreatedByExists = await checkColumn('alert_notification_logs', 'created_by');
    if (!logsCreatedByExists) {
      console.log('📝 Adding created_by column to alert_notification_logs table...');
      await pool.query(`
        ALTER TABLE alert_notification_logs 
        ADD COLUMN created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
      `);
      console.log('✅ Added created_by column to alert_notification_logs table');
    } else {
      console.log('✅ created_by column already exists in alert_notification_logs table');
    }

    // 4. Check if notification_logs table exists and add created_by if needed (for backward compatibility)
    const notificationLogsExists = await checkColumn('notification_logs', 'created_by');
    if (!notificationLogsExists) {
      console.log('📝 Adding created_by column to notification_logs table...');
      try {
        await pool.query(`
          ALTER TABLE notification_logs 
          ADD COLUMN created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
        `);
        console.log('✅ Added created_by column to notification_logs table');
      } catch (error) {
        console.log('⚠️ notification_logs table does not exist or error adding column:', error.message);
      }
    } else {
      console.log('✅ created_by column already exists in notification_logs table');
    }

    // 4. Create indexes for better performance
    console.log('\n📊 Creating performance indexes...');
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_alerts_created_by 
        ON alerts(created_by) WHERE created_by IS NOT NULL
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_alert_email_recipients_created_by 
        ON alert_email_recipients(created_by) WHERE created_by IS NOT NULL
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_alert_notification_logs_created_by 
        ON alert_notification_logs(created_by) WHERE created_by IS NOT NULL
      `);
      console.log('✅ Created performance indexes');
    } catch (error) {
      console.log('⚠️ Index creation failed (non-critical):', error.message);
    }

    // 5. Verify the changes
    console.log('\n🔍 Verifying schema changes...');
    const alertsSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'alerts' AND column_name = 'created_by'
    `);
    
    const recipientsSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'alert_email_recipients' AND column_name = 'created_by'
    `);
    
    const logsSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'alert_notification_logs' AND column_name = 'created_by'
    `);

    if (alertsSchema.rows.length > 0) {
      console.log('✅ alerts.created_by:', alertsSchema.rows[0].data_type, '(nullable:', alertsSchema.rows[0].is_nullable === 'YES' ? 'yes' : 'no', ')');
    }
    if (recipientsSchema.rows.length > 0) {
      console.log('✅ alert_email_recipients.created_by:', recipientsSchema.rows[0].data_type, '(nullable:', recipientsSchema.rows[0].is_nullable === 'YES' ? 'yes' : 'no', ')');
    }
    if (logsSchema.rows.length > 0) {
      console.log('✅ alert_notification_logs.created_by:', logsSchema.rows[0].data_type, '(nullable:', logsSchema.rows[0].is_nullable === 'YES' ? 'yes' : 'no', ')');
    }

    console.log('\n🎉 User permission columns added successfully!');
    console.log('\n📋 Summary of changes:');
    console.log('  • Added created_by column to alerts table');
    console.log('  • Added created_by column to alert_email_recipients table');
    console.log('  • Added created_by column to alert_notification_logs table');
    console.log('  • Created performance indexes for all new columns');
    console.log('\n⚠️  Next steps:');
    console.log('  1. Update API routes to use created_by filtering');
    console.log('  2. Update frontend components for user-specific views');
    console.log('  3. Test all functionality to ensure no breaking changes');

  } catch (error) {
    console.error('❌ Error adding user permission columns:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the migration if this file is executed directly
if (require.main === module) {
  addUserPermissionColumns()
    .then(() => {
      console.log('\n✅ Database migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Database migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addUserPermissionColumns };
