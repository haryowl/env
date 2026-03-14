# HTTP Device Data Ingestion

Devices can send sensor/GPS data to the app via HTTP POST when MQTT is not available.

## Endpoint

```
POST /api/device-data/:deviceId
```

- **deviceId** (path): Your device ID (must match `device_id` in the database, or will be auto-created).
- **Content-Type:** `application/json`
- **Body:** Same JSON format as MQTT (see below).

## Authentication

- **No auth (default):** If `DEVICE_DATA_API_KEY` is not set in `.env`, the endpoint accepts requests without authentication.
- **API key:** If `DEVICE_DATA_API_KEY` is set, include one of:
  - Header: `X-API-Key: <your-key>`
  - Header: `Authorization: Bearer <your-key>`

## JSON Body Format

Same as MQTT. Example:

```json
{
  "datetime": "2025-03-13T10:30:00.000Z",
  "_terminalTime": "2025-03-13 18:30:00",
  "_groupName": "Optional Group Name",
  "TSS": 50.34,
  "COD": 101.82,
  "PH": 7.03,
  "Debit": 0.000,
  "temperature": 25.5,
  "humidity": 70.2
}
```

For GPS:

```json
{
  "datetime": "2025-03-13T10:30:00Z",
  "latitude": -6.2,
  "longitude": 106.8,
  "altitude": 100
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `datetime` or `_terminalTime` | string (ISO date) | Optional | Device timestamp. Defaults to server receive time. |
| Any numeric field | number | At least one | Stored as sensor readings (e.g. TSS, COD, PH, temperature). |
| `latitude`, `longitude` | number | For GPS | Stored in gps_tracks. |

## Example Requests

### cURL

```bash
curl -X POST http://localhost:3000/api/device-data/7071149045090111014 \
  -H "Content-Type: application/json" \
  -d '{"datetime":"2025-03-13T10:30:00Z","TSS":50.34,"COD":101.82,"PH":7.03,"Debit":0.0}'
```

With API key:

```bash
curl -X POST http://localhost:3000/api/device-data/7071149045090111014 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"datetime":"2025-03-13T10:30:00Z","TSS":50.34,"COD":101.82,"PH":7.03}'
```

### JavaScript (fetch)

```javascript
await fetch('http://your-server:3000/api/device-data/7071149045090111014', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    datetime: new Date().toISOString(),
    TSS: 50.34,
    COD: 101.82,
    PH: 7.03,
    Debit: 0.0
  })
});
```

## Response

**Success (201):**
```json
{
  "success": true,
  "message": "Data ingested",
  "deviceId": "7071149045090111014"
}
```

**Error (4xx/5xx):**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Auto-Create Device

If the device does not exist in the database, it is created with:
- `protocol`: `http`
- `device_type`: inferred from payload (sensor, gps, or hybrid)
- `status`: `online`

## Notes

- Data is processed the same way as MQTT: device mapper, alerts, and real-time WebSocket emission.
- Set `DEVICE_DATA_API_KEY` in production for security.
