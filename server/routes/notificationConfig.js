const express = require('express');
const { query, getRow, getRows } = require('../config/database');
const router = express.Router();

// ===== EMAIL CONFIGURATION ROUTES =====

// GET /api/notification-config/email - List all email configurations
router.get('/email', async (req, res) => {
  try {
    const result = await getRows('SELECT * FROM email_config ORDER BY is_default DESC, name ASC');
    res.json({ configs: result });
  } catch (error) {
    console.error('Failed to fetch email configs:', error);
    res.status(500).json({ error: 'Failed to fetch email configurations' });
  }
});

// POST /api/notification-config/email - Create email configuration
router.post('/email', async (req, res) => {
  try {
    const { name, smtp_host, smtp_port, smtp_secure, username, password, from_email, from_name, is_default } = req.body;
    
    // If this is set as default, unset other defaults
    if (is_default) {
      await query('UPDATE email_config SET is_default = false');
    }
    
    const result = await query(`
      INSERT INTO email_config (name, smtp_host, smtp_port, smtp_secure, username, password, from_email, from_name, is_default, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [name, smtp_host, smtp_port, smtp_secure, username, password, from_email, from_name, is_default, req.user?.user_id]);
    
    res.status(201).json({ config: result.rows[0] });
  } catch (error) {
    console.error('Failed to create email config:', error);
    res.status(500).json({ error: 'Failed to create email configuration' });
  }
});

// PUT /api/notification-config/email/:id - Update email configuration
router.put('/email/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, smtp_host, smtp_port, smtp_secure, username, password, from_email, from_name, is_default } = req.body;
    
    // If this is set as default, unset other defaults
    if (is_default) {
      await query('UPDATE email_config SET is_default = false WHERE config_id != $1', [id]);
    }
    
    const result = await query(`
      UPDATE email_config SET
        name = $1, smtp_host = $2, smtp_port = $3, smtp_secure = $4, username = $5,
        password = $6, from_email = $7, from_name = $8, is_default = $9, updated_at = NOW()
      WHERE config_id = $10
      RETURNING *
    `, [name, smtp_host, smtp_port, smtp_secure, username, password, from_email, from_name, is_default, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email configuration not found' });
    }
    res.json({ config: result.rows[0] });
  } catch (error) {
    console.error('Failed to update email config:', error);
    res.status(500).json({ error: 'Failed to update email configuration' });
  }
});

// DELETE /api/notification-config/email/:id - Delete email configuration
router.delete('/email/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM email_config WHERE config_id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email configuration not found' });
    }
    res.json({ message: 'Email configuration deleted', config: result.rows[0] });
  } catch (error) {
    console.error('Failed to delete email config:', error);
    res.status(500).json({ error: 'Failed to delete email configuration' });
  }
});

// ===== EMAIL RECIPIENTS ROUTES =====

// GET /api/notification-config/email-recipients - List all email recipients
router.get('/email-recipients', async (req, res) => {
  try {
    const result = await getRows('SELECT * FROM email_recipients ORDER BY name ASC, email ASC');
    res.json({ recipients: result });
  } catch (error) {
    console.error('Failed to fetch email recipients:', error);
    res.status(500).json({ error: 'Failed to fetch email recipients' });
  }
});

// POST /api/notification-config/email-recipients - Create email recipient
router.post('/email-recipients', async (req, res) => {
  try {
    const { email, name, is_active } = req.body;
    const result = await query(`
      INSERT INTO email_recipients (email, name, is_active, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [email, name, is_active, req.user?.user_id]);
    
    res.status(201).json({ recipient: result.rows[0] });
  } catch (error) {
    console.error('Failed to create email recipient:', error);
    res.status(500).json({ error: 'Failed to create email recipient' });
  }
});

// PUT /api/notification-config/email-recipients/:id - Update email recipient
router.put('/email-recipients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, is_active } = req.body;
    const result = await query(`
      UPDATE email_recipients SET email = $1, name = $2, is_active = $3, updated_at = NOW()
      WHERE recipient_id = $4
      RETURNING *
    `, [email, name, is_active, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email recipient not found' });
    }
    res.json({ recipient: result.rows[0] });
  } catch (error) {
    console.error('Failed to update email recipient:', error);
    res.status(500).json({ error: 'Failed to update email recipient' });
  }
});

