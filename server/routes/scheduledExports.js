const express = require('express');
const { query, getRow, getRows } = require('../config/database');
const { authenticateToken, authorizeMenuAccess } = require('../middleware/auth');
const simpleScheduledExportService = require('../services/simpleScheduledExportService');
const router = express.Router();

// Validation middleware
const validateExportData = (req, res, next) => {
  const { name, frequency, device_ids, parameters, format } = req.body;
  
  if (!name || !frequency || !device_ids || !parameters || !format) {
    return res.status(400).json({ 
      error: 'Missing required fields: name, frequency, device_ids, parameters, format' 
    });
  }
  
  if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
    return res.status(400).json({ 
      error: 'Frequency must be one of: daily, weekly, monthly' 
    });
  }
  
  if (!['pdf', 'excel'].includes(format)) {
    return res.status(400).json({ 
      error: 'Format must be one of: pdf, excel' 
    });
  }
  
  if (!Array.isArray(device_ids) || device_ids.length === 0) {
    return res.status(400).json({ 
      error: 'device_ids must be a non-empty array' 
    });
  }
  
  if (!Array.isArray(parameters) || parameters.length === 0) {
    return res.status(400).json({ 
      error: 'parameters must be a non-empty array' 
    });
  }
  
  next();
};

// GET /api/scheduled-exports - List all scheduled exports
router.get('/', authenticateToken, authorizeMenuAccess('/scheduled-exports', 'read'), async (req, res) => {
  try {
    // Check if user is admin/super_admin - if so, show all exports
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
    let sqlQuery = `
      SELECT 
        se.export_id,
        se.name,
        se.description,
        se.frequency,
        se.is_active,
        se.time_zone,
        ec.device_ids,
        ec.parameters,
        ec.format,
        ec.date_range_days,
        COUNT(DISTINCT eer.email) as recipient_count,
        se.created_at,
        se.updated_at
      FROM scheduled_exports se
      LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
      LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
    `;
    let params = [];
    
    if (!isAdmin) {
      // Non-admin users can only see exports they created OR exports with NULL created_by (existing records)
      sqlQuery += ' WHERE (se.created_by = $1 OR se.created_by IS NULL)';
      params = [req.user.user_id];
    }
    
    sqlQuery += `
      GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.date_range_days, se.created_at, se.updated_at
      ORDER BY se.created_at DESC
    `;
    
    const exports = await getRows(sqlQuery, params);
    
    // Parse cron expressions for all exports to include time fields
    const parseCronExpression = (cronExpr, frequency) => {
      if (!cronExpr) return {};
      
      const parts = cronExpr.split(' ');
      if (parts.length !== 5) return {};
      
      const [minutes, hours, dayOfMonth, month, dayOfWeek] = parts;
      
      const timeFields = {};
      
      // Extract time
      const timeStr = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
      
      switch (frequency) {
        case 'daily':
          timeFields.daily_time = timeStr;
          break;
        case 'weekly':
          timeFields.weekly_time = timeStr;
          // Convert day of week (0=Sunday, 1=Monday, etc.)
          const dayMap = { '0': 'sunday', '1': 'monday', '2': 'tuesday', '3': 'wednesday', '4': 'thursday', '5': 'friday', '6': 'saturday' };
          timeFields.weekly_day = dayMap[dayOfWeek] || 'monday';
          break;
        case 'monthly':
          timeFields.monthly_time = timeStr;
          timeFields.monthly_date = parseInt(dayOfMonth) || 1;
          break;
      }
      
      return timeFields;
    };
    
    // Add parsed time fields to all exports
    const exportsWithTimeFields = exports.map(exportItem => {
      const timeFields = parseCronExpression(exportItem.cron_expression, exportItem.frequency);
      return { ...exportItem, ...timeFields };
    });
    
    res.json({ exports: exportsWithTimeFields });
  } catch (error) {
    console.error('Failed to fetch scheduled exports:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled exports' });
  }
});

