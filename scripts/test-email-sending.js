const { Pool } = require('pg');
const notificationService = require('../server/services/notificationService');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const testEmailSending = async () => {
  try {
    console.log('🧪 Testing email sending process...\n');

    // 1. Check email service status
    console.log('📧 Email Service Status:');
    console.log(`  - Email Transporter: ${notificationService.emailTransporter ? '✅ Initialized' : '❌ Not initialized'}`);
    console.log(`  - Default Config: ${notificationService.defaultEmailConfig ? '✅ Available' : '❌ Not available'}`);

    // 2. Try to initialize email service
    console.log('\n📧 Initializing email service...');
    try {
      await notificationService.initializeEmailTransporter();
      console.log('✅ Email service initialization completed');
    } catch (error) {
      console.log(`❌ Email service initialization failed: ${error.message}`);
      console.log('💡 This is why emails are not being sent!');
      return;
    }

    // 3. Check recipients for export ID 15
    console.log('\n📧 Checking recipients for NewTest (ID: 15):');
    const recipients = await pool.query(`
      SELECT 
        eer.email,
        eer.name,
        eer.is_active
      FROM export_email_recipients eer
      WHERE eer.export_id = 15 AND eer.is_active = true
    `);
    
    if (recipients.rows.length === 0) {
      console.log('  ❌ No recipients found!');
      return;
    } else {
      console.log(`  ✅ Found ${recipients.rows.length} recipients:`);
      recipients.rows.forEach((recipient, index) => {
        console.log(`    ${index + 1}. ${recipient.email} (${recipient.name})`);
      });
    }

    // 4. Test sending a simple email
    console.log('\n📧 Testing email sending...');
    try {
      const testEmailData = {
        to: recipients.rows[0].email,
        toName: recipients.rows[0].name,
        subject: 'Test Email from IoT System',
        html: '<h2>Test Email</h2><p>This is a test email to verify email functionality.</p>'
      };
      
      await notificationService.sendExportEmail(testEmailData);
      console.log('✅ Test email sent successfully!');
    } catch (error) {
      console.log(`❌ Test email failed: ${error.message}`);
      console.log('💡 This explains why scheduled exports show 0 emails sent.');
    }

    console.log('\n🎉 Email sending test completed!');

  } catch (error) {
    console.error('❌ Error testing email sending:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the test
testEmailSending()
  .then(() => {
    console.log('\n✅ Email sending test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Email sending test failed:', error);
    process.exit(1);
  });


