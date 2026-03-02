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

const checkDeviceIdType = async () => {
  try {
    console.log('Checking device_id column type and sample values...\n');

    // Check the data type of device_id column
    const columnInfo = await pool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'devices' 
      AND column_name = 'device_id'
    `);

    if (columnInfo.rows.length > 0) {
      const col = columnInfo.rows[0];
      console.log('Device ID column info:');
      console.log(`  Column: ${col.column_name}`);
      console.log(`  Data Type: ${col.data_type}`);
      console.log(`  Max Length: ${col.character_maximum_length || 'N/A'}`);
      console.log(`  Nullable: ${col.is_nullable}`);
    } else {
      console.log('❌ device_id column not found in devices table');
      return;
    }

    // Get sample device IDs
    console.log('\nSample device IDs:');
    const sampleDevices = await pool.query(`
      SELECT device_id, name 
      FROM devices 
      ORDER BY device_id 
      LIMIT 10
    `);

    sampleDevices.rows.forEach(device => {
      console.log(`  - ${device.name}: ${device.device_id} (type: ${typeof device.device_id})`);
    });

    // Check if we have any very large device IDs
    const largeDevices = await pool.query(`
      SELECT device_id, name 
      FROM devices 
      WHERE LENGTH(device_id::text) > 15
      ORDER BY LENGTH(device_id::text) DESC
      LIMIT 5
    `);

    if (largeDevices.rows.length > 0) {
      console.log('\nLarge device IDs (>15 digits):');
      largeDevices.rows.forEach(device => {
        const length = device.device_id.toString().length;
        console.log(`  - ${device.name}: ${device.device_id} (${length} digits)`);
      });
    }

    // Check BIGINT range limits
    console.log('\nPostgreSQL BIGINT range:');
    console.log(`  Min: -9,223,372,036,854,775,808`);
    console.log(`  Max: 9,223,372,036,854,775,807`);

    // Test the problematic device ID
    const testId = '7032259136010134000';
    console.log(`\nTesting problematic device ID: ${testId}`);
    console.log(`  Length: ${testId.length} digits`);
    console.log(`  As number: ${parseInt(testId)}`);
    console.log(`  Exceeds BIGINT max? ${parseInt(testId) > 9223372036854775807}`);

  } catch (error) {
    console.error('❌ Error checking device ID type:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the check if this file is executed directly
if (require.main === module) {
  checkDeviceIdType()
    .then(() => {
      console.log('\nCheck completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Check failed:', error);
      process.exit(1);
    });
}

module.exports = { checkDeviceIdType };

