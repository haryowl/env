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
  await query(`
    ALTER TABLE field_definitions
    ADD COLUMN IF NOT EXISTS value_kind VARCHAR(20)
  `);

  // One-time defaults for existing fields (only where still unset).
  await query(`
    UPDATE field_definitions SET value_kind = 'rate'
    WHERE value_kind IS NULL AND (
      category ILIKE '%flow%'
      OR unit ILIKE '%/min%'
      OR unit ILIKE '%menit%'
      OR field_name ILIKE '%debit%'
      OR field_name ILIKE '%flow%'
    )
  `);
  await query(`
    UPDATE field_definitions SET value_kind = 'cumulative'
    WHERE value_kind IS NULL AND (
      unit ILIKE '%mm%'
      OR field_name ILIKE '%hujan%'
      OR field_name ILIKE '%rain%'
      OR field_name ILIKE '%curah%'
    )
  `);
}

module.exports = { ensureFieldDefinitionsSchema };
