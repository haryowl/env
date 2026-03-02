# Timezone Implementation Guide

## Overview

This document explains the timezone handling system in the IoT monitoring application. The system supports multiple timezones for devices and users, with automatic conversion between device local time and UTC for storage, and user display timezone for viewing.

## Timezone Flow

### 1. Device Data Flow
```
Device (Local Time) → Device Mapper → UTC Storage → User Display (User Timezone)
```

**Example:**
- Device in Jakarta (UTC+7) sends: `_terminalTime: "2025-07-26 18:11:05"`
- Device Mapper converts to UTC: `2025-07-26 11:11:05 UTC`
- Stored in database as UTC
- User in New York (UTC-5) sees: `2025-07-26 06:11:05 EDT`

### 2. Timezone Configuration Points

#### A. Device Timezone (DEVICES Menu)
- **Purpose**: Defines the source timezone of the device
- **Location**: Device creation/editing form
- **Usage**: Converts device's local datetime to UTC for storage
- **Example**: Device in Jakarta → `timezone: "Asia/Jakarta"`

#### B. User Profile Timezone (SETTINGS → Profile)
- **Purpose**: User's preferred timezone for data display
- **Location**: Settings → Profile section
- **Usage**: Converts UTC data to user's local time for display
- **Example**: User in New York → `timezone: "America/New_York"`

#### C. Application Timezone (SETTINGS → Preferences)
- **Purpose**: Default timezone for the application interface
- **Location**: Settings → Application Preferences
- **Usage**: Fallback timezone if user profile timezone is not set
- **Storage**: `localStorage.getItem('iot_timezone')`

## Implementation Details

### 1. Device Mapper Timezone Conversion

**File**: `server/services/deviceMapper.js`

```javascript
// Convert device's local datetime to UTC for storage
if (mappedData.datetime && device.timezone && device.timezone !== 'UTC') {
  try {
    // Parse the datetime string in the device's timezone
    const deviceLocalTime = moment.tz(mappedData.datetime, device.timezone);
    
    if (deviceLocalTime.isValid()) {
      // Convert to UTC for storage
      const utcTime = deviceLocalTime.utc();
      mappedData.datetime = utcTime.toISOString();
    }
  } catch (error) {
    // Fallback: treat as UTC if conversion fails
    mappedData.datetime = moment.utc(mappedData.datetime).toISOString();
  }
}
```

### 2. Frontend Timezone Utilities

**File**: `client/src/utils/timezoneUtils.js`

```javascript
// Comprehensive timezone list with UTC offsets
export const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC (UTC+0)' },
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta (UTC+7)' },
  { value: 'America/New_York', label: 'America/New York (UTC-5/UTC-4)' },
  // ... more timezones
];

// Format datetime in user's timezone
export const formatInUserTimezone = (datetime, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!datetime) return '-';
  
  try {
    const utcMoment = moment.utc(datetime);
    if (!utcMoment.isValid()) return '-';
    
    const userTz = getUserTimezone();
    return utcMoment.tz(userTz).format(format);
  } catch (error) {
    return '-';
  }
};
```

### 3. Database Schema

**Devices Table**:
```sql
CREATE TABLE devices (
  device_id VARCHAR(50) PRIMARY KEY,
  timezone VARCHAR(50) DEFAULT 'UTC',  -- Device timezone
  -- ... other fields
);
```

**Users Table**:
```sql
CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  timezone VARCHAR(50) DEFAULT 'UTC',  -- User timezone
  -- ... other fields
);
```

## Usage Examples

### 1. Device Configuration
When creating a device in Jakarta:
```javascript
{
  device_id: "sensor_001",
  name: "Water Quality Sensor",
  timezone: "Asia/Jakarta",  // Device is in UTC+7
  // ... other config
}
```

### 2. Data Processing
Device sends data:
```json
{
  "_terminalTime": "2025-07-26 18:11:05",
  "cod_mg_l": "217.896",
  "tss_mg_l": "125.69"
}
```

Device Mapper processes:
1. Maps `_terminalTime` → `datetime`
2. Converts `"2025-07-26 18:11:05"` from `Asia/Jakarta` to UTC
3. Result: `"2025-07-26T11:11:05.000Z"` (stored in database)

### 3. User Display
User in New York (UTC-5) views data:
- UTC time: `2025-07-26T11:11:05.000Z`
- Displayed as: `2025-07-26 06:11:05 EDT`

## Timezone Options with UTC Offsets

The system provides a curated list of timezones with UTC offset information:

### Asia
- `Asia/Jakarta (UTC+7)`
- `Asia/Singapore (UTC+8)`
- `Asia/Tokyo (UTC+9)`
- `Asia/Shanghai (UTC+8)`

### Americas
- `America/New_York (UTC-5/UTC-4)` - DST aware
- `America/Los_Angeles (UTC-8/UTC-7)` - DST aware
- `America/Sao_Paulo (UTC-3/UTC-2)` - DST aware

### Europe
- `Europe/London (UTC+0/UTC+1)` - DST aware
- `Europe/Paris (UTC+1/UTC+2)` - DST aware
- `Europe/Moscow (UTC+3)`

### Australia/Oceania
- `Australia/Sydney (UTC+10/UTC+11)` - DST aware
- `Pacific/Auckland (UTC+12/UTC+13)` - DST aware

## Best Practices

### 1. Device Configuration
- Always set the correct device timezone when creating devices
- Use the timezone where the device is physically located
- For devices without timezone info, default to UTC

### 2. User Configuration
- Users should set their preferred timezone in Settings
- The application timezone serves as a fallback
- Timezone changes take effect immediately

### 3. Data Consistency
- All data is stored in UTC in the database
- Timezone conversions happen at the application layer
- Historical data maintains timezone accuracy

## Troubleshooting

### Common Issues

1. **Wrong Device Timezone**
   - Symptom: Data appears at wrong times
   - Solution: Update device timezone in Device Manager

2. **User Timezone Not Set**
   - Symptom: Data shows in UTC instead of local time
   - Solution: Set timezone in Settings → Profile

3. **Invalid DateTime Format**
   - Symptom: Conversion errors in logs
   - Solution: Check device datetime format in mapper template

### Debugging

Enable debug logging in `deviceMapper.js`:
```javascript
console.log(`DeviceMapper: Converted ${mappedData.datetime} from ${device.timezone} to UTC: ${utcTime.toISOString()}`);
```

Check timezone conversion in frontend:
```javascript
console.log('User timezone:', getUserTimezone());
console.log('Formatted time:', formatInUserTimezone(utcTime));
```

## Migration Notes

If upgrading from a previous version:
1. Existing devices without timezone will default to UTC
2. Users should update their timezone preferences
3. Historical data will be displayed in the user's selected timezone
4. No data migration is required as all timestamps are already in UTC 