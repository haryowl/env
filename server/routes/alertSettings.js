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

// Test email configuration
router.post('/test-email', auth.authenticateToken, async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_email, from_name } = req.body;
    
    // Validate required fields
    if (!smtp_host || !smtp_port || !smtp_user || !smtp_pass || !from_email || !from_name) {
      return res.status(400).json({ 
        error: 'Missing required email configuration fields',
        required: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'from_email', 'from_name']
      });
    }

    // Validate user email
    if (!req.user || !req.user.email) {
      return res.status(400).json({ 
        error: 'User email not found. Please ensure your user account has a valid email address.'
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: parseInt(smtp_port),
      secure: smtp_secure === true,
      auth: {
        user: smtp_user,
        pass: smtp_pass
      },
      // Add timeout and connection settings
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });

    // Verify connection configuration
    await transporter.verify();
    
    await transporter.sendMail({
      from: `"${from_name}" <${from_email}>`,
      to: req.user.email,
      subject: 'Alert System Test Email',
      text: 'This is a test email from the IoT Alert System to verify your email configuration.',
      html: '<p>This is a test email from the IoT Alert System to verify your email configuration.</p>'
    });
    
    res.json({ message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Error sending test email:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to send test email';
    if (error.code === 'EAUTH') {
      errorMessage = 'Authentication failed. Please check your SMTP username and password.';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Connection failed. Please check your SMTP host and port.';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection timed out. Please check your SMTP settings.';
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
    console.log('Adding email recipient:', { name, email, alerts });
    
    const alertsJson = JSON.stringify(alerts);
    console.log('Alerts JSON to be stored:', alertsJson);
    
    const result = await db.query(
      'INSERT INTO alert_email_recipients (name, email, alerts, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, alertsJson, req.user.user_id]
    );
    
    console.log('Email recipient added successfully with ID:', result.rows[0].id);
    res.json({ message: 'Email recipient added successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Error adding email recipient:', error);
    res.status(500).json({ error: 'Failed to add email recipient' });
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

// HTTP Endpoints
router.post('/http-endpoints', auth.authenticateToken, async (req, res) => {
  try {
    const { url, method, headers, alerts } = req.body;
    const result = await db.query(
      'INSERT INTO alert_http_endpoints (url, method, headers, alerts) VALUES ($1, $2, $3, $4) RETURNING id',
      [url, method, JSON.stringify(headers || {}), JSON.stringify(alerts || [])]
    );
    res.json({ message: 'HTTP endpoint added successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Error adding HTTP endpoint:', error);
    res.status(500).json({ error: 'Failed to add HTTP endpoint' });
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
    const { url, method, headers } = req.body;
    
    const testData = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'This is a test notification from the IoT Alert System'
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
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
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

module.exports = router; 