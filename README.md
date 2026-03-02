# IoT Monitoring System

A comprehensive IoT monitoring system with MQTT broker support, multi-protocol device management, real-time data visualization, and advanced user management features.

## 🚀 Features

### Core Features
- **MQTT Broker Integration**: Eclipse Mosquitto support with automatic device discovery
- **Multi-Protocol Support**: MQTT, NMEA (GPS), HTTP, TCP/UDP, Modbus, and custom protocols
- **Real-time Monitoring**: WebSocket-based live data streaming
- **Device Management**: Complete device lifecycle management with permissions
- **User Management**: Role-based access control (RBAC) with 4 user levels
- **Device Mapper**: Flexible field mapping and data transformation
- **Timezone Support**: Multi-timezone data handling and conversion

### Advanced Features
- **Time-Series Database**: PostgreSQL + TimescaleDB for efficient data storage
- **Data Compression**: Automatic compression for historical data
- **Real-time Alerts**: Configurable alerting system
- **Web Dashboard**: Modern, responsive web interface
- **API REST**: Complete REST API for integration
- **Security**: JWT authentication, rate limiting, and input validation

## 🏗️ System Architecture

```
┌─────────────────┐    MQTT     ┌─────────────────┐
│   Data Loggers  │ ──────────► │  Mosquitto      │
│   (Sensors)     │             │  MQTT Broker    │
└─────────────────┘             └─────────────────┘
                                        │
                                        │ MQTT
                                        ▼
┌─────────────────┐             ┌─────────────────┐
│   GPS Devices   │ ──────────► │  Node.js        │
│   (Various      │   HTTP/TCP  │  Monitoring     │
│   Protocols)    │             │  Application    │
└─────────────────┘             └─────────────────┘
                                        │
                                        │ WebSocket
                                        ▼
                                ┌─────────────────┐
                                │  Web Dashboard  │
                                │  (Real-time)    │
                                └─────────────────┘
```

## 📋 Prerequisites

### System Requirements
- **OS**: Linux (Ubuntu 20.04 LTS or later recommended), or Windows Server 2016+
- **Storage**: 100GB available space
- **RAM**: Minimum 4GB, Recommended 8GB+
- **CPU**: 2+ cores

### Software Requirements
- **Node.js**: v16+
- **PostgreSQL**: v12+ (TimescaleDB extension optional)
- **Eclipse Mosquitto**: v2.0+ (MQTT broker)
- **Git**: For version control

## 🛠️ Installation

### Install from GitHub (new Linux server)

One-command install: clone the repo and run the install script.

**App only** (Node.js, PostgreSQL, and Mosquitto already installed):

```bash
git clone https://github.com/haryowl/env.git && cd env && chmod +x install.sh && ./install.sh
```

**App + system dependencies** (installs PostgreSQL, Mosquitto, Node.js on Ubuntu, then the app):

```bash
git clone https://github.com/haryowl/env.git && cd env && chmod +x install.sh && ./install.sh --system
```

Then edit `.env`, create the database if needed, run `npm run setup-db`, and start with `npm start`. See the "Next steps" printed by the script.

---

### Quick install on Ubuntu (Linux)

To install system dependencies (PostgreSQL, Mosquitto, Node.js) on Ubuntu in one go:

```bash
# From the project root, make the script executable and run it
chmod +x scripts/setup-ubuntu.sh
./scripts/setup-ubuntu.sh
```

Then continue from **Step 3. Environment Configuration** below (create `.env`, run `npm run setup-db`, then `npm start`).

---

### 1. Clone the Repository
```bash
git clone https://github.com/haryowl/env.git
cd env
```

### 2. Install Dependencies
```bash
npm run install-all
```
Or install server and client separately:
```bash
npm install
cd client && npm install && cd ..
```

### 3. Environment Configuration
Copy the environment template and configure your settings:

**Linux / macOS:**
```bash
cp env.example .env
```

**Windows (Command Prompt):**
```cmd
copy env.example .env
```

Edit `.env` file with your configuration:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iot_monitoring
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_SSL=false

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# MQTT Configuration
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_CLIENT_ID=monitoring_server
```

### 4. Database Setup

#### Ubuntu / Debian (Linux)
```bash
# Install PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Optional: TimescaleDB for time-series optimization
# sudo add-apt-repository ppa:timescale/timescaledb-ppa
# sudo apt update
# sudo apt install timescaledb-2-postgresql-14  # match your PostgreSQL version

