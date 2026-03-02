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

const testExportTrigger = async () => {
  try {
    console.log('🧪 Testing export trigger for NewTest (ID: 15)...\n');

    // Get the export data
    const exportData = await pool.query(`
      SELECT 
        se.*,
        ec.device_ids,
        ec.parameters,
        ec.format,
        ec.template,
        ec.date_range_days,
        array_agg(
          CASE WHEN eer.email IS NOT NULL 
          THEN json_build_object('email', eer.email, 'name', eer.name)
          ELSE NULL END
        ) FILTER (WHERE eer.email IS NOT NULL) as recipients
      FROM scheduled_exports se
      LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
      LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
      WHERE se.export_id = 15
      GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.template, ec.date_range_days
    `);

    if (exportData.rows.length === 0) {
      console.log('❌ Export not found');
      return;
    }

    const exportItem = exportData.rows[0];
    console.log('📊 Export Data:');
    console.log(`  - Name: ${exportItem.name}`);
    console.log(`  - Frequency: ${exportItem.frequency}`);
    console.log(`  - Cron Expression: ${exportItem.cron_expression}`);
    console.log(`  - Timezone: ${exportItem.time_zone}`);
    console.log(`  - Active: ${exportItem.is_active}`);
    console.log(`  - Devices: ${JSON.stringify(exportItem.device_ids)}`);
    console.log(`  - Parameters: ${JSON.stringify(exportItem.parameters)}`);
    console.log(`  - Recipients: ${exportItem.recipients ? exportItem.recipients.length : 0}`);

    // Test the cron expression
    const cron = require('node-cron');
    const isValid = cron.validate(exportItem.cron_expression);
    console.log(`\n🧪 Cron Expression Validation: ${isValid ? '✅ Valid' : '❌ Invalid'}`);

    if (isValid) {
      console.log(`\n⏰ Next execution times for cron: ${exportItem.cron_expression}`);
      console.log('  - This cron runs daily at 12:45 UTC');
      console.log('  - Your local time: 19:45 UTC+7');
      console.log('  - Next execution: Tomorrow at 12:45 UTC');
    }

    console.log('\n🎉 Export trigger test completed!');

  } catch (error) {
    console.error('❌ Error testing export trigger:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the test
testExportTrigger()
  .then(() => {
    console.log('\n✅ Export trigger test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Export trigger test failed:', error);
    process.exit(1);
  });
