# Troubleshooting: No Device Data Showing

When a device is transmitting but no data appears in the app, check the following on the **server** (in order).

**Tip:** When a step says "use ONE of these" or shows alternatives, run **only one** of the commands. Do not copy text in parentheses like `(or pm2...)` into the terminal—that causes a syntax error.

---

## How to view server logs

Use the command that matches how you run the app.

**If you run with Node directly (e.g. `node server/index.js` or `npm start`):**  
Logs appear in that terminal. If you run in background with `nohup` or `screen`, read the log file or reattach:

```bash
# If you started with: nohup npm start > app.log 2>&1 &
tail -f app.log

# If you use screen
screen -r   # reattach to see live logs
```

**If you use PM2:**

```bash
# Last 200 lines (default)
pm2 logs

# Last 500 lines, then follow
pm2 logs --lines 500

# Logs for a specific app name (e.g. iot-monitoring)
pm2 logs iot-monitoring
```

**If you use systemd (e.g. `systemctl start myapp`):**

```bash
# Last lines and follow
journalctl -u myapp -f

# Last 200 lines
journalctl -u myapp -n 200
```

**If you use Docker:**

```bash
docker logs -f <container_name_or_id>
```

---

## 1. MQTT broker connection

Data is ingested via MQTT. The server must connect to the same broker the device publishes to.

- **Env:** `MQTT_BROKER_URL` must be set (e.g. `mqtt://broker.hivemq.com:1883` or your broker).
- **Logs:** On startup you should see:
  - `Connecting to MQTT broker...`
  - `Connected to MQTT broker`
  - `MQTT: Subscribing to...` / `Subscribed to topic: ...`
- If you see *"MQTT broker URL not configured"* or *"Skipping MQTT connection"*, set `MQTT_BROKER_URL` and restart.

**Commands to run:**

```bash
# 1a) Check if MQTT URL is set (if using environment variable)
echo $MQTT_BROKER_URL

# 1b) If you use a .env file in the project folder (e.g. ~/env)
cd ~/env   # or your app directory
grep MQTT .env

# 1c) View recent server logs and look for MQTT lines (use ONE of these)
tail -n 100 app.log | grep -i mqtt
# OR with PM2:
pm2 logs --lines 100 --nostream | grep -i mqtt
# OR with systemd:
journalctl -u myapp -n 100 --no-pager | grep -i mqtt
```

Look for: `Connected to MQTT broker` and `Subscribed to topic`. If you see `Skipping MQTT connection` or `MQTT broker URL not configured`, set `MQTT_BROKER_URL` in `.env` and restart the server.

---

## 1b. Device connects to broker but does not appear in the list

The app **does not** create devices when a client connects to the broker. It only creates a device when it **receives a published message** on a topic it is subscribed to. So the device must **publish** at least one message to a matching topic (e.g. `devices/<id>/data` or `<id>/data`).

- **Check what the device publishes:** On the server, subscribe to all topics and watch for messages (then Ctrl+C to stop):

  ```bash
  mosquitto_sub -h localhost -t '#' -v
  ```

  Note the **topic** and **payload** of the first message. The topic must match one of the patterns in section 3 below (e.g. `devices/7022759042020164263/data` or `7022759042020164263/data`).

- **After the device publishes** to a matching topic, check app logs for:
  - `Received message on topic: ...`
  - `MQTT: Extracted device ID: ... from topic: ...`
  - `Device ... not found in database, creating new device`

If you see those lines, the device should appear in the list after a refresh. If the device only connects and never publishes, or publishes to a topic that does not match any pattern, it will not appear.

---

## 2. Device registered in database

The server only stores data for devices that exist in the `devices` table (or that it can auto-create from a known topic pattern).

- **Table:** `devices`
- Device must exist with:
  - `protocol = 'mqtt'`
  - `status != 'deleted'`
  - `config` (e.g. `{"topics":["devices/YOUR_DEVICE_ID/data"]}`) so the server subscribes to the right topic.

**Commands to run:**

