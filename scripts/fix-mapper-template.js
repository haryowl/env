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

const fixMapperTemplate = async () => {
  try {
    console.log('Fixing mapper template for device 7092139028080123021...\n');
    
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
    console.log('Current template mappings:');
    
    let mappings = [];
    if (template.mappings) {
      mappings = typeof template.mappings === 'string' 
        ? JSON.parse(template.mappings) 
        : template.mappings;
      
      mappings.forEach((mapping, index) => {
        console.log(`${index + 1}. Source: "${mapping.source_field}" → Target: "${mapping.target_field}"`);
        if (mapping.formula) console.log(`   Formula: ${mapping.formula} (REMOVING THIS)`);
        console.log('');
      });
    }
    
    // Fix the mappings by removing formulas and ensuring direct mapping
    const fixedMappings = mappings.map(mapping => ({
      source_field: mapping.source_field,
      target_field: mapping.target_field,
      data_type: mapping.data_type || 'number'
      // Remove any formula that might be causing cached values
    }));
    
    console.log('Fixed mappings (removed formulas):');
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
    
    // Also check and fix field_mappings table
    console.log('\nChecking field_mappings table...');
    const fieldMappings = await pool.query(`
      SELECT * FROM field_mappings 
      WHERE device_id = '7092139028080123021'
      ORDER BY mapping_id
    `);
    
    if (fieldMappings.rows.length > 0) {
      console.log('Found field mappings that might be causing issues:');
      fieldMappings.rows.forEach((mapping, index) => {
        console.log(`${index + 1}. Source: "${mapping.source_field}" → Target: "${mapping.target_field}"`);
        if (mapping.formula) console.log(`   Formula: ${mapping.formula} (REMOVING THIS)`);
        if (mapping.default_value) console.log(`   Default Value: ${mapping.default_value} (REMOVING THIS)`);
        console.log('');
      });
      
      // Remove formulas and default values from field mappings
      for (const mapping of fieldMappings.rows) {
        await pool.query(`
          UPDATE field_mappings 
          SET formula = NULL, default_value = NULL, updated_at = NOW()
          WHERE mapping_id = $1
        `, [mapping.mapping_id]);
      }
      
      console.log('Field mappings updated (removed formulas and default values)!');
    }
    
  } catch (error) {
    console.error('Error fixing mapper template:', error);
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  fixMapperTemplate();
} 