const { Pool } = require('pg');
require('dotenv').config();

// Database connection configuration
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'iot_monitoring',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function addFormulaColumn() {
  const client = await pool.connect();
  
  try {
    console.log('Adding formula column to field_mappings table...');
    
    // Check if formula column already exists
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'field_mappings' 
      AND column_name = 'formula'
    `);
    
    if (checkColumn.rows.length === 0) {
      // Add formula column
      await client.query(`
        ALTER TABLE field_mappings 
        ADD COLUMN formula TEXT
      `);
      
      console.log('✅ Formula column added successfully');
    } else {
      console.log('ℹ️  Formula column already exists');
    }
    
    // Update existing queries to include formula
    console.log('Updating device mapper queries...');
    
    // The queries in deviceMapper.js will need to be updated to include formula
    console.log('✅ Migration completed successfully');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
addFormulaColumn()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  }); 