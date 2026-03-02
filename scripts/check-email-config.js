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

const checkEmailConfig = async () => {
  try {
    console.log('🔍 Checking email configuration...\n');

    // Check email_config table
    console.log('📧 Email Configuration:');
    const emailConfig = await pool.query(`
      SELECT * FROM email_config 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (emailConfig.rows.length === 0) {
      console.log('  ❌ No email configuration found!');
      console.log('  💡 This is why emails are not being sent.');
      console.log('  💡 You need to configure email settings in the admin panel.');
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

    // Check alert_email_config table
    console.log('\n📧 Alert Email Configuration:');
    const alertEmailConfig = await pool.query(`
      SELECT * FROM alert_email_config 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (alertEmailConfig.rows.length === 0) {
      console.log('  ❌ No alert email configuration found!');
    } else {
      const config = alertEmailConfig.rows[0];
      console.log(`  ✅ Alert email config found (ID: ${config.config_id})`);
      console.log(`  - SMTP Host: ${config.smtp_host}`);
      console.log(`  - From Email: ${config.from_email}`);
      console.log(`  - Active: ${config.is_active}`);
    }

    // Check if notification service is working
    console.log('\n📧 Notification Service Status:');
    try {
      const notificationService = require('../server/services/notificationService');
      console.log(`  - Email Transporter: ${notificationService.emailTransporter ? '✅ Initialized' : '❌ Not initialized'}`);
      
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

    console.log('\n🎉 Email configuration check completed!');

  } catch (error) {
    console.error('❌ Error checking email configuration:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the check
checkEmailConfig()
  .then(() => {
    console.log('\n✅ Email configuration check completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Email configuration check failed:', error);
    process.exit(1);
  });