// DELETE /api/notification-config/email-recipients/:id - Delete email recipient
router.delete('/email-recipients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM email_recipients WHERE recipient_id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email recipient not found' });
    }
    res.json({ message: 'Email recipient deleted', recipient: result.rows[0] });
  } catch (error) {
    console.error('Failed to delete email recipient:', error);
    res.status(500).json({ error: 'Failed to delete email recipient' });
  }
});

// ===== HTTP CONFIGURATION ROUTES =====

// GET /api/notification-config/http - List all HTTP configurations
router.get('/http', async (req, res) => {
  try {
    const result = await getRows('SELECT * FROM http_config ORDER BY is_default DESC, name ASC');
    res.json({ configs: result });
  } catch (error) {
    console.error('Failed to fetch HTTP configs:', error);
    res.status(500).json({ error: 'Failed to fetch HTTP configurations' });
  }
});

// POST /api/notification-config/http - Create HTTP configuration
router.post('/http', async (req, res) => {
  try {
    const { name, url, method, headers, timeout, retry_count, retry_delay, is_default } = req.body;
    
    // If this is set as default, unset other defaults
    if (is_default) {
      await query('UPDATE http_config SET is_default = false');
    }
    
    const result = await query(`
      INSERT INTO http_config (name, url, method, headers, timeout, retry_count, retry_delay, is_default, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [name, url, method, JSON.stringify(headers), timeout, retry_count, retry_delay, is_default, req.user?.user_id]);
    
    res.status(201).json({ config: result.rows[0] });
  } catch (error) {
    console.error('Failed to create HTTP config:', error);
    res.status(500).json({ error: 'Failed to create HTTP configuration' });
  }
});

// PUT /api/notification-config/http/:id - Update HTTP configuration
router.put('/http/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, method, headers, timeout, retry_count, retry_delay, is_default } = req.body;
    
    // If this is set as default, unset other defaults
    if (is_default) {
      await query('UPDATE http_config SET is_default = false WHERE config_id != $1', [id]);
    }
    
    const result = await query(`
      UPDATE http_config SET
        name = $1, url = $2, method = $3, headers = $4, timeout = $5,
        retry_count = $6, retry_delay = $7, is_default = $8, updated_at = NOW()
      WHERE config_id = $9
      RETURNING *
    `, [name, url, method, JSON.stringify(headers), timeout, retry_count, retry_delay, is_default, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'HTTP configuration not found' });
    }
    res.json({ config: result.rows[0] });
  } catch (error) {
    console.error('Failed to update HTTP config:', error);
    res.status(500).json({ error: 'Failed to update HTTP configuration' });
  }
});

// DELETE /api/notification-config/http/:id - Delete HTTP configuration
router.delete('/http/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM http_config WHERE config_id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'HTTP configuration not found' });
    }
    res.json({ message: 'HTTP configuration deleted', config: result.rows[0] });
  } catch (error) {
    console.error('Failed to delete HTTP config:', error);
    res.status(500).json({ error: 'Failed to delete HTTP configuration' });
  }
});

// ===== ALERT ASSIGNMENT ROUTES =====

// GET /api/notification-config/alert-assignments/:alertId - Get assignments for an alert
router.get('/alert-assignments/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    
    // Get email assignments
    const emailAssignments = await getRows(`
      SELECT aea.assignment_id, aea.recipient_id, er.email, er.name
      FROM alert_email_assignments aea
      JOIN email_recipients er ON aea.recipient_id = er.recipient_id
      WHERE aea.alert_id = $1
    `, [alertId]);
    
    // Get HTTP assignments
    const httpAssignments = await getRows(`
      SELECT aha.assignment_id, aha.config_id, hc.name, hc.url, hc.method
      FROM alert_http_assignments aha
      JOIN http_config hc ON aha.config_id = hc.config_id
      WHERE aha.alert_id = $1
    `, [alertId]);
    
    res.json({ 
      email_assignments: emailAssignments,
      http_assignments: httpAssignments
    });
  } catch (error) {
    console.error('Failed to fetch alert assignments:', error);
    res.status(500).json({ error: 'Failed to fetch alert assignments' });
  }
});

// POST /api/notification-config/alert-assignments/:alertId/email - Assign email recipients to alert
router.post('/alert-assignments/:alertId/email', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { recipient_ids } = req.body;
    
    // Delete existing assignments
    await query('DELETE FROM alert_email_assignments WHERE alert_id = $1', [alertId]);
    
    // Add new assignments
    for (const recipient_id of recipient_ids) {
      await query(`
        INSERT INTO alert_email_assignments (alert_id, recipient_id)
        VALUES ($1, $2)
      `, [alertId, recipient_id]);
    }
    
    res.json({ message: 'Email assignments updated successfully' });
  } catch (error) {
    console.error('Failed to update email assignments:', error);
    res.status(500).json({ error: 'Failed to update email assignments' });
  }
});

// POST /api/notification-config/alert-assignments/:alertId/http - Assign HTTP configs to alert
router.post('/alert-assignments/:alertId/http', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { config_ids } = req.body;
    
    // Delete existing assignments
    await query('DELETE FROM alert_http_assignments WHERE alert_id = $1', [alertId]);
    
    // Add new assignments
    for (const config_id of config_ids) {
      await query(`
        INSERT INTO alert_http_assignments (alert_id, config_id)
        VALUES ($1, $2)
      `, [alertId, config_id]);
    }
    
    res.json({ message: 'HTTP assignments updated successfully' });
  } catch (error) {
    console.error('Failed to update HTTP assignments:', error);
    res.status(500).json({ error: 'Failed to update HTTP assignments' });
  }
});

// ===== NOTIFICATION LOGS ROUTES =====

// GET /api/notification-config/logs - Get notification logs
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, type, status, alert_id } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (type) {
      whereClause += ` AND notification_type = $${paramIndex++}`;
      params.push(type);
    }
    
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    
    if (alert_id) {
      whereClause += ` AND nl.alert_id = $${paramIndex++}`;
      params.push(alert_id);
    }
    
    const result = await getRows(`
      SELECT nl.*, a.name as alert_name
      FROM notification_logs nl
      LEFT JOIN alerts a ON nl.alert_id = a.alert_id
      ${whereClause}
      ORDER BY nl.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);
    
    // Get total count
    const countResult = await getRow(`
      SELECT COUNT(*) as total
      FROM notification_logs nl
      LEFT JOIN alerts a ON nl.alert_id = a.alert_id
      ${whereClause}
    `, params);
    
    res.json({ 
      logs: result,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.total),
        pages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    console.error('Failed to fetch notification logs:', error);
    res.status(500).json({ error: 'Failed to fetch notification logs' });
  }
});

// ===== TEST ROUTES =====

// POST /api/notification-config/test-email - Test email configuration
router.post('/test-email', async (req, res) => {
  try {
    const { config_id, test_email } = req.body;
    const { NotificationService } = require('../services/notificationService');
    const notificationService = NotificationService;
    const result = await notificationService.testEmailConfig(config_id, test_email);
    res.json(result);
  } catch (error) {
    console.error('Failed to test email configuration:', error);
    res.status(500).json({ error: 'Failed to test email configuration' });
  }
});

// POST /api/notification-config/test-http - Test HTTP configuration
router.post('/test-http', async (req, res) => {
  try {
    const { config_id } = req.body;
    const { NotificationService } = require('../services/notificationService');
    const notificationService = NotificationService;
    const result = await notificationService.testHttpConfig(config_id);
    res.json(result);
  } catch (error) {
    console.error('Failed to test HTTP configuration:', error);
    res.status(500).json({ error: 'Failed to test HTTP configuration' });
  }
});

module.exports = router; 