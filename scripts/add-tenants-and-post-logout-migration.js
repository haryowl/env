/**
 * Tenants + post-logout redirect (tenant default + per-user override).
 * Run once on existing databases: node scripts/add-tenants-and-post-logout-migration.js
 *
 * Also grants /tenants menu to super_admin and admin roles (menu_permissions table).
 */
const { query } = require('../server/config/database');
const { ensureTenantsSchema, resetTenantsSchemaCacheForTests } = require('../server/utils/ensureTenantsSchema');

async function migrate() {
  await ensureTenantsSchema();
  resetTenantsSchemaCacheForTests();

  const rows = await query(
    `SELECT role_id, role_name FROM roles WHERE role_name IN ('super_admin', 'admin')`
  );
  for (const r of rows.rows || []) {
    await query(
      `
      INSERT INTO menu_permissions (
        role_id, menu_path, menu_name,
        can_access, can_create, can_read, can_update, can_delete
      )
      VALUES ($1, '/tenants', 'Tenants', true, true, true, true, true)
      ON CONFLICT (role_id, menu_path) DO UPDATE SET
        menu_name = EXCLUDED.menu_name,
        can_access = EXCLUDED.can_access,
        can_create = EXCLUDED.can_create,
        can_read = EXCLUDED.can_read,
        can_update = EXCLUDED.can_update,
        can_delete = EXCLUDED.can_delete
    `,
      [r.role_id]
    );
  }

  console.log('Tenants / post-logout migration completed.');
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { migrate };
