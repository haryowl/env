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

const debugAutoTriggerRecipients = async () => {
  try {
    console.log('🔍 Debugging auto trigger recipients loading...\n');

    // Test the exact query used in loadScheduledExports
    console.log('📧 Testing loadScheduledExports query:');
    const exports = await pool.query(`
      SELECT 
        se.export_id,
        se.name,
        se.description,
        se.frequency,
        se.is_active,
        se.time_zone,
        ec.device_ids,
        ec.parameters,
        ec.format,
        ec.date_range_days,
        array_agg(
          CASE WHEN eer.email IS NOT NULL 
          THEN json_build_object('email', eer.email, 'name', eer.name)
          ELSE NULL END
        ) FILTER (WHERE eer.email IS NOT NULL) as recipients
      FROM scheduled_exports se
      LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
      LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
      WHERE se.is_active = true
      GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.date_range_days
    `);

    console.log(`📊 Found ${exports.rows.length} active exports:`);
    
    exports.rows.forEach((exportItem, index) => {
      console.log(`\n${index + 1}. Export ID: ${exportItem.export_id} (${exportItem.name})`);
      console.log(`   - Recipients: ${exportItem.recipients ? exportItem.recipients.length : 0}`);
      console.log(`   - Recipients data:`, JSON.stringify(exportItem.recipients, null, 2));
      
      if (exportItem.recipients && exportItem.recipients.length > 0) {
        console.log(`   ✅ Has recipients - should send emails`);
      } else {
        console.log(`   ❌ No recipients - will skip email sending`);
      }
    });

    // Test the manual trigger query for comparison
    console.log('\n📧 Testing manual trigger query for comparison:');
    const manualTriggerData = await pool.query(`
      SELECT 
        se.export_id,
        se.name,
        se.description,
        se.frequency,
        se.is_active,
        se.time_zone,
        ec.device_ids,
        ec.parameters,
        ec.format,
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
      GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.date_range_days
    `);

    if (manualTriggerData.rows.length > 0) {
      const manualData = manualTriggerData.rows[0];
      console.log(`\n🎯 Manual trigger data for NewTest (ID: 15):`);
      console.log(`   - Recipients: ${manualData.recipients ? manualData.recipients.length : 0}`);
      console.log(`   - Recipients data:`, JSON.stringify(manualData.recipients, null, 2));
    }

    console.log('\n🎉 Auto trigger recipients debugging completed!');

  } catch (error) {
    console.error('❌ Error debugging auto trigger recipients:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the debug
debugAutoTriggerRecipients()
  .then(() => {
    console.log('\n✅ Auto trigger recipients debugging completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Auto trigger recipients debugging failed:', error);
    process.exit(1);
  });


