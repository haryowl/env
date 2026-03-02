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

const debugScheduledExports = async () => {
  try {
    console.log('🔍 Debugging scheduled exports...\n');

    // 1. Check all scheduled exports in database
    console.log('📊 All scheduled exports in database:');
    const allExports = await pool.query(`
      SELECT 
        se.export_id,
        se.name,
        se.frequency,
        se.cron_expression,
        se.is_active,
        se.time_zone,
        se.created_at,
        se.updated_at
      FROM scheduled_exports se
      ORDER BY se.created_at DESC
    `);
    
    allExports.rows.forEach(exportItem => {
      console.log(`  - ID: ${exportItem.export_id}, Name: "${exportItem.name}", Frequency: ${exportItem.frequency}, Active: ${exportItem.is_active}, Cron: ${exportItem.cron_expression}, Timezone: ${exportItem.time_zone}`);
    });

    // 2. Check active exports only
    console.log('\n📊 Active scheduled exports:');
    const activeExports = await pool.query(`
      SELECT 
        se.export_id,
        se.name,
        se.frequency,
        se.cron_expression,
        se.time_zone
      FROM scheduled_exports se
      WHERE se.is_active = true
      ORDER BY se.created_at DESC
    `);
    
    if (activeExports.rows.length === 0) {
      console.log('  ❌ No active scheduled exports found!');
    } else {
      activeExports.rows.forEach(exportItem => {
        console.log(`  ✅ ID: ${exportItem.export_id}, Name: "${exportItem.name}", Frequency: ${exportItem.frequency}, Cron: ${exportItem.cron_expression}, Timezone: ${exportItem.time_zone}`);
      });
    }

    // 3. Check export configurations
    console.log('\n📊 Export configurations:');
    const configs = await pool.query(`
      SELECT 
        ec.export_id,
        ec.device_ids,
        ec.parameters,
        ec.format,
        ec.date_range_days
      FROM export_configurations ec
      ORDER BY ec.export_id
    `);
    
    configs.rows.forEach(config => {
      console.log(`  - Export ID: ${config.export_id}, Devices: ${JSON.stringify(config.device_ids)}, Parameters: ${JSON.stringify(config.parameters)}, Format: ${config.format}, Days: ${config.date_range_days}`);
    });

    // 4. Check email recipients
    console.log('\n📊 Email recipients:');
    const recipients = await pool.query(`
      SELECT 
        eer.export_id,
        eer.email,
        eer.name,
        eer.is_active
      FROM export_email_recipients eer
      ORDER BY eer.export_id, eer.email
    `);
    
    if (recipients.rows.length === 0) {
      console.log('  ❌ No email recipients found!');
    } else {
      recipients.rows.forEach(recipient => {
        console.log(`  - Export ID: ${recipient.export_id}, Email: ${recipient.email}, Name: ${recipient.name}, Active: ${recipient.is_active}`);
      });
    }

    // 5. Check execution logs
    console.log('\n📊 Recent execution logs:');
    const logs = await pool.query(`
      SELECT 
        eel.export_id,
        eel.status,
        eel.started_at,
        eel.completed_at,
        eel.execution_time_ms,
        eel.error_message
      FROM export_execution_logs eel
      ORDER BY eel.started_at DESC
      LIMIT 10
    `);
    
    if (logs.rows.length === 0) {
      console.log('  ❌ No execution logs found!');
    } else {
      logs.rows.forEach(log => {
        console.log(`  - Export ID: ${log.export_id}, Status: ${log.status}, Started: ${log.started_at}, Completed: ${log.completed_at}, Duration: ${log.execution_time_ms}ms, Error: ${log.error_message || 'None'}`);
      });
    }

    // 6. Test cron expression validation
    console.log('\n🧪 Testing cron expressions:');
    const cron = require('node-cron');
    
    const testExpressions = [
      '0 8 * * *',    // Daily at 8 AM
      '0 8 * * 1',    // Weekly on Monday at 8 AM
      '0 8 1 * *',    // Monthly on 1st at 8 AM
      '*/5 * * * *'   // Every 5 minutes (for testing)
    ];
    
    testExpressions.forEach(expr => {
      const isValid = cron.validate(expr);
      console.log(`  ${isValid ? '✅' : '❌'} ${expr} - ${isValid ? 'Valid' : 'Invalid'}`);
    });

    console.log('\n🎉 Scheduled exports debugging completed!');

  } catch (error) {
    console.error('❌ Error debugging scheduled exports:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the debugging
debugScheduledExports()
  .then(() => {
    console.log('\n✅ Scheduled exports debugging completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Scheduled exports debugging failed:', error);
    process.exit(1);
  });
