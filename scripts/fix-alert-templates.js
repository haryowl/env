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

const fixAlertTemplates = async () => {
  try {
    console.log('Fixing alert templates...\n');
    
    // Fix Alert 7 (COD) - replace duplicate {max} with {min}
    await pool.query(`
      UPDATE alerts 
      SET template = $1, updated_at = NOW()
      WHERE alert_id = 7
    `, ['{device} {parameter} {value} melebihi nilai max {max} dan min {min}']);
    
    // Fix Alert 8 (TSS) - remove line breaks and format properly
    await pool.query(`
      UPDATE alerts 
      SET template = $1, updated_at = NOW()
      WHERE alert_id = 8
    `, ['{device} {parameter} {value} melebihi nilai max {max} dan min {min}']);
    
    console.log('Alert templates fixed successfully!');
    
    // Show updated templates
    console.log('\nUpdated templates:');
    const result = await pool.query(`
      SELECT alert_id, name, template
      FROM alerts
      ORDER BY alert_id
    `);
    
    result.rows.forEach(alert => {
      console.log(`Alert ${alert.alert_id} (${alert.name}): "${alert.template}"`);
    });
    
  } catch (error) {
    console.error('Error fixing alert templates:', error);
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  fixAlertTemplates();
} 