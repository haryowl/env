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

const fixDeviceIdsToText = async () => {
  try {
    console.log('Fixing export_configurations device_ids column to use TEXT[]...');

    // Check if the table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'export_configurations'
      )
    `);

    if (!tableExists.rows[0].exists) {
      console.log('export_configurations table does not exist, skipping fix');
      return;
    }

    // Check current column type
    const columnInfo = await pool.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns 
      WHERE table_name = 'export_configurations' 
      AND column_name = 'device_ids'
    `);

    if (columnInfo.rows.length === 0) {
      console.log('device_ids column does not exist, skipping fix');
      return;
    }

    const currentType = columnInfo.rows[0].data_type;
    const udtName = columnInfo.rows[0].udt_name;
    console.log(`Current device_ids column type: ${currentType} (${udtName})`);

    if (currentType === 'ARRAY' && udtName === 'int8') {
      console.log('Converting device_ids from BIGINT[] to TEXT[]...');
      
      // First, backup any existing data
      const existingData = await pool.query('SELECT config_id, device_ids FROM export_configurations');
      
      if (existingData.rows.length > 0) {
        console.log(`Found ${existingData.rows.length} existing configurations to preserve`);
        
        // Convert the column type - convert each bigint to text
        await pool.query(`
          ALTER TABLE export_configurations 
          ALTER COLUMN device_ids TYPE TEXT[] USING device_ids::TEXT[]
        `);
        
        console.log('✓ Successfully converted device_ids column to TEXT[]');
      } else {
        console.log('No existing data found, converting column type...');
        await pool.query(`
          ALTER TABLE export_configurations 
          ALTER COLUMN device_ids TYPE TEXT[]
        `);
        console.log('✓ Successfully converted device_ids column to TEXT[]');
      }
    } else if (currentType === 'ARRAY' && udtName === 'text') {
      console.log('✓ device_ids column is already TEXT[]');
    } else {
      console.log(`⚠ Unexpected column type: ${currentType} (${udtName})`);
    }

    // Verify the change
    const newColumnInfo = await pool.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns 
      WHERE table_name = 'export_configurations' 
      AND column_name = 'device_ids'
    `);

    console.log(`Final device_ids column type: ${newColumnInfo.rows[0].data_type} (${newColumnInfo.rows[0].udt_name})`);

    console.log('✅ Device IDs fix completed successfully');

  } catch (error) {
    console.error('❌ Error fixing device_ids column:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the fix if this file is executed directly
if (require.main === module) {
  fixDeviceIdsToText()
    .then(() => {
      console.log('Fix completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fix failed:', error);
      process.exit(1);
    });
}

module.exports = { fixDeviceIdsToText };

