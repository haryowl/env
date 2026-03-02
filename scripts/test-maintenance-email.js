require('dotenv').config();
const { sendEmail } = require('../server/services/notificationService');

async function testMaintenanceEmail() {
  console.log('🧪 Testing maintenance email sending...');
  
  try {
    await sendEmail({
      to: ['test@example.com'],
      subject: '🔔 Test Maintenance Reminder',
      html: `
        <h2>Test Maintenance Reminder</h2>
        <p>This is a test email to verify the maintenance reminder system is working.</p>
        <p><strong>Sensor Site:</strong> Test Sensor</p>
        <p><strong>Maintenance Type:</strong> Test Maintenance</p>
        <p><strong>Planned Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Assigned Person:</strong> Test User</p>
      `
    });
    
    console.log('✅ Test email sent successfully!');
  } catch (error) {
    console.error('❌ Test email failed:', error.message);
  }
}

testMaintenanceEmail();


