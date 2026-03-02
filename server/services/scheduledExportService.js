const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment-timezone');
const { query, getRow, getRows } = require('../config/database');
const { NotificationService } = require('./notificationService');
const notificationService = NotificationService;

class ScheduledExportService {
  constructor() {
    this.activeJobs = new Map();
    this.isInitialized = false;
    this.tempDir = path.join(__dirname, '../temp/exports');
    
    // Ensure temp directory exists
    this.ensureTempDirectory();
  }

  // Initialize the service and load existing scheduled exports
  async initialize() {
    try {
      console.log('Initializing Scheduled Export Service...');
      
      // Load all active scheduled exports
      await this.loadScheduledExports();
      
      this.isInitialized = true;
      console.log(`✓ Scheduled Export Service initialized with ${this.activeJobs.size} active jobs`);
      
    } catch (error) {
      console.error('Failed to initialize Scheduled Export Service:', error);
      throw error;
    }
  }

  // Ensure temp directory exists for export files
  async ensureTempDirectory() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  // Load all active scheduled exports from database
  async loadScheduledExports() {
    try {
      const exports = await getRows(`
        SELECT 
          se.*,
          ec.device_ids,
          ec.parameters,
          ec.format,
          ec.template,
          ec.date_range_days,
          array_agg(DISTINCT eer.email) as recipient_emails
        FROM scheduled_exports se
        LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
        LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
        WHERE se.is_active = true
        GROUP BY se.export_id, ec.config_id
        ORDER BY se.created_at
      `);

      for (const exportJob of exports) {
        if (exportJob.cron_expression) {
          await this.scheduleExport(exportJob);
        }
      }

      console.log(`Loaded ${exports.length} scheduled exports`);
    } catch (error) {
      console.error('Failed to load scheduled exports:', error);
      throw error;
    }
  }

  // Schedule a new export job
  async scheduleExport(exportData) {
    try {
      const { export_id, cron_expression, time_zone } = exportData;
      
      // Validate cron expression
      if (!cron.validate(cron_expression)) {
        throw new Error(`Invalid cron expression: ${cron_expression}`);
      }

      // Stop existing job if it exists
      if (this.activeJobs.has(export_id)) {
        this.stopExport(export_id);
      }

      // Create new cron job
      const job = cron.schedule(cron_expression, async () => {
        await this.executeExport(export_id);
      }, {
        scheduled: false,
        timezone: time_zone || 'UTC'
      });

      // Start the job
      job.start();
      this.activeJobs.set(export_id, job);

      console.log(`✓ Scheduled export ${export_id} with cron: ${cron_expression} (${time_zone || 'UTC'})`);
      
      return true;
    } catch (error) {
      console.error(`Failed to schedule export ${exportData.export_id}:`, error);
      throw error;
    }
  }

  // Stop a scheduled export
  stopExport(exportId) {
    const job = this.activeJobs.get(exportId);
    if (job) {
      job.stop();
      job.destroy();
      this.activeJobs.delete(exportId);
      console.log(`✓ Stopped export ${exportId}`);
      return true;
    }
    return false;
  }

  // Execute an export job
  async executeExport(exportId) {
    const startTime = Date.now();
    let logId = null;

    try {
      console.log(`🚀 Starting scheduled export ${exportId}`);

      // Create execution log entry
      const logResult = await query(`
        INSERT INTO export_execution_logs (export_id, status, started_at)
        VALUES ($1, 'running', NOW())
        RETURNING log_id
      `, [exportId]);
      logId = logResult.rows[0].log_id;

      // Get export configuration
      const exportConfig = await getRow(`
        SELECT 
          se.*,
          ec.device_ids,
          ec.parameters,
          ec.format,
          ec.template,
          ec.date_range_days,
          array_agg(DISTINCT eer.email) as recipient_emails,
          array_agg(DISTINCT eer.name) as recipient_names
        FROM scheduled_exports se
        LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
        LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
        WHERE se.export_id = $1
        GROUP BY se.export_id, ec.config_id
      `, [exportId]);

      if (!exportConfig) {
        throw new Error(`Export configuration not found for ID: ${exportId}`);
      }

      // Calculate date range for export
      const endDate = moment().tz(exportConfig.time_zone || 'UTC');
      const startDate = endDate.clone().subtract(exportConfig.date_range_days || 1, 'days');

      // Generate export file
      const exportResult = await this.generateExportFile(exportConfig, startDate, endDate);
      
      // Send email with attachment
      const emailResult = await this.sendExportEmail(exportConfig, exportResult.filePath, exportResult.fileSize);

      // Update execution log with success
      const executionTime = Date.now() - startTime;
      await query(`
        UPDATE export_execution_logs 
        SET 
          status = 'success',
          completed_at = NOW(),
          file_path = $1,
          file_size = $2,
          recipients_count = $3,
          execution_time_ms = $4
        WHERE log_id = $5
      `, [
        exportResult.filePath,
        exportResult.fileSize,
        emailResult.recipientsCount,
        executionTime,
        logId
      ]);

      console.log(`✅ Export ${exportId} completed successfully in ${executionTime}ms`);

    } catch (error) {
      console.error(`❌ Export ${exportId} failed:`, error);

      // Update execution log with failure
      const executionTime = Date.now() - startTime;
      await query(`
        UPDATE export_execution_logs 
        SET 
          status = 'failed',
          completed_at = NOW(),
          error_message = $1,
          execution_time_ms = $2
        WHERE log_id = $3
      `, [error.message, executionTime, logId]);

      throw error;
    }
  }

