1# Fresh install on Ubuntu + nginx (no port in URL)

This guide installs the IoT Monitoring app on a **new Ubuntu server** and puts **nginx** in front so users open:

- `http://your-domain.com` (port 80)  
- or `https://your-domain.com` (port 443, recommended)

The app itself still runs on **port 3000** on the server; only nginx is public on 80/443.

**GitHub repo:** `https://github.com/haryowl/env.git`

---

## What you need

| Item | Notes |
|------|--------|
| Ubuntu 20.04 / 22.04 / 24.04 | Fresh VPS or VM |
| `sudo` access | Required for packages and nginx |
| Domain (optional) | e.g. `csr.aksadata.id` → server public IP |
| ~2 GB RAM+ | 4 GB+ recommended |

---

## Fast path (about 2 copy-paste blocks)

### Block 1 — Clone and install everything from GitHub

Run as a normal user with `sudo` (not as root):

```bash
git clone https://github.com/haryowl/env.git /opt/iot-monitoring
cd /opt/iot-monitoring
chmod +x install.sh scripts/setup-ubuntu-nginx.sh
./install.sh --system
```

This installs **Node.js, PostgreSQL, Mosquitto, Git**, copies `.env`, and runs `npm run install-all`.

**Alternative (single remote script):**

```bash
curl -fsSL https://raw.githubusercontent.com/haryowl/env/main/scripts/setup-ubuntu-nginx.sh | bash
```

That script clones to `/opt/iot-monitoring`, runs `./install.sh --system`, then prints the next steps.

---

### Block 2 — Configure, database, build, run with PM2

Still in `/opt/iot-monitoring`:

**1) Edit environment**

```bash
nano .env
```

Set at least these (use your real values):

```env
PORT=3000
NODE_ENV=production

DB_HOST=localhost
DB_PORT=5432
DB_NAME=iot_monitoring
DB_USER=postgres
DB_PASSWORD=YOUR_STRONG_DB_PASSWORD

JWT_SECRET=YOUR_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=24h

MQTT_BROKER_URL=mqtt://localhost:1883

# Public URL without :3000 (required for tenants / logout redirects / CORS)
CORS_ORIGINS=http://YOUR_DOMAIN,https://YOUR_DOMAIN
ALLOWED_LOGOUT_REDIRECT_HOSTS=YOUR_DOMAIN
```

Examples:

- Domain: `CORS_ORIGINS=http://csr.aksadata.id,https://csr.aksadata.id`
- IP only: `CORS_ORIGINS=http://81.17.100.7`

**2) Set PostgreSQL password (must match `.env`) and create the database**

`npm run setup-db` connects as `DB_USER` with `DB_PASSWORD` over TCP (`localhost`). On a fresh Ubuntu install the `postgres` role often has **no password** until you set one — if `.env` has a password PostgreSQL does not know, you get `password authentication failed for user "postgres"`.

Use the **same** password in both places (example: `MySecureDbPass123`):

```bash
# Replace with the exact value you put in .env as DB_PASSWORD=
export DB_PASS='MySecureDbPass123'

sudo -u postgres psql -c "ALTER USER postgres PASSWORD '${DB_PASS}';"
sudo -u postgres psql -c "CREATE DATABASE iot_monitoring;"
```

Verify (should list `iot_monitoring`):

```bash
PGPASSWORD="$DB_PASS" psql -h localhost -U postgres -d iot_monitoring -c '\conninfo'
```

In `.env`:

```env
DB_USER=postgres
DB_PASSWORD=MySecureDbPass123
```

**Common mistake:** editing `.env` with `YOUR_STRONG_DB_PASSWORD` or leaving `your_password` from `env.example` without running `ALTER USER postgres` with that same string.

**3) Create tables and default admin**

```bash
npm run setup-db
```

Default login: **`admin` / `admin123`** — change the password after first login.

**4) Build the web UI and install PM2**

```bash
npm run build
sudo npm install -g pm2
pm2 start server/index.js --name iot-monitoring
pm2 save
pm2 startup
```

Follow the command `pm2 startup` prints (copy/paste the `sudo env ...` line), then run `pm2 save` again.

**5) Check the app locally**

```bash
curl -s http://127.0.0.1:3000/health
```

You should see `"status":"healthy"` (or similar JSON).

---

## Step 3 — nginx (access without `:3000`)

**1) Install nginx**

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

**2) Create site config**

Replace `YOUR_DOMAIN` with your hostname or server IP.

```bash
sudo nano /etc/nginx/sites-available/iot-monitoring
```

Paste (edit `server_name`):

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Socket.IO / WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**3) Enable site and reload**

