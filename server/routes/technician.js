const express = require('express');
const router = express.Router();
const { query, getRow, getRows } = require('../config/database');
const { authorizeMenuAccess } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for photo uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/maintenance-photos');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `maintenance-${req.params.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Apply authentication and menu access middleware
router.use(authorizeMenuAccess('/technician'));

// GET /api/technician/schedule - Get technician's maintenance schedule
router.get('/schedule', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const username = req.user.username;
    console.log(`Getting maintenance schedule for technician: ${userId} (${username})`);

    // Get maintenance schedules assigned to this technician
    const schedules = await getRows(`
      SELECT 
        ms.maintenance_id,
        ms.maintenance_type,
        ms.planned_date,
        ms.actual_date,
        ms.assigned_person,
        ms.status,
        ms.description,
        ms.maintenance_notes,
        ms.technician_notes,
        ms.photos,
        ms.gps_location,
        ms.technician_signature,
        ms.admin_approved,
        ms.admin_approved_by,
        ms.admin_approved_at,
        ms.admin_approval_notes,
        ms.maintenance_started_at,
        ms.maintenance_completed_at,
        ms.created_at,
        ms.updated_at,
        ss.name as sensor_site_name,
        ss.parameter as sensor_parameter,
        sd.brand_name,
        sd.sensor_type,
        s.site_name,
        s.location as site_location,
        d.name as device_name,
        d.device_id,
        c.company_name
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN companies c ON s.company_id = c.company_id
      LEFT JOIN devices d ON ss.device_id = d.device_id
      WHERE ms.assigned_person = $2
         OR EXISTS (
           SELECT 1 FROM sensor_site_users ssu 
           WHERE ssu.sensor_site_id = ss.sensor_site_id 
           AND ssu.user_id = $1
         )
      ORDER BY 
        CASE 
          WHEN ms.status = 'in_progress' THEN 1
          WHEN ms.planned_date = CURRENT_DATE THEN 2
          WHEN ms.planned_date > CURRENT_DATE THEN 3
          ELSE 4
        END,
        ms.planned_date ASC
    `, [userId, username]);

    console.log(`Found ${schedules.length} maintenance schedules for technician`);
    res.json(schedules);
  } catch (error) {
    console.error('Get technician schedule error:', error);
    res.status(500).json({
      error: 'Failed to get maintenance schedule',
      code: 'GET_TECHNICIAN_SCHEDULE_ERROR'
    });
  }
});

// GET /api/technician/schedule/today - Get today's maintenance tasks
router.get('/schedule/today', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const username = req.user.username;
    console.log(`Getting today's maintenance tasks for technician: ${userId} (${username})`);

    const todaySchedules = await getRows(`
      SELECT 
        ms.maintenance_id,
        ms.maintenance_type,
        ms.planned_date,
        ms.actual_date,
        ms.assigned_person,
        ms.status,
        ms.description,
        ms.maintenance_notes,
        ms.technician_notes,
        ms.photos,
        ms.gps_location,
        ms.technician_signature,
        ms.admin_approved,
        ms.maintenance_started_at,
        ms.maintenance_completed_at,
        ss.name as sensor_site_name,
        ss.parameter as sensor_parameter,
        sd.brand_name,
        sd.sensor_type,
        s.site_name,
        s.location as site_location,
        d.name as device_name,
        d.device_id,
        c.company_name
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN companies c ON s.company_id = c.company_id
      LEFT JOIN devices d ON ss.device_id = d.device_id
      WHERE (ms.assigned_person = $2
         OR EXISTS (
           SELECT 1 FROM sensor_site_users ssu 
           WHERE ssu.sensor_site_id = ss.sensor_site_id 
           AND ssu.user_id = $1
         ))
        AND ms.planned_date = CURRENT_DATE
        AND ms.status IN ('scheduled', 'in_progress')
      ORDER BY ms.planned_date ASC
    `, [userId, username]);

    console.log(`Found ${todaySchedules.length} today's maintenance tasks`);
    res.json(todaySchedules);
  } catch (error) {
    console.error('Get today schedule error:', error);
    res.status(500).json({
      error: 'Failed to get today\'s maintenance schedule',
      code: 'GET_TODAY_SCHEDULE_ERROR'
    });
  }
});

