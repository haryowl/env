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

async function addSensorSiteUsersJunction() {
  try {
    console.log('🔧 Adding sensor_site_users junction table...');
    
    // Create the junction table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sensor_site_users (
        sensor_site_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        assigned_at TIMESTAMP DEFAULT NOW(),
        assigned_by INTEGER,
        PRIMARY KEY (sensor_site_id, user_id),
        FOREIGN KEY (sensor_site_id) REFERENCES sensor_sites(sensor_site_id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL
      )
    `);
    
    console.log('✅ Created sensor_site_users junction table');
    
    // Create index for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_site_users_sensor_site_id 
      ON sensor_site_users(sensor_site_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_site_users_user_id 
      ON sensor_site_users(user_id)
    `);
    
    console.log('✅ Created indexes for sensor_site_users table');
    
    // Migrate existing data from user_id to the junction table
    console.log('🔄 Migrating existing user assignments...');
    
    const existingAssignments = await pool.query(`
      SELECT sensor_site_id, user_id, created_by 
      FROM sensor_sites 
      WHERE user_id IS NOT NULL
    `);
    
    console.log(`📊 Found ${existingAssignments.rows.length} existing user assignments to migrate`);
    
    for (const assignment of existingAssignments.rows) {
      try {
        await pool.query(`
          INSERT INTO sensor_site_users (sensor_site_id, user_id, assigned_by)
          VALUES ($1, $2, $3)
          ON CONFLICT (sensor_site_id, user_id) DO NOTHING
        `, [assignment.sensor_site_id, assignment.user_id, assignment.created_by]);
      } catch (error) {
        console.warn(`⚠️  Could not migrate assignment for sensor_site_id ${assignment.sensor_site_id}:`, error.message);
      }
    }
    
    console.log('✅ Migration completed');
    
    // Verify the migration
    const junctionCount = await pool.query(`
      SELECT COUNT(*) as count FROM sensor_site_users
    `);
    
    console.log(`📊 Junction table now has ${junctionCount.rows[0].count} user assignments`);
    
    console.log('🎉 sensor_site_users junction table setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error setting up sensor_site_users junction table:', error.message);
  } finally {
    await pool.end();
  }
}

addSensorSiteUsersJunction();


