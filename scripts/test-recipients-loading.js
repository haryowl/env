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

const testRecipientsLoading = async () => {
  try {
    console.log('🧪 Testing recipients loading for scheduled exports...\n');

    // Test the same query used in loadScheduledExports
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

    console.log(`📊 Found ${exports.rows.length} active scheduled exports:`);
    
    exports.rows.forEach((exportItem, index) => {
      console.log(`\n${index + 1}. Export ID: ${exportItem.export_id} (${exportItem.name})`);
      console.log(`   - Frequency: ${exportItem.frequency}`);
      console.log(`   - Active: ${exportItem.is_active}`);
      console.log(`   - Recipients: ${exportItem.recipients ? exportItem.recipients.length : 0}`);
      
      if (exportItem.recipients && exportItem.recipients.length > 0) {
        console.log(`   - Email addresses:`);
        exportItem.recipients.forEach((recipient, i) => {
          console.log(`     ${i + 1}. ${recipient.email} (${recipient.name})`);
        });
      } else {
        console.log(`   - ❌ No recipients found!`);
      }
    });

    // Test the specific export (ID: 15)
    const specificExport = exports.rows.find(exp => exp.export_id === 15);
    if (specificExport) {
      console.log(`\n🎯 NewTest (ID: 15) recipients:`);
      if (specificExport.recipients && specificExport.recipients.length > 0) {
        console.log(`   ✅ Found ${specificExport.recipients.length} recipients:`);
        specificExport.recipients.forEach((recipient, i) => {
          console.log(`     ${i + 1}. ${recipient.email} (${recipient.name})`);
        });
      } else {
        console.log(`   ❌ No recipients found for NewTest!`);
      }
    } else {
      console.log(`\n❌ NewTest (ID: 15) not found in active exports!`);
    }

    console.log('\n🎉 Recipients loading test completed!');

  } catch (error) {
    console.error('❌ Error testing recipients loading:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the test
testRecipientsLoading()
  .then(() => {
    console.log('\n✅ Recipients loading test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Recipients loading test failed:', error);
    process.exit(1);
  });