```bash
# 2a) Connect to PostgreSQL and list devices (replace DB_NAME, USER with your values from .env)
# If your .env has DATABASE_URL=postgresql://user:pass@host:5432/dbname, use:
psql "$DATABASE_URL" -c "SELECT device_id, name, protocol, status, config FROM devices WHERE status != 'deleted';"

# 2b) Or connect step by step:
# psql -h localhost -U your_db_user -d your_db_name -c "SELECT device_id, name, protocol, status FROM devices WHERE status != 'deleted';"
```

If the device is missing, add it in the app (Devices → Add) or ensure the device publishes to a topic that matches the **wildcard** subscriptions (e.g. `devices/+/data`) so the server can auto-create it.

---

## 3. Topic and device ID match

The server derives `device_id` from the MQTT topic. It must match the `device_id` in the `devices` table.

**Subscribed patterns (from code):**
- `devices/+/data`, `device/+/data`, `+/data`  → device_id from topic
- `sensors/+/reading`, `gps/+/location`
- `+/telemetry`, `+/state`, `+/message`, `telemetry/+`
- `data/+/+`, `data/sparing/sparing/+`, `data/+/+/+`
- Per-device topics from `devices.config.topics`

**Example:** If the device publishes to `devices/mydevice123/data`, the device in DB must have `device_id = 'mydevice123'`.

**Commands to run:**

```bash
# 3a) Watch logs live while the device sends data (use ONE of these)
tail -f app.log
# OR
pm2 logs --lines 0
# OR
journalctl -u myapp -f

# 3b) Search recent logs for topic and device ID (use ONE of these)
grep -E "Raw message received|Extracted device ID" app.log | tail -20
# OR
pm2 logs --lines 500 --nostream | grep -E "Raw message received|Extracted device ID"
# OR
journalctl -u myapp -n 500 --no-pager | grep -E "Raw message received|Extracted device ID"
```

You should see `MQTT: Raw message received on topic: ...` and `MQTT: Extracted device ID: XXX from topic: ...`. The XXX must match your device’s `device_id` in the database. If it is empty or different, fix the device’s publish topic or the server’s topic pattern.

---

## 4. Message format (JSON + numeric/GPS fields)

- Payload must be **valid JSON**.
- For **sensor data:** at least one field must be a **number** (or numeric string). Other fields are skipped and not stored.
- For **GPS:** include `latitude` and `longitude` (numbers).

**Commands to run:**

```bash
# 4a) Search logs for message content and storage (use ONE of these)
grep -E "Message content|storeDeviceData|Inserting sensor reading|Skipping field" app.log | tail -30
# OR
pm2 logs --lines 300 --nostream | grep -E "Message content|storeDeviceData|Inserting sensor reading|Skipping field"
# OR
journalctl -u myapp -n 300 --no-pager | grep -E "Message content|storeDeviceData|Inserting sensor reading|Skipping field"
```

You should see `MQTT: Message content: {...}` and `storeDeviceData: Inserting sensor reading for field X value Y`. If you only see `Skipping field ... (not a valid number)`, the payload must include numeric values (or latitude/longitude for GPS).

---

## 5. Database tables and writes

Data is stored in:
- **Sensor:** `sensor_readings` (device_id, sensor_type, value, unit, timestamp, metadata)
- **GPS:** `gps_tracks` (device_id, latitude, longitude, ..., timestamp, ...)

**Commands to run:**

```bash
# 5a) Count rows (replace with your DB connection if needed)
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM sensor_readings;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM gps_tracks;"

# 5b) Show latest sensor and GPS rows
psql "$DATABASE_URL" -c "SELECT device_id, sensor_type, value, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 5;"
psql "$DATABASE_URL" -c "SELECT device_id, latitude, longitude, timestamp FROM gps_tracks ORDER BY timestamp DESC LIMIT 5;"
```

If counts are 0 after the device has been sending, fix steps 1–4. If you see rows but the app still shows no data, check step 6.

---

## 6. API and permissions

- **Data API:** `GET /api/data?device_id=XXX&time_range=24h` (and optional `start_date`/`end_date`).
- User must have **read** access to that device (role or device permissions).