# Start PostgreSQL (usually enabled by default)
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user (run as postgres user)
sudo -u postgres psql -c "CREATE DATABASE iot_monitoring;"
# If you need a dedicated user (optional):
# sudo -u postgres psql -c "CREATE USER iot_user WITH PASSWORD 'your_password';"
# sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE iot_monitoring TO iot_user;"
```

#### Windows
1. Download and install PostgreSQL from https://www.postgresql.org/
2. Create database: `CREATE DATABASE iot_monitoring;` (via pgAdmin or psql)

#### Optional: TimescaleDB extension (Linux or Windows)
After PostgreSQL is installed, you can enable TimescaleDB inside the database:
```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```
(TimescaleDB is optional; the app works with standard PostgreSQL.)

#### Run Database Setup (all platforms)
```bash
npm run setup-db
```

This will create all necessary tables and a default admin user:
- **Username**: `admin`
- **Password**: `admin123`

**⚠️ Important**: Change the default password after first login!

### 5. Install and Configure Mosquitto MQTT Broker

#### Ubuntu / Debian (Linux)
```bash
# Install Mosquitto
sudo apt update
sudo apt install -y mosquitto mosquitto-clients

# Start and enable the service
sudo systemctl start mosquitto
sudo systemctl enable mosquitto

# Check status
sudo systemctl status mosquitto
```

Default config is usually sufficient. To customize, edit `/etc/mosquitto/mosquitto.conf`:
```conf
listener 1883
allow_anonymous true
persistence true
persistence_location /var/lib/mosquitto/
log_dest file
log_dest stdout
log_type all
log_timestamp true
```
Then restart: `sudo systemctl restart mosquitto`

#### Windows
1. Download Mosquitto from https://mosquitto.org/download/
2. Install as a Windows service
3. Configure `mosquitto.conf` (e.g. in install directory):
   ```conf
   listener 1883
   allow_anonymous true
   persistence true
   persistence_location C:\mosquitto\data\
   log_dest file
   log_dest stdout
   log_type all
   log_timestamp true
   ```
4. Start: `net start mosquitto`

### 6. Start the Application
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The application will be available at `http://localhost:3000`

## 👥 User Management

### User Roles
1. **Super Admin**: Full system access, user management
2. **Admin**: Device and user management
3. **Operator**: Device monitoring and basic configuration
4. **Viewer**: Read-only access to assigned devices

### Default Admin Account
- **Username**: `admin`
- **Password**: `admin123`
- **Role**: Super Admin

## 📊 Device Management

### Supported Protocols
- **MQTT**: Message Queuing Telemetry Transport
- **NMEA**: GPS navigation data
- **HTTP**: REST API endpoints
- **TCP/UDP**: Custom socket protocols
- **Modbus**: Industrial communication protocol
- **Custom**: User-defined protocols

### Device Types
- **Sensor**: Temperature, humidity, pressure, etc.
- **GPS**: Location tracking devices
- **Hybrid**: Combined sensor and GPS devices

### Device Configuration Example
```json
{
  "device_id": "sensor_001",
  "device_type": "sensor",
  "protocol": "mqtt",
  "name": "Temperature Sensor",
  "description": "Outdoor temperature sensor",
  "location": "Building A - Roof",
  "timezone": "America/New_York",
  "config": {
    "topics": ["sensors/temp/001", "sensors/humidity/001"],
    "qos": 1
  },
  "field_mappings": {
    "temp": "temperature",
    "hum": "humidity"
  }
}
```

## 🔧 Device Mapper

The device mapper allows you to standardize data from different protocols:

### Field Mapping Example
```json
{
  "source_field": "temp",
  "target_field": "temperature",
  "data_type": "number",
  "conversion_rule": {
    "unit": "celsius"
  },
  "validation_rule": {
    "min": -50,
    "max": 100
  },
  "default_value": 0,
  "is_required": true
}
```

### Data Type Conversions
- **Number**: Automatic unit conversion (Fahrenheit to Celsius, etc.)
- **Boolean**: String to boolean conversion
- **Timestamp**: Multiple date format support with timezone conversion
- **JSON**: Automatic JSON parsing

## 🌍 Timezone Management

The system supports multiple timezones:
- **UTC Storage**: All data stored in UTC
- **Device Timezones**: Each device can have its own timezone
- **User Timezones**: Users can view data in their preferred timezone
- **Automatic Conversion**: Real-time timezone conversion

## 📈 Data Storage

