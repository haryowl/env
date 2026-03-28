/**
 * Validates absolute URLs used for post-logout redirects (open-redirect hardening).
 * Allowed hosts: ALLOWED_LOGOUT_REDIRECT_HOSTS (comma-separated), else hostnames from CORS_ORIGINS.
 * Non-production: also allows localhost / 127.0.0.1 / ::1.
 */

function parseAllowedHostsFromEnv() {
  const explicit = (process.env.ALLOWED_LOGOUT_REDIRECT_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (explicit.length) return explicit;

  const cors = process.env.CORS_ORIGINS || '';
  const hosts = [];
  cors.split(',').forEach((part) => {
    const p = part.trim();
    if (!p) return;
    try {
      const u = new URL(p);
      if (u.hostname) hosts.push(u.hostname.toLowerCase());
    } catch (_) {
      /* ignore */
    }
  });
  return hosts;
}

function devLocalHosts() {
  return new Set(['localhost', '127.0.0.1', '[::1]']);
}

function isHostAllowed(hostname) {
  const h = String(hostname).toLowerCase();
  const allow = parseAllowedHostsFromEnv();
  if (allow.includes(h)) return true;
  if (process.env.NODE_ENV !== 'production' && devLocalHosts().has(h)) return true;
  return false;
}

/**
 * @param {string|null|undefined} raw
 * @returns {{ ok: true, url: string|null } | { ok: false, error: string }}
 */
function validatePostLogoutRedirectUrl(raw) {
  if (raw == null || String(raw).trim() === '') {
    return { ok: true, url: null };
  }
  const s = String(raw).trim();
  if (s.length > 2048) {
    return { ok: false, error: 'URL too long (max 2048 characters)' };
  }

  let u;
  try {
    u = new URL(s);
  } catch (_) {
    return { ok: false, error: 'Invalid URL' };
  }

  if (!['http:', 'https:'].includes(u.protocol)) {
    return { ok: false, error: 'URL must use http or https' };
  }

  if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:') {
    return { ok: false, error: 'HTTPS is required for logout redirect URLs in production' };
  }

  if (u.username || u.password) {
    return { ok: false, error: 'URL must not contain credentials' };
  }

  if (!isHostAllowed(u.hostname)) {
    return {
      ok: false,
      error:
        'Host is not allowed. Set ALLOWED_LOGOUT_REDIRECT_HOSTS (comma-separated) or include the host in CORS_ORIGINS.',
    };
  }

  return { ok: true, url: u.href };
}

/**
 * @param {{ post_logout_redirect_url?: string|null, tenant_post_logout_redirect_url?: string|null }} row
 * @returns {string|null}
 */
function resolveLogoutRedirectFromUserRow(row) {
  if (!row) return null;
  const candidates = [row.post_logout_redirect_url, row.tenant_post_logout_redirect_url];
  for (const c of candidates) {
    if (c == null || String(c).trim() === '') continue;
    const v = validatePostLogoutRedirectUrl(c);
    if (v.ok && v.url) return v.url;
  }
  return null;
}

module.exports = {
  validatePostLogoutRedirectUrl,
  resolveLogoutRedirectFromUserRow,
  parseAllowedHostsFromEnv,
};
