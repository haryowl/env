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

const checkDatabaseSchema = async () => {
  try {
    console.log('Checking database schema...');

    // Check if role_device_permissions table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'role_device_permissions'
      );
    `);

    console.log('\n=== Table Existence ===');
    console.log(`role_device_permissions table exists: ${tableExists.rows[0].exists}`);

    if (tableExists.rows[0].exists) {
      // Check table structure
      const tableStructure = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'role_device_permissions'
        ORDER BY ordinal_position;
      `);

      console.log('\n=== role_device_permissions Table Structure ===');
      tableStructure.rows.forEach(col => {
        console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });

      // Check constraints
      const constraints = await pool.query(`
        SELECT 
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'role_device_permissions'
        ORDER BY tc.constraint_type, kcu.column_name;
      `);

      console.log('\n=== Constraints ===');
      constraints.rows.forEach(constraint => {
        console.log(`${constraint.constraint_type}: ${constraint.constraint_name} (${constraint.column_name})`);
      });
    }

    // Check if we can insert a test record
    console.log('\n=== Testing Insert ===');
    try {
      const testInsert = await pool.query(`
        INSERT INTO role_device_permissions (role_id, device_id, permissions)
        VALUES (1, 'test_device', '{"read": true}')
        ON CONFLICT (role_id, device_id) DO NOTHING
      `);
      console.log('✓ Test insert successful');
      
      // Clean up test record
      await pool.query(`
        DELETE FROM role_device_permissions 
        WHERE role_id = 1 AND device_id = 'test_device'
      `);
      console.log('✓ Test record cleaned up');
    } catch (insertError) {
      console.error('✗ Test insert failed:', insertError.message);
    }

    // Check all related tables
    const tables = ['roles', 'user_roles', 'devices', 'user_device_permissions'];
    console.log('\n=== Related Tables ===');
    for (const table of tables) {
      const exists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [table]);
      console.log(`${table}: ${exists.rows[0].exists ? '✓' : '✗'}`);
    }

  } catch (error) {
    console.error('Failed to check database schema:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
checkDatabaseSchema(); 