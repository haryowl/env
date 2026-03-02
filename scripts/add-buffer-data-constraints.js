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

const addBufferDataConstraints = async () => {
  try {
    console.log('Adding buffer data handling constraints...\n');

    // Add index for faster duplicate detection
    console.log('Creating index for duplicate detection...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_duplicate_check 
      ON sensor_readings (device_id, sensor_type, timestamp, value)
    `);
    console.log('✅ Index created for duplicate detection');

    // Add index for buffered data queries
    console.log('Creating index for buffered data queries...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_buffered_data 
      ON sensor_readings (device_id, timestamp DESC) 
      WHERE (metadata->>'isBufferedData')::boolean = true
    `);
    console.log('✅ Index created for buffered data queries');

    // Add index for old data queries
    console.log('Creating index for old data queries...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_old_data 
      ON sensor_readings (device_id, timestamp DESC) 
      WHERE (metadata->>'isOldData')::boolean = true
    `);
    console.log('✅ Index created for old data queries');

    // Add partial unique constraint for exact duplicates (within 1 second window)
    console.log('Adding partial unique constraint for exact duplicates...');
    try {
      await pool.query(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_sensor_readings_exact_duplicates 
        ON sensor_readings (device_id, sensor_type, timestamp, value) 
        WHERE timestamp IS NOT NULL
      `);
      console.log('✅ Partial unique constraint added for exact duplicates');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️ Partial unique constraint already exists');
      } else {
        throw error;
      }
    }

    // Create view for buffered data analysis
    console.log('Creating view for buffered data analysis...');
    await pool.query(`
      CREATE OR REPLACE VIEW buffered_data_analysis AS
      SELECT 
        device_id,
        sensor_type,
        COUNT(*) as total_readings,
        COUNT(*) FILTER (WHERE (metadata->>'isBufferedData')::boolean = true) as buffered_readings,
        COUNT(*) FILTER (WHERE (metadata->>'isOldData')::boolean = true) as old_readings,
        COUNT(*) FILTER (WHERE (metadata->>'isVeryOldData')::boolean = true) as very_old_readings,
        ROUND(
          COUNT(*) FILTER (WHERE (metadata->>'isBufferedData')::boolean = true) * 100.0 / COUNT(*), 2
        ) as buffered_percentage,
        MIN(timestamp) as earliest_reading,
        MAX(timestamp) as latest_reading
      FROM sensor_readings 
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY device_id, sensor_type
      ORDER BY device_id, sensor_type
    `);
    console.log('✅ View created for buffered data analysis');

    // Create function to clean up very old duplicates
    console.log('Creating function to clean up old duplicates...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION cleanup_old_duplicates(days_old INTEGER DEFAULT 7)
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        WITH duplicates AS (
          SELECT id, 
                 ROW_NUMBER() OVER (
                   PARTITION BY device_id, sensor_type, 
                   DATE_TRUNC('minute', timestamp), value 
                   ORDER BY timestamp DESC
                 ) as rn
          FROM sensor_readings 
          WHERE timestamp < NOW() - INTERVAL '1 day' * days_old
        )
        DELETE FROM sensor_readings 
        WHERE id IN (
          SELECT id FROM duplicates WHERE rn > 1
        );
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Function created for cleaning up old duplicates');

    console.log('\n🎉 Buffer data handling constraints added successfully!');
    console.log('\n📊 You can now use these queries:');
    console.log('  - SELECT * FROM buffered_data_analysis; -- Analyze buffered data');
    console.log('  - SELECT cleanup_old_duplicates(7); -- Clean up duplicates older than 7 days');

  } catch (error) {
    console.error('❌ Error adding buffer data constraints:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the script
addBufferDataConstraints()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });


