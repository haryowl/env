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

const testNotificationIntegration = async () => {
  try {
    console.log('Testing notification integration...');

    // Check if required tables exist
    const tables = ['alerts', 'alert_logs', 'email_config', 'http_config', 'email_recipients', 'notification_logs'];
    for (const table of tables) {
      const result = await pool.query(`SELECT to_regclass('public.${table}') AS table_exists`);
      if (!result.rows[0].table_exists) {
        console.error(`❌ Table ${table} does not exist`);
        return;
      }
      console.log(`✅ Table ${table} exists`);
    }

    // Check if there are any alerts configured
    const alerts = await pool.query('SELECT * FROM alerts LIMIT 5');
    console.log(`📊 Found ${alerts.rows.length} alerts in the system`);

    if (alerts.rows.length > 0) {
      console.log('\n📋 Alert configurations:');
      alerts.rows.forEach((alert, index) => {
        console.log(`${index + 1}. ${alert.name} (${alert.type})`);
        console.log(`   Device: ${alert.device_id}`);
        console.log(`   Parameter: ${alert.parameter}`);
        console.log(`   Actions: ${JSON.stringify(alert.actions)}`);
        console.log(`   Template: ${alert.template ? 'Configured' : 'Not configured'}`);
        console.log('');
      });
    }

    // Check email configuration
    const emailConfigs = await pool.query('SELECT * FROM email_config WHERE is_default = true');
    if (emailConfigs.rows.length > 0) {
      console.log('✅ Default email configuration found');
      const config = emailConfigs.rows[0];
      console.log(`   SMTP Host: ${config.smtp_host}:${config.smtp_port}`);
      console.log(`   From: ${config.from_name} <${config.from_email}>`);
    } else {
      console.log('⚠️  No default email configuration found');
    }

    // Check HTTP configuration
    const httpConfigs = await pool.query('SELECT * FROM http_config WHERE is_default = true');
    if (httpConfigs.rows.length > 0) {
      console.log('✅ Default HTTP configuration found');
      const config = httpConfigs.rows[0];
      console.log(`   URL: ${config.url}`);
      console.log(`   Method: ${config.method}`);
    } else {
      console.log('⚠️  No default HTTP configuration found');
    }

    // Check email recipients
    const recipients = await pool.query('SELECT * FROM email_recipients WHERE is_active = true');
    console.log(`📧 Found ${recipients.rows.length} active email recipients`);

    // Check notification logs
    const logs = await pool.query('SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 5');
    console.log(`📝 Found ${logs.rows.length} recent notification logs`);

    if (logs.rows.length > 0) {
      console.log('\n📋 Recent notification logs:');
      logs.rows.forEach((log, index) => {
        console.log(`${index + 1}. ${log.notification_type} to ${log.recipient} - ${log.status}`);
        console.log(`   Alert ID: ${log.alert_id}`);
        console.log(`   Time: ${log.created_at}`);
        if (log.error_details) {
          console.log(`   Error: ${log.error_details}`);
        }
        console.log('');
      });
    }

    // Test alert evaluation service
    console.log('\n🧪 Testing alert evaluation service...');
    
    // Import the alert evaluation service
    const { evaluateThresholdAlertsOnData } = require('../server/services/alertEvaluationService');
    
    // Test with a sample alert if one exists
    if (alerts.rows.length > 0) {
      const testAlert = alerts.rows[0];
      console.log(`Testing with alert: ${testAlert.name}`);
      
      try {
        // This will test the notification sending if the alert has actions configured
        await evaluateThresholdAlertsOnData(
          testAlert.device_id,
          testAlert.parameter,
          999, // Test value that should trigger threshold
          new Date()
        );
        console.log('✅ Alert evaluation test completed');
      } catch (error) {
        console.error('❌ Alert evaluation test failed:', error.message);
      }
    } else {
      console.log('⚠️  No alerts found to test with');
    }

    console.log('\n🎉 Notification integration test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  testNotificationIntegration().catch(console.error);
}

module.exports = { testNotificationIntegration }; 