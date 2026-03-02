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

async function testCompanySiteAccess() {
  const client = await pool.connect();
  try {
    console.log('=== Testing Company Site Access ===\n');
    
    // Check if companies table exists and has data
    const companies = await client.query('SELECT COUNT(*) as count FROM companies');
    console.log('Companies in database:', companies.rows[0].count);
    
    // Check if sites table exists and has data
    const sites = await client.query('SELECT COUNT(*) as count FROM sites');
    console.log('Sites in database:', sites.rows[0].count);
    
    // Check if users table exists and has data
    const users = await client.query('SELECT COUNT(*) as count FROM users');
    console.log('Users in database:', users.rows[0].count);
    
    // Check if devices table exists and has data
    const devices = await client.query('SELECT COUNT(*) as count FROM devices');
    console.log('Devices in database:', devices.rows[0].count);
    
    // Check users table structure
    const userColumns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    console.log('\nUsers table columns:');
    userColumns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Check if there are any users
    const allUsers = await client.query('SELECT user_id, username, email FROM users LIMIT 5');
    console.log('\nSample users:');
    allUsers.rows.forEach(user => {
      console.log(`  ${user.user_id}: ${user.username} (${user.email})`);
    });
    
    // Check roles table
    const roles = await client.query('SELECT role_id, role_name, display_name FROM roles');
    console.log('\nAvailable roles:');
    roles.rows.forEach(role => {
      console.log(`  ${role.role_id}: ${role.role_name} (${role.display_name})`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

testCompanySiteAccess().catch(console.error);


