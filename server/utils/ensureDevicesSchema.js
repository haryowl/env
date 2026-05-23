const { query } = require('../config/database');

let ensured = false;

async function ensureDevicesSchema() {
  if (ensured) return;

  await query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS valid_from DATE`);
  await query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS valid_to DATE`);
  await query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false`);

  ensured = true;
}

function resetDevicesSchemaCacheForTests() {
  ensured = false;
}

module.exports = { ensureDevicesSchema, resetDevicesSchemaCacheForTests };
