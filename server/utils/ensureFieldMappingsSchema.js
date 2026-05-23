const { query } = require('../config/database');

let ensured = false;

async function ensureFieldMappingsSchema() {
  if (ensured) return;

  await query(`ALTER TABLE field_mappings ADD COLUMN IF NOT EXISTS formula TEXT`);

  ensured = true;
}

function resetFieldMappingsSchemaCacheForTests() {
  ensured = false;
}

module.exports = { ensureFieldMappingsSchema, resetFieldMappingsSchemaCacheForTests };
