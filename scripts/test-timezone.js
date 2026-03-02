const moment = require('moment-timezone');

// Test timezone conversion
const testTimezoneConversion = () => {
  console.log('Testing timezone conversion...');
  
  // Test device timezone conversion
  const deviceTime = '2025-07-26 18:11:05';
  const deviceTimezone = 'Asia/Jakarta';
  
  console.log(`Device time: ${deviceTime}`);
  console.log(`Device timezone: ${deviceTimezone}`);
  
  try {
    const deviceLocalTime = moment.tz(deviceTime, deviceTimezone);
    if (deviceLocalTime.isValid()) {
      const utcTime = deviceLocalTime.utc();
      console.log(`Converted to UTC: ${utcTime.toISOString()}`);
      
      // Test user timezone conversion
      const userTimezone = 'America/New_York';
      const userTime = utcTime.tz(userTimezone);
      console.log(`Displayed in ${userTimezone}: ${userTime.format('YYYY-MM-DD HH:mm:ss')}`);
    } else {
      console.log('Invalid device time');
    }
  } catch (error) {
    console.error('Error in timezone conversion:', error);
  }
};

testTimezoneConversion(); 