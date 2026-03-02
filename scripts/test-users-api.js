require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function testUsersAPI() {
  console.log('🧪 Testing users API logic...\n');

  try {
    // Test the technician query directly
    console.log('🔍 Testing technician query...');
    
    const technicians = await getRows(`
      SELECT DISTINCT u.user_id, u.username, u.email, u.status
      FROM users u
      JOIN user_roles ur ON u.user_id = ur.user_id
      JOIN roles r ON ur.role_id = r.role_id
      WHERE r.role_name = $1 AND u.status = 'active'
      ORDER BY u.username
    `, ['technician']);

    console.log(`✅ Found ${technicians.length} technicians:`);
    technicians.forEach(tech => {
      console.log(`   • ${tech.username} (${tech.email}) - Status: ${tech.status}`);
    });

    // Check if tech111 user has technician role
    console.log('\n🔍 Checking tech111 user role assignments...');
    
    const tech111User = await getRow('SELECT user_id, username FROM users WHERE username = $1', ['tech111']);
    if (tech111User) {
      const userRoles = await getRows(`
        SELECT r.role_name, r.role_id
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = $1
      `, [tech111User.user_id]);

      console.log(`✅ tech111 (ID: ${tech111User.user_id}) role assignments:`);
      userRoles.forEach(role => {
        console.log(`   • ${role.role_name} (ID: ${role.role_id})`);
      });
    } else {
      console.log('❌ tech111 user not found');
    }

    // Test admin user
    console.log('\n🔍 Testing admin user...');
    
    const adminUser = await getRow('SELECT user_id, username FROM users WHERE username = $1', ['admin']);
    if (adminUser) {
      const adminRoles = await getRows(`
        SELECT r.role_name, r.role_id
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = $1
      `, [adminUser.user_id]);

      console.log(`✅ admin (ID: ${adminUser.user_id}) role assignments:`);
      adminRoles.forEach(role => {
        console.log(`   • ${role.role_name} (ID: ${role.role_id})`);
      });
    } else {
      console.log('❌ admin user not found');
    }

  } catch (error) {
    console.error('❌ Error testing users API:', error);
  }
}

testUsersAPI();


