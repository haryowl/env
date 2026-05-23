const { query } = require('../config/database');

let ensured = false;

/**
 * Idempotent schema for company/site features (fresh installs missed user_sites historically).
 */
async function ensureSitesSchema() {
  if (ensured) return;

  await query(`
    CREATE TABLE IF NOT EXISTS user_sites (
      user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      site_id INTEGER NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
      assigned_at TIMESTAMP DEFAULT NOW(),
      assigned_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      permission_level VARCHAR(20) DEFAULT 'viewer' CHECK (permission_level IN ('viewer', 'operator', 'admin')),
      PRIMARY KEY (user_id, site_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_sites_user_id ON user_sites(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_sites_site_id ON user_sites(site_id)`);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'site_id'
      ) THEN
        ALTER TABLE devices ADD COLUMN site_id INTEGER REFERENCES sites(site_id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_devices_site_id ON devices(site_id)`);

  ensured = true;
}

function resetSitesSchemaCacheForTests() {
  ensured = false;
}

module.exports = { ensureSitesSchema, resetSitesSchemaCacheForTests };
