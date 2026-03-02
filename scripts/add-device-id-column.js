const { pool } = require('../server/config/database');

async function addDeviceIdColumn() {
  try {
    console.log('Adding device_id column to mapper_templates table...');
    
    // Add device_id column if it doesn't exist
    await pool.query(`
      ALTER TABLE mapper_templates 
      ADD COLUMN IF NOT EXISTS device_id VARCHAR(50) REFERENCES devices(device_id);
    `);
    
    console.log('device_id column added successfully!');
    
    // Check the table structure
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'mapper_templates' 
      ORDER BY ordinal_position;
    `);
    
    console.log('Current mapper_templates table structure:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
  } catch (error) {
    console.error('Error adding device_id column:', error);
  } finally {
    await pool.end();
  }
}

addDeviceIdColumn(); 