```bash
sudo ln -sf /etc/nginx/sites-available/iot-monitoring /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

**4) Firewall (if UFW is enabled)**

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Port **3000** does not need to be open to the internet.

**5) Open in browser**

- `http://YOUR_DOMAIN`  
- You should see the login page (no `:3000`).

### Multiple domains (same app)

If several hostnames should open the **same** IoT app (e.g. `monitor.example.com` and `iot.example.com`, or domain + `www`), use **one** `server` block and list every name on `server_name`. nginx accepts any of them and still proxies to the same `127.0.0.1:3000`.

**DNS:** Each hostname must have an **A** (or **AAAA**) record pointing to this server’s public IP before Certbot will work.

**nginx** — replace the single name with a space-separated list:

```nginx
server {
    listen 80;
    server_name monitor.example.com iot.example.com www.monitor.example.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Then `sudo nginx -t` and `sudo systemctl reload nginx`. Test each URL in the browser.

**App / CORS / tenants** — the Node app must allow each **origin** (scheme + host + port). In `.env` or **Deployment & domain** in the UI, list every public URL (comma-separated, no spaces required but allowed):

```env
CORS_ORIGINS=http://monitor.example.com,https://monitor.example.com,http://iot.example.com,https://iot.example.com
ALLOWED_LOGOUT_REDIRECT_HOSTS=monitor.example.com,iot.example.com
```


After changing `.env`, run `pm2 restart iot-monitoring`.

**Optional:** `www` and bare domain are different hostnames — include both in `server_name`, `CORS_ORIGINS`, and Certbot if users might use either.

You do **not** need a separate nginx site file per domain unless you want different apps or certificates on different servers.

---

## Optional — HTTPS (Let's Encrypt)

Only if you have a **real domain name** pointing to this server:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

**Several domains on one certificate** — repeat `-d` for each hostname in the same `server_name` list:

```bash
sudo certbot --nginx -d monitor.example.com -d iot.example.com -d www.monitor.example.com
```

Certbot updates the nginx site for HTTPS. Then add `https://...` for **each** hostname to `CORS_ORIGINS` and restart:

```bash
pm2 restart iot-monitoring
```

---

## How it fits together

```text
Browser  →  nginx :80 / :443  →  Node app :3000  →  PostgreSQL
                              →  Mosquitto :1883 (MQTT)
```

The React UI is served from `client/dist` by the same Node process, so one nginx `location /` is enough.

---

## Update the app later

```bash
cd /opt/iot-monitoring
git pull
npm run install-all
npm run build
pm2 restart iot-monitoring
```

Database migrations (if any): check project `scripts/` or release notes; often `npm run setup-db` is only needed once.

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| Blank page / API errors | `pm2 logs iot-monitoring` — app running? `curl http://127.0.0.1:3000/health` |
| 502 Bad Gateway | App not running: `pm2 status` and restart |
| Login works on `:3000` but not on domain | nginx config not enabled or wrong `server_name` |
| `password authentication failed for user "postgres"` on `setup-db` | `DB_PASSWORD` in `.env` must match `ALTER USER postgres PASSWORD '...'` (see step 2 above) |
| Tenant / logout “host not allowed” | Add host to `CORS_ORIGINS` or `ALLOWED_LOGOUT_REDIRECT_HOSTS` in `.env`, restart PM2 |
| WebSocket / live data fails | nginx `Upgrade` and `Connection` headers (see config above) |
| MQTT devices not connecting | `sudo systemctl status mosquitto` — broker on port 1883 |
| Create site / alert returns **500** on fresh install | Run `npm run ensure-schema` then `pm2 restart iot-monitoring` (adds `user_sites`, `alerts.created_by`, etc.) |

After `npm run setup-db`, schema extras are applied automatically on first app start. On an existing DB from an older release, run once:

```bash
cd /opt/iot-monitoring
npm run ensure-schema
pm2 restart iot-monitoring
```

**Logs**

```bash
pm2 logs iot-monitoring --lines 100
sudo tail -f /var/log/nginx/error.log
```

---

## Manual install (if you prefer step-by-step without `--system`)

See also the main [README](../README.md). Short version:

1. `git clone https://github.com/haryowl/env.git && cd env`
2. `chmod +x install.sh && ./install.sh` (app only; install Postgres/Mosquitto/Node yourself)
3. Configure `.env`, `npm run setup-db`, `npm run build`, PM2, nginx as above.

---

## Summary checklist

- [ ] `git clone` + `./install.sh --system`
- [ ] `.env` with `DB_PASSWORD`, `JWT_SECRET`, `CORS_ORIGINS` (no `:3000`)
- [ ] `npm run setup-db`
- [ ] `npm run build` + `pm2 start`
- [ ] nginx proxy to `127.0.0.1:3000`
- [ ] Browser opens `http://YOUR_DOMAIN` and login works
- [ ] Change default `admin` password