// GET /api/scheduled-exports/:id - Get specific scheduled export
router.get('/:id', authenticateToken, authorizeMenuAccess('/scheduled-exports', 'read'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is admin/super_admin - if so, can access any export
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
    let sqlQuery = `
      SELECT 
        se.*,
        ec.device_ids,
        ec.parameters,
        ec.format,
        ec.template,
        ec.date_range_days,
        array_agg(
          CASE WHEN eer.email IS NOT NULL 
          THEN json_build_object('email', eer.email, 'name', eer.name)
          ELSE NULL END
        ) FILTER (WHERE eer.email IS NOT NULL) as recipients
      FROM scheduled_exports se
      LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
      LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
      WHERE se.export_id = $1
    `;
    let params = [id];
    
    if (!isAdmin) {
      // Non-admin users can only access exports they created OR exports with NULL created_by (existing records)
      sqlQuery += ' AND (se.created_by = $2 OR se.created_by IS NULL)';
      params.push(req.user.user_id);
    }
    
    sqlQuery += `
      GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.template, ec.date_range_days
    `;
    
    const exportData = await getRow(sqlQuery, params);
    
    if (!exportData) {
      return res.status(404).json({ error: 'Scheduled export not found or access denied' });
    }
    
    // Parse cron expression to extract time fields for frontend
    const parseCronExpression = (cronExpr, frequency) => {
      if (!cronExpr) return {};
      
      const parts = cronExpr.split(' ');
      if (parts.length !== 5) return {};
      
      const [minutes, hours, dayOfMonth, month, dayOfWeek] = parts;
      
      const timeFields = {};
      
      // Extract time
      const timeStr = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
      
      switch (frequency) {
        case 'daily':
          timeFields.daily_time = timeStr;
          break;
        case 'weekly':
          timeFields.weekly_time = timeStr;
          // Convert day of week (0=Sunday, 1=Monday, etc.)
          const dayMap = { '0': 'sunday', '1': 'monday', '2': 'tuesday', '3': 'wednesday', '4': 'thursday', '5': 'friday', '6': 'saturday' };
          timeFields.weekly_day = dayMap[dayOfWeek] || 'monday';
          break;
        case 'monthly':
          timeFields.monthly_time = timeStr;
          timeFields.monthly_date = parseInt(dayOfMonth) || 1;
          break;
      }
      
      return timeFields;
    };
    
    // Add parsed time fields to export data
    const timeFields = parseCronExpression(exportData.cron_expression, exportData.frequency);
    Object.assign(exportData, timeFields);
    
    // Clean up recipients data - remove null entries
    if (exportData.recipients) {
      exportData.recipients = exportData.recipients.filter(recipient => 
        recipient && recipient.email && recipient.email.trim() !== ''
      );
    }
    
    // If no recipients, set empty array
    if (!exportData.recipients || exportData.recipients.length === 0) {
      exportData.recipients = [];
    }
    
    console.log('Export data for edit:', {
      id: exportData.export_id,
      name: exportData.name,
      device_ids: exportData.device_ids,
      parameters: exportData.parameters,
      recipients: exportData.recipients
    });
    
    // Get execution logs
    const logs = await simpleScheduledExportService.getExecutionLogs(id, 20);
    
    res.json({ 
      export: exportData,
      logs 
    });
  } catch (error) {
    console.error('Failed to fetch scheduled export:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled export' });
  }
});

