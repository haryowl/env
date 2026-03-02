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

const testScheduledExports = async () => {
  try {
    console.log('Testing Scheduled Export functionality...\n');

    // 1. Check if tables exist
    console.log('1. Checking database tables...');
    const tables = ['scheduled_exports', 'export_configurations', 'export_email_recipients', 'export_execution_logs'];
    
    for (const table of tables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `, [table]);
      
      if (result.rows[0].exists) {
        console.log(`   ✓ ${table} table exists`);
      } else {
        console.log(`   ❌ ${table} table missing`);
      }
    }

    // 2. Check for existing scheduled exports
    console.log('\n2. Checking existing scheduled exports...');
    const exportsResult = await pool.query('SELECT COUNT(*) as count FROM scheduled_exports');
    console.log(`   Found ${exportsResult.rows[0].count} scheduled exports`);

    // 3. Check for devices to use in test
    console.log('\n3. Checking available devices...');
    const devicesResult = await pool.query('SELECT device_id, name FROM devices LIMIT 5');
    if (devicesResult.rows.length > 0) {
      console.log('   Available devices:');
      devicesResult.rows.forEach(device => {
        console.log(`     - ${device.name} (ID: ${device.device_id})`);
      });
    } else {
      console.log('   ⚠ No devices found - create some devices first');
    }

    // 4. Check for email configuration
    console.log('\n4. Checking email configuration...');
    const emailConfigResult = await pool.query('SELECT enabled FROM alert_email_config WHERE id = 1');
    if (emailConfigResult.rows.length > 0) {
      const isEnabled = emailConfigResult.rows[0].enabled;
      console.log(`   Email configuration: ${isEnabled ? 'Enabled' : 'Disabled'}`);
      if (!isEnabled) {
        console.log('   ⚠ Email notifications are disabled - scheduled exports won\'t send emails');
      }
    } else {
      console.log('   ⚠ No email configuration found - set up email config first');
    }

    // 5. Check for sample data
    console.log('\n5. Checking sample data...');
    const dataResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM device_data 
      WHERE timestamp > NOW() - INTERVAL '7 days'
    `);
    console.log(`   Found ${dataResult.rows[0].count} data records in the last 7 days`);

    // 6. Create a test scheduled export (optional)
    console.log('\n6. Testing scheduled export creation...');
    
    if (devicesResult.rows.length > 0 && emailConfigResult.rows.length > 0) {
      try {
        // Check if test export already exists
        const existingTest = await pool.query(`
          SELECT export_id FROM scheduled_exports WHERE name = 'Test Daily Export'
        `);
        
        if (existingTest.rows.length === 0) {
        // Use any available device ID for the test (now supports strings)
        const testDevice = devicesResult.rows[0]; // Use the first available device
        
        if (!testDevice) {
          console.log('   ⚠ No devices found - skipping test export creation');
        } else {
          // Create a test scheduled export
          const testExportResult = await pool.query(`
            WITH new_export AS (
              INSERT INTO scheduled_exports (name, description, frequency, cron_expression, time_zone)
              VALUES ('Test Daily Export', 'Test export for daily reports', 'daily', '0 8 * * *', 'UTC')
              RETURNING export_id
            ),
            new_config AS (
              INSERT INTO export_configurations (export_id, device_ids, parameters, format, template, date_range_days)
              VALUES (
                (SELECT export_id FROM new_export), 
                $1, 
                $2, 
                'excel', 
                'standard', 
                1
              )
              RETURNING config_id
            )
            SELECT export_id FROM new_export
          `, [
            [testDevice.device_id], // Now using device_id as string directly
            ['temperature', 'humidity', 'pressure'] // Default parameters
          ]);
          
          const exportId = testExportResult.rows[0].export_id;
          console.log(`   ✓ Created test scheduled export (ID: ${exportId}) for device: ${testDevice.name} (${testDevice.device_id})`);
          
          // Add a test email recipient
          await pool.query(`
            INSERT INTO export_email_recipients (export_id, email, name)
            VALUES ($1, 'test@example.com', 'Test Recipient')
          `, [exportId]);
          console.log('   ✓ Added test email recipient');
        }
        
        } else {
          console.log('   ℹ Test scheduled export already exists');
        }
      } catch (error) {
        console.log('   ⚠ Failed to create test scheduled export:', error.message);
      }
    } else {
      console.log('   ⚠ Skipping test export creation - missing devices or email config');
    }

    // 7. Test cron expression validation
    console.log('\n7. Testing cron expressions...');
    const cron = require('node-cron');
    const testCrons = [
      { freq: 'daily', expr: '0 8 * * *', desc: 'Daily at 8:00 AM' },
      { freq: 'weekly', expr: '0 8 * * 1', desc: 'Weekly on Monday at 8:00 AM' },
      { freq: 'monthly', expr: '0 8 1 * *', desc: 'Monthly on 1st at 8:00 AM' }
    ];
    
    testCrons.forEach(test => {
      const isValid = cron.validate(test.expr);
      console.log(`   ${isValid ? '✓' : '❌'} ${test.freq}: ${test.expr} - ${test.desc}`);
    });

    console.log('\n🎉 Scheduled Export functionality test completed!');
    console.log('\n📋 Next steps:');
    console.log('  1. Set up email configuration in the admin panel');
    console.log('  2. Create devices and collect some data');
    console.log('  3. Create scheduled exports via the API or frontend');
    console.log('  4. Test manual export triggers');
    console.log('  5. Monitor execution logs');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the test if this file is executed directly
if (require.main === module) {
  testScheduledExports()
    .then(() => {
      console.log('Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testScheduledExports };
