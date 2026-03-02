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

const fixExportConfigDeviceIds = async () => {
  try {
    console.log('Fixing export_configurations device_ids column type...');

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
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'export_configurations' 
      AND column_name = 'device_ids'
    `);

    if (columnInfo.rows.length === 0) {
      console.log('device_ids column does not exist, skipping fix');
      return;
    }

    const currentType = columnInfo.rows[0].data_type;
    console.log(`Current device_ids column type: ${currentType}`);

    if (currentType === 'ARRAY' && columnInfo.rows[0].udt_name === 'int4') {
      console.log('Converting device_ids from INTEGER[] to BIGINT[]...');
      
      // First, backup any existing data
      const existingData = await pool.query('SELECT config_id, device_ids FROM export_configurations');
      
      if (existingData.rows.length > 0) {
        console.log(`Found ${existingData.rows.length} existing configurations to preserve`);
        
        // Convert the column type
        await pool.query(`
          ALTER TABLE export_configurations 
          ALTER COLUMN device_ids TYPE BIGINT[] USING device_ids::BIGINT[]
        `);
        
        console.log('✓ Successfully converted device_ids column to BIGINT[]');
      } else {
        console.log('No existing data found, converting column type...');
        await pool.query(`
          ALTER TABLE export_configurations 
          ALTER COLUMN device_ids TYPE BIGINT[]
        `);
        console.log('✓ Successfully converted device_ids column to BIGINT[]');
      }
    } else {
      console.log('✓ device_ids column is already the correct type (BIGINT[])');
    }

    console.log('✅ Export configurations device_ids fix completed successfully');

  } catch (error) {
    console.error('❌ Error fixing export_configurations device_ids:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the fix if this file is executed directly
if (require.main === module) {
  fixExportConfigDeviceIds()
    .then(() => {
      console.log('Fix completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fix failed:', error);
      process.exit(1);
    });
}

module.exports = { fixExportConfigDeviceIds };

