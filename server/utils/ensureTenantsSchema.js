const { query } = require('../config/database');

let done = false;

/**
 * Idempotent: creates tenants table, user FK columns, and FK constraint when missing.
 */
async function ensureTenantsSchema() {
  if (done) return;

  await query(`
    CREATE TABLE IF NOT EXISTS tenants (
      tenant_id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      post_logout_redirect_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS post_logout_redirect_url TEXT`);

  const fk = await query(`
    SELECT 1 FROM pg_constraint WHERE conname = 'users_tenant_id_fkey'
  `);
  if (!fk.rows.length) {
    try {
      await query(`
        ALTER TABLE users
        ADD CONSTRAINT users_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE SET NULL
      `);
    } catch (e) {
      if (!String(e.message || '').includes('already exists')) throw e;
    }
  }

  done = true;
}

function resetTenantsSchemaCacheForTests() {
  done = false;
}

module.exports = { ensureTenantsSchema, resetTenantsSchemaCacheForTests };
