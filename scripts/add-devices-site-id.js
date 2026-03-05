/**
 * Add site_id column to devices table so devices can be assigned to sites.
 * Run from project root: node scripts/add-devices-site-id.js
 * Requires .env with DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (and DB_SSL if needed).
 */
require('dotenv').config();
const { getRow, query } = require('../server/config/database');

async function addDevicesSiteId() {
  try {
    const hasColumn = await getRow(
      `SELECT 1 FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'site_id'`
    );
    if (hasColumn) {
      console.log('devices.site_id already exists. Nothing to do.');
      process.exit(0);
      return;
    }
    await query(`
      ALTER TABLE devices 
      ADD COLUMN site_id INTEGER REFERENCES sites(site_id) ON DELETE SET NULL
    `);
    console.log('Added devices.site_id column.');
    await query(`CREATE INDEX IF NOT EXISTS idx_devices_site_id ON devices(site_id)`);
    console.log('Created index idx_devices_site_id.');
    console.log('Done. Restart the server and assign devices to sites in Company and Site.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

addDevicesSiteId();
