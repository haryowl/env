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

const assignAdminRole = async () => {
  try {
    console.log('Assigning admin role to admin0 user...\n');

    // Get the admin role ID
    const adminRole = await pool.query('SELECT role_id FROM roles WHERE role_name = $1', ['admin']);
    if (adminRole.rows.length === 0) {
      console.log('❌ Admin role not found in roles table');
      return;
    }

    // Get the admin0 user ID
    const admin0User = await pool.query('SELECT user_id FROM users WHERE username = $1', ['admin0']);
    if (admin0User.rows.length === 0) {
      console.log('❌ admin0 user not found');
      return;
    }

    const roleId = adminRole.rows[0].role_id;
    const userId = admin0User.rows[0].user_id;

    // Check if the role is already assigned
    const existingAssignment = await pool.query(
      'SELECT * FROM user_roles WHERE user_id = $1 AND role_id = $2',
      [userId, roleId]
    );

    if (existingAssignment.rows.length > 0) {
      console.log('✓ admin0 already has admin role assigned');
      return;
    }

    // Assign the admin role to admin0
    await pool.query(`
      INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
      VALUES ($1, $2, true, 1)
    `, [userId, roleId]);

    console.log('✓ Successfully assigned admin role to admin0 user');
    console.log('Now admin0 can create users');

  } catch (error) {
    console.error('Error assigning admin role:', error);
  } finally {
    await pool.end();
  }
};

assignAdminRole(); 