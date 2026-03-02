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

const fixPermissionIssues = async () => {
  try {
    console.log('🔧 Fixing permission issues for existing records...\n');

    // 1. Check current state of alerts table
    console.log('📊 Checking current alerts data...');
    const alertsCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN created_by IS NULL THEN 1 END) as null_created_by,
        COUNT(CASE WHEN created_by IS NOT NULL THEN 1 END) as has_created_by
      FROM alerts
    `);
    
    console.log('Alerts table status:', alertsCheck.rows[0]);

    // 2. Check scheduled exports
    console.log('📊 Checking current scheduled exports data...');
    const exportsCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_exports,
        COUNT(CASE WHEN created_by IS NULL THEN 1 END) as null_created_by,
        COUNT(CASE WHEN created_by IS NOT NULL THEN 1 END) as has_created_by
      FROM scheduled_exports
    `);
    
    console.log('Scheduled exports table status:', exportsCheck.rows[0]);

    // 3. Check email recipients
    console.log('📊 Checking current email recipients data...');
    const recipientsCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_recipients,
        COUNT(CASE WHEN created_by IS NULL THEN 1 END) as null_created_by,
        COUNT(CASE WHEN created_by IS NOT NULL THEN 1 END) as has_created_by
      FROM alert_email_recipients
    `);
    
    console.log('Email recipients table status:', recipientsCheck.rows[0]);

    // 4. Test permission queries
    console.log('\n🧪 Testing permission queries...');
    
    // Test alerts query
    const testAlertsQuery = `
      SELECT alert_id, name, created_by 
      FROM alerts 
      WHERE (created_by = $1 OR created_by IS NULL)
      LIMIT 5
    `;
    
    try {
      const testResult = await pool.query(testAlertsQuery, [1]); // Test with user_id = 1
      console.log('✅ Alerts permission query works:', testResult.rows.length, 'results');
    } catch (error) {
      console.error('❌ Alerts permission query failed:', error.message);
    }

    // 5. Create a comprehensive test
    console.log('\n🔍 Testing specific alert update scenario...');
    
    // Get a sample alert
    const sampleAlert = await pool.query('SELECT alert_id, created_by FROM alerts LIMIT 1');
    if (sampleAlert.rows.length > 0) {
      const alertId = sampleAlert.rows[0].alert_id;
      const createdBy = sampleAlert.rows[0].created_by;
      
      console.log(`Testing alert ID: ${alertId}, created_by: ${createdBy}`);
      
      // Test the exact query used in the PUT route
      const updateTestQuery = `
        UPDATE alerts SET
          name = $1,
          device_id = $2,
          parameter = $3,
          min = $4,
          max = $5,
          type = $6,
          threshold_time = $7,
          actions = $8,
          template = $9,
          updated_at = NOW()
        WHERE alert_id = $10 AND (created_by = $11 OR created_by IS NULL)
        RETURNING *
      `;
      
      try {
        const updateResult = await pool.query(updateTestQuery, [
          'Test Alert', // name
          'test_device', // device_id
          'test_param', // parameter
          0, // min
          100, // max
          'threshold', // type
          60, // threshold_time
          '{}', // actions
          '', // template
          alertId, // alert_id
          1 // user_id
        ]);
        
        if (updateResult.rows.length > 0) {
          console.log('✅ Alert update query works');
        } else {
          console.log('❌ Alert update query returned no rows - permission issue detected');
        }
      } catch (error) {
        console.error('❌ Alert update query failed:', error.message);
      }
    }

    // 6. Provide recommendations
    console.log('\n📋 Recommendations:');
    console.log('1. Check if the user has the correct role (admin/super_admin)');
    console.log('2. Verify the alert_id being sent in the request');
    console.log('3. Check if the user_id in the JWT token matches the created_by field');
    console.log('4. Consider temporarily removing permission checks for testing');

    console.log('\n🎉 Permission analysis completed!');

  } catch (error) {
    console.error('❌ Error analyzing permissions:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the analysis
fixPermissionIssues()
  .then(() => {
    console.log('\n✅ Permission analysis completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Permission analysis failed:', error);
    process.exit(1);
  });


