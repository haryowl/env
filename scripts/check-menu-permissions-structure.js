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

async function checkMenuPermissionsStructure() {
  try {
    console.log('🔍 Checking menu_permissions table structure...');
    
    // Check table structure
    const structure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'menu_permissions' 
      ORDER BY ordinal_position
    `);
    
    if (structure.rows.length === 0) {
      console.log('❌ menu_permissions table does not exist');
      return;
    }
    
    console.log('📋 menu_permissions table structure:');
    structure.rows.forEach(row => {
      console.log(`• ${row.column_name} (${row.data_type}, ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });
    
    // Check existing menu permissions
    const menuPermissions = await pool.query(`
      SELECT * FROM menu_permissions 
      WHERE menu_path IN ('/company-site', '/sensor-management', '/maintenance')
      ORDER BY menu_path
    `);
    
    console.log('\n📋 Current menu permissions for "In Addition" features:');
    if (menuPermissions.rows.length === 0) {
      console.log('❌ No menu permissions found for "In Addition" features');
    } else {
      menuPermissions.rows.forEach(row => {
        console.log('•', row);
      });
    }
    
    // Check all menu permissions to understand the structure
    const allPermissions = await pool.query(`
      SELECT * FROM menu_permissions LIMIT 5
    `);
    
    console.log('\n📋 Sample menu permissions (first 5):');
    allPermissions.rows.forEach(row => {
      console.log('•', row);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkMenuPermissionsStructure();


