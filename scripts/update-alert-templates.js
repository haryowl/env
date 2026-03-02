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

const updateAlertTemplates = async () => {
  try {
    console.log('Updating alert templates to use variables...\n');
    
    // Get current alerts
    const result = await pool.query(`
      SELECT alert_id, name, parameter, template, actions
      FROM alerts
      ORDER BY alert_id
    `);
    
    if (result.rows.length === 0) {
      console.log('No alerts found in database.');
      return;
    }
    
    console.log('Current templates:');
    result.rows.forEach(alert => {
      console.log(`Alert ${alert.alert_id} (${alert.name}): "${alert.template || 'NULL'}"`);
    });
    
    console.log('\nUpdating templates...\n');
    
    // Update each alert template
    for (const alert of result.rows) {
      let newTemplate = '';
      
      if (!alert.template || alert.template.trim() === '') {
        // Create a default template with variables
        newTemplate = `Alert: {device} parameter {parameter} value {value} exceeded threshold (min: {min}, max: {max})`;
      } else {
        // Replace common static patterns with variables
        newTemplate = alert.template
          .replace(/\b\d+\.?\d*\b/g, '{value}') // Replace numbers with {value}
          .replace(/\b(device|Device)\b/gi, '{device}') // Replace device references
          .replace(/\b(parameter|Parameter)\b/gi, '{parameter}') // Replace parameter references
          .replace(/\b(value|Value)\b/gi, '{value}'); // Replace value references
      }
      
      // Update the template in database
      await pool.query(`
        UPDATE alerts 
        SET template = $1, updated_at = NOW()
        WHERE alert_id = $2
      `, [newTemplate, alert.alert_id]);
      
      console.log(`Updated Alert ${alert.alert_id} (${alert.name}):`);
      console.log(`  Old: "${alert.template || 'NULL'}"`);
      console.log(`  New: "${newTemplate}"`);
      console.log('');
    }
    
    console.log('Alert templates updated successfully!');
    
    // Show final templates
    console.log('\nFinal templates:');
    const finalResult = await pool.query(`
      SELECT alert_id, name, template
      FROM alerts
      ORDER BY alert_id
    `);
    
    finalResult.rows.forEach(alert => {
      console.log(`Alert ${alert.alert_id} (${alert.name}): "${alert.template}"`);
    });
    
  } catch (error) {
    console.error('Error updating alert templates:', error);
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  updateAlertTemplates();
} 