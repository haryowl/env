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

const fixMapperSourceFields = async () => {
  try {
    console.log('Fixing mapper template source fields for device 7092139028080123021...\n');
    
    // Get current template
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
    console.log('Current mappings:');
    
    let mappings = [];
    if (template.mappings) {
      mappings = typeof template.mappings === 'string' 
        ? JSON.parse(template.mappings) 
        : template.mappings;
      
      mappings.forEach((mapping, index) => {
        console.log(`${index + 1}. Source: "${mapping.source_field}" → Target: "${mapping.target_field}"`);
        console.log(`   Data Type: ${mapping.data_type}`);
        console.log('');
      });
    }
    
    // Fix the mappings to use the new MQTT field names
    const fixedMappings = mappings.map(mapping => {
      let newMapping = { ...mapping };
      
      // Update source fields to use new MQTT field names
      if (mapping.source_field === 'Dummy_ShowCOD') {
        newMapping.source_field = 'cod_mg_l';
        console.log(`   FIXING: Dummy_ShowCOD → cod_mg_l`);
      } else if (mapping.source_field === 'Dummy_ShowTSS') {
        newMapping.source_field = 'tss_mg_l';
        console.log(`   FIXING: Dummy_ShowTSS → tss_mg_l`);
      } else if (mapping.source_field === 'Dummy_ShowPH') {
        newMapping.source_field = 'ph_value';
        console.log(`   FIXING: Dummy_ShowPH → ph_value`);
      }
      
      return newMapping;
    });
    
    console.log('\nFixed mappings:');
    fixedMappings.forEach((mapping, index) => {
      console.log(`${index + 1}. Source: "${mapping.source_field}" → Target: "${mapping.target_field}"`);
      console.log(`   Data Type: ${mapping.data_type}`);
      console.log('');
    });
    
    // Update the template
    await pool.query(`
      UPDATE mapper_templates 
      SET mappings = $1, updated_at = NOW()
      WHERE template_id = $2
    `, [JSON.stringify(fixedMappings), template.template_id]);
    
    console.log('Mapper template updated successfully!');
    console.log('Now the mapper will use the new MQTT field names instead of the old Dummy_Show fields.');
    
  } catch (error) {
    console.error('Error fixing mapper template:', error);
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  fixMapperSourceFields();
} 