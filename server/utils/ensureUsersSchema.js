const { query } = require('../config/database');

let done = false;

/**
 * Idempotent fixes for legacy user table constraints (e.g. CHECK on role that
 * only allowed built-in roles, blocking custom roles like socfinadm).
 */
async function ensureUsersSchema() {
  if (done) return;
  await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  done = true;
}

function resetUsersSchemaCacheForTests() {
  done = false;
}

module.exports = { ensureUsersSchema, resetUsersSchemaCacheForTests };
