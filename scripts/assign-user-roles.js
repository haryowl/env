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

const assignUserRoles = async () => {
  try {
    console.log('Assigning roles to users...');

    // Get all users
    const users = await pool.query('SELECT user_id, username, role FROM users');
    
    // Get all roles
    const roles = await pool.query('SELECT role_id, role_name FROM roles');
    
    // Get existing user roles
    const existingUserRoles = await pool.query('SELECT user_id, role_id FROM user_roles');

    console.log('\n=== Current Users ===');
    users.rows.forEach(user => {
      console.log(`${user.username} (${user.role})`);
    });

    console.log('\n=== Available Roles ===');
    roles.rows.forEach(role => {
      console.log(`${role.role_name} (ID: ${role.role_id})`);
    });

    // Assign roles based on user's current role
    for (const user of users.rows) {
      // Check if user already has a role assigned
      const hasRole = existingUserRoles.rows.some(ur => ur.user_id === user.user_id);
      
      if (!hasRole) {
        // Find the corresponding role
        const role = roles.rows.find(r => r.role_name === user.role);
        
        if (role) {
          await pool.query(`
            INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
            VALUES ($1, $2, true, 1)
          `, [user.user_id, role.role_id]);
          
          console.log(`✓ Assigned ${role.role_name} role to ${user.username}`);
        } else {
          console.log(`⚠ No role found for ${user.username} (${user.role})`);
        }
      } else {
        console.log(`- ${user.username} already has a role assigned`);
      }
    }

    console.log('\n✓ Role assignment completed');

  } catch (error) {
    console.error('Failed to assign user roles:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
assignUserRoles(); 