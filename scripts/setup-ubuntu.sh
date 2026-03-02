#!/usr/bin/env bash
# setup-ubuntu.sh - Install system dependencies for IoT Monitoring System on Ubuntu/Debian
# Usage: chmod +x scripts/setup-ubuntu.sh && ./scripts/setup-ubuntu.sh

set -e

# Detect Linux distro
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_VERSION="${VERSION_ID:-}"
else
  OS_ID="unknown"
fi

echo "=============================================="
echo "IoT Monitoring System - Ubuntu/Debian Setup"
echo "=============================================="

# Require root for package installs (or suggest sudo)
if [ "$(id -u)" -ne 0 ]; then
  echo "This script installs system packages. Running with sudo..."
  exec sudo bash "$0" "$@"
fi

case "$OS_ID" in
  ubuntu|debian)
    echo "Detected: $PRETTY_NAME"
    ;;
  *)
    echo "Warning: This script is intended for Ubuntu/Debian. Detected: $OS_ID"
    if [ "${FORCE_SETUP:-0}" != "1" ]; then
      echo "Set FORCE_SETUP=1 to run anyway: FORCE_SETUP=1 $0"
      exit 1
    fi
    ;;
esac

# Update package list
echo ""
echo ">>> Updating package list..."
apt-get update -qq

# Install Node.js (v18 LTS) if not present or too old
NODE_REQUIRED=16
if ! command -v node &>/dev/null; then
  echo ""
  echo ">>> Installing Node.js (via NodeSource for v18 LTS)..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
elif [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt "$NODE_REQUIRED" ]; then
  echo ""
  echo ">>> Upgrading Node.js (current: $(node -v), need v${NODE_REQUIRED}+)..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
else
  echo ""
  echo ">>> Node.js already installed: $(node -v)"
fi

# Install PostgreSQL
if ! command -v psql &>/dev/null; then
  echo ""
  echo ">>> Installing PostgreSQL..."
  apt-get install -y postgresql postgresql-contrib
  systemctl start postgresql || true
  systemctl enable postgresql 2>/dev/null || true
  echo "PostgreSQL installed. Create database with: sudo -u postgres psql -c 'CREATE DATABASE iot_monitoring;'"
else
  echo ""
  echo ">>> PostgreSQL already installed: $(psql --version 2>/dev/null || echo 'present')"
fi

# Install Mosquitto MQTT broker
if ! command -v mosquitto &>/dev/null; then
  echo ""
  echo ">>> Installing Mosquitto MQTT broker..."
  apt-get install -y mosquitto mosquitto-clients
  systemctl start mosquitto || true
  systemctl enable mosquitto 2>/dev/null || true
  echo "Mosquitto installed and started."
else
  echo ""
  echo ">>> Mosquitto already installed."
  systemctl start mosquitto 2>/dev/null || true
fi

# Optional: Git if not present
if ! command -v git &>/dev/null; then
  echo ""
  echo ">>> Installing Git..."
  apt-get install -y git
else
  echo ""
  echo ">>> Git already installed."
fi

echo ""
echo "=============================================="
echo "System dependencies are ready."
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. cp env.example .env   (from project root)"
echo "  2. Edit .env and set DB_PASSWORD and other options"
echo "  3. Create DB (if not exists): sudo -u postgres psql -c 'CREATE DATABASE iot_monitoring;'"
echo "  4. npm run install-all"
echo "  5. npm run setup-db"
echo "  6. npm start"
echo ""