### Database Schema
- **Users**: User accounts and permissions
- **Devices**: Device configuration and status
- **Device Groups**: Logical device grouping
- **Sensor Readings**: Time-series sensor data
- **GPS Tracks**: Time-series location data
- **Device Events**: Device status and error logs
- **System Logs**: Application and user activity logs

### Data Retention
- **Hot Data**: Last 30 days (full resolution)
- **Warm Data**: 30 days - 1 year (compressed)
- **Cold Data**: 1+ years (highly compressed)
- **Auto-cleanup**: Configurable retention policies

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/change-password` - Change password
- `GET /api/auth/profile` - Get user profile

### Devices
- `GET /api/devices` - List devices
- `POST /api/devices` - Create device
- `GET /api/devices/:id` - Get device details
- `PUT /api/devices/:id` - Update device
- `DELETE /api/devices/:id` - Delete device

### Data
- `GET /api/data/sensors/:deviceId` - Get sensor data
- `GET /api/data/gps/:deviceId` - Get GPS data
- `POST /api/data/query` - Custom data queries

### Device Mapper
- `GET /api/device-mapper/:deviceId` - Get field mappings
- `POST /api/device-mapper/:deviceId` - Create field mapping
- `PUT /api/device-mapper/:deviceId/:field` - Update field mapping
- `DELETE /api/device-mapper/:deviceId/:field` - Delete field mapping

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-based Access Control**: Granular permissions
- **Rate Limiting**: API request throttling
- **Input Validation**: Comprehensive data validation
- **SQL Injection Protection**: Parameterized queries
- **CORS Configuration**: Cross-origin request control
- **Helmet Security**: HTTP security headers

## 📱 Web Dashboard

### Features
- **Real-time Data**: Live data visualization
- **Device Management**: Add, edit, and configure devices
- **User Management**: Manage users and permissions
- **Data Visualization**: Charts and graphs
- **Alert Management**: Configure and view alerts
- **System Monitoring**: Health and performance metrics

### Technologies
- **Frontend**: React + TypeScript
- **UI Framework**: Material-UI
- **Charts**: Chart.js or D3.js
- **Real-time**: Socket.IO client

## 🚨 Monitoring and Alerts

### System Health
- Database connection status
- MQTT broker connectivity
- Application performance metrics
- Error logging and monitoring

### Alert Types
- **Device Offline**: Device not responding
- **Data Threshold**: Values outside normal range
- **System Errors**: Application or database errors
- **Performance**: High resource usage

## 🔧 Configuration

### Environment Variables
See `env.example` for all available configuration options.

### Database Configuration
- Connection pooling
- Query optimization
- Backup scheduling
- Data retention policies

### MQTT Configuration
- Broker connection settings
- Topic subscriptions
- QoS levels
- Authentication

## 📚 Troubleshooting

### Common Issues

#### Database Connection Failed

**Linux (Ubuntu/Debian):**
```bash
# Check PostgreSQL service
sudo systemctl status postgresql
sudo systemctl start postgresql

# Test connection
psql -h localhost -U postgres -d iot_monitoring
```

**Windows:**
```cmd
net start postgresql-x64-14
psql -h localhost -U postgres -d iot_monitoring
```

#### MQTT Connection Failed

**Linux (Ubuntu/Debian):**
```bash
# Check Mosquitto service
sudo systemctl status mosquitto
sudo systemctl start mosquitto

# Test MQTT connection
mosquitto_pub -h localhost -t test/topic -m "test message"
```

**Windows:**
```cmd
net start mosquitto
mosquitto_pub -h localhost -t test/topic -m "test message"
```

#### Application Won't Start
```bash
# Check Node.js version (v16+ required)
node --version

# Reinstall dependencies
npm run install-all

# Ensure environment file exists
# Linux/macOS:
cp env.example .env
# Windows: copy env.example .env
```

### Logs
- **Application Logs**: `logs/app.log`
- **Database Logs**: PostgreSQL log files (Linux: often `/var/log/postgresql/`)
- **MQTT Logs**: Mosquitto log (Linux: `journalctl -u mosquitto` or config `log_dest`)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation

## 🔄 Updates

### Version 1.0.0
- Initial release
- Core monitoring functionality
- MQTT and multi-protocol support
- User management system
- Device mapper
- Timezone support
- Web dashboard

---

**Note**: This is a production-ready system designed for enterprise use. Make sure to follow security best practices and regularly update dependencies. 