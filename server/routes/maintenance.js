const express = require('express');
const router = express.Router();
const { query, getRow, getRows, transaction } = require('../config/database');
const { authenticateToken, authorizeMenuAccess } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);
router.use(authorizeMenuAccess('/maintenance'));

// GET /api/maintenance - Get all maintenance schedules
router.get('/', async (req, res) => {
  try {
    console.log('Fetching maintenance schedules for user:', req.user.user_id);
    const maintenanceSchedules = await getRows(`
      SELECT 
        ms.maintenance_id,
        ms.sensor_site_id,
        ms.maintenance_type,
        ms.planned_date,
        ms.actual_date,
        ms.assigned_person,
        ms.status,
        ms.description,
        ms.maintenance_notes,
        ms.reminder_sent,
        ms.reminder_sent_at,
        ms.created_at,
        ms.updated_at,
        ms.created_by,
        ss.name as sensor_site_name,
        sd.brand_name,
        sd.sensor_type,
        s.site_name,
        ARRAY_AGG(u.username) FILTER (WHERE u.username IS NOT NULL) as assigned_users,
        CASE 
          WHEN ms.actual_date IS NOT NULL THEN 'completed'
          WHEN ms.planned_date < CURRENT_DATE THEN 'overdue'
          WHEN ms.planned_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
          ELSE 'scheduled'
        END as status_color
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN sensor_site_users ssu ON ss.sensor_site_id = ssu.sensor_site_id
      LEFT JOIN users u ON ssu.user_id = u.user_id
      WHERE (ms.created_by = $1 OR ms.created_by IS NULL)
      GROUP BY ms.maintenance_id, ms.sensor_site_id, ms.maintenance_type, ms.planned_date, 
               ms.actual_date, ms.assigned_person, ms.status, ms.description, ms.maintenance_notes,
               ms.reminder_sent, ms.reminder_sent_at, ms.created_at, ms.updated_at, ms.created_by,
               ss.name, sd.brand_name, sd.sensor_type, s.site_name
      ORDER BY ms.planned_date DESC
    `, [req.user.user_id]);
    
    console.log('Maintenance schedules fetched:', maintenanceSchedules.length);
    res.json(maintenanceSchedules);
  } catch (error) {
    console.error('Get maintenance schedules error:', error);
    res.status(500).json({
      error: 'Failed to get maintenance schedules',
      code: 'GET_MAINTENANCE_SCHEDULES_ERROR'
    });
  }
});

// GET /api/maintenance/:id - Get maintenance schedule by ID
router.get('/:id', async (req, res) => {
  try {
    const maintenanceSchedule = await getRow(`
      SELECT 
        ms.maintenance_id,
        ms.sensor_site_id,
        ms.maintenance_type,
        ms.planned_date,
        ms.actual_date,
        ms.assigned_person,
        ms.status,
        ms.description,
        ms.maintenance_notes,
        ms.reminder_sent,
        ms.reminder_sent_at,
        ms.created_at,
        ms.updated_at,
        ms.created_by,
        ss.name as sensor_site_name,
        sd.brand_name,
        sd.sensor_type,
        s.site_name,
        ARRAY_AGG(u.username) FILTER (WHERE u.username IS NOT NULL) as assigned_users
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN sensor_site_users ssu ON ss.sensor_site_id = ssu.sensor_site_id
      LEFT JOIN users u ON ssu.user_id = u.user_id
      WHERE ms.maintenance_id = $1 AND (ms.created_by = $2 OR ms.created_by IS NULL)
      GROUP BY ms.maintenance_id, ms.sensor_site_id, ms.maintenance_type, ms.planned_date, 
               ms.actual_date, ms.assigned_person, ms.status, ms.description, ms.maintenance_notes,
               ms.reminder_sent, ms.reminder_sent_at, ms.created_at, ms.updated_at, ms.created_by,
               ss.name, sd.brand_name, sd.sensor_type, s.site_name
    `, [req.params.id, req.user.user_id]);

    if (!maintenanceSchedule) {
      return res.status(404).json({
        error: 'Maintenance schedule not found',
        code: 'MAINTENANCE_SCHEDULE_NOT_FOUND'
      });
    }

    res.json(maintenanceSchedule);
  } catch (error) {
    console.error('Get maintenance schedule error:', error);
    res.status(500).json({
      error: 'Failed to get maintenance schedule',
      code: 'GET_MAINTENANCE_SCHEDULE_ERROR'
    });
  }
});

