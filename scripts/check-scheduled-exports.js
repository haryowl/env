const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function checkScheduledExports() {
  const client = await pool.connect();
  try {
    console.log('=== Checking Scheduled Exports ===\n');
    
    // Check scheduled exports table structure
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'scheduled_exports'
      ORDER BY ordinal_position
    `);
    
    console.log('Scheduled exports table columns:');
    columns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Check all scheduled exports
    const exports = await client.query(`
      SELECT export_id, name, frequency, cron_expression, is_active, time_zone
      FROM scheduled_exports
      ORDER BY export_id
    `);
    
    console.log('\nScheduled exports:');
    exports.rows.forEach(exp => {
      console.log(`  ID ${exp.export_id}: ${exp.name}`);
      console.log(`    Frequency: ${exp.frequency}`);
      console.log(`    Cron Expression: ${exp.cron_expression || 'NULL'}`);
      console.log(`    Is Active: ${exp.is_active}`);
      console.log(`    Time Zone: ${exp.time_zone}`);
      console.log('');
    });
    
    // Check export configurations
    const configs = await client.query(`
      SELECT config_id, export_id, device_ids, parameters, format, date_range_days
      FROM export_configurations
      ORDER BY export_id
    `);
    
    console.log('Export configurations:');
    configs.rows.forEach(config => {
      console.log(`  Export ID ${config.export_id}:`);
      console.log(`    Device IDs: ${config.device_ids}`);
      console.log(`    Parameters: ${config.parameters}`);
      console.log(`    Format: ${config.format}`);
      console.log(`    Date Range Days: ${config.date_range_days}`);
      console.log('');
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkScheduledExports().catch(console.error);


