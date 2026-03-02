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

const checkMapperTemplate = async () => {
  try {
    console.log('Checking mapper template for device 7092139028080123021...\n');
    
    const result = await pool.query(`
      SELECT * FROM mapper_templates 
      WHERE device_id = '7092139028080123021'
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('No mapper template found for device 7092139028080123021');
      return;
    }
    
    const template = result.rows[0];
    console.log('Mapper Template Details:');
    console.log('=======================');
    console.log(`Template ID: ${template.template_id}`);
    console.log(`Template Name: ${template.template_name}`);
    console.log(`Device ID: ${template.device_id}`);
    console.log(`Description: ${template.description}`);
    console.log(`Created At: ${template.created_at}`);
    console.log(`Updated At: ${template.updated_at}`);
    console.log('');
    
    console.log('Mappings:');
    console.log('=========');
    if (template.mappings) {
      const mappings = typeof template.mappings === 'string' 
        ? JSON.parse(template.mappings) 
        : template.mappings;
      
      mappings.forEach((mapping, index) => {
        console.log(`${index + 1}. Source: "${mapping.source_field}" → Target: "${mapping.target_field}"`);
        if (mapping.data_type) console.log(`   Data Type: ${mapping.data_type}`);
        if (mapping.formula) console.log(`   Formula: ${mapping.formula}`);
        console.log('');
      });
    } else {
      console.log('No mappings found');
    }
    
    // Check if there are any field mappings that might be overriding
    console.log('Field Mappings:');
    console.log('===============');
    const fieldMappings = await pool.query(`
      SELECT * FROM field_mappings 
      WHERE device_id = '7092139028080123021'
      ORDER BY mapping_id
    `);
    
    if (fieldMappings.rows.length === 0) {
      console.log('No field mappings found');
    } else {
      fieldMappings.rows.forEach((mapping, index) => {
        console.log(`${index + 1}. Source: "${mapping.source_field}" → Target: "${mapping.target_field}"`);
        console.log(`   Data Type: ${mapping.data_type}`);
        if (mapping.formula) console.log(`   Formula: ${mapping.formula}`);
        if (mapping.default_value) console.log(`   Default Value: ${mapping.default_value}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('Error checking mapper template:', error);
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  checkMapperTemplate();
} 