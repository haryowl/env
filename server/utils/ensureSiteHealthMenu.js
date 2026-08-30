const { query } = require('../config/database');

const MENU_PATH = '/site-health';

async function ensureSiteHealthMenuPermissions() {
  try {
    await query(`
      INSERT INTO menu_permissions (role_id, menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete)
      SELECT mp.role_id, $1, 'Site Health',
             mp.can_access, mp.can_create, mp.can_read, mp.can_update, mp.can_delete
      FROM menu_permissions mp
      WHERE mp.menu_path = '/comparison-dashboard'
      ON CONFLICT (role_id, menu_path) DO NOTHING
    `, [MENU_PATH]);
  } catch (error) {
    console.warn('site-health: menu_permissions copy skipped:', error.message);
  }
  try {
    await query(`
      UPDATE roles
      SET menu_permissions = COALESCE(menu_permissions::jsonb, '{}'::jsonb) || jsonb_build_object(
        '/site-health',
        COALESCE(
          menu_permissions::jsonb->'/comparison-dashboard',
          '{"access":true,"read":true,"create":false,"update":false,"delete":false}'::jsonb
        )
      )
      WHERE menu_permissions::jsonb ? '/comparison-dashboard'
        AND NOT (COALESCE(menu_permissions::jsonb, '{}'::jsonb) ? '/site-health')
    `);
  } catch (error) {
    console.warn('site-health: roles.menu_permissions merge skipped:', error.message);
  }
}

module.exports = { ensureSiteHealthMenuPermissions, SITE_HEALTH_MENU_PATH: MENU_PATH };
