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

async function checkInAdditionPermissions() {
  try {
    console.log('🔍 Checking "In Addition" menu permissions...');
    
    // Check if the menu permissions exist
    const menuPermissions = await pool.query(`
      SELECT menu_path, allowed_roles
      FROM menu_permissions 
      WHERE menu_path IN ('/company-site', '/sensor-management', '/maintenance')
      ORDER BY menu_path
    `);
    
    console.log('\n📋 Current menu permissions for "In Addition" features:');
    if (menuPermissions.rows.length === 0) {
      console.log('❌ No menu permissions found for "In Addition" features');
    } else {
      menuPermissions.rows.forEach(row => {
        console.log(`• ${row.menu_path}: ${row.allowed_roles}`);
      });
    }
    
    // Check what roles exist
    const roles = await pool.query(`
      SELECT role_name FROM roles ORDER BY role_name
    `);
    
    console.log('\n👥 Available roles:');
    roles.rows.forEach(row => {
      console.log(`• ${row.role_name}`);
    });
    
    // Check if we need to add the missing permissions
    const requiredMenus = ['/company-site', '/sensor-management', '/maintenance'];
    const existingMenus = menuPermissions.rows.map(row => row.menu_path);
    const missingMenus = requiredMenus.filter(menu => !existingMenus.includes(menu));
    
    if (missingMenus.length > 0) {
      console.log('\n⚠️  Missing menu permissions:');
      missingMenus.forEach(menu => {
        console.log(`• ${menu}`);
      });
      console.log('\n💡 Need to add these permissions to the database');
    } else {
      console.log('\n✅ All required menu permissions exist');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkInAdditionPermissions();


