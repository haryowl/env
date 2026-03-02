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

async function checkTables() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking sensor_database table structure...\n');
    
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'sensor_database'
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 sensor_database columns:');
    result.rows.forEach(col => {
      console.log(`  • ${col.column_name} (${col.data_type}${col.is_nullable === 'NO' ? ', NOT NULL' : ''})`);
    });
    
    console.log('\n🔍 Checking sensor_sites table structure...\n');
    
    const result2 = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'sensor_sites'
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 sensor_sites columns:');
    result2.rows.forEach(col => {
      console.log(`  • ${col.column_name} (${col.data_type}${col.is_nullable === 'NO' ? ', NOT NULL' : ''})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTables();


