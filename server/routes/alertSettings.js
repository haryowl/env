const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/database');
const nodemailer = require('nodemailer');

// Email Configuration
router.get('/email-config', auth.authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM alert_email_config WHERE id = 1');
    const rows = result.rows;
    res.json({ config: rows[0] || {} });
  } catch (error) {
    console.error('Error fetching email config:', error);
    res.status(500).json({ error: 'Failed to fetch email configuration' });
  }
});

router.post('/email-config', auth.authenticateToken, async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_email, from_name, enabled } = req.body;
    const result = await db.query('SELECT id FROM alert_email_config WHERE id = 1');
    const existing = result.rows;
    if (existing.length > 0) {
      await db.query(
        'UPDATE alert_email_config SET smtp_host = $1, smtp_port = $2, smtp_secure = $3, smtp_user = $4, smtp_pass = $5, from_email = $6, from_name = $7, enabled = $8 WHERE id = 1',
        [smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_email, from_name, enabled]
      );
    } else {
      await db.query(
        'INSERT INTO alert_email_config (id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_email, from_name, enabled) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)',
        [smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_email, from_name, enabled]
      );
    }
    res.json({ message: 'Email configuration saved successfully' });
  } catch (error) {
    console.error('Error saving email config:', error);
    res.status(500).json({ error: 'Failed to save email configuration' });
  }
});

// Simple email format check (local part @ domain with at least one dot in domain)
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length < 255;
};