// PUT /api/technician/maintenance/:id/start - Start maintenance work
router.put('/maintenance/:id/start', async (req, res) => {
  try {
    const maintenanceId = req.params.id;
    const userId = req.user.user_id;
    const username = req.user.username;
    const { gps_location } = req.body;

    console.log(`Starting maintenance ${maintenanceId} for technician ${userId} (${username})`);

    // Verify technician has access to this maintenance
    const maintenance = await getRow(`
      SELECT ms.maintenance_id, ms.status, ss.sensor_site_id
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      WHERE ms.maintenance_id = $1 
        AND (ms.assigned_person = $2 
             OR EXISTS (
               SELECT 1 FROM sensor_site_users ssu 
               WHERE ssu.sensor_site_id = ss.sensor_site_id 
               AND ssu.user_id = $3
             ))
    `, [maintenanceId, username, userId]);

    if (!maintenance) {
      return res.status(404).json({
        error: 'Maintenance not found or access denied',
        code: 'MAINTENANCE_NOT_FOUND'
      });
    }

    if (maintenance.status !== 'scheduled') {
      return res.status(400).json({
        error: 'Maintenance must be in scheduled status to start',
        code: 'INVALID_MAINTENANCE_STATUS'
      });
    }

    // Update maintenance status to in_progress
    const result = await query(`
      UPDATE maintenance_schedules 
      SET 
        status = 'in_progress',
        maintenance_started_at = NOW(),
        gps_location = $1,
        updated_at = NOW()
      WHERE maintenance_id = $2
      RETURNING maintenance_id, status, maintenance_started_at
    `, [gps_location ? JSON.stringify(gps_location) : null, maintenanceId]);

    console.log(`✅ Maintenance ${maintenanceId} started successfully`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Start maintenance error:', error);
    res.status(500).json({
      error: 'Failed to start maintenance',
      code: 'START_MAINTENANCE_ERROR'
    });
  }
});

// PUT /api/technician/maintenance/:id/complete - Complete maintenance work
router.put('/maintenance/:id/complete', async (req, res) => {
  try {
    const maintenanceId = req.params.id;
    const userId = req.user.user_id;
    const username = req.user.username;
    const { 
      technician_notes, 
      maintenance_notes, 
      gps_location,
      technician_signature 
    } = req.body;

    console.log(`Completing maintenance ${maintenanceId} for technician ${userId} (${username})`);

    // Verify technician has access to this maintenance
    const maintenance = await getRow(`
      SELECT ms.maintenance_id, ms.status, ss.sensor_site_id
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      WHERE ms.maintenance_id = $1 
        AND (ms.assigned_person = $2 
             OR EXISTS (
               SELECT 1 FROM sensor_site_users ssu 
               WHERE ssu.sensor_site_id = ss.sensor_site_id 
               AND ssu.user_id = $3
             ))
    `, [maintenanceId, username, userId]);

    if (!maintenance) {
      return res.status(404).json({
        error: 'Maintenance not found or access denied',
        code: 'MAINTENANCE_NOT_FOUND'
      });
    }

    if (maintenance.status !== 'in_progress') {
      return res.status(400).json({
        error: 'Maintenance must be in progress to complete',
        code: 'INVALID_MAINTENANCE_STATUS'
      });
    }

    // Update maintenance status to completed
    const result = await query(`
      UPDATE maintenance_schedules 
      SET 
        status = 'completed',
        actual_date = CURRENT_DATE,
        technician_notes = $1,
        maintenance_notes = $2,
        gps_location = $3,
        technician_signature = $4,
        maintenance_completed_at = NOW(),
        admin_approved = FALSE,
        updated_at = NOW()
      WHERE maintenance_id = $5
      RETURNING maintenance_id, status, actual_date, maintenance_completed_at
    `, [
      technician_notes,
      maintenance_notes,
      gps_location ? JSON.stringify(gps_location) : null,
      technician_signature,
      maintenanceId
    ]);

    console.log(`✅ Maintenance ${maintenanceId} completed successfully`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Complete maintenance error:', error);
    res.status(500).json({
      error: 'Failed to complete maintenance',
      code: 'COMPLETE_MAINTENANCE_ERROR'
    });
  }
});

// POST /api/technician/maintenance/:id/photos - Upload maintenance photos
router.post('/maintenance/:id/photos', upload.array('photos', 10), async (req, res) => {
  try {
    const maintenanceId = req.params.id;
    const userId = req.user.user_id;
    const username = req.user.username;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No photos uploaded',
        code: 'NO_PHOTOS_UPLOADED'
      });
    }

    console.log(`Uploading ${req.files.length} photos for maintenance ${maintenanceId}`);

    // Verify technician has access to this maintenance
    const maintenance = await getRow(`
      SELECT ms.maintenance_id, ms.status, ms.photos, ss.sensor_site_id
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      WHERE ms.maintenance_id = $1 
        AND (ms.assigned_person = $2 
             OR EXISTS (
               SELECT 1 FROM sensor_site_users ssu 
               WHERE ssu.sensor_site_id = ss.sensor_site_id 
               AND ssu.user_id = $3
             ))
    `, [maintenanceId, username, userId]);

    if (!maintenance) {
      return res.status(404).json({
        error: 'Maintenance not found or access denied',
        code: 'MAINTENANCE_NOT_FOUND'
      });
    }

    // Process uploaded photos
    const photoData = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userId
    }));

    // Get existing photos and merge with new ones
    let existingPhotos = [];
    if (maintenance.photos) {
      try {
        existingPhotos = JSON.parse(maintenance.photos);
      } catch (error) {
        console.error('Error parsing existing photos:', error);
      }
    }

    const updatedPhotos = [...existingPhotos, ...photoData];

    // Update maintenance with new photos
    const result = await query(`
      UPDATE maintenance_schedules 
      SET photos = $1, updated_at = NOW()
      WHERE maintenance_id = $2
      RETURNING maintenance_id, photos
    `, [JSON.stringify(updatedPhotos), maintenanceId]);

    console.log(`✅ Uploaded ${req.files.length} photos for maintenance ${maintenanceId}`);
    res.json({
      maintenance_id: maintenanceId,
      photos: updatedPhotos,
      message: `Successfully uploaded ${req.files.length} photos`
    });
  } catch (error) {
    console.error('Upload photos error:', error);
    res.status(500).json({
      error: 'Failed to upload photos',
      code: 'UPLOAD_PHOTOS_ERROR'
    });
  }
});

