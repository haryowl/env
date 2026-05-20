#!/usr/bin/env bash
# Fresh Ubuntu install: clone from GitHub + system deps + app deps
# Usage (one command from any directory):
#   curl -fsSL https://raw.githubusercontent.com/haryowl/env/main/scripts/setup-ubuntu-nginx.sh | bash
#
# Or after clone:
#   chmod +x scripts/setup-ubuntu-nginx.sh && ./scripts/setup-ubuntu-nginx.sh
#
# Full guide: docs/INSTALL-UBUNTU-NGINX.md

set -e

INSTALL_DIR="${INSTALL_DIR:-/opt/iot-monitoring}"
REPO_URL="${REPO_URL:-https://github.com/haryowl/env.git}"

echo "=============================================="
echo "IoT Monitoring - Ubuntu bootstrap"
echo "Install directory: $INSTALL_DIR"
echo "=============================================="

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this script as a normal user with sudo (not as root)."
  echo "Example: curl -fsSL ... | bash"
  exit 1
fi

if [ ! -d "$INSTALL_DIR/.git" ]; then
  echo ">>> Cloning $REPO_URL ..."
  sudo mkdir -p "$(dirname "$INSTALL_DIR")"
  sudo git clone "$REPO_URL" "$INSTALL_DIR"
  sudo chown -R "$(whoami):$(whoami)" "$INSTALL_DIR"
else
  echo ">>> Already cloned at $INSTALL_DIR"
fi

cd "$INSTALL_DIR"
chmod +x install.sh

echo ">>> Installing system packages + Node dependencies..."
./install.sh --system

echo ""
echo "=============================================="
echo "Bootstrap done (app not started yet)."
echo "=============================================="
echo ""
echo "Next — run these commands:"
echo ""
echo "  cd $INSTALL_DIR"
echo "  nano .env          # set DB_PASSWORD, JWT_SECRET, CORS_ORIGINS"
echo "  sudo -u postgres psql -c \"CREATE DATABASE iot_monitoring;\""
echo "  npm run setup-db"
echo "  npm run build"
echo "  sudo npm install -g pm2"
echo "  pm2 start server/index.js --name iot-monitoring"
echo "  pm2 save && pm2 startup"
echo ""
echo "Then configure nginx (no :3000 in URL):"
echo "  See: $INSTALL_DIR/docs/INSTALL-UBUNTU-NGINX.md"
echo ""
echo "Default login: admin / admin123  (change after first login)"
echo ""