// Test email configuration
router.post('/test-email', auth.authenticateToken, async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_email, from_name } = req.body || {};
    
    // Validate required fields
    if (!smtp_host || !smtp_user || !smtp_pass || !from_email || !from_name) {
      return res.status(400).json({ 
        error: 'Missing required email configuration fields',
        required: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'from_email', 'from_name']
      });
    }

    const port = parseInt(smtp_port, 10);
    if (!port || port < 1 || port > 65535) {
      return res.status(400).json({ error: 'Invalid SMTP port. Use 587 (TLS) or 465 (SSL).' });
    }

    const fromEmailTrimmed = String(from_email).trim();
    if (!isValidEmail(fromEmailTrimmed)) {
      return res.status(400).json({ error: 'Invalid From Email format. Use a valid address (e.g. user@domain.com).' });
    }

    // Validate user email (recipient)
    if (!req.user || !req.user.email) {
      return res.status(400).json({ 
        error: 'User email not found. Please add an email to your user profile to receive the test.'
      });
    }
    const toEmail = String(req.user.email).trim();
    if (!isValidEmail(toEmail)) {
      return res.status(400).json({ 
        error: 'Your profile email is invalid. Update it in your user profile (e.g. Settings or User Management).'
      });
    }

    const secure = smtp_secure === true || smtp_secure === 'true';
    const transporter = nodemailer.createTransport({
      host: String(smtp_host).trim(),
      port,
      secure,
      auth: {
        user: String(smtp_user).trim(),
        pass: smtp_pass
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });

    await transporter.verify();
    
    const fromNameSafe = String(from_name).replace(/"/g, '').trim() || 'Alert';
    await transporter.sendMail({
      from: `"${fromNameSafe}" <${fromEmailTrimmed}>`,
      to: toEmail,
      subject: 'Alert System Test Email',
      text: 'This is a test email from the IoT Alert System to verify your email configuration.',
      html: '<p>This is a test email from the IoT Alert System to verify your email configuration.</p>'
    });
    
    res.json({ message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Test email error:', error.message, error.code || '', error.response ? error.response : '');
    
    let errorMessage = 'Failed to send test email';
    if (error.code === 'EAUTH') {
      errorMessage = 'Authentication failed. Check SMTP username and password (e.g. use an App Password for Gmail).';
    } else if (error.code === 'ECONNECTION' || error.code === 'ENOTFOUND') {
      errorMessage = 'Connection failed. Check SMTP host and port (e.g. smtp.gmail.com:587).';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET') {
      errorMessage = 'Connection timed out. Check firewall or try a different port.';
    } else if (error.code === 'EENVELOPE') {
      errorMessage = 'Invalid from or recipient email. Check From Email and your user profile email.';
    } else if (error.response) {
      errorMessage = `SMTP rejected: ${error.response}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Email Recipients
router.get('/email-recipients', auth.authenticateToken, async (req, res) => {
  try {
    // Check if user is admin/super_admin - if so, show all recipients (including NULL created_by)
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
    let query = 'SELECT * FROM alert_email_recipients';
    let params = [];
    
    if (!isAdmin) {
      // Non-admin users can only see recipients they created OR recipients with NULL created_by (existing records)
      query += ' WHERE (created_by = $1 OR created_by IS NULL)';
      params = [req.user.user_id];
    }
    
    query += ' ORDER BY name';
    
    const result = await db.query(query, params);
    console.log('Raw email recipients from DB:', result.rows);
    
    const rows = result.rows.map(row => {
      let alerts = [];
      try {
        // Handle different possible formats
        if (row.alerts === null || row.alerts === undefined) {
          alerts = [];
        } else if (typeof row.alerts === 'string') {
          alerts = JSON.parse(row.alerts);
        } else if (Array.isArray(row.alerts)) {
          alerts = row.alerts;
        } else if (typeof row.alerts === 'number') {
          // If it's a single number, convert to array
          alerts = [row.alerts];
        } else {
          alerts = [];
        }
        
        // Ensure alerts is always an array
        if (!Array.isArray(alerts)) {
          alerts = [];
        }
        
        console.log(`Parsed alerts for recipient ${row.id} (${row.name}):`, alerts, 'Original value:', row.alerts, 'Type:', typeof row.alerts);
      } catch (parseError) {
        console.warn('Failed to parse alerts JSON for recipient:', row.id, parseError);
        alerts = [];
      }
      return {
        ...row,
        alerts: alerts
      };
    });
    
    console.log('Processed email recipients:', rows);
    res.json({ recipients: rows });
  } catch (error) {
    console.error('Error fetching email recipients:', error);
    res.status(500).json({ error: 'Failed to fetch email recipients' });
  }
});

router.post('/email-recipients', auth.authenticateToken, async (req, res) => {
  try {
    const { name, email, alerts } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const emailTrimmed = String(email).trim();
    if (!isValidEmail(emailTrimmed)) {
      return res.status(400).json({ error: 'Invalid email format. Use a valid address (e.g. user@domain.com).' });
    }

    const alertsArray = Array.isArray(alerts) ? alerts : (alerts != null ? [alerts] : []);
    const alertsJson = JSON.stringify(alertsArray);

    try {
      const result = await db.query(
        'INSERT INTO alert_email_recipients (name, email, alerts, created_by) VALUES ($1, $2, $3::jsonb, $4) RETURNING id',
        [String(name).trim(), emailTrimmed, alertsJson, req.user.user_id]
      );
      return res.json({ message: 'Email recipient added successfully', id: result.rows[0].id });
    } catch (insertError) {
      const msg = insertError.message || '';
      if (msg.includes('created_by') && (msg.includes('does not exist') || msg.includes('column'))) {
        const result = await db.query(
          'INSERT INTO alert_email_recipients (name, email, alerts) VALUES ($1, $2, $3::jsonb) RETURNING id',
          [String(name).trim(), emailTrimmed, alertsJson]
        );
        return res.json({ message: 'Email recipient added successfully', id: result.rows[0].id });
      }
      throw insertError;
    }
  } catch (error) {
    console.error('Error adding email recipient:', error);
    res.status(500).json({
      error: 'Failed to add email recipient',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.put('/email-recipients/:id', auth.authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, alerts } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const emailTrimmed = String(email).trim();
    if (!isValidEmail(emailTrimmed)) {
      return res.status(400).json({ error: 'Invalid email format. Use a valid address (e.g. user@domain.com).' });
    }

    const alertsArray = Array.isArray(alerts) ? alerts : (alerts != null ? [alerts] : []);
    const alertsJson = JSON.stringify(alertsArray);

    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    let query = 'UPDATE alert_email_recipients SET name = $1, email = $2, alerts = $3::jsonb WHERE id = $4';
    const params = [String(name).trim(), emailTrimmed, alertsJson, id];

    if (!isAdmin) {
      query += ' AND (created_by = $5 OR created_by IS NULL)';
      params.push(req.user.user_id);
    }

    query += ' RETURNING id, name, email, alerts';

    const result = await db.query(query, params);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Email recipient not found or access denied' });
    }

    return res.json({ message: 'Email recipient updated successfully', recipient: result.rows[0] });
  } catch (error) {
    console.error('Error updating email recipient:', error);
    res.status(500).json({ error: 'Failed to update email recipient' });
  }
});

router.delete('/email-recipients/:id', auth.authenticateToken, async (req, res) => {
  try {
    // Check if user is admin/super_admin - if so, can delete any recipient
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
    let query = 'DELETE FROM alert_email_recipients WHERE id = $1';
    let params = [req.params.id];
    
    if (!isAdmin) {
      // Non-admin users can only delete recipients they created OR recipients with NULL created_by (existing records)
      query += ' AND (created_by = $2 OR created_by IS NULL)';
      params.push(req.user.user_id);
    }
    
    const result = await db.query(query, params);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Email recipient not found or access denied' });
    }
    
    res.json({ message: 'Email recipient deleted successfully' });
  } catch (error) {
    console.error('Error deleting email recipient:', error);
    res.status(500).json({ error: 'Failed to delete email recipient' });
  }
});

// HTTP Configuration
router.get('/http-config', auth.authenticateToken, async (req, res) => {
  try {
    const configResult = await db.query('SELECT * FROM alert_http_config WHERE id = 1');
    const configRows = configResult.rows;
    const endpointResult = await db.query('SELECT * FROM alert_http_endpoints ORDER BY url');
    const endpointRows = endpointResult.rows;
    res.json({ 
      config: configRows[0] || { enabled: false },
      endpoints: endpointRows.map(row => {
        let alerts = [];
        try {
          // Handle different possible formats
          if (row.alerts === null || row.alerts === undefined) {
            alerts = [];
          } else if (typeof row.alerts === 'string') {
            alerts = JSON.parse(row.alerts);
          } else if (Array.isArray(row.alerts)) {
            alerts = row.alerts;
          } else if (typeof row.alerts === 'number') {
            // If it's a single number, convert to array
            alerts = [row.alerts];
          } else {
            alerts = [];
          }
          
          // Ensure alerts is always an array
          if (!Array.isArray(alerts)) {
            alerts = [];
          }
        } catch (parseError) {
          console.warn('Failed to parse alerts JSON for endpoint:', row.id, parseError);
          alerts = [];
        }
        return {
          ...row,
          alerts: alerts
        };
      })
    });
  } catch (error) {
    console.error('Error fetching HTTP config:', error);
    res.status(500).json({ error: 'Failed to fetch HTTP configuration' });
  }
});

router.post('/http-config', auth.authenticateToken, async (req, res) => {
  try {
    const { enabled } = req.body;
    const result = await db.query('SELECT id FROM alert_http_config WHERE id = 1');
    const existing = result.rows;
    if (existing.length > 0) {
      await db.query('UPDATE alert_http_config SET enabled = $1 WHERE id = 1', [enabled]);
    } else {
      await db.query('INSERT INTO alert_http_config (id, enabled) VALUES (1, $1)', [enabled]);
    }
    res.json({ message: 'HTTP configuration saved successfully' });
  } catch (error) {
    console.error('Error saving HTTP config:', error);
    res.status(500).json({ error: 'Failed to save HTTP configuration' });
  }
});

function parseHttpBodyTemplate(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'object') return raw;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (e) {
    const err = new Error('body_template must be valid JSON');
    err.cause = e;
    throw err;
  }
}

// HTTP Endpoints
router.post('/http-endpoints', auth.authenticateToken, async (req, res) => {
  try {
    const { url, method, headers, alerts, body_template } = req.body;
    let bodyJson = null;
    try {
      bodyJson = parseHttpBodyTemplate(body_template);
    } catch (parseErr) {
      return res.status(400).json({ error: parseErr.message });
    }
    const result = await db.query(
      `INSERT INTO alert_http_endpoints (url, method, headers, alerts, body_template)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [url, method, JSON.stringify(headers || {}), JSON.stringify(alerts || []), bodyJson]
    );
    res.json({ message: 'HTTP endpoint added successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Error adding HTTP endpoint:', error);
    res.status(500).json({ error: 'Failed to add HTTP endpoint' });
  }
});

router.patch('/http-endpoints/:id', auth.authenticateToken, async (req, res) => {
  try {
    const existingResult = await db.query('SELECT * FROM alert_http_endpoints WHERE id = $1', [req.params.id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'HTTP endpoint not found' });
    }
    const existing = existingResult.rows[0];

    const url = req.body.url !== undefined ? req.body.url : existing.url;
    const method = req.body.method !== undefined ? req.body.method : existing.method;

    let headersObj = existing.headers;
    if (req.body.headers !== undefined) {
      headersObj = req.body.headers;
    }
    if (typeof headersObj !== 'object' || headersObj === null) {
      headersObj = {};
    }

    let alertsArr = existing.alerts;
    if (req.body.alerts !== undefined) {
      alertsArr = req.body.alerts;
    }
    if (!Array.isArray(alertsArr)) {
      alertsArr = [];
    }

    let bodyJson = existing.body_template;
    if (req.body.body_template !== undefined) {
      try {
        bodyJson = parseHttpBodyTemplate(req.body.body_template);
      } catch (parseErr) {
        return res.status(400).json({ error: parseErr.message });
      }
    }

    await db.query(
      `UPDATE alert_http_endpoints
       SET url = $1, method = $2, headers = $3, alerts = $4, body_template = $5, updated_at = NOW()
       WHERE id = $6`,
      [url, method, JSON.stringify(headersObj), JSON.stringify(alertsArr), bodyJson, req.params.id]
    );
    res.json({ message: 'HTTP endpoint updated successfully' });
  } catch (error) {
    console.error('Error updating HTTP endpoint:', error);
    res.status(500).json({ error: 'Failed to update HTTP endpoint' });
  }
});

router.delete('/http-endpoints/:id', auth.authenticateToken, async (req, res) => {
  try {
    await db.query('DELETE FROM alert_http_endpoints WHERE id = $1', [req.params.id]);
    res.json({ message: 'HTTP endpoint deleted successfully' });
  } catch (error) {
    console.error('Error deleting HTTP endpoint:', error);
    res.status(500).json({ error: 'Failed to delete HTTP endpoint' });
  }
});

// Test HTTP endpoint
router.post('/test-http', auth.authenticateToken, async (req, res) => {
  try {
    const { url, method, headers, body_template } = req.body;
    const { NotificationService } = require('../services/notificationService');

    const sampleCtx = {
      alert_id: 0,
      device: 'TestDevice',
      parameter: 'temperature',
      value: 42,
      min: 0,
      max: 100,
      message: 'This is a test notification from the IoT Alert System',
      timestamp: new Date().toISOString(),
      type: 'iot_alert',
      lastUpdate: new Date().toISOString(),
      thresholdTime: new Date().toISOString()
    };

    let bodyJson;
    try {
      bodyJson = NotificationService.buildHttpPayloadFromTemplate(body_template, sampleCtx);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Invalid body template' });
    }

    const testData = bodyJson ?? {
      test: true,
      timestamp: sampleCtx.timestamp,
      message: sampleCtx.message
    };

    const response = await fetch(url, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(testData)
    });
    
    if (response.ok) {
      res.json({ message: 'HTTP endpoint test successful' });
    } else {
      res.status(400).json({ error: `HTTP endpoint test failed with status ${response.status}` });
    }
  } catch (error) {
    console.error('Error testing HTTP endpoint:', error);
    res.status(500).json({ error: 'Failed to test HTTP endpoint: ' + error.message });
  }
});