**Commands to run:**

```bash
# 6a) Get a token (replace with your username/password and server URL)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 6b) Call data API (replace YOUR_DEVICE_ID with real device_id from step 2)
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/data?device_id=YOUR_DEVICE_ID&time_range=24h"

# 6c) If server is on another host/port, use that URL in both commands, e.g.:
# TOKEN=$(curl -s -X POST http://81.17.100.7:3000/api/auth/login ...)
# curl -s -H "Authorization: Bearer $TOKEN" "http://81.17.100.7:3000/api/data?device_id=YOUR_DEVICE_ID&time_range=24h"
```

If the response has data but the UI does not, the issue is frontend (e.g. wrong device or time range). If the response is empty `[]` or 403, fix permissions or device_id.

---

## 7. Alternative: data via Listeners (HTTP)

If the device sends data via **HTTP** to a Listener (not MQTT), then:

- A **Listener** must be configured in the app (Listeners) for that device/endpoint.
- The listener endpoint must be reachable by the device (URL/host/firewall).
**Commands to run:**

```bash
# 7a) If you use Listeners, check app logs for listener activity (use ONE of these)
grep -i listener app.log | tail -20
# OR
pm2 logs --lines 200 --nostream | grep -i listener
# OR
journalctl -u myapp -n 200 --no-pager | grep -i listener

# 7b) Confirm data still lands in DB (same as step 5)
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM sensor_readings;"
```

Listener config is in the app (Listeners menu). Ensure the device sends HTTP to the listener URL and that the server can receive it (firewall, URL correct).

---

## Summary checklist

| # | Check | Commands to run |
|---|--------|------------------|
| 1 | MQTT broker URL set and connected | See section 1: `echo $MQTT_BROKER_URL`, `grep MQTT .env`, then grep logs for mqtt |
| 2 | Device in DB | See section 2: `psql ... -c "SELECT device_id, name, protocol, status FROM devices ..."` |
| 3 | Topic to device_id match | See section 3: grep logs for "Raw message received" and "Extracted device ID" |
| 4 | Message format / storage | See section 4: grep logs for "Message content" and "storeDeviceData" |
| 5 | Data in DB | See section 5: `psql` COUNT and SELECT on sensor_readings and gps_tracks |
| 6 | API returns data | See section 6: curl login then curl /api/data with Bearer token |
| 7 | Listeners (if HTTP) | See section 7: grep logs for listener; run step 5 SQL |

---

## Quick reference: all check commands (copy-paste)

Assume app directory `~/env`, log file `app.log`, and `DATABASE_URL` in `.env`. Adjust for your setup (pm2/systemd/Docker).

```bash
# Load .env if you use it (optional)
cd ~/env && set -a && source .env && set +a

# 1) MQTT
echo $MQTT_BROKER_URL
grep MQTT .env
tail -n 100 app.log | grep -i mqtt

# 2) Devices in DB
psql "$DATABASE_URL" -c "SELECT device_id, name, protocol, status FROM devices WHERE status != 'deleted';"

# 3) Topic / device ID in logs
grep -E "Raw message received|Extracted device ID" app.log | tail -20

# 4) Message / store in logs
grep -E "Message content|storeDeviceData|Inserting sensor reading|Skipping field" app.log | tail -30

# 5) Data counts and latest rows
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM sensor_readings; SELECT COUNT(*) FROM gps_tracks;"
psql "$DATABASE_URL" -c "SELECT device_id, sensor_type, value, timestamp FROM sensor_readings ORDER BY timestamp DESC LIMIT 5;"
psql "$DATABASE_URL" -c "SELECT device_id, latitude, longitude, timestamp FROM gps_tracks ORDER BY timestamp DESC LIMIT 5;"

# 6) API (replace YOUR_PASSWORD and YOUR_DEVICE_ID)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"YOUR_PASSWORD"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token: ${TOKEN:0:20}..."
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/data?device_id=YOUR_DEVICE_ID&time_range=24h"
```

Running through these in order usually finds why device data is not showing on the installed server.
