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

const checkAlertTemplates = async () => {
  try {
    console.log('Checking alert templates...\n');
    
    const result = await pool.query(`
      SELECT alert_id, name, parameter, template, actions
      FROM alerts
      ORDER BY alert_id
    `);
    
    if (result.rows.length === 0) {
      console.log('No alerts found in database.');
      return;
    }
    
    console.log('Current alert templates:');
    console.log('=======================\n');
    
    result.rows.forEach(alert => {
      console.log(`Alert ID: ${alert.alert_id}`);
      console.log(`Name: ${alert.name}`);
      console.log(`Parameter: ${alert.parameter}`);
      console.log(`Template: ${alert.template || 'NULL'}`);
      console.log(`Actions: ${JSON.stringify(alert.actions)}`);
      console.log('---\n');
    });
    
    // Check if templates contain variables
    console.log('Template Analysis:');
    console.log('==================\n');
    
    result.rows.forEach(alert => {
      if (alert.template) {
        const hasVariables = alert.template.includes('{') && alert.template.includes('}');
        const hasValueVar = alert.template.includes('{value}');
        const hasDeviceVar = alert.template.includes('{device}');
        const hasParameterVar = alert.template.includes('{parameter}');
        
        console.log(`Alert ${alert.alert_id} (${alert.name}):`);
        console.log(`  - Contains variables: ${hasVariables}`);
        console.log(`  - Has {value}: ${hasValueVar}`);
        console.log(`  - Has {device}: ${hasDeviceVar}`);
        console.log(`  - Has {parameter}: ${hasParameterVar}`);
        console.log(`  - Template: "${alert.template}"`);
        console.log('');
      }
    });
    
  } catch (error) {
    console.error('Error checking alert templates:', error);
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  checkAlertTemplates();
} 