// Notification Logs
router.get('/notification-logs', auth.authenticateToken, async (req, res) => {
  try {
    // Check if user is admin/super_admin - if so, show all logs
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin' ||
      req.user.role === 'super_admin' || req.user.role === 'admin';
    
    let query = `
      SELECT nl.*, a.name as alert_name 
      FROM alert_notification_logs nl 
      LEFT JOIN alerts a ON nl.alert_id = a.alert_id 
    `;
    let params = [];
    
    if (!isAdmin) {
      // Non-admin users can only see logs from alerts they created OR alerts with NULL created_by (existing records)
      query += ' WHERE (a.created_by = $1 OR a.created_by IS NULL)';
      params = [req.user.user_id];
    }
    
    query += ' ORDER BY nl.timestamp DESC LIMIT 1000';
    
    const result = await db.query(query, params);
    res.json({ logs: result.rows });
  } catch (error) {
    console.error('Error fetching notification logs:', error);
    res.status(500).json({ error: 'Failed to fetch notification logs' });
  }
});

// ---- WhatsApp provider (admin) + per-user subscriptions ----
const { ensureAlertsSchema } = require('../utils/ensureAlertsSchema');
const whatsappAlertService = require('../services/whatsappAlertService');

const isReqAdmin = (req) =>
  req.user?.role === 'super_admin' ||
  req.user?.role === 'admin' ||
  req.user?.role_name === 'super_admin' ||
  req.user?.role_name === 'admin';

