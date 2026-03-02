const { Pool } = require('pg');
require('dotenv').config();

// Use the same database configuration as the main application
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'iot_monitoring',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT) || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function addFormulaColumn() {
  let client;
  
  try {
    console.log('Connecting to database...');
    console.log('DB_HOST:', process.env.DB_HOST);
    console.log('DB_NAME:', process.env.DB_NAME);
    console.log('DB_USER:', process.env.DB_USER);
    console.log('DB_PORT:', process.env.DB_PORT);
    
    client = await pool.connect();
    console.log('✅ Connected to database successfully');
    
    // Check if field_mappings table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'field_mappings'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('❌ field_mappings table does not exist. Creating it...');
      
      await client.query(`
        CREATE TABLE field_mappings (
          mapping_id SERIAL PRIMARY KEY,
          device_id VARCHAR(255) NOT NULL,
          source_field VARCHAR(255) NOT NULL,
          target_field VARCHAR(255) NOT NULL,
          data_type VARCHAR(50) DEFAULT 'string',
          conversion_rule JSONB DEFAULT '{}',
          validation_rule JSONB DEFAULT '{}',
          default_value TEXT,
          is_required BOOLEAN DEFAULT false,
          formula TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(device_id, source_field)
        );
      `);
      
      console.log('✅ field_mappings table created successfully');
    } else {
      console.log('ℹ️  field_mappings table already exists');
    }
    
    // Check if formula column already exists
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'field_mappings' 
      AND column_name = 'formula'
    `);
    
    if (checkColumn.rows.length === 0) {
      console.log('Adding formula column to field_mappings table...');
      
      // Add formula column
      await client.query(`
        ALTER TABLE field_mappings 
        ADD COLUMN formula TEXT
      `);
      
      console.log('✅ Formula column added successfully');
    } else {
      console.log('ℹ️  Formula column already exists');
    }
    
    console.log('✅ Migration completed successfully');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Error details:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Make sure PostgreSQL is running and accessible');
    } else if (error.code === '28P01') {
      console.error('💡 Check your database username and password in .env file');
    } else if (error.code === '3D000') {
      console.error('💡 Check your database name in .env file');
    }
    
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run migration
addFormulaColumn()
  .then(() => {
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error.message);
    process.exit(1);
  }); 