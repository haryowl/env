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

const debugEmailConfig = async () => {
  try {
    console.log('🔍 Debugging email configuration...\n');

    // 1. Check email configuration
    console.log('📧 Email Configuration:');
    const emailConfig = await pool.query(`
      SELECT * FROM email_configurations 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (emailConfig.rows.length === 0) {
      console.log('  ❌ No email configuration found!');
    } else {
      const config = emailConfig.rows[0];
      console.log(`  ✅ Email config found (ID: ${config.config_id})`);
      console.log(`  - SMTP Host: ${config.smtp_host}`);
      console.log(`  - SMTP Port: ${config.smtp_port}`);
      console.log(`  - From Email: ${config.from_email}`);
      console.log(`  - From Name: ${config.from_name}`);
      console.log(`  - Username: ${config.username}`);
      console.log(`  - SSL: ${config.ssl}`);
      console.log(`  - Active: ${config.is_active}`);
    }

    // 2. Check export recipients for NewTest (ID: 15)
    console.log('\n📧 Export Recipients for NewTest (ID: 15):');
    const recipients = await pool.query(`
      SELECT 
        eer.email,
        eer.name,
        eer.is_active,
        eer.created_at
      FROM export_email_recipients eer
      WHERE eer.export_id = 15
      ORDER BY eer.created_at
    `);
    
    if (recipients.rows.length === 0) {
      console.log('  ❌ No email recipients found for export ID 15!');
    } else {
      console.log(`  ✅ Found ${recipients.rows.length} recipients:`);
      recipients.rows.forEach((recipient, index) => {
        console.log(`    ${index + 1}. ${recipient.email} (${recipient.name}) - Active: ${recipient.is_active}`);
      });
    }

    // 3. Check recent execution logs for email details
    console.log('\n📧 Recent Execution Logs:');
    const logs = await pool.query(`
      SELECT 
        eel.export_id,
        eel.status,
        eel.started_at,
        eel.recipients_count,
        eel.error_message
      FROM export_execution_logs eel
      WHERE eel.export_id = 15
      ORDER BY eel.started_at DESC
      LIMIT 3
    `);
    
    if (logs.rows.length === 0) {
      console.log('  ❌ No execution logs found!');
    } else {
      logs.rows.forEach((log, index) => {
        console.log(`    ${index + 1}. ${log.started_at} - Status: ${log.status}, Recipients: ${log.recipients_count}, Error: ${log.error_message || 'None'}`);
      });
    }

    // 4. Check if email service is working
    console.log('\n📧 Email Service Status:');
    try {
      const notificationService = require('../server/services/notificationService');
      const isInitialized = notificationService.emailTransporter !== null;
      console.log(`  - Email Transporter: ${isInitialized ? '✅ Initialized' : '❌ Not initialized'}`);
      
      if (notificationService.defaultEmailConfig) {
        console.log(`  - Default Config: ✅ Available`);
        console.log(`    - From: ${notificationService.defaultEmailConfig.from_email}`);
        console.log(`    - Host: ${notificationService.defaultEmailConfig.smtp_host}`);
      } else {
        console.log(`  - Default Config: ❌ Not available`);
      }
    } catch (error) {
      console.log(`  - Email Service: ❌ Error - ${error.message}`);
    }

    console.log('\n🎉 Email configuration debugging completed!');

  } catch (error) {
    console.error('❌ Error debugging email configuration:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the debugging
debugEmailConfig()
  .then(() => {
    console.log('\n✅ Email configuration debugging completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Email configuration debugging failed:', error);
    process.exit(1);
  });