  // Generate export file (PDF or Excel)
  async generateExportFile(exportConfig, startDate, endDate) {
    try {
      const { format, device_ids, parameters, template, export_id } = exportConfig;
      const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
      const filename = `export_${export_id}_${timestamp}.${format}`;
      const filePath = path.join(this.tempDir, filename);

      // Fetch data for export
      const data = await this.fetchExportData(device_ids, parameters, startDate, endDate);

      if (format === 'pdf') {
        await this.generatePDF(data, filePath, exportConfig);
      } else if (format === 'excel') {
        await this.generateExcel(data, filePath, exportConfig);
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }

      // Get file size
      const stats = await fs.stat(filePath);
      
      return {
        filePath,
        fileSize: stats.size,
        filename
      };

    } catch (error) {
      console.error('Failed to generate export file:', error);
      throw error;
    }
  }

  // Fetch data for export
  async fetchExportData(deviceIds, parameters, startDate, endDate) {
    try {
      // Convert device IDs array to comma-separated string
      const deviceIdsStr = Array.isArray(deviceIds) ? deviceIds.join(',') : deviceIds.toString();
      const parametersStr = Array.isArray(parameters) ? parameters.join(',') : parameters.toString();

      // Fetch data from database
      const result = await query(`
        SELECT 
          d.device_id,
          d.name as device_name,
          dm.timestamp,
          dm.datetime,
          ${parameters.map(param => `dm.${param}`).join(', ')}
        FROM device_data dm
        JOIN devices d ON dm.device_id = d.device_id
        WHERE dm.device_id = ANY($1::text[])
        AND dm.timestamp >= $2
        AND dm.timestamp <= $3
        ORDER BY dm.timestamp DESC
      `, [
        deviceIds,
        startDate.toISOString(),
        endDate.toISOString()
      ]);

      return result.rows;
    } catch (error) {
      console.error('Failed to fetch export data:', error);
      throw error;
    }
  }

  // Generate PDF export
  async generatePDF(data, filePath, exportConfig) {
    try {
      // Import PDF generation utilities
      const { exportToPDF } = require('../utils/exportUtils');
      
      // Prepare data for PDF export
      const pdfData = {
        deviceName: exportConfig.name,
        period: `${exportConfig.date_range_days} day(s)`,
        chartData: data,
        alertData: [], // Could be enhanced to include alerts
        tableData: data,
        parameters: exportConfig.parameters,
        chartRefs: {} // No chart refs for automated export
      };

      // Generate PDF using existing utility
      // Note: This is a simplified implementation
      // In a full implementation, we'd need to modify the export utility
      // to work without DOM elements (headless PDF generation)
      
      // For now, we'll create a simple text-based export
      await this.createSimplePDF(data, filePath, exportConfig);

    } catch (error) {
      console.error('Failed to generate PDF:', error);
      throw error;
    }
  }

  // Generate Excel export
  async generateExcel(data, filePath, exportConfig) {
    try {
      // Import Excel generation utilities
      const XLSX = require('xlsx');
      
      // Prepare data for Excel
      const worksheetData = data.map(row => {
        const excelRow = {
          'Device ID': row.device_id,
          'Device Name': row.device_name,
          'Timestamp': row.timestamp,
          'DateTime': row.datetime
        };
        
        // Add parameter columns
        exportConfig.parameters.forEach(param => {
          excelRow[param] = row[param] || 'N/A';
        });
        
        return excelRow;
      });

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Export Data');
      
      // Write file
      XLSX.writeFile(workbook, filePath);

    } catch (error) {
      console.error('Failed to generate Excel:', error);
      throw error;
    }
  }

  // Create simple PDF (fallback implementation)
  async createSimplePDF(data, filePath, exportConfig) {
    try {
      const fs = require('fs').promises;
      
      // Create a simple text-based "PDF" for now
      // In production, you'd use a proper PDF library like jsPDF or Puppeteer
      let content = `Export Report\n`;
      content += `================\n\n`;
      content += `Export Name: ${exportConfig.name}\n`;
      content += `Generated: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`;
      content += `Date Range: ${exportConfig.date_range_days} day(s)\n`;
      content += `Parameters: ${exportConfig.parameters.join(', ')}\n\n`;
      
      content += `Data Summary:\n`;
      content += `Total Records: ${data.length}\n\n`;
      
      if (data.length > 0) {
        content += `Sample Data (first 10 records):\n`;
        data.slice(0, 10).forEach((row, index) => {
          content += `${index + 1}. ${row.device_name} - ${row.datetime}\n`;
          exportConfig.parameters.forEach(param => {
            content += `   ${param}: ${row[param] || 'N/A'}\n`;
          });
          content += `\n`;
        });
      }
      
      await fs.writeFile(filePath, content, 'utf8');
      
    } catch (error) {
      console.error('Failed to create simple PDF:', error);
      throw error;
    }
  }

