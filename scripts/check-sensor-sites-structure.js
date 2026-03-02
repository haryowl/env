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

async function checkSensorSitesStructure() {
  try {
    console.log('🔍 Checking sensor_sites table structure...');
    
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'sensor_sites' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 sensor_sites columns:');
    result.rows.forEach(row => {
      console.log(`• ${row.column_name} (${row.data_type}, ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });
    
    // Check if sensor_site_users table exists
    const junctionTableResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'sensor_site_users'
    `);
    
    if (junctionTableResult.rows.length > 0) {
      console.log('\n✅ sensor_site_users junction table exists');
      
      const junctionColumns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'sensor_site_users' 
        ORDER BY ordinal_position
      `);
      
      console.log('📋 sensor_site_users columns:');
      junctionColumns.rows.forEach(row => {
        console.log(`• ${row.column_name} (${row.data_type}, ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
      });
    } else {
      console.log('\n❌ sensor_site_users junction table does not exist');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSensorSitesStructure();
