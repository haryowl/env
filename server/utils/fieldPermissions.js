const { getRows, query } = require('../config/database');

const ALWAYS_VISIBLE = new Set([
  'datetime',
  'timestamp',
  'device_id',
  'device_name',
  'server_received_at',
]);

let columnEnsured = false;

async function ensureFieldPermissionsColumn() {
  if (columnEnsured) return;
  await query(
    `ALTER TABLE roles
     ADD COLUMN IF NOT EXISTS field_permissions JSONB DEFAULT '{"mode":"all","fields":[]}'::jsonb`
  );
  columnEnsured = true;
}

function normalizeFieldPermissions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { mode: 'all', fields: [] };
  }
  const mode = raw.mode === 'selected' ? 'selected' : 'all';
  const fields = Array.isArray(raw.fields)
    ? [...new Set(raw.fields.map((f) => String(f || '').trim()).filter(Boolean))]
    : [];
  return { mode, fields };
}

function isPrivilegedRoleName(name) {
  const n = String(name || '').toLowerCase();
  return n === 'admin' || n === 'super_admin';
}

/**
 * null-like "all" visibility, or an allow-list of field names.
 * Multiple roles: if any role allows all, the user sees all; otherwise union of selected fields.
 */
async function getFieldVisibilityForUser(user) {
  await ensureFieldPermissionsColumn();
  if (!user) return { mode: 'all', fields: [] };
  if (isPrivilegedRoleName(user.role)) return { mode: 'all', fields: [] };

  let roles = await getRows(
    `SELECT r.role_name, r.field_permissions
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.role_id
     WHERE ur.user_id = $1`,
    [user.user_id]
  );
  if ((!roles || roles.length === 0) && user.role) {
    roles = await getRows(
      `SELECT role_name, field_permissions FROM roles WHERE role_name = $1`,
      [user.role]
    );
  }
  roles = Array.isArray(roles) ? roles : [];
  if (roles.some((r) => isPrivilegedRoleName(r.role_name))) {
    return { mode: 'all', fields: [] };
  }
  if (roles.length === 0) return { mode: 'all', fields: [] };

  const normalized = roles.map((r) => normalizeFieldPermissions(r.field_permissions));
  if (normalized.some((p) => p.mode === 'all')) {
    return { mode: 'all', fields: [] };
  }

  const union = new Set();
  for (const p of normalized) {
    for (const field of p.fields) union.add(field);
  }
  return { mode: 'selected', fields: [...union] };
}

function fieldIsVisible(name, visibility) {
  if (name == null || name === '') return false;
  if (!visibility || visibility.mode === 'all') return true;
  const key = String(name);
  if (ALWAYS_VISIBLE.has(key)) return true;
  const allowed = visibility.fields || [];
  const lower = key.toLowerCase();
  return allowed.some((f) => f === key || String(f).toLowerCase() === lower);
}

function filterFieldNameList(names, visibility) {
  if (!Array.isArray(names) || !visibility || visibility.mode === 'all') return names || [];
  return names.filter((name) => fieldIsVisible(name, visibility));
}

function filterPayloadByVisibility(obj, visibility) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if (!visibility || visibility.mode === 'all') return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (fieldIsVisible(key, visibility)) out[key] = value;
  }
  return out;
}

module.exports = {
  ALWAYS_VISIBLE,
  ensureFieldPermissionsColumn,
  normalizeFieldPermissions,
  getFieldVisibilityForUser,
  fieldIsVisible,
  filterFieldNameList,
  filterPayloadByVisibility,
};
