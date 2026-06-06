const { query } = require('../config/database');

let ensured = false;

async function ensurePasswordResetSchema() {
  if (ensured) return;

  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
    ON password_reset_tokens(token_hash)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens(user_id)
  `);

  ensured = true;
}

function resetPasswordResetSchemaCacheForTests() {
  ensured = false;
}

module.exports = { ensurePasswordResetSchema, resetPasswordResetSchemaCacheForTests };
