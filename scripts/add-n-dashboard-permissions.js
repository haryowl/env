require('dotenv').config();
const { query, getRows } = require('../server/config/database');

/**
 * One-time grant of the new N-Dashboard menu to existing roles.
 * - admin-like roles get full permissions; everyone else gets access + read.
 * - Updates both the menu_permissions table and the roles.menu_permissions JSONB fallback.
 *
 * Usage: node scripts/add-n-dashboard-permissions.js
 */
const MENU_PATH = '/n-dashboard';
const MENU_NAME = 'N-Dashboard';
const FULL_ACCESS_ROLES = new Set(['super_admin', 'admin', 'manager']);

async function addNDashboardPermissions() {
  try {
    const roles = await getRows('SELECT role_id, role_name, menu_permissions FROM roles ORDER BY role_name');
    console.log(`Found ${roles.length} roles`);

    for (const role of roles) {
      const full = FULL_ACCESS_ROLES.has(role.role_name);
      const perm = {
        access: true,
        read: true,
        create: full,
        update: full,
        delete: full,
      };

      await query(`
        INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (role_id, menu_path) DO UPDATE SET
          menu_name = $3,
          can_access = $4,
          can_create = $5,
          can_read = $6,
          can_update = $7,
          can_delete = $8
      `, [role.role_id, MENU_PATH, MENU_NAME, perm.access, perm.create, perm.read, perm.update, perm.delete]);

      const jsonbPerms = { ...(role.menu_permissions || {}), [MENU_PATH]: perm };
      await query('UPDATE roles SET menu_permissions = $1 WHERE role_id = $2', [JSON.stringify(jsonbPerms), role.role_id]);

      console.log(`✅ ${role.role_name}: access=${perm.access}, full=${full}`);
    }

    console.log('\nDone. Users may need to re-login (or refresh) to pick up new permissions.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to add N-Dashboard permissions:', error);
    process.exit(1);
  }
}

addNDashboardPermissions();
