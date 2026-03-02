require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function checkMaintenanceTables() {
  try {
    console.log('🔍 Checking maintenance_schedules table structure...');
    
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'maintenance_schedules' 
      ORDER BY ordinal_position
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ maintenance_schedules table does not exist');
      console.log('📋 Need to create maintenance_schedules table with the following structure:');
      console.log('• maintenance_schedule_id (integer, NOT NULL)');
      console.log('• sensor_site_id (integer, NOT NULL)');
      console.log('• plan_visit_date (date)');
      console.log('• actual_visit_date (date)');
      console.log('• plan_maintenance_date (date)');
      console.log('• actual_maintenance_date (date)');
      console.log('• maintenance_person (character varying)');
      console.log('• reminder_email_time (timestamp)');
      console.log('• maintenance_status (character varying)');
      console.log('• notes (text)');
      console.log('• created_at (timestamp)');
      console.log('• updated_at (timestamp)');
      console.log('• created_by (integer)');
    } else {
      console.log('📋 maintenance_schedules columns:');
      result.rows.forEach(row => {
        console.log(`• ${row.column_name} (${row.data_type}, ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkMaintenanceTables();


