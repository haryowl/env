# Notification Integration for Alert System

## Overview

The alert evaluation service has been successfully updated to include notification sending capabilities. When alerts are triggered, the system can now automatically send email and HTTP notifications based on the alert configuration.

## What Was Implemented

### 1. Updated Alert Evaluation Service (`server/services/alertEvaluationService.js`)

- **Added notification service import**: Integrated the existing `NotificationService` into the alert evaluation service
- **Enhanced threshold alerts**: When threshold alerts are triggered, the system now:
  - Gets the device name for better notification context
  - Checks if the alert has notification actions configured (`email` or `http`)
  - Calls the notification service to send appropriate notifications
  - Logs any notification failures without breaking the alert evaluation
- **Enhanced inactivity alerts**: Similar notification integration for inactivity alerts
- **Error handling**: Notification failures are caught and logged but don't prevent alert logging or WebSocket events

### 2. Updated Server Initialization (`server/index.js`)

- **Added notification service import**: Imported the notification service
- **Enhanced service initialization**: Added notification service initialization to the `initializeServices` function
- **Email transporter setup**: The notification service's email transporter is initialized during server startup

### 3. Updated Dependencies (`package.json`)

- **Added required packages**: Added `axios` (^1.6.0) and `nodemailer` (^6.9.7) to the server dependencies
- **Added test script**: Added `test-notifications` script for testing the integration

### 4. Created Test Script (`scripts/test-notification-integration.js`)

- **Comprehensive testing**: Tests all aspects of the notification integration
- **Table verification**: Checks that all required tables exist
- **Configuration validation**: Verifies email and HTTP configurations
- **Alert testing**: Tests the alert evaluation service with sample data
- **Logging verification**: Shows recent notification logs

## How It Works

### Alert Configuration

Alerts can be configured with notification actions through the `actions` field:

```json
{
  "name": "High Temperature Alert",
  "device_id": "sensor001",
  "parameter": "temperature",
  "min": null,
  "max": 80,
  "type": "threshold",
  "actions": {
    "email": true,
    "http": true,
    "popup": false
  },
  "template": "Alert: Device {device} temperature is {value}°C (max: {max}°C)"
}
```

### Notification Flow

1. **Alert Triggered**: When sensor data exceeds thresholds or inactivity is detected
2. **Device Lookup**: System gets the device name for better notification context
3. **Action Check**: System checks if the alert has `email` or `http` actions enabled
4. **Notification Sending**: If enabled, notifications are sent via the configured channels
5. **Logging**: All notification attempts are logged to the `notification_logs` table
6. **Error Handling**: Notification failures don't prevent alert logging or WebSocket events

### Supported Notification Types

#### Email Notifications
- Uses SMTP configuration from `email_config` table
- Sends to recipients assigned to the alert via `alert_email_assignments`
- Supports HTML and text templates
- Includes retry logic with configurable attempts

#### HTTP Notifications
- Uses HTTP configuration from `http_config` table
- Sends POST/PUT requests to configured webhook URLs
- Supports custom headers and authentication
- Includes retry logic with exponential backoff

## Database Tables Required

The following tables must exist for the notification system to work:

1. **`alerts`** - Alert definitions with `actions` field
2. **`alert_logs`** - Alert event logging
3. **`email_config`** - SMTP server configurations
4. **`http_config`** - HTTP webhook configurations
5. **`email_recipients`** - Email recipient list
6. **`alert_email_assignments`** - Alert-to-recipient mappings
7. **`notification_logs`** - Notification attempt logging

## Configuration

### Email Configuration

Configure SMTP settings in the `email_config` table:

```sql
INSERT INTO email_config (
  name, smtp_host, smtp_port, smtp_secure, 
  username, password, from_email, from_name, is_default
) VALUES (
  'Gmail SMTP', 'smtp.gmail.com', 587, false,
  'your-email@gmail.com', 'your-app-password',
  'alerts@yourdomain.com', 'IoT Alert System', true
);
```

### HTTP Configuration

Configure webhook settings in the `http_config` table:

```sql
INSERT INTO http_config (
  name, url, method, headers, is_default
) VALUES (
  'Slack Webhook', 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
  'POST', '{"Content-Type": "application/json"}', true
);
```

### Email Recipients

Add email recipients:

```sql
INSERT INTO email_recipients (email, name, is_active) 
VALUES ('admin@company.com', 'System Admin', true);
```

### Alert-Recipient Assignment

Assign recipients to alerts:

```sql
INSERT INTO alert_email_assignments (alert_id, recipient_id)
VALUES (1, 1);
```

## Testing

Run the notification integration test:

```bash
npm run test-notifications
```

This will:
- Verify all required tables exist
- Check alert configurations
- Validate email and HTTP configurations
- Test the alert evaluation service
- Show recent notification logs

## Error Handling

The notification system includes comprehensive error handling:

- **Notification failures don't break alerts**: If notifications fail, alerts are still logged and WebSocket events are still sent
- **Retry logic**: Both email and HTTP notifications include retry mechanisms
- **Detailed logging**: All notification attempts are logged with success/failure status and error details
- **Graceful degradation**: If notification service is unavailable, the system continues to function

## Monitoring

Monitor notification system health through:

1. **Notification logs**: Check `notification_logs` table for success/failure rates
2. **Server logs**: Watch for notification-related error messages
3. **Test script**: Run `npm run test-notifications` to verify system health

## Security Considerations

- **SMTP credentials**: Store email passwords securely (consider environment variables)
- **Webhook URLs**: Use HTTPS for webhook endpoints
- **Authentication**: Configure appropriate authentication for HTTP notifications
- **Rate limiting**: Consider implementing rate limiting for notification endpoints

## Future Enhancements

Potential improvements for the notification system:

1. **SMS notifications**: Add SMS gateway integration
2. **Slack/Discord**: Direct integration with chat platforms
3. **Escalation policies**: Automatic escalation for critical alerts
4. **Notification templates**: Rich template system with variables
5. **Scheduling**: Time-based notification rules
6. **User preferences**: Per-user notification preferences 