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

const checkAvailableParameters = async () => {
  try {
    console.log('Checking for available parameters across all tables...\n');

    // Check device_data table
    console.log('=== device_data table ===');
    const deviceDataCount = await pool.query(`
      SELECT COUNT(*) as count FROM device_data
    `);
    console.log(`Total records: ${deviceDataCount.rows[0].count}`);

    const deviceDataParams = await pool.query(`
      SELECT DISTINCT field_name, unit, data_type
      FROM device_data 
      WHERE field_name IS NOT NULL AND field_name != ''
      ORDER BY field_name
    `);
    
    if (deviceDataParams.rows.length > 0) {
      console.log('Available parameters:');
      deviceDataParams.rows.forEach(param => {
        console.log(`  - ${param.field_name} (${param.unit || 'no unit'}) [${param.data_type || 'unknown type'}]`);
      });
    } else {
      console.log('No parameters found in device_data table');
    }

    // Check if there are other data tables
    console.log('\n=== Checking for other data tables ===');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE '%data%' 
        OR table_name LIKE '%sensor%'
        OR table_name LIKE '%reading%'
      ORDER BY table_name
    `);

    console.log('Data-related tables found:');
    tables.rows.forEach(table => {
      console.log(`  - ${table.table_name}`);
    });

    // Check device_mapper_fields table for field definitions
    console.log('\n=== device_mapper_fields table ===');
    try {
      const mapperFields = await pool.query(`
        SELECT DISTINCT field_name, field_type, unit
        FROM device_mapper_fields 
        ORDER BY field_name
      `);

      if (mapperFields.rows.length > 0) {
        console.log('Field definitions from device_mapper_fields:');
        mapperFields.rows.forEach(field => {
          console.log(`  - ${field.field_name} (${field.unit || 'no unit'}) [${field.field_type || 'unknown type'}]`);
        });
      } else {
        console.log('No field definitions found in device_mapper_fields');
      }
    } catch (error) {
      console.log('device_mapper_fields table not found or accessible');
    }

    // If no parameters found, create some sample parameters
    if (deviceDataParams.rows.length === 0) {
      console.log('\n=== Creating sample parameters ===');
      console.log('No parameters found. You may need to:');
      console.log('1. Add some device data first');
      console.log('2. Or manually insert some sample parameters');
      
      // Optionally insert some sample parameters
      const sampleParams = [
        { field_name: 'temperature', unit: '°C', data_type: 'numeric' },
        { field_name: 'humidity', unit: '%', data_type: 'numeric' },
        { field_name: 'ph', unit: '', data_type: 'numeric' },
        { field_name: 'cod', unit: 'mg/L', data_type: 'numeric' },
        { field_name: 'tss', unit: 'mg/L', data_type: 'numeric' },
        { field_name: 'pressure', unit: 'Pa', data_type: 'numeric' }
      ];

      console.log('\nSample parameters that could be added:');
      sampleParams.forEach(param => {
        console.log(`  - ${param.field_name} (${param.unit}) [${param.data_type}]`);
      });
    }

  } catch (error) {
    console.error('Failed to check available parameters:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
checkAvailableParameters();



