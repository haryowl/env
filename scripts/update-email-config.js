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

const updateEmailConfig = async () => {
  try {
    console.log('📧 Email Configuration Update Tool\n');

    // Show current configuration
    console.log('📧 Current email configuration:');
    const currentConfig = await pool.query('SELECT * FROM email_config ORDER BY created_at DESC LIMIT 1');
    
    if (currentConfig.rows.length > 0) {
      const config = currentConfig.rows[0];
      console.log(`  - ID: ${config.id}`);
      console.log(`  - SMTP Host: ${config.smtp_host}`);
      console.log(`  - SMTP Port: ${config.smtp_port}`);
      console.log(`  - Username: ${config.username}`);
      console.log(`  - From Email: ${config.from_email}`);
      console.log(`  - From Name: ${config.from_name}`);
      console.log(`  - SSL: ${config.ssl}`);
    } else {
      console.log('  ❌ No email configuration found');
    }

    console.log('\n💡 To fix the email issue, you need to update the email configuration with valid credentials.');
    console.log('\n📝 Instructions:');
    console.log('1. Choose your email provider:');
    console.log('   a) Gmail (requires App Password)');
    console.log('   b) Outlook/Hotmail');
    console.log('   c) Custom SMTP server');
    console.log('   d) Other email provider');
    
    console.log('\n2. For Gmail setup:');
    console.log('   - Enable 2-factor authentication');
    console.log('   - Generate an App Password');
    console.log('   - Use your Gmail address as username');
    console.log('   - Use the App Password (not your regular password)');
    
    console.log('\n3. Update the database manually or use this script with valid credentials.');
    
    console.log('\n🔧 Example SQL to update email config:');
    console.log(`
UPDATE email_config SET
  smtp_host = 'smtp.gmail.com',
  smtp_port = 587,
  username = 'your-actual-email@gmail.com',
  password = 'your-app-password-here',
  from_email = 'your-actual-email@gmail.com',
  from_name = 'IoT Monitoring System',
  ssl = true
WHERE id = ${currentConfig.rows[0]?.id || 1};
    `);

    console.log('\n🎉 After updating the email configuration, restart the backend server.');
    console.log('🎉 Then test the scheduled exports again - they should send emails successfully!');

  } catch (error) {
    console.error('❌ Error checking email configuration:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the update tool
updateEmailConfig()
  .then(() => {
    console.log('\n✅ Email configuration update tool completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Email configuration update tool failed:', error);
    process.exit(1);
  });