// POST /api/scheduled-exports - Create new scheduled export
router.post('/', authenticateToken, authorizeMenuAccess('/scheduled-exports', 'create'), validateExportData, async (req, res) => {
  try {
    const { 
      name, 
      description, 
      frequency, 
      device_ids, 
      parameters, 
      format, 
      template = 'standard',
      date_range_days = 1,
      time_zone = 'UTC',
      recipients = [],
      // Time fields from frontend
      daily_time,
      weekly_time,
      monthly_time,
      weekly_day,
      monthly_date
    } = req.body;
    
    // Generate cron expression based on frequency and time
    const generateCronExpression = (freq, time, day, date) => {
      if (!time) time = '08:00'; // Default to 8:00 AM
      
      const [hours, minutes] = time.split(':').map(Number);
      
      switch (freq) {
        case 'daily':
          return `${minutes} ${hours} * * *`;
        case 'weekly':
          const dayMap = {
            'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
            'friday': 5, 'saturday': 6, 'sunday': 0
          };
          const dayOfWeek = dayMap[day] || 1;
          return `${minutes} ${hours} * * ${dayOfWeek}`;
        case 'monthly':
          const dayOfMonth = date || 1;
          return `${minutes} ${hours} ${dayOfMonth} * *`;
        default:
          return `${minutes} ${hours} * * *`;
      }
    };
    
    // Determine time to use based on frequency
    let timeToUse = '';
    switch (frequency) {
      case 'daily':
        timeToUse = daily_time || '08:00';
        break;
      case 'weekly':
        timeToUse = weekly_time || '08:00';
        break;
      case 'monthly':
        timeToUse = monthly_time || '08:00';
        break;
      default:
        timeToUse = '08:00';
    }
    
    const cron_expression = generateCronExpression(
      frequency,
      timeToUse,
      weekly_day,
      monthly_date
    );
    
    console.log(`Creating export with cron expression: ${cron_expression} for frequency: ${frequency}, time: ${timeToUse}`);
    
    // Insert scheduled export
    const exportResult = await query(`
      INSERT INTO scheduled_exports (name, description, frequency, cron_expression, time_zone, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING export_id
    `, [name, description, frequency, cron_expression, time_zone, req.user?.user_id]);
    
    const exportId = exportResult.rows[0].export_id;
    
    // Insert export configuration
    await query(`
      INSERT INTO export_configurations (export_id, device_ids, parameters, format, template, date_range_days)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [exportId, device_ids, parameters, format, template, date_range_days]);
    
    // Add email recipients
    if (recipients && recipients.length > 0) {
      for (const recipient of recipients) {
        await query(`
          INSERT INTO export_email_recipients (export_id, email, name)
          VALUES ($1, $2, $3)
        `, [exportId, recipient.email, recipient.name || null]);
      }
    }
    
    // Schedule the export job
    const exportData = await getRow(`
      SELECT 
        se.*,
        ec.device_ids,
        ec.parameters,
        ec.format,
        ec.template,
        ec.date_range_days,
        COUNT(DISTINCT eer.email) as recipient_count
      FROM scheduled_exports se
      LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
      LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
      WHERE se.export_id = $1
      GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.template, ec.date_range_days
    `, [exportId]);
    
    await simpleScheduledExportService.scheduleExport(exportData);
    
    res.status(201).json({ 
      message: 'Scheduled export created successfully',
      export_id: exportId 
    });
  } catch (error) {
    console.error('Failed to create scheduled export:', error);
    res.status(500).json({ error: 'Failed to create scheduled export' });
  }
});

// PUT /api/scheduled-exports/:id - Update scheduled export
router.put('/:id', authenticateToken, authorizeMenuAccess('/scheduled-exports', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      frequency, 
      device_ids, 
      parameters, 
      format, 
      template,
      date_range_days,
      time_zone,
      is_active,
      recipients = [],
      // Time fields from frontend
      daily_time,
      weekly_time,
      monthly_time,
      weekly_day,
      monthly_date
    } = req.body;
    
    // Check if export exists and user has access
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
    let sqlQuery = 'SELECT * FROM scheduled_exports WHERE export_id = $1';
    let params = [id];
    
    if (!isAdmin) {
      // Non-admin users can only update exports they created OR exports with NULL created_by (existing records)
      sqlQuery += ' AND (created_by = $2 OR created_by IS NULL)';
      params.push(req.user.user_id);
    }
    
    const existingExport = await getRow(sqlQuery, params);
    if (!existingExport) {
      return res.status(404).json({ error: 'Scheduled export not found or access denied' });
    }
    
    // Generate new cron expression based on frequency and time
    let cron_expression = existingExport.cron_expression;
    
    // Generate cron expression based on frequency and time fields
    const generateCronExpression = (freq, time, day, date) => {
      if (!time) time = '08:00'; // Default to 8:00 AM
      
      const [hours, minutes] = time.split(':').map(Number);
      
      switch (freq) {
        case 'daily':
          return `${minutes} ${hours} * * *`;
        case 'weekly':
          const dayMap = {
            'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
            'friday': 5, 'saturday': 6, 'sunday': 0
          };
          const dayOfWeek = dayMap[day] || 1;
          return `${minutes} ${hours} * * ${dayOfWeek}`;
        case 'monthly':
          const dayOfMonth = date || 1;
          return `${minutes} ${hours} ${dayOfMonth} * *`;
        default:
          return `${minutes} ${hours} * * *`;
      }
    };
    
    // Generate new cron expression if any relevant fields changed
    if (frequency || daily_time || weekly_time || monthly_time || weekly_day || monthly_date) {
      const currentFreq = frequency || existingExport.frequency;
      let timeToUse = '';
      
      switch (currentFreq) {
        case 'daily':
          timeToUse = daily_time || '08:00';
          break;
        case 'weekly':
          timeToUse = weekly_time || '08:00';
          break;
        case 'monthly':
          timeToUse = monthly_time || '08:00';
          break;
        default:
          timeToUse = '08:00';
      }
      
      cron_expression = generateCronExpression(
        currentFreq,
        timeToUse,
        weekly_day,
        monthly_date
      );
      
      console.log(`Generated cron expression: ${cron_expression} for frequency: ${currentFreq}, time: ${timeToUse}`);
    }
    
    // Update scheduled export
    await query(`
      UPDATE scheduled_exports SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        frequency = COALESCE($3, frequency),
        cron_expression = COALESCE($4, cron_expression),
        time_zone = COALESCE($5, time_zone),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
      WHERE export_id = $7
    `, [name, description, frequency, cron_expression, time_zone, is_active, id]);
    
    // Update export configuration
    await query(`
      UPDATE export_configurations SET
        device_ids = COALESCE($1, device_ids),
        parameters = COALESCE($2, parameters),
        format = COALESCE($3, format),
        template = COALESCE($4, template),
        date_range_days = COALESCE($5, date_range_days),
        updated_at = NOW()
      WHERE export_id = $6
    `, [device_ids, parameters, format, template, date_range_days, id]);
    
    // Update recipients if provided
    if (recipients.length >= 0) {
      // Delete existing recipients
      await query('DELETE FROM export_email_recipients WHERE export_id = $1', [id]);
      
      // Add new recipients
      for (const recipient of recipients) {
        await query(`
          INSERT INTO export_email_recipients (export_id, email, name)
          VALUES ($1, $2, $3)
        `, [id, recipient.email, recipient.name || null]);
      }
    }
    
    // Reschedule the export job
    if (is_active !== false) {
      const exportData = await getRow(`
        SELECT 
          se.*,
          ec.device_ids,
          ec.parameters,
          ec.format,
          ec.template,
          ec.date_range_days,
          COUNT(DISTINCT eer.email) as recipient_count
        FROM scheduled_exports se
        LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
        LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
        WHERE se.export_id = $1
        GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.template, ec.date_range_days
      `, [id]);
      
      await simpleScheduledExportService.scheduleExport(exportData);
    } else {
      // Stop the job if deactivated
      simpleScheduledExportService.stopExport(id);
    }
    
    res.json({ message: 'Scheduled export updated successfully' });
  } catch (error) {
    console.error('Failed to update scheduled export:', error);
    res.status(500).json({ error: 'Failed to update scheduled export' });
  }
});

// DELETE /api/scheduled-exports/:id - Delete scheduled export
router.delete('/:id', authenticateToken, authorizeMenuAccess('/scheduled-exports', 'delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if export exists and user has access
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
    let sqlQuery = 'SELECT * FROM scheduled_exports WHERE export_id = $1';
    let params = [id];
    
    if (!isAdmin) {
      // Non-admin users can only delete exports they created OR exports with NULL created_by (existing records)
      sqlQuery += ' AND (created_by = $2 OR created_by IS NULL)';
      params.push(req.user.user_id);
    }
    
    const existingExport = await getRow(sqlQuery, params);
    if (!existingExport) {
      return res.status(404).json({ error: 'Scheduled export not found or access denied' });
    }
    
    // Stop the scheduled job
    simpleScheduledExportService.stopExport(id);
    
    // Delete the export (cascade will handle related records)
    await query('DELETE FROM scheduled_exports WHERE export_id = $1', [id]);
    
    res.json({ message: 'Scheduled export deleted successfully' });
  } catch (error) {
    console.error('Failed to delete scheduled export:', error);
    res.status(500).json({ error: 'Failed to delete scheduled export' });
  }
});

// POST /api/scheduled-exports/:id/trigger - Manually trigger export
router.post('/:id/trigger', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if export exists and user has access
    const isAdmin = req.user.role_name === 'super_admin' || req.user.role_name === 'admin';
    
    let sqlQuery = 'SELECT * FROM scheduled_exports WHERE export_id = $1';
    let params = [id];
    
    if (!isAdmin) {
      // Non-admin users can only trigger exports they created OR exports with NULL created_by (existing records)
      sqlQuery += ' AND (created_by = $2 OR created_by IS NULL)';
      params.push(req.user.user_id);
    }
    
    const existingExport = await getRow(sqlQuery, params);
    if (!existingExport) {
      return res.status(404).json({ error: 'Scheduled export not found or access denied' });
    }
    
    // Trigger the export
    const result = await simpleScheduledExportService.triggerExport(id);
    
    if (result.success) {
      res.json({ message: 'Export triggered successfully' });
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (error) {
    console.error('Failed to trigger export:', error);
    res.status(500).json({ error: 'Failed to trigger export' });
  }
});

// GET /api/scheduled-exports/:id/logs - Get execution logs
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    
    // Check if export exists
    const existingExport = await getRow('SELECT * FROM scheduled_exports WHERE export_id = $1', [id]);
    if (!existingExport) {
      return res.status(404).json({ error: 'Scheduled export not found' });
    }
    
    const logs = await simpleScheduledExportService.getExecutionLogs(id, parseInt(limit));
    res.json({ logs });
  } catch (error) {
    console.error('Failed to fetch execution logs:', error);
    res.status(500).json({ error: 'Failed to fetch execution logs' });
  }
});

// GET /api/scheduled-exports/status/service - Get service status
router.get('/status/service', async (req, res) => {
  try {
    const status = {
      isInitialized: simpleScheduledExportService.isInitialized,
      activeJobsCount: simpleScheduledExportService.activeJobs.size,
      activeJobs: Array.from(simpleScheduledExportService.activeJobs.keys())
    };
    
    res.json({ status });
  } catch (error) {
    console.error('Failed to get service status:', error);
    res.status(500).json({ error: 'Failed to get service status' });
  }
});

module.exports = router;
