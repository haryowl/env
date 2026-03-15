/**
 * Add valid_from and valid_to columns to devices table for device access period.
 * Non-admin users can only access device data when today is between valid_from and valid_to.
 * Empty dates = never valid (no access until both are set).
 */
const { query } = require('../server/config/database');

async function addDeviceValidPeriodColumns() {
  try {
    await query(`
      ALTER TABLE devices 
      ADD COLUMN IF NOT EXISTS valid_from DATE,
      ADD COLUMN IF NOT EXISTS valid_to DATE
    `);
    console.log('Added valid_from and valid_to columns to devices table');
  } catch (error) {
    console.error('Error adding device valid period columns:', error);
    throw error;
  }
}

if (require.main === module) {
  addDeviceValidPeriodColumns().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { addDeviceValidPeriodColumns };
