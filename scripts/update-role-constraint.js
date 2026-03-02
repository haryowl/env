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

const updateRoleConstraint = async () => {
  try {
    console.log('Updating role constraint to allow custom roles...');

    // Check if the constraint exists
    const constraintCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'users' 
      AND constraint_type = 'CHECK' 
      AND constraint_name LIKE '%role%'
    `);

    if (constraintCheck.rows.length > 0) {
      console.log('Found existing role constraint, removing...');
      
      // Remove the existing constraint
      await pool.query(`
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check
      `);
      
      console.log('✓ Removed existing role constraint');
    } else {
      console.log('No existing role constraint found');
    }

    // Update the role column to allow longer role names
    await pool.query(`
      ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50)
    `);
    
    console.log('✓ Updated role column to VARCHAR(50)');

    console.log('✓ Role constraint update completed successfully');
  } catch (error) {
    console.error('Role constraint update failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

updateRoleConstraint(); 