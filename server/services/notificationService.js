const nodemailer = require('nodemailer');
const axios = require('axios');
const { query, getRow, getRows } = require('../config/database');

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.defaultEmailConfig = null;
    this.defaultHttpConfig = null;
  }

  // Initialize email transporter
  async initializeEmailTransporter() {
    try {
      const config = await getRow('SELECT * FROM email_config WHERE is_default = true LIMIT 1');
      if (!config) {
        console.log('No email configuration found');
        return;
      }

      console.log('Email config found:', {
        smtp_host: config.smtp_host,
        smtp_port: config.smtp_port,
        username: config.username ? '***' : 'not set',
        from_email: config.from_email,
        from_name: config.from_name
      });

      this.defaultEmailConfig = config;
      this.emailTransporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port,
        secure: config.ssl || false,
        auth: {
          user: config.username,
          pass: config.password
        }
      });

      // Verify connection
      await this.emailTransporter.verify();
      console.log('Email transporter initialized successfully');
    } catch (error) {
      console.error('Failed to initialize email transporter:', error);
    }
  }

  // Send email notification
  async sendEmail(alertId, template, deviceName, parameter, value, min, max, lastUpdate, thresholdTime) {
    try {
      if (!this.emailTransporter) {
        await this.initializeEmailTransporter();
      }

      if (!this.emailTransporter) {
        throw new Error('Email transporter not available');
      }

      // Get email recipients for this alert
      const recipients = await getRows(`
        SELECT email, name
        FROM alert_email_recipients
        WHERE alerts @> $1::jsonb
      `, [JSON.stringify([alertId])]);

      console.log(`Found ${recipients.length} email recipients for alert ${alertId}:`, recipients);

      if (recipients.length === 0) {
        console.log(`No active email recipients found for alert ${alertId}`);
        return;
      }

      // Process template
      const processedTemplate = this.processTemplate(template, {
        device: deviceName,
        parameter,
        value,
        min,
        max,
        lastUpdate,
        thresholdTime
      });

      // Send email to each recipient
      for (const recipient of recipients) {
        try {
          const mailOptions = {
            from: `"${this.defaultEmailConfig.from_name}" <${this.defaultEmailConfig.from_email}>`,
            to: recipient.email,
            subject: `IoT Alert: ${deviceName}`,
            text: processedTemplate,
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #d32f2f;">IoT Alert Notification</h2>
                    <p style="font-size: 16px; line-height: 1.6;">${processedTemplate.replace(/\n/g, '<br>')}</p>
                    <hr style="margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">
                      This is an automated alert from your IoT monitoring system.<br>
                      Sent at: ${new Date().toLocaleString()}
                    </p>
                   </div>`
          };

          await this.emailTransporter.sendMail(mailOptions);
          
          // Log successful email
          await this.logNotification(alertId, 'email', recipient.email, 'sent', processedTemplate);
          
          console.log(`Email sent successfully to ${recipient.email}`);
        } catch (error) {
          console.error(`Failed to send email to ${recipient.email}:`, error);
          await this.logNotification(alertId, 'email', recipient.email, 'failed', processedTemplate, error.message);
        }
      }
    } catch (error) {
      console.error('Failed to send email notification:', error);
      throw error;
    }
  }

  // Send HTTP notification
  async sendHttpNotification(alertId, template, deviceName, parameter, value, min, max, lastUpdate, thresholdTime) {
    try {
      // Get HTTP endpoints for this alert
      const configs = await getRows(`
        SELECT *
        FROM alert_http_endpoints
        WHERE alerts @> $1::jsonb
      `, [JSON.stringify([alertId])]);

      if (configs.length === 0) {
        console.log(`No HTTP configurations found for alert ${alertId}`);
        return;
      }

      // Process template
      const processedTemplate = this.processTemplate(template, {
        device: deviceName,
        parameter,
        value,
        min,
        max,
        lastUpdate,
        thresholdTime
      });

      // Send HTTP request to each configuration
      for (const config of configs) {
        try {
          const payload = {
            alert_id: alertId,
            device: deviceName,
            parameter,
            value,
            min,
            max,
            message: processedTemplate,
            timestamp: new Date().toISOString(),
            type: 'iot_alert'
          };

          const requestConfig = {
            method: config.method.toLowerCase(),
            url: config.url,
            headers: {
              'Content-Type': 'application/json',
              ...config.headers
            },
            timeout: config.timeout || 30000,
            data: payload
          };

          const response = await axios(requestConfig);
          
          // Log successful HTTP notification
          await this.logNotification(alertId, 'http', config.url, 'sent', processedTemplate);
          
          console.log(`HTTP notification sent successfully to ${config.url}`);
        } catch (error) {
          console.error(`Failed to send HTTP notification to ${config.url}:`, error);
          
          // Retry logic
          let retryCount = 0;
          const maxRetries = config.retry_count || 3;
          const retryDelay = config.retry_delay || 5000;
          
          while (retryCount < maxRetries) {
            try {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              
              const payload = {
                alert_id: alertId,
                device: deviceName,
                parameter,
                value,
                min,
                max,
                message: processedTemplate,
                timestamp: new Date().toISOString(),
                type: 'iot_alert'
              };

              const requestConfig = {
                method: config.method.toLowerCase(),
                url: config.url,
                headers: {
                  'Content-Type': 'application/json',
                  ...config.headers
                },
                timeout: config.timeout || 30000,
                data: payload
              };

              const response = await axios(requestConfig);
              
              // Log successful retry
              await this.logNotification(alertId, 'http', config.url, 'sent', processedTemplate);
              console.log(`HTTP notification sent successfully to ${config.url} after retry ${retryCount + 1}`);
              break;
            } catch (retryError) {
              retryCount++;
              if (retryCount >= maxRetries) {
                await this.logNotification(alertId, 'http', config.url, 'failed', processedTemplate, retryError.message);
                console.error(`HTTP notification failed after ${maxRetries} retries to ${config.url}`);
              } else {
                await this.logNotification(alertId, 'http', config.url, 'retrying', processedTemplate, retryError.message);
                console.log(`Retrying HTTP notification to ${config.url} (attempt ${retryCount + 1}/${maxRetries})`);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send HTTP notification:', error);
      throw error;
    }
  }

  // Process template with variables
  processTemplate(template, variables) {
    console.log('processTemplate called with:', { template, variables });
    
    let processed = template;
    
    // Replace variables in template
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'g');
      const replacement = variables[key] || '';
      processed = processed.replace(regex, replacement);
      console.log(`Replacing {${key}} with:`, replacement);
    });
    
    console.log('Final processed template:', processed);
    return processed;
  }

  // Log notification attempt
  async logNotification(alertId, type, recipient, status, message, errorDetails = null, createdBy = null) {
    try {
      // Try to get the alert's creator if not provided
      if (!createdBy) {
        try {
          const alertResult = await query('SELECT created_by FROM alerts WHERE alert_id = $1', [alertId]);
          if (alertResult.rows.length > 0) {
            createdBy = alertResult.rows[0].created_by;
          }
        } catch (error) {
          console.warn('Could not fetch alert creator:', error.message);
        }
      }

      // Try alert_notification_logs first, fallback to notification_logs for backward compatibility
      try {
        await query(`
          INSERT INTO alert_notification_logs (alert_id, notification_type, recipient, status, message, error_details, sent_at, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          alertId,
          type,
          recipient,
          status,
          message,
          errorDetails,
          status === 'sent' ? new Date() : null,
          createdBy
        ]);
      } catch (error) {
        // Fallback to notification_logs table if alert_notification_logs doesn't exist
        console.warn('alert_notification_logs table not found, using notification_logs:', error.message);
        await query(`
          INSERT INTO notification_logs (alert_id, notification_type, recipient, status, message, error_details, sent_at, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          alertId,
          type,
          recipient,
          status,
          message,
          errorDetails,
          status === 'sent' ? new Date() : null,
          createdBy
        ]);
      }
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }

  // Send notification based on alert type
  async sendNotification(alert, deviceName, parameter, value, min, max, lastUpdate, thresholdTime) {
    try {
      const { alert_id, actions, template } = alert;
      
      // Send email notification if enabled
      if (actions?.email) {
        await this.sendEmail(alert_id, template, deviceName, parameter, value, min, max, lastUpdate, thresholdTime);
      }
      
      // Send HTTP notification if enabled
      if (actions?.http) {
        await this.sendHttpNotification(alert_id, template, deviceName, parameter, value, min, max, lastUpdate, thresholdTime);
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw error;
    }
  }

  // Send export email with attachment
  async sendExportEmail(emailData) {
    try {
      if (!this.emailTransporter) {
        await this.initializeEmailTransporter();
      }

      if (!this.emailTransporter) {
        throw new Error('Email transporter not available');
      }

      const { to, toName, subject, html, attachment } = emailData;

      const mailOptions = {
        from: `"${this.defaultEmailConfig.from_name}" <${this.defaultEmailConfig.from_email}>`,
        to: `${toName ? `${toName} <${to}>` : to}`,
        subject: subject,
        html: html
      };

      // Add attachment if provided
      if (attachment) {
        mailOptions.attachments = [{
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType || 'application/octet-stream'
        }];
      }

      console.log('Sending export email with options:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject,
        hasAttachment: !!mailOptions.attachments,
        attachmentFilename: attachment?.filename
      });
      
      const result = await this.emailTransporter.sendMail(mailOptions);
      
      console.log(`Export email sent successfully to ${to}`, {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected
      });
      return { success: true };
      
    } catch (error) {
      console.error(`Failed to send export email to ${emailData.to}:`, error);
      throw error;
    }
  }

  // Test email configuration
  async testEmailConfig(configId, testEmail) {
    try {
      let config;
      if (configId) {
        config = await getRow('SELECT * FROM alert_email_config WHERE id = $1', [configId]);
      } else {
        config = await getRow('SELECT * FROM alert_email_config WHERE id = 1');
      }

      if (!config) {
        throw new Error('Email configuration not found');
      }

      const transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port,
        secure: config.smtp_secure,
        auth: {
          user: config.smtp_user,
          pass: config.smtp_pass
        }
      });

      // Verify connection
      await transporter.verify();

      // Send test email
      const mailOptions = {
        from: `"${config.from_name}" <${config.from_email}>`,
        to: testEmail,
        subject: 'IoT Alert System - Test Email',
        text: 'This is a test email from your IoT Alert System. If you receive this, your email configuration is working correctly.',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #4caf50;">IoT Alert System - Test Email</h2>
            <p>This is a test email from your IoT Alert System.</p>
            <p>If you receive this email, your email configuration is working correctly.</p>
            <hr style="margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
              SMTP Host: ${config.smtp_host}:${config.smtp_port}<br>
              Sent at: ${new Date().toLocaleString()}
            </p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      return { success: true, message: 'Test email sent successfully' };
    } catch (error) {
      console.error('Test email failed:', error);
      return { success: false, message: error.message };
    }
  }

  // Test HTTP configuration
  async testHttpConfig(configId) {
    try {
      let config;
      if (configId) {
        config = await getRow('SELECT * FROM alert_http_endpoints WHERE id = $1', [configId]);
      } else {
        config = await getRow('SELECT * FROM alert_http_endpoints LIMIT 1');
      }

      if (!config) {
        throw new Error('HTTP configuration not found');
      }

      const testPayload = {
        test: true,
        message: 'This is a test notification from your IoT Alert System',
        timestamp: new Date().toISOString()
      };

      const requestConfig = {
        method: config.method.toLowerCase(),
        url: config.url,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        },
        timeout: 30000,
        data: testPayload
      };

      const response = await axios(requestConfig);
      return { 
        success: true, 
        message: 'Test HTTP notification sent successfully',
        status: response.status,
        statusText: response.statusText
      };
    } catch (error) {
      console.error('Test HTTP notification failed:', error);
      return { 
        success: false, 
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      };
    }
  }
}

// Simple email sending function for maintenance reminders
const sendEmail = async ({ to, subject, html }) => {
  try {
    const notificationService = new NotificationService();
    
    // Initialize the email transporter
    await notificationService.initializeEmailTransporter();
    
    if (!notificationService.emailTransporter) {
      throw new Error('Email transporter not available');
    }

    // Get email config
    const emailConfig = await getRow('SELECT * FROM email_config WHERE is_default = true LIMIT 1');
    if (!emailConfig) {
      throw new Error('No email configuration found');
    }

    // Send the email
    await notificationService.emailTransporter.sendMail({
      from: `"${emailConfig.from_name}" <${emailConfig.from_email}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject: subject,
      html: html
    });

    console.log(`✅ Email sent successfully to: ${Array.isArray(to) ? to.join(', ') : to}`);
    return true;
  } catch (error) {
    console.error('Failed to send email notification:', error);
    throw error;
  }
};

module.exports = { NotificationService: new NotificationService(), sendEmail }; 