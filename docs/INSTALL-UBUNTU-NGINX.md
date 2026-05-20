# Fresh install on Ubuntu + nginx (no port in URL)

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

**2) Create PostgreSQL database**

```bash
sudo -u postgres psql -c "CREATE DATABASE iot_monitoring;"
```

If you set a postgres password in `.env`, ensure PostgreSQL accepts it (default Ubuntu `peer` auth for local `postgres` user is fine when `DB_USER=postgres`).

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

---

## Optional — HTTPS (Let's Encrypt)

Only if you have a **real domain name** pointing to this server:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

Then in `.env` use `https://` in `CORS_ORIGINS` and restart:

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
| Tenant / logout “host not allowed” | Add host to `CORS_ORIGINS` or `ALLOWED_LOGOUT_REDIRECT_HOSTS` in `.env`, restart PM2 |
| WebSocket / live data fails | nginx `Upgrade` and `Connection` headers (see config above) |
| MQTT devices not connecting | `sudo systemctl status mosquitto` — broker on port 1883 |

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
