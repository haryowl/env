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

const debugAlertDeviceId = async () => {
  try {
    console.log('🔍 Debugging alert device_id foreign key issue...\n');

    // 1. Check what devices exist
    console.log('📊 Available devices:');
    const devices = await pool.query(`
      SELECT device_id, name, device_type, status 
      FROM devices 
      ORDER BY device_id
    `);
    
    devices.rows.forEach(device => {
      console.log(`  - ${device.device_id} (${device.name}) - ${device.device_type} - ${device.status}`);
    });

    // 2. Check what alerts exist and their device_ids
    console.log('\n📊 Current alerts:');
    const alerts = await pool.query(`
      SELECT alert_id, name, device_id, parameter, created_by
      FROM alerts 
      ORDER BY alert_id
    `);
    
    alerts.rows.forEach(alert => {
      console.log(`  - Alert ${alert.alert_id}: "${alert.name}" -> device_id: "${alert.device_id}" (created_by: ${alert.created_by})`);
    });

    // 3. Check for foreign key constraint violations
    console.log('\n🔍 Checking for foreign key violations...');
    
    for (const alert of alerts.rows) {
      const deviceExists = await pool.query(`
        SELECT device_id FROM devices WHERE device_id = $1
      `, [alert.device_id]);
      
      if (deviceExists.rows.length === 0) {
        console.log(`❌ Alert ${alert.alert_id} has invalid device_id: "${alert.device_id}"`);
      } else {
        console.log(`✅ Alert ${alert.alert_id} has valid device_id: "${alert.device_id}"`);
      }
    }

    // 4. Test the exact update that's failing
    console.log('\n🧪 Testing alert update with valid device_id...');
    
    if (alerts.rows.length > 0 && devices.rows.length > 0) {
      const testAlert = alerts.rows[0];
      const validDevice = devices.rows[0];
      
      console.log(`Testing update of alert ${testAlert.alert_id} with device_id: ${validDevice.device_id}`);
      
      try {
        const updateResult = await pool.query(`
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
        `, [
          testAlert.name + ' (Updated)',
          validDevice.device_id, // Use valid device_id
          testAlert.parameter,
          testAlert.min,
          testAlert.max,
          testAlert.type,
          testAlert.threshold_time,
          testAlert.actions,
          testAlert.template,
          testAlert.alert_id,
          1 // user_id
        ]);
        
        if (updateResult.rows.length > 0) {
          console.log('✅ Alert update with valid device_id works!');
        } else {
          console.log('❌ Alert update returned no rows - permission issue');
        }
      } catch (error) {
        console.error('❌ Alert update failed:', error.message);
      }
    }

    // 5. Check the foreign key constraint
    console.log('\n🔗 Foreign key constraint info:');
    const fkInfo = await pool.query(`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'alerts'
        AND kcu.column_name = 'device_id'
    `);
    
    if (fkInfo.rows.length > 0) {
      const fk = fkInfo.rows[0];
      console.log(`  Constraint: ${fk.constraint_name}`);
      console.log(`  Column: ${fk.column_name}`);
      console.log(`  References: ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    }

    console.log('\n🎉 Device ID debugging completed!');

  } catch (error) {
    console.error('❌ Error debugging device IDs:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the debugging
debugAlertDeviceId()
  .then(() => {
    console.log('\n✅ Device ID debugging completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Device ID debugging failed:', error);
    process.exit(1);
  });