router.get('/whatsapp-provider', auth.authenticateToken, auth.authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    await ensureAlertsSchema();
    const config = await whatsappAlertService.getProviderConfig();
    res.json({ config });
  } catch (error) {
    console.error('Error fetching WhatsApp provider:', error);
    res.status(500).json({ error: 'Failed to fetch WhatsApp provider configuration' });
  }
});

router.put('/whatsapp-provider', auth.authenticateToken, auth.authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    await ensureAlertsSchema();
    const config = await whatsappAlertService.upsertProviderConfig(req.body || {}, req.user.user_id);
    res.json({ message: 'WhatsApp provider saved', config });
  } catch (error) {
    console.error('Error saving WhatsApp provider:', error);
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    res.status(status).json({ error: error.message || 'Failed to save WhatsApp provider configuration' });
  }
});

router.get('/whatsapp-subscriptions', auth.authenticateToken, async (req, res) => {
  try {
    await ensureAlertsSchema();
    const rows = await whatsappAlertService.listSubscriptionsForUser(req.user.user_id);
    res.json({ subscriptions: rows });
  } catch (error) {
    console.error('Error listing WhatsApp subscriptions:', error);
    res.status(500).json({ error: 'Failed to list WhatsApp subscriptions' });
  }
});

router.post('/whatsapp-subscriptions', auth.authenticateToken, async (req, res) => {
  try {
    await ensureAlertsSchema();
    const { device_id, alert_id, phone, phones } = req.body || {};
    if (!device_id || alert_id == null || (phone == null && phones == null)) {
      return res.status(400).json({ error: 'device_id, alert_id, and phone (or phones) are required' });
    }
    const input = phones != null ? phones : phone;
    const parsed = whatsappAlertService.parsePhoneList(input);
    if (parsed.length <= 1) {
      const row = await whatsappAlertService.addSubscription({
        userId: req.user.user_id,
        deviceId: device_id,
        alertId: Number(alert_id),
        phone: parsed[0] || input,
        req,
      });
      return res.status(201).json({ subscription: row, added: [row], skipped: [], failed: [] });
    }
    const result = await whatsappAlertService.addSubscriptionsBulk({
      userId: req.user.user_id,
      deviceId: device_id,
      alertId: Number(alert_id),
      phones: input,
      req,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('Error adding WhatsApp subscription:', error);
    const body = { error: error.message || 'Failed to add subscription' };
    if (error.details) body.details = error.details;
    res.status(error.status || 500).json(body);
  }
});

router.put('/whatsapp-subscriptions/:id', auth.authenticateToken, async (req, res) => {
  try {
    await ensureAlertsSchema();
    const { device_id, alert_id, phone } = req.body || {};
    if (!device_id || alert_id == null || !phone) {
      return res.status(400).json({ error: 'device_id, alert_id, and phone are required' });
    }
    const row = await whatsappAlertService.updateSubscription({
      id: Number(req.params.id),
      userId: req.user.user_id,
      deviceId: device_id,
      alertId: Number(alert_id),
      phone,
      req,
      isAdmin: isReqAdmin(req),
    });
    res.json({ subscription: row });
  } catch (error) {
    console.error('Error updating WhatsApp subscription:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to update subscription' });
  }
});

router.delete('/whatsapp-subscriptions/:id', auth.authenticateToken, async (req, res) => {
  try {
    await ensureAlertsSchema();
    await whatsappAlertService.deleteSubscription(
      Number(req.params.id),
      req.user.user_id,
      isReqAdmin(req)
    );
    res.json({ message: 'Subscription deleted' });
  } catch (error) {
    console.error('Error deleting WhatsApp subscription:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to delete subscription' });
  }
});

router.get('/whatsapp-alerts', auth.authenticateToken, async (req, res) => {
  try {
    await ensureAlertsSchema();
    const deviceId = req.query.deviceId || req.query.device_id;
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }
    const alerts = await whatsappAlertService.listAlertsForDevice(deviceId, req);
    res.json({ alerts });
  } catch (error) {
    console.error('Error listing WhatsApp alerts for device:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to list alerts' });
  }
});

module.exports = router; 