// POST /api/maintenance - Create new maintenance schedule
router.post('/', async (req, res) => {
  try {
    const { 
      sensor_site_id, 
      maintenance_type, 
      planned_date, 
      actual_date, 
      assigned_person, 
      status, 
      description, 
      maintenance_notes,
      reminder_days_before,
      reminder_email_time,
      reminder_recipients
    } = req.body;

    // Validation
    if (!sensor_site_id) {
      return res.status(400).json({
        error: 'Sensor site ID is required',
        code: 'SENSOR_SITE_ID_REQUIRED'
      });
    }

    if (!maintenance_type || maintenance_type.trim() === '') {
      return res.status(400).json({
        error: 'Maintenance type is required',
        code: 'MAINTENANCE_TYPE_REQUIRED'
      });
    }

    if (!planned_date) {
      return res.status(400).json({
        error: 'Planned date is required',
        code: 'PLANNED_DATE_REQUIRED'
      });
    }

    // Validate sensor site exists
    const sensorSite = await getRow(`
      SELECT sensor_site_id FROM sensor_sites WHERE sensor_site_id = $1
    `, [sensor_site_id]);
    
    if (!sensorSite) {
      return res.status(400).json({
        error: 'Invalid sensor site ID',
        code: 'INVALID_SENSOR_SITE_ID'
      });
    }

    // Convert reminder_email_time to proper format if needed
    let formattedReminderTime = reminder_email_time || '09:00:00';
    if (formattedReminderTime && !formattedReminderTime.includes(':')) {
      formattedReminderTime = '09:00:00'; // Default fallback
    }
    if (formattedReminderTime && formattedReminderTime.split(':').length === 2) {
      formattedReminderTime += ':00'; // Add seconds if missing
    }

    // Handle empty date values - convert empty strings to null
    const actualDate = actual_date && actual_date.trim() !== '' ? actual_date : null;

    const result = await query(`
      INSERT INTO maintenance_schedules (
        sensor_site_id, maintenance_type, planned_date, actual_date, 
        assigned_person, status, description, maintenance_notes, 
        reminder_days_before, reminder_email_time, reminder_recipients,
        reminder_sent, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, $12)
      RETURNING maintenance_id, sensor_site_id, maintenance_type, planned_date, 
                actual_date, assigned_person, status, description, maintenance_notes, created_at
    `, [
      sensor_site_id, maintenance_type, planned_date, actualDate, 
      assigned_person, status || 'scheduled', description, maintenance_notes,
      reminder_days_before || 1, formattedReminderTime, reminder_recipients || [],
      req.user.user_id
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create maintenance schedule error:', error);
    res.status(500).json({
      error: 'Failed to create maintenance schedule',
      code: 'CREATE_MAINTENANCE_SCHEDULE_ERROR'
    });
  }
});

// PUT /api/maintenance/:id - Update maintenance schedule
router.put('/:id', async (req, res) => {
  try {
    const { 
      sensor_site_id, 
      maintenance_type, 
      planned_date, 
      actual_date, 
      assigned_person, 
      status, 
      description, 
      maintenance_notes,
      reminder_days_before,
      reminder_email_time,
      reminder_recipients
    } = req.body;
    const maintenanceId = req.params.id;

    // Validation
    if (!sensor_site_id) {
      return res.status(400).json({
        error: 'Sensor site ID is required',
        code: 'SENSOR_SITE_ID_REQUIRED'
      });
    }

    if (!maintenance_type || maintenance_type.trim() === '') {
      return res.status(400).json({
        error: 'Maintenance type is required',
        code: 'MAINTENANCE_TYPE_REQUIRED'
      });
    }

    if (!planned_date) {
      return res.status(400).json({
        error: 'Planned date is required',
        code: 'PLANNED_DATE_REQUIRED'
      });
    }

    // Check if maintenance schedule exists and user has permission
    const existingSchedule = await getRow(`
      SELECT maintenance_id FROM maintenance_schedules 
      WHERE maintenance_id = $1 AND (created_by = $2 OR created_by IS NULL)
    `, [maintenanceId, req.user.user_id]);

    if (!existingSchedule) {
      return res.status(404).json({
        error: 'Maintenance schedule not found or access denied',
        code: 'MAINTENANCE_SCHEDULE_NOT_FOUND'
      });
    }

    // Validate sensor site exists
    const sensorSite = await getRow(`
      SELECT sensor_site_id FROM sensor_sites WHERE sensor_site_id = $1
    `, [sensor_site_id]);
    
    if (!sensorSite) {
      return res.status(400).json({
        error: 'Invalid sensor site ID',
        code: 'INVALID_SENSOR_SITE_ID'
      });
    }

    // Convert reminder_email_time to proper format if needed
    let formattedReminderTime = reminder_email_time || '09:00:00';
    if (formattedReminderTime && !formattedReminderTime.includes(':')) {
      formattedReminderTime = '09:00:00'; // Default fallback
    }
    if (formattedReminderTime && formattedReminderTime.split(':').length === 2) {
      formattedReminderTime += ':00'; // Add seconds if missing
    }

    // Handle empty date values - convert empty strings to null
    const actualDate = actual_date && actual_date.trim() !== '' ? actual_date : null;

    // Check if status is changing to 'completed' for completion notification
    const previousStatus = await getRow(`
      SELECT status FROM maintenance_schedules WHERE maintenance_id = $1
    `, [maintenanceId]);

    const result = await query(`
      UPDATE maintenance_schedules 
      SET sensor_site_id = $1, maintenance_type = $2, planned_date = $3, 
          actual_date = $4, assigned_person = $5, status = $6, 
          description = $7, maintenance_notes = $8, 
          reminder_days_before = $9, reminder_email_time = $10, reminder_recipients = $11,
          updated_at = NOW()
      WHERE maintenance_id = $12 AND (created_by = $13 OR created_by IS NULL)
      RETURNING maintenance_id, sensor_site_id, maintenance_type, planned_date, 
                actual_date, assigned_person, status, description, maintenance_notes, updated_at
    `, [
      sensor_site_id, maintenance_type, planned_date, actualDate, 
      assigned_person, status, description, maintenance_notes,
      reminder_days_before || 1, formattedReminderTime, reminder_recipients || [],
      maintenanceId, req.user.user_id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Maintenance schedule not found or access denied',
        code: 'MAINTENANCE_SCHEDULE_NOT_FOUND'
      });
    }

    // Trigger completion notification if status changed to 'completed'
    if (status === 'completed' && previousStatus && previousStatus.status !== 'completed' && actualDate) {
      try {
        const MaintenanceReminderService = require('../services/maintenanceReminderService');
        const maintenanceReminderService = new MaintenanceReminderService();
        
        // Get the full schedule data for notification
        const fullSchedule = await getRow(`
          SELECT 
            ms.*,
            ss.name as sensor_site_name,
            sd.brand_name,
            sd.sensor_type,
            s.site_name,
            ARRAY_AGG(u.email) FILTER (WHERE u.email IS NOT NULL) as site_user_emails
          FROM maintenance_schedules ms
          LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
          LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
          LEFT JOIN sites s ON ss.site_id = s.site_id
          LEFT JOIN sensor_site_users ssu ON ss.sensor_site_id = ssu.sensor_site_id
          LEFT JOIN users u ON ssu.user_id = u.user_id
          WHERE ms.maintenance_id = $1
          GROUP BY ms.maintenance_id, ss.name, sd.brand_name, sd.sensor_type, s.site_name
        `, [maintenanceId]);

        if (fullSchedule) {
          await maintenanceReminderService.sendMaintenanceCompletionNotification(fullSchedule);
        }
      } catch (notificationError) {
        console.error('Failed to send completion notification:', notificationError);
        // Don't fail the update if notification fails
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update maintenance schedule error:', error);
    res.status(500).json({
      error: 'Failed to update maintenance schedule',
      code: 'UPDATE_MAINTENANCE_SCHEDULE_ERROR'
    });
  }
});

// DELETE /api/maintenance/:id - Delete maintenance schedule
router.delete('/:id', async (req, res) => {
  try {
    const maintenanceId = req.params.id;

    const result = await query(`
      DELETE FROM maintenance_schedules 
      WHERE maintenance_id = $1 AND (created_by = $2 OR created_by IS NULL)
      RETURNING maintenance_id
    `, [maintenanceId, req.user.user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Maintenance schedule not found or access denied',
        code: 'MAINTENANCE_SCHEDULE_NOT_FOUND'
      });
    }

    res.json({ message: 'Maintenance schedule deleted successfully' });
  } catch (error) {
    console.error('Delete maintenance schedule error:', error);
    res.status(500).json({
      error: 'Failed to delete maintenance schedule',
      code: 'DELETE_MAINTENANCE_SCHEDULE_ERROR'
    });
  }
});

module.exports = router;
