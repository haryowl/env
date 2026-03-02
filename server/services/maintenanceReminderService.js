const { query, getRows } = require('../config/database');
const { sendEmail } = require('./notificationService');

class MaintenanceReminderService {
  constructor() {
    this.isRunning = false;
  }

  // Check for maintenance schedules that need reminders
  async checkAndSendReminders() {
    if (this.isRunning) {
      console.log('Maintenance reminder service already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('🔔 Checking maintenance schedules for reminders...');

    try {
      // Get maintenance schedules that need reminders
      const schedulesNeedingReminders = await getRows(`
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
        WHERE ms.reminder_sent = FALSE 
          AND ms.planned_date <= CURRENT_DATE + INTERVAL '1 day' * ms.reminder_days_before
          AND ms.planned_date >= CURRENT_DATE
          AND ms.actual_date IS NULL
          AND ms.status != 'cancelled'
        GROUP BY ms.maintenance_id, ss.name, sd.brand_name, sd.sensor_type, s.site_name
      `);

      console.log(`📧 Found ${schedulesNeedingReminders.length} maintenance schedules needing reminders`);

      for (const schedule of schedulesNeedingReminders) {
        await this.sendMaintenanceReminder(schedule);
      }

      // Get completed maintenance schedules that need completion notifications
      const completedSchedules = await getRows(`
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
        WHERE ms.completion_notification_sent = FALSE 
          AND ms.actual_date IS NOT NULL
          AND ms.status = 'completed'
        GROUP BY ms.maintenance_id, ss.name, sd.brand_name, sd.sensor_type, s.site_name
      `);

      console.log(`✅ Found ${completedSchedules.length} completed maintenance schedules needing notifications`);

      for (const schedule of completedSchedules) {
        await this.sendMaintenanceCompletionNotification(schedule);
      }

    } catch (error) {
      console.error('❌ Error in maintenance reminder service:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Send reminder email for upcoming maintenance
  async sendMaintenanceReminder(schedule) {
    try {
      const reminderDate = new Date(schedule.planned_date);
      const daysUntilMaintenance = Math.ceil((reminderDate - new Date()) / (1000 * 60 * 60 * 24));
      
      // Get recipient emails
      const recipientEmails = this.getRecipientEmails(schedule);
      
      if (recipientEmails.length === 0) {
        console.log(`⚠️  No email recipients found for maintenance schedule ${schedule.maintenance_id}`);
        return;
      }

      const subject = `🔔 Maintenance Reminder: ${schedule.sensor_site_name}`;
      const htmlContent = this.generateMaintenanceReminderEmail(schedule, daysUntilMaintenance);

      // Send email
      await sendEmail({
        to: recipientEmails,
        subject: subject,
        html: htmlContent
      });

      // Update reminder_sent flag
      await query(`
        UPDATE maintenance_schedules 
        SET reminder_sent = TRUE, reminder_sent_at = NOW()
        WHERE maintenance_id = $1
      `, [schedule.maintenance_id]);

      console.log(`✅ Sent maintenance reminder for ${schedule.sensor_site_name} to ${recipientEmails.join(', ')}`);

    } catch (error) {
      console.error(`❌ Error sending maintenance reminder for schedule ${schedule.maintenance_id}:`, error);
    }
  }

  // Send completion notification email
  async sendMaintenanceCompletionNotification(schedule) {
    try {
      // Get recipient emails
      const recipientEmails = this.getRecipientEmails(schedule);
      
      if (recipientEmails.length === 0) {
        console.log(`⚠️  No email recipients found for maintenance completion ${schedule.maintenance_id}`);
        return;
      }

      const subject = `✅ Maintenance Completed: ${schedule.sensor_site_name}`;
      const htmlContent = this.generateMaintenanceCompletionEmail(schedule);

      // Send email
      await sendEmail({
        to: recipientEmails,
        subject: subject,
        html: htmlContent
      });

      // Update completion notification flag
      await query(`
        UPDATE maintenance_schedules 
        SET completion_notification_sent = TRUE, completion_notification_sent_at = NOW()
        WHERE maintenance_id = $1
      `, [schedule.maintenance_id]);

      console.log(`✅ Sent maintenance completion notification for ${schedule.sensor_site_name} to ${recipientEmails.join(', ')}`);

    } catch (error) {
      console.error(`❌ Error sending maintenance completion notification for schedule ${schedule.maintenance_id}:`, error);
    }
  }

  // Get recipient emails from schedule
  getRecipientEmails(schedule) {
    const emails = [];
    
    // Add site user emails
    if (schedule.site_user_emails && schedule.site_user_emails.length > 0) {
      emails.push(...schedule.site_user_emails.filter(email => email));
    }
    
    // Add custom reminder recipients
    if (schedule.reminder_recipients && schedule.reminder_recipients.length > 0) {
      emails.push(...schedule.reminder_recipients.filter(email => email));
    }
    
    // Remove duplicates
    return [...new Set(emails)];
  }

  // Generate maintenance reminder email HTML
  generateMaintenanceReminderEmail(schedule, daysUntilMaintenance) {
    const reminderDate = new Date(schedule.planned_date);
    const formattedDate = reminderDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #007BA7; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .alert { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .info-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .info-table td { padding: 8px; border-bottom: 1px solid #ddd; }
          .info-table td:first-child { font-weight: bold; width: 30%; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Maintenance Reminder</h1>
          </div>
          <div class="content">
            <div class="alert">
              <strong>⚠️ Maintenance Due ${daysUntilMaintenance === 0 ? 'Today' : `in ${daysUntilMaintenance} day${daysUntilMaintenance > 1 ? 's' : ''}`}</strong>
            </div>
            
            <table class="info-table">
              <tr><td>Sensor Site:</td><td>${schedule.sensor_site_name}</td></tr>
              <tr><td>Brand:</td><td>${schedule.brand_name || 'N/A'}</td></tr>
              <tr><td>Type:</td><td>${schedule.sensor_type || 'N/A'}</td></tr>
              <tr><td>Site:</td><td>${schedule.site_name || 'N/A'}</td></tr>
              <tr><td>Maintenance Type:</td><td>${schedule.maintenance_type}</td></tr>
              <tr><td>Planned Date:</td><td>${formattedDate}</td></tr>
              <tr><td>Assigned Person:</td><td>${schedule.assigned_person || 'Not assigned'}</td></tr>
              <tr><td>Status:</td><td>${schedule.status}</td></tr>
            </table>
            
            ${schedule.description ? `<p><strong>Description:</strong><br>${schedule.description}</p>` : ''}
          </div>
          <div class="footer">
            <p>This is an automated reminder from the IoT Monitoring System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate maintenance completion email HTML
  generateMaintenanceCompletionEmail(schedule) {
    const completionDate = new Date(schedule.actual_date);
    const formattedDate = completionDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #28a745; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .success { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .info-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .info-table td { padding: 8px; border-bottom: 1px solid #ddd; }
          .info-table td:first-child { font-weight: bold; width: 30%; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Maintenance Completed</h1>
          </div>
          <div class="content">
            <div class="success">
              <strong>🎉 Maintenance Successfully Completed</strong>
            </div>
            
            <table class="info-table">
              <tr><td>Sensor Site:</td><td>${schedule.sensor_site_name}</td></tr>
              <tr><td>Brand:</td><td>${schedule.brand_name || 'N/A'}</td></tr>
              <tr><td>Type:</td><td>${schedule.sensor_type || 'N/A'}</td></tr>
              <tr><td>Site:</td><td>${schedule.site_name || 'N/A'}</td></tr>
              <tr><td>Maintenance Type:</td><td>${schedule.maintenance_type}</td></tr>
              <tr><td>Planned Date:</td><td>${new Date(schedule.planned_date).toLocaleDateString()}</td></tr>
              <tr><td>Actual Date:</td><td>${formattedDate}</td></tr>
              <tr><td>Assigned Person:</td><td>${schedule.assigned_person || 'N/A'}</td></tr>
              <tr><td>Status:</td><td>${schedule.status}</td></tr>
            </table>
            
            ${schedule.description ? `<p><strong>Description:</strong><br>${schedule.description}</p>` : ''}
            ${schedule.maintenance_notes ? `<p><strong>Maintenance Notes:</strong><br>${schedule.maintenance_notes}</p>` : ''}
          </div>
          <div class="footer">
            <p>This is an automated notification from the IoT Monitoring System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Start the reminder service (run every hour)
  start() {
    console.log('🚀 Starting maintenance reminder service...');
    
    // Run immediately
    this.checkAndSendReminders();
    
    // Then run every hour
    setInterval(() => {
      this.checkAndSendReminders();
    }, 60 * 60 * 1000); // 1 hour
    
    console.log('✅ Maintenance reminder service started (checking every hour)');
  }

  // Stop the reminder service
  stop() {
    console.log('🛑 Stopping maintenance reminder service...');
    // Note: In a production environment, you'd want to store the interval ID
    // and clear it properly. For now, this is just a placeholder.
  }
}

module.exports = new MaintenanceReminderService();