// GET /api/technician/maintenance/:id - Get maintenance details
router.get('/maintenance/:id', async (req, res) => {
  try {
    const maintenanceId = req.params.id;
    const userId = req.user.user_id;
    const username = req.user.username;

    console.log(`Getting maintenance details ${maintenanceId} for technician ${userId} (${username})`);

    const maintenance = await getRow(`
      SELECT 
        ms.maintenance_id,
        ms.maintenance_type,
        ms.planned_date,
        ms.actual_date,
        ms.assigned_person,
        ms.status,
        ms.description,
        ms.maintenance_notes,
        ms.technician_notes,
        ms.photos,
        ms.gps_location,
        ms.technician_signature,
        ms.admin_approved,
        ms.admin_approved_by,
        ms.admin_approved_at,
        ms.admin_approval_notes,
        ms.maintenance_started_at,
        ms.maintenance_completed_at,
        ms.created_at,
        ms.updated_at,
        ss.name as sensor_site_name,
        ss.parameter as sensor_parameter,
        sd.brand_name,
        sd.sensor_type,
        s.site_name,
        s.location as site_location,
        d.name as device_name,
        d.device_id,
        c.company_name
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN companies c ON s.company_id = c.company_id
      LEFT JOIN devices d ON ss.device_id = d.device_id
      WHERE ms.maintenance_id = $1 
        AND (ms.assigned_person = $2 
             OR EXISTS (
               SELECT 1 FROM sensor_site_users ssu 
               WHERE ssu.sensor_site_id = ss.sensor_site_id 
               AND ssu.user_id = $3
             ))
    `, [maintenanceId, username, userId]);

    if (!maintenance) {
      return res.status(404).json({
        error: 'Maintenance not found or access denied',
        code: 'MAINTENANCE_NOT_FOUND'
      });
    }

    // Parse photos JSON if it exists
    if (maintenance.photos) {
      try {
        maintenance.photos = JSON.parse(maintenance.photos);
      } catch (error) {
        console.error('Error parsing photos JSON:', error);
        maintenance.photos = [];
      }
    }

    // Parse GPS location JSON if it exists
    if (maintenance.gps_location) {
      try {
        maintenance.gps_location = JSON.parse(maintenance.gps_location);
      } catch (error) {
        console.error('Error parsing GPS location JSON:', error);
        maintenance.gps_location = null;
      }
    }

    res.json(maintenance);
  } catch (error) {
    console.error('Get maintenance details error:', error);
    res.status(500).json({
      error: 'Failed to get maintenance details',
      code: 'GET_MAINTENANCE_DETAILS_ERROR'
    });
  }
});

module.exports = router;