  // Send export email with attachment
  async sendExportEmail(exportConfig, filePath, fileSize) {
    try {
      const fs = require('fs').promises;
      
      // Read file content
      const fileContent = await fs.readFile(filePath);
      
      // Get email configuration
      const emailConfig = await getRow('SELECT * FROM alert_email_config WHERE id = 1');
      if (!emailConfig || !emailConfig.enabled) {
        throw new Error('Email configuration not available');
      }

      // Prepare email content
      const subject = `Automated Export: ${exportConfig.name}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #6B46C1;">Automated Export Report</h2>
          <p>Hello,</p>
          <p>Please find attached your scheduled export report: <strong>${exportConfig.name}</strong></p>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Export Details:</h3>
            <ul style="margin: 0;">
              <li><strong>Export Name:</strong> ${exportConfig.name}</li>
              <li><strong>Generated:</strong> ${moment().format('YYYY-MM-DD HH:mm:ss')}</li>
              <li><strong>Date Range:</strong> ${exportConfig.date_range_days} day(s)</li>
              <li><strong>Format:</strong> ${exportConfig.format.toUpperCase()}</li>
              <li><strong>File Size:</strong> ${(fileSize / 1024).toFixed(2)} KB</li>
            </ul>
          </div>
          
          <p>This is an automated email from your IoT Monitoring System.</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            Generated at: ${moment().format('YYYY-MM-DD HH:mm:ss')}<br>
            System: IoT Monitoring Platform
          </p>
        </div>
      `;

      // Send email to each recipient
      const recipients = exportConfig.recipient_emails || [];
      let successCount = 0;

      for (let i = 0; i < recipients.length; i++) {
        const email = recipients[i];
        const name = exportConfig.recipient_names?.[i] || 'Recipient';

        try {
          await notificationService.sendExportEmail({
            to: email,
            toName: name,
            subject,
            html: htmlContent,
            attachment: {
              filename: path.basename(filePath),
              content: fileContent,
              contentType: exportConfig.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
          });
          successCount++;
        } catch (emailError) {
          console.error(`Failed to send email to ${email}:`, emailError);
        }
      }

      // Clean up temporary file after sending emails
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file:', cleanupError);
      }

      return {
        recipientsCount: successCount,
        totalRecipients: recipients.length
      };

    } catch (error) {
      console.error('Failed to send export email:', error);
      throw error;
    }
  }

  // Get execution logs for an export
  async getExecutionLogs(exportId, limit = 50) {
    try {
      const logs = await getRows(`
        SELECT 
          log_id,
          status,
          started_at,
          completed_at,
          file_size,
          recipients_count,
          execution_time_ms,
          error_message
        FROM export_execution_logs
        WHERE export_id = $1
        ORDER BY started_at DESC
        LIMIT $2
      `, [exportId, limit]);

      return logs;
    } catch (error) {
      console.error('Failed to get execution logs:', error);
      throw error;
    }
  }

  // Get all scheduled exports
  async getAllScheduledExports() {
    try {
      const exports = await getRows(`
        SELECT 
          se.*,
          ec.device_ids,
          ec.parameters,
          ec.format,
          ec.template,
          ec.date_range_days,
          COUNT(DISTINCT eer.recipient_id) as recipient_count
        FROM scheduled_exports se
        LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
        LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
        GROUP BY se.export_id, ec.config_id
        ORDER BY se.created_at DESC
      `);

      return exports;
    } catch (error) {
      console.error('Failed to get scheduled exports:', error);
      throw error;
    }
  }

  // Manual trigger for testing
  async triggerExport(exportId) {
    try {
      console.log(`Manual trigger for export ${exportId}`);
      await this.executeExport(exportId);
      return { success: true, message: 'Export executed successfully' };
    } catch (error) {
      console.error(`Manual trigger failed for export ${exportId}:`, error);
      return { success: false, message: error.message };
    }
  }

  // Shutdown the service
  async shutdown() {
    try {
      console.log('Shutting down Scheduled Export Service...');
      
      // Stop all active jobs
      for (const [exportId, job] of this.activeJobs) {
        job.stop();
        job.destroy();
      }
      
      this.activeJobs.clear();
      this.isInitialized = false;
      
      console.log('✓ Scheduled Export Service shutdown complete');
    } catch (error) {
      console.error('Error during service shutdown:', error);
    }
  }
}

module.exports = new ScheduledExportService();
