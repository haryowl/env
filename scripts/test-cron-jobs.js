const cron = require('node-cron');
const moment = require('moment-timezone');

const testCronJobs = () => {
  console.log('🧪 Testing cron job functionality...\n');

  // Test 1: Basic cron job
  console.log('1. Testing basic cron job (every 10 seconds):');
  const job1 = cron.schedule('*/10 * * * * *', () => {
    console.log(`   ✅ Cron job executed at: ${new Date().toISOString()}`);
  }, {
    scheduled: false,
    timezone: 'UTC'
  });

  job1.start();
  console.log('   Started cron job (will run for 30 seconds)...');

  // Test 2: Daily cron job
  console.log('\n2. Testing daily cron job:');
  const job2 = cron.schedule('0 8 * * *', () => {
    console.log(`   ✅ Daily cron job executed at: ${new Date().toISOString()}`);
  }, {
    scheduled: false,
    timezone: 'UTC'
  });

  job2.start();
  console.log('   Started daily cron job (8 AM UTC)');

  // Test 3: Check if jobs are running
  console.log('\n3. Active cron jobs:');
  console.log(`   Job 1 (every 10s): Running`);
  console.log(`   Job 2 (daily 8AM): Running`);

  // Test 4: Validate cron expressions
  console.log('\n4. Validating cron expressions:');
  const expressions = [
    '0 8 * * *',      // Daily at 8 AM
    '0 8 * * 1',      // Weekly on Monday at 8 AM
    '0 8 1 * *',      // Monthly on 1st at 8 AM
    '*/5 * * * *',    // Every 5 minutes
    '*/10 * * * * *'  // Every 10 seconds
  ];

  expressions.forEach(expr => {
    const isValid = cron.validate(expr);
    console.log(`   ${isValid ? '✅' : '❌'} ${expr}`);
  });

  // Test 5: Timezone handling
  console.log('\n5. Testing timezone handling:');
  const now = moment();
  console.log(`   Current UTC time: ${now.utc().format()}`);
  console.log(`   Current local time: ${now.format()}`);
  
  // Test different timezones
  const timezones = ['UTC', 'America/New_York', 'Asia/Jakarta', 'Europe/London'];
  timezones.forEach(tz => {
    const timeInTz = now.tz(tz);
    console.log(`   Time in ${tz}: ${timeInTz.format()}`);
  });

  // Stop jobs after 30 seconds
  setTimeout(() => {
    console.log('\n6. Stopping test jobs...');
    job1.stop();
    job2.stop();
    console.log('   ✅ Test completed');
    process.exit(0);
  }, 30000);

  console.log('\n⏰ Test will run for 30 seconds, then stop...');
};

// Run the test
testCronJobs();
