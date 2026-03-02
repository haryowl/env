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

const checkDeviceDataStructure = async () => {
  try {
    console.log('Checking device_data table structure...\n');

    // Get table structure
    const structure = await pool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'device_data' 
      ORDER BY ordinal_position
    `);

    console.log('=== device_data Table Structure ===');
    structure.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    // Get sample data to see what columns contain parameter information
    const sampleData = await pool.query(`
      SELECT * FROM device_data 
      LIMIT 5
    `);

    console.log('\n=== Sample Data ===');
    if (sampleData.rows.length > 0) {
      console.log('Columns:', Object.keys(sampleData.rows[0]));
      console.log('Sample row:', JSON.stringify(sampleData.rows[0], null, 2));
    } else {
      console.log('No data found in device_data table');
    }

    // Check if there are any JSON columns that might contain parameter data
    const jsonColumns = structure.rows.filter(col => 
      col.data_type === 'json' || col.data_type === 'jsonb'
    );

    if (jsonColumns.length > 0) {
      console.log('\n=== JSON Columns Found ===');
      jsonColumns.forEach(col => {
        console.log(`JSON Column: ${col.column_name}`);
      });

      // Sample the JSON data
      for (const col of jsonColumns) {
        const jsonSample = await pool.query(`
          SELECT ${col.column_name} 
          FROM device_data 
          WHERE ${col.column_name} IS NOT NULL 
          LIMIT 3
        `);

        console.log(`\nSample data from ${col.column_name}:`);
        jsonSample.rows.forEach((row, index) => {
          console.log(`Row ${index + 1}:`, JSON.stringify(row[col.column_name], null, 2));
        });
      }
    }

  } catch (error) {
    console.error('Failed to check device_data structure:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
checkDeviceDataStructure();



