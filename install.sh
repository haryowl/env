#!/usr/bin/env bash
# Install IoT Monitoring System on a new Linux server (run from project root after clone)
# Usage:
#   Option A - Clone then install:
#     git clone https://github.com/haryowl/env.git && cd env && chmod +x install.sh && ./install.sh
#   Option B - Install system deps first (Ubuntu), then app:
#     ./install.sh --system
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=============================================="
echo "IoT Monitoring System - Install"
echo "=============================================="

# Require package.json and server folder
if [ ! -f package.json ] || [ ! -d server ]; then
  echo "Error: Run this script from the project root (where package.json and server/ are)."
  exit 1
fi

# Optional: install system dependencies (PostgreSQL, Mosquitto, Node.js) on Ubuntu
if [ "$1" = "--system" ]; then
  if [ ! -f scripts/setup-ubuntu.sh ]; then
    echo ">>> Error: scripts/setup-ubuntu.sh not found."
    exit 1
  fi
  chmod +x scripts/setup-ubuntu.sh
  echo ">>> Installing system dependencies (Ubuntu/Debian)..."
  sudo scripts/setup-ubuntu.sh
fi

# Create .env from example if missing
if [ ! -f .env ]; then
  echo ">>> Creating .env from env.example..."
  cp env.example .env
  echo "    Please edit .env and set DB_PASSWORD, JWT_SECRET, and other options."
else
  echo ">>> .env already exists; skipping."
fi

# Install Node dependencies (root + client)
echo ">>> Installing Node dependencies..."
npm run install-all

echo ""
echo "=============================================="
echo "Install complete."
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Edit .env and set at least:"
echo "     - DB_PASSWORD (PostgreSQL password)"
echo "     - JWT_SECRET  (strong random string)"
echo ""
echo "  2. Create the database (if not already):"
echo "     sudo -u postgres psql -c \"CREATE DATABASE iot_monitoring;\""
echo ""
echo "  3. Run database setup (creates tables and default admin):"
echo "     npm run setup-db"
echo ""
echo "  4. Start the application:"
echo "     npm start"
echo ""
echo "  Default login: admin / admin123 (change after first login!)"
echo ""
