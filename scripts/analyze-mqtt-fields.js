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

const analyzeMqttFields = async () => {
  try {
    console.log('Analyzing MQTT data structure for device 7092139028080123021...\n');
    
    // Get the latest MQTT data from sensor_readings
    const result = await pool.query(`
      SELECT metadata, sensor_type, value, timestamp
      FROM sensor_readings 
      WHERE device_id = '7092139028080123021'
      ORDER BY timestamp DESC
      LIMIT 10
    `);
    
    if (result.rows.length === 0) {
      console.log('No sensor data found for device 7092139028080123021');
      return;
    }
    
    console.log('Latest MQTT Data Structure:');
    console.log('============================');
    
    // Analyze the metadata to see what fields are available
    const latestData = result.rows[0];
    if (latestData.metadata) {
      const metadata = typeof latestData.metadata === 'string' 
        ? JSON.parse(latestData.metadata) 
        : latestData.metadata;
      
      console.log('Available fields in MQTT data:');
      Object.keys(metadata).forEach(field => {
        console.log(`  - ${field}: ${metadata[field]} (${typeof metadata[field]})`);
      });
    }
    
    console.log('\nCurrent sensor readings:');
    result.rows.forEach(row => {
      console.log(`  - ${row.sensor_type}: ${row.value} (${row.timestamp})`);
    });
    
    // Get current mapper template
    console.log('\nCurrent Mapper Template:');
    console.log('=======================');
    const templateResult = await pool.query(`
      SELECT * FROM mapper_templates 
      WHERE device_id = '7092139028080123021'
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    
    if (templateResult.rows.length > 0) {
      const template = templateResult.rows[0];
      if (template.mappings) {
        const mappings = typeof template.mappings === 'string' 
          ? JSON.parse(template.mappings) 
          : template.mappings;
        
        console.log('Current mappings:');
        mappings.forEach((mapping, index) => {
          console.log(`  ${index + 1}. ${mapping.source_field} → ${mapping.target_field}`);
        });
      }
    }
    
    // Suggest proper mappings
    console.log('\nSuggested Mappings:');
    console.log('===================');
    console.log('Based on the MQTT data structure, here are the suggested mappings:');
    console.log('');
    console.log('RECOMMENDATION: Use the Device Mapper interface to configure these mappings:');
    console.log('');
    console.log('1. Go to Device Mapper menu in the web interface');
    console.log('2. Find the mapper for device 7092139028080123021');
    console.log('3. Update the source fields to match the new MQTT field names:');
    console.log('');
    console.log('   Current → Suggested');
    console.log('   Dummy_ShowCOD → cod_mg_l');
    console.log('   Dummy_ShowTSS → tss_mg_l');
    console.log('   Dummy_ShowPH → ph_value');
    console.log('');
    console.log('4. Save the mapper');
    console.log('');
    console.log('This will ensure the system uses the current MQTT values instead of cached values.');
    
  } catch (error) {
    console.error('Error analyzing MQTT fields:', error);
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  analyzeMqttFields();
} 