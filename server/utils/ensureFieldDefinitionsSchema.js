const { query } = require('../config/database');

async function ensureFieldDefinitionsSchema() {
  await query(`
    ALTER TABLE field_definitions
    ADD COLUMN IF NOT EXISTS status_keywords TEXT
  `);
  await query(`
    ALTER TABLE field_definitions
    ADD COLUMN IF NOT EXISTS display_min DOUBLE PRECISION
  `);
  await query(`
    ALTER TABLE field_definitions
    ADD COLUMN IF NOT EXISTS display_max DOUBLE PRECISION
  `);
}

module.exports = { ensureFieldDefinitionsSchema };
