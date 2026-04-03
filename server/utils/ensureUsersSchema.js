const { query } = require('../config/database');

let roleCheckDropped = false;
let profileColumnEnsured = false;

/**
 * Idempotent fixes for legacy user table constraints (e.g. CHECK on role that
 * only allowed built-in roles, blocking custom roles like socfinadm).
 */
async function ensureUsersSchema() {
  if (!roleCheckDropped) {
    await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    roleCheckDropped = true;
  }
  if (!profileColumnEnsured) {
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'profile_picture'
        ) THEN
          ALTER TABLE users ADD COLUMN profile_picture VARCHAR(512);
        END IF;
      END $$;
    `);
    profileColumnEnsured = true;
  }
}

function resetUsersSchemaCacheForTests() {
  roleCheckDropped = false;
  profileColumnEnsured = false;
}

module.exports = { ensureUsersSchema, resetUsersSchemaCacheForTests };
