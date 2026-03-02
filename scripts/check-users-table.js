require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function checkUsersTable() {
  console.log('🔍 Checking users table structure...\n');

  try {
    const columns = await getRows(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('Users table columns:');
    columns.forEach(col => {
      console.log(`  • ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });

    // Also check existing users
    console.log('\n📋 Existing users:');
    const users = await getRows('SELECT user_id, username, email, role FROM users ORDER BY user_id');
    users.forEach(user => {
      console.log(`  • ${user.username} (ID: ${user.user_id}, Role: ${user.role}, Email: ${user.email})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkUsersTable();


