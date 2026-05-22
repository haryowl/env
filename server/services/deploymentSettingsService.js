const fs = require('fs').promises;
const path = require('path');
const { parseAllowedHostsFromEnv } = require('../utils/postLogoutRedirect');

const ENV_PATH = path.join(process.cwd(), '.env');

/** Keys this UI may read/write (never touch secrets like JWT_SECRET here). */
const MANAGED_KEYS = ['CORS_ORIGINS', 'ALLOWED_LOGOUT_REDIRECT_HOSTS'];

function parseEnvLines(content) {
  const map = new Map();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function serializeEnvLines(originalContent, updates) {
  const keysUpdated = new Set(Object.keys(updates));
  const out = [];
  const lines = originalContent.split(/\r?\n/);
  let hadKey = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      out.push(line);
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (keysUpdated.has(key)) {
      const val = updates[key] ?? '';
      out.push(`${key}=${val}`);
      hadKey.add(key);
    } else {
      out.push(line);
    }
  }

  for (const key of MANAGED_KEYS) {
    if (keysUpdated.has(key) && !hadKey.has(key)) {
      out.push(`${key}=${updates[key] ?? ''}`);
    }
  }

  return out.join('\n').replace(/\n*$/, '\n');
}

function validateCorsOrigins(value) {
  const s = String(value || '').trim();
  if (!s) {
    return { ok: true, value: '' };
  }
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) {
    return { ok: false, error: 'Enter at least one origin URL or leave empty' };
  }
  const normalized = [];
  for (const part of parts) {
    try {
      const u = new URL(part);
      if (!['http:', 'https:'].includes(u.protocol)) {
        return { ok: false, error: `Invalid protocol in ${part} (use http or https)` };
      }
      normalized.push(u.origin);
    } catch {
      return { ok: false, error: `Invalid URL: ${part}` };
    }
  }
  return { ok: true, value: normalized.join(',') };
}

function validateLogoutHosts(value) {
  const s = String(value || '').trim();
  if (!s) {
    return { ok: true, value: '' };
  }
  const parts = s.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  const hostRe = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;
  for (const part of parts) {
    if (part.includes('://') || part.includes('/') || part.includes(':')) {
      return { ok: false, error: `Use hostnames only (no protocol or port): ${part}` };
    }
    if (!hostRe.test(part) && part !== 'localhost') {
      return { ok: false, error: `Invalid hostname: ${part}` };
    }
  }
  return { ok: true, value: parts.join(',') };
}

function primaryHostnameFromSettings(corsOrigins, logoutHosts) {
  if (logoutHosts) {
    return logoutHosts.split(',')[0].trim().toLowerCase();
  }
  const cors = String(corsOrigins || '').trim();
  if (!cors) return 'YOUR_DOMAIN';
  try {
    return new URL(cors.split(',')[0].trim()).hostname;
  } catch {
    return 'YOUR_DOMAIN';
  }
}

function buildNginxConfig(serverName, appPort = 3000) {
  const name = serverName || 'YOUR_DOMAIN';
  return `# Save as: /etc/nginx/sites-available/iot-monitoring
# Then: sudo ln -sf /etc/nginx/sites-available/iot-monitoring /etc/nginx/sites-enabled/
#       sudo nginx -t && sudo systemctl reload nginx

server {
    listen 80;
    server_name ${name};

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:${appPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`;
}

function buildCertbotSteps(serverName) {
  const name = serverName || 'YOUR_DOMAIN';
  return [
    'sudo apt-get update',
    'sudo apt-get install -y certbot python3-certbot-nginx',
    `sudo certbot --nginx -d ${name}`,
    'Add https:// to CORS_ORIGINS in this page, then Save',
    'pm2 restart iot-monitoring',
  ];
}

async function readEnvFile() {
  try {
    const content = await fs.readFile(ENV_PATH, 'utf8');
    return { exists: true, content };
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { exists: false, content: '' };
    }
    throw e;
  }
}

async function getDeploymentSettings(req) {
  const { content, exists } = await readEnvFile();
  const parsed = parseEnvLines(content);
  const corsOrigins = process.env.CORS_ORIGINS || parsed.get('CORS_ORIGINS') || '';
  const logoutHosts =
    process.env.ALLOWED_LOGOUT_REDIRECT_HOSTS || parsed.get('ALLOWED_LOGOUT_REDIRECT_HOSTS') || '';
  const serverName = primaryHostnameFromSettings(corsOrigins, logoutHosts);
  const appPort = process.env.PORT || '3000';

  return {
    env_file: ENV_PATH,
    env_file_exists: exists,
    cors_origins: corsOrigins,
    allowed_logout_redirect_hosts: logoutHosts,
    effective_allowed_hosts: parseAllowedHostsFromEnv(),
    node_env: process.env.NODE_ENV || 'development',
    app_port: appPort,
    suggested_server_name: serverName,
    request_host: req.get('host') || null,
    nginx_config: buildNginxConfig(serverName, appPort),
    certbot_steps: buildCertbotSteps(serverName),
    restart_required_after_save: true,
    guide_path: 'docs/INSTALL-UBUNTU-NGINX.md',
  };
}

async function updateDeploymentSettings({ cors_origins, allowed_logout_redirect_hosts }) {
  const corsResult = validateCorsOrigins(cors_origins);
  if (!corsResult.ok) {
    return { ok: false, error: corsResult.error };
  }
  const hostsResult = validateLogoutHosts(allowed_logout_redirect_hosts);
  if (!hostsResult.ok) {
    return { ok: false, error: hostsResult.error };
  }

  const updates = {
    CORS_ORIGINS: corsResult.value,
    ALLOWED_LOGOUT_REDIRECT_HOSTS: hostsResult.value,
  };

  const { exists, content } = await readEnvFile();
  const newContent = serializeEnvLines(exists ? content : '', updates);
  await fs.writeFile(ENV_PATH, newContent, 'utf8');

  process.env.CORS_ORIGINS = updates.CORS_ORIGINS;
  process.env.ALLOWED_LOGOUT_REDIRECT_HOSTS = updates.ALLOWED_LOGOUT_REDIRECT_HOSTS;

  return {
    ok: true,
    message:
      'Saved to .env. Restart the app (e.g. pm2 restart iot-monitoring) and reload nginx if you changed the server.',
    settings: {
      cors_origins: updates.CORS_ORIGINS,
      allowed_logout_redirect_hosts: updates.ALLOWED_LOGOUT_REDIRECT_HOSTS,
      effective_allowed_hosts: parseAllowedHostsFromEnv(),
    },
  };
}

module.exports = {
  getDeploymentSettings,
  updateDeploymentSettings,
  buildNginxConfig,
  buildCertbotSteps,
  MANAGED_KEYS,
};
