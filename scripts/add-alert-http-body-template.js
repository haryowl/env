/**
 * Add body_template (JSON) to alert_http_endpoints for custom webhook JSON bodies.
 */
const { query } = require('../server/config/database');

async function addAlertHttpBodyTemplate() {
  try {
    await query(`
      ALTER TABLE alert_http_endpoints
      ADD COLUMN IF NOT EXISTS body_template JSONB
    `);
    console.log('Added body_template column to alert_http_endpoints');
  } catch (error) {
    console.error('Error adding body_template column:', error);
    throw error;
  }
}

if (require.main === module) {
  addAlertHttpBodyTemplate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { addAlertHttpBodyTemplate };
