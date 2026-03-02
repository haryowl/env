const notificationService = require('../server/services/notificationService');

const testEmailService = async () => {
  try {
    console.log('🧪 Testing email service initialization...\n');

    console.log('📧 Current email service status:');
    console.log(`  - Email Transporter: ${notificationService.emailTransporter ? '✅ Initialized' : '❌ Not initialized'}`);
    console.log(`  - Default Config: ${notificationService.defaultEmailConfig ? '✅ Available' : '❌ Not available'}`);

    console.log('\n📧 Attempting to initialize email transporter...');
    try {
      await notificationService.initializeEmailTransporter();
      console.log('✅ Email transporter initialization completed');
      
      console.log('\n📧 Post-initialization status:');
      console.log(`  - Email Transporter: ${notificationService.emailTransporter ? '✅ Initialized' : '❌ Not initialized'}`);
      console.log(`  - Default Config: ${notificationService.defaultEmailConfig ? '✅ Available' : '❌ Not available'}`);
      
      if (notificationService.defaultEmailConfig) {
        console.log('\n📧 Email configuration details:');
        console.log(`  - SMTP Host: ${notificationService.defaultEmailConfig.smtp_host}`);
        console.log(`  - SMTP Port: ${notificationService.defaultEmailConfig.smtp_port}`);
        console.log(`  - From Email: ${notificationService.defaultEmailConfig.from_email}`);
        console.log(`  - From Name: ${notificationService.defaultEmailConfig.from_name}`);
        console.log(`  - Username: ${notificationService.defaultEmailConfig.username}`);
      }
      
    } catch (error) {
      console.log(`❌ Email transporter initialization failed: ${error.message}`);
      console.log('💡 This is likely because the email configuration has invalid credentials.');
      console.log('💡 You need to update the email settings with valid SMTP credentials.');
    }

    console.log('\n🎉 Email service test completed!');

  } catch (error) {
    console.error('❌ Error testing email service:', error);
    throw error;
  }
};

// Run the test
testEmailService()
  .then(() => {
    console.log('\n✅ Email service test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Email service test failed:', error);
    process.exit(1);
  });


