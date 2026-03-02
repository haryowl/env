const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment-timezone');
const { query, getRow, getRows } = require('../config/database');
const { NotificationService } = require('./notificationService');
const notificationService = NotificationService;

class SimpleScheduledExportService {
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
      console.log('Initializing Simple Scheduled Export Service...');
      
      // Load all active scheduled exports
      await this.loadScheduledExports();
      
      this.isInitialized = true;
      console.log(`✓ Simple Scheduled Export Service initialized with ${this.activeJobs.size} active jobs`);
      
    } catch (error) {
      console.error('Failed to initialize Simple Scheduled Export Service:', error);
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
          se.export_id,
          se.name,
          se.description,
          se.frequency,
          se.cron_expression,
          se.is_active,
          se.time_zone,
          ec.device_ids,
          ec.parameters,
          ec.format,
          ec.date_range_days,
          array_agg(
            CASE WHEN eer.email IS NOT NULL 
            THEN json_build_object('email', eer.email, 'name', eer.name)
            ELSE NULL END
          ) FILTER (WHERE eer.email IS NOT NULL) as recipients
        FROM scheduled_exports se
        LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
        LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
        WHERE se.is_active = true
        GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.cron_expression, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.date_range_days
      `);
      
      for (const exportData of exports) {
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
        
        await this.startJob(exportData);
      }
      
    } catch (error) {
      console.error('Failed to load scheduled exports:', error);
      throw error;
    }
  }

  // Start a cron job for an export
  async startJob(exportData) {
    try {
      // Use the cron_expression from the database, not generate a new one
      const cronExpression = exportData.cron_expression;
      
      if (!cronExpression) {
        console.error(`No cron expression found for export ${exportData.export_id}`);
        return;
      }
      
      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        console.error(`Invalid cron expression for export ${exportData.export_id}: ${cronExpression}`);
        return;
      }
      
      const job = cron.schedule(cronExpression, async () => {
        // Fetch fresh export data with recipients each time the cron runs
        const freshExportData = await this.getFreshExportData(exportData.export_id);
        if (freshExportData) {
          await this.executeExport(freshExportData);
        } else {
          console.error(`Failed to fetch fresh data for export ${exportData.export_id}`);
        }
      }, {
        scheduled: false,
        timezone: exportData.time_zone || 'UTC'
      });

      job.start();
      this.activeJobs.set(exportData.export_id, job);
      console.log(`Started job for export: ${exportData.name} (ID: ${exportData.export_id}) with cron: ${cronExpression}`);
      
    } catch (error) {
      console.error(`Failed to start job for export ${exportData.export_id}:`, error);
    }
  }

  // Stop a cron job
  async stopJob(exportId) {
    try {
      const job = this.activeJobs.get(exportId);
      if (job) {
        job.stop();
        job.destroy();
        this.activeJobs.delete(exportId);
        console.log(`Stopped job for export: ${exportId}`);
      }
    } catch (error) {
      console.error(`Failed to stop job for export ${exportId}:`, error);
    }
  }

  // Generate cron expression based on frequency
  generateCronExpression(frequency) {
    switch (frequency) {
      case 'daily':
        return '0 8 * * *'; // Daily at 8:00 AM
      case 'weekly':
        return '0 8 * * 1'; // Weekly on Monday at 8:00 AM
      case 'monthly':
        return '0 8 1 * *'; // Monthly on 1st at 8:00 AM
      default:
        return '0 8 * * *'; // Default to daily
    }
  }

  // Execute an export
  async executeExport(exportData) {
    const executionId = `exec_${Date.now()}_${exportData.export_id}`;
    const startTime = Date.now();
    let logResult = null;
    
    try {
      console.log(`Starting export execution: ${exportData.name} (ID: ${exportData.export_id})`);
      
      // Log execution start
      logResult = await this.logExecutionStart(exportData.export_id);
      const logId = logResult.log_id;
      
      // Calculate date range
      const endDate = moment();
      const startDate = endDate.clone().subtract(exportData.date_range_days || 1, 'days');
      
      // Fetch data
      const chartData = await this.fetchExportData(
        exportData.device_ids || [],
        exportData.parameters || [],
        startDate.toDate(),
        endDate.toDate()
      );
      
      // Fetch device names for PDF generation
      if (exportData.device_ids && exportData.device_ids.length > 0) {
        const deviceNames = await getRows(`
          SELECT device_id, name FROM devices WHERE device_id = ANY($1)
        `, [exportData.device_ids]);
        
        exportData.deviceNames = deviceNames.reduce((acc, device) => {
          acc[device.device_id] = device.name;
          return acc;
        }, {});
      }
      
      // Generate export file
      const filepath = await this.generateExportFile(exportData, chartData, startDate, endDate);
      
      // Send email if recipients exist
      await this.sendExportEmail(exportData, filepath, startDate, endDate);
      
      const executionTime = Date.now() - startTime;
      
      // Log successful execution completion
      await this.logExecutionComplete(logId, 'success', {
        file_path: filepath,
        file_size: await this.getFileSize(filepath),
        recipients_count: exportData.recipients?.length || 0,
        execution_time_ms: executionTime
      });
      
      console.log(`✅ Export completed successfully: ${exportData.name} (${executionTime}ms)`);
      
    } catch (error) {
      console.error(`❌ Export ${exportData.export_id} failed:`, error);
      
      const executionTime = Date.now() - startTime;
      
      // Log failed execution completion
      if (logResult && logResult.log_id) {
        await this.logExecutionComplete(logResult.log_id, 'failed', {
          error_message: error.message,
          execution_time_ms: executionTime
        });
      }
    }
  }

  // Fetch data using the same logic as Quick View
  async fetchExportData(deviceIds, parameters, startDate, endDate) {
    try {
      // Build the query similar to data-dash route
      let where = [];
      let sqlParams = [];
      let paramIdx = 1;
      
      if (deviceIds && deviceIds.length > 0) {
        where.push(`sr.device_id = ANY($${paramIdx++})`);
        sqlParams.push(deviceIds);
      }
      
      if (startDate) {
        where.push(`sr.timestamp >= $${paramIdx++}`);
        sqlParams.push(new Date(startDate));
      }
      
      if (endDate) {
        where.push(`sr.timestamp <= $${paramIdx++}`);
        sqlParams.push(new Date(endDate));
      }
      
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      
      const rawSql = `
        SELECT sr.timestamp, sr.device_id, sr.sensor_type, sr.value, sr.unit, sr.metadata, (sr.metadata->>'datetime') as datetime
        FROM sensor_readings sr
        ${whereClause}
        ORDER BY sr.timestamp DESC
        LIMIT 2000
      `;
      
      const rawResult = await query(rawSql, sqlParams);
      return rawResult.rows || [];
      
    } catch (error) {
      console.error('Failed to fetch export data:', error);
      throw error;
    }
  }

  // Generate export file (simplified version)
  async generateExportFile(exportData, chartData, startDate, endDate) {
    try {
      const filename = `${exportData.name}_${startDate.format('YYYY-MM-DD')}_to_${endDate.format('YYYY-MM-DD')}.${exportData.format === 'excel' ? 'xlsx' : 'pdf'}`;
      const filepath = path.join(this.tempDir, filename);
      
      if (exportData.format === 'excel') {
        await this.generateExcelFile(filepath, exportData, chartData, startDate, endDate);
      } else {
        await this.generatePDFFile(filepath, exportData, chartData, startDate, endDate);
      }
      
      return filepath;
    } catch (error) {
      console.error('Failed to generate export file:', error);
      throw error;
    }
  }

  // Generate Excel file
  async generateExcelFile(filepath, exportData, chartData, startDate, endDate) {
    const XLSX = require('xlsx');
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Create summary sheet with proper format
    const summaryData = [
      ['Scheduled Export Report'],
      [''],
      ['Export Name', exportData.name],
      ['Period', `${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')}`],
      ['Generated', new Date().toLocaleString()],
      [''],
      ['Summary Statistics']
    ];
    
    if (chartData && chartData.length > 0) {
      summaryData.push(['Total Data Points', chartData.length]);
      summaryData.push(['']);
      
      // Get unique parameters from the data
      const parameters = [...new Set(chartData.map(item => item.sensor_type))];
      
      parameters.forEach(param => {
        const values = chartData.filter(item => item.sensor_type === param && item.value !== null).map(item => parseFloat(item.value));
        if (values.length > 0) {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
          summaryData.push([param, 'Min', 'Max', 'Average']);
          summaryData.push(['', min.toFixed(3), max.toFixed(3), avg.toFixed(3)]);
          summaryData.push(['']);
        }
      });
    }
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    
    // Create data sheet with proper format (grouped by timestamp)
    if (chartData.length > 0) {
      // Group data by timestamp and device
      const groupedData = {};
      
      chartData.forEach(item => {
        const timestamp = item.datetime ? new Date(item.datetime).toLocaleString() : new Date(item.timestamp).toLocaleString();
        const key = `${timestamp}_${item.device_id}`;
        
        if (!groupedData[key]) {
          groupedData[key] = {
            'DateTime': timestamp,
            'Device Name': exportData.deviceNames ? (exportData.deviceNames[item.device_id] || item.device_id) : item.device_id,
            'Device ID': item.device_id,
            'Timestamp': new Date(item.timestamp).toLocaleString()
          };
        }
        
        // Add parameter as a column
        groupedData[key][item.sensor_type] = item.value;
      });
      
      // Convert to array and create headers
      const dataArray = Object.values(groupedData);
      
      if (dataArray.length > 0) {
        // Get all unique parameters for headers
        const allParameters = [...new Set(chartData.map(item => item.sensor_type))];
        const headers = ['DateTime', 'Device Name', 'Device ID', ...allParameters, 'Timestamp'];
        
        // Create data rows
        const dataRows = dataArray.map(row => {
          const rowData = [row['DateTime'], row['Device Name'], row['Device ID']];
          allParameters.forEach(param => {
            rowData.push(row[param] !== undefined ? parseFloat(row[param]) : null);
          });
          rowData.push(row['Timestamp']);
          return rowData;
        });
        
        // Create sheet with headers and data
        const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
        XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');
      }
    }
    
    // Write file
    XLSX.writeFile(wb, filepath);
    console.log(`Excel file generated: ${filepath}`);
  }

  // Generate PDF file
  async generatePDFFile(filepath, exportData, chartData, startDate, endDate) {
    const jsPDF = require('jspdf').jsPDF;
    
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text('Scheduled Export Report', 20, 20);
    
    // Device and period info - smaller font and reduced spacing
    doc.setFontSize(9);
    doc.text(`Export Name: ${exportData.name}`, 20, 30);
    doc.text(`Period: ${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')}`, 20, 37);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 44);
    
    // Summary statistics - reduced spacing
    doc.setFontSize(12);
    doc.text('Summary Statistics', 20, 58);
    
    let yPos = 68;
    if (chartData && chartData.length > 0) {
      doc.setFontSize(8);
      doc.text(`Total Data Points: ${chartData.length}`, 20, yPos);
      yPos += 6;
      
      // Get unique parameters and calculate statistics
      const parameters = [...new Set(chartData.map(item => item.sensor_type))];
      
      parameters.forEach(param => {
        const values = chartData.filter(item => item.sensor_type === param && item.value !== null).map(item => parseFloat(item.value));
        if (values.length > 0) {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
          doc.text(`${param}: Min=${min.toFixed(3)}, Max=${max.toFixed(3)}, Avg=${avg.toFixed(3)}`, 20, yPos);
          yPos += 5;
        }
      });
    }
    
    // Data table
    if (chartData && chartData.length > 0) {
      // Check if we need a new page for the table
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }
      
      // Group data by timestamp and device (same logic as Excel)
      const groupedData = {};
      
      chartData.forEach(item => {
        // Use 24-hour format for datetime
        const dateTime = item.datetime ? new Date(item.datetime) : new Date(item.timestamp);
        const timestamp = dateTime.toLocaleString('en-GB', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        const key = `${timestamp}_${item.device_id}`;
        
        if (!groupedData[key]) {
          groupedData[key] = {
            'DateTime': timestamp,
            'Device Name': exportData.deviceNames ? (exportData.deviceNames[item.device_id] || item.device_id) : item.device_id
          };
        }
        
        // Add parameter as a property
        groupedData[key][item.sensor_type] = item.value;
      });
      
      const dataArray = Object.values(groupedData);
      const allParameters = [...new Set(chartData.map(item => item.sensor_type))];
      
      if (dataArray.length > 0) {
        // Create a simple table format
        const headers = ['DateTime', 'Device Name', ...allParameters];
        
        // Draw table headers (remove duplicate "Data Table" heading)
        yPos += 8;
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        
        // Create header row with proper spacing
        let headerText = '';
        headers.forEach((header, index) => {
          const headerCell = String(header).substring(0, 12); // Truncate header
          if (index === 0) {
            headerText += headerCell.padEnd(16); // DateTime column wider
          } else if (index === 1) {
            headerText += headerCell.padEnd(15); // Device Name column
          } else {
            headerText += headerCell.padEnd(10); // Parameter columns
          }
          if (index < headers.length - 1) {
            headerText += ' | ';
          }
        });
        
        doc.text(headerText, 20, yPos);
        yPos += 8;
        
        // Draw header separator line
        doc.setLineWidth(0.5);
        doc.line(20, yPos, 190, yPos);
        yPos += 8;
        
        // Draw data rows
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        
        dataArray.forEach((row, index) => {
          if (yPos > 280) {
            doc.addPage();
            yPos = 20;
            
            // Redraw headers on new page
            doc.setFont(undefined, 'bold');
            doc.setFontSize(9);
            doc.text('Data Table (continued)', 20, yPos);
            yPos += 10;
            doc.text(headerText, 20, yPos);
            yPos += 8;
            doc.line(20, yPos, 190, yPos);
            yPos += 8;
            doc.setFont(undefined, 'normal');
            doc.setFontSize(8);
          }
          
          // Format datetime with full timestamp (date + time)
          const fullDateTime = row['DateTime']; // Keep full datetime
          
          const rowData = [
            fullDateTime.substring(0, 19), // Keep full datetime with time (YYYY-MM-DD HH:mm:ss)
            row['Device Name'].substring(0, 15), // Truncate device name
            ...allParameters.map(param => row[param] !== undefined ? parseFloat(row[param]).toFixed(2) : 'N/A')
          ];
          
          // Create row text with proper spacing
          let rowText = '';
          rowData.forEach((cellData, colIndex) => {
            const cellText = String(cellData);
            if (colIndex === 0) {
              rowText += cellText.padEnd(16); // DateTime column
            } else if (colIndex === 1) {
              rowText += cellText.padEnd(15); // Device Name column
            } else {
              rowText += cellText.padEnd(10); // Parameter columns
            }
            if (colIndex < rowData.length - 1) {
              rowText += ' | ';
            }
          });
          
          doc.text(`${index + 1}. ${rowText}`, 20, yPos);
          yPos += 6;
        });
      }
    }
    
    // Save the PDF
    doc.save(filepath);
    console.log(`PDF file generated: ${filepath}`);
  }

  // Send export email
  async sendExportEmail(exportData, filepath, startDate, endDate) {
    try {
      if (!exportData.recipients || exportData.recipients.length === 0) {
        console.log('No email recipients configured');
        return;
      }
      
      const fileContent = await fs.readFile(filepath);
      const filename = path.basename(filepath);
      
      for (const { email, name } of exportData.recipients) {
        const emailData = {
          to: email,
          toName: name,
          subject: `Scheduled Export: ${exportData.name}`,
          html: `
            <h2>Scheduled Export Report</h2>
            <p><strong>Export Name:</strong> ${exportData.name}</p>
            <p><strong>Period:</strong> ${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p>Please find the attached export file.</p>
          `,
          attachment: {
            filename: filename,
            content: fileContent,
            contentType: exportData.format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
          }
        };
        
        await notificationService.sendExportEmail(emailData);
      }
    } catch (error) {
      console.error('Failed to send export email:', error);
      throw error;
    }
  }

  // Get file size
  async getFileSize(filepath) {
    try {
      const stats = await fs.stat(filepath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  // Log execution start
  async logExecutionStart(exportId) {
    try {
      const result = await query(`
        INSERT INTO export_execution_logs (
          export_id, 
          status, 
          started_at
        )
        VALUES ($1, 'running', NOW())
        RETURNING log_id
      `, [exportId]);
      
      return result.rows[0];
    } catch (error) {
      console.error('Failed to log execution start:', error);
      return { log_id: null };
    }
  }

  // Log execution completion
  async logExecutionComplete(logId, status, details) {
    if (!logId) return;
    
    try {
      const completedAt = status === 'success' ? new Date() : null;
      
      await query(`
        UPDATE export_execution_logs 
        SET 
          status = $2,
          completed_at = $3,
          file_path = $4,
          file_size = $5,
          recipients_count = $6,
          error_message = $7,
          execution_time_ms = $8
        WHERE log_id = $1
      `, [
        logId,
        status,
        completedAt,
        details?.file_path || null,
        details?.file_size || null,
        details?.recipients_count || 0,
        details?.error_message || null,
        details?.execution_time_ms || null
      ]);
    } catch (error) {
      console.error('Failed to log execution completion:', error);
    }
  }

  // Shutdown service
  async shutdown() {
    console.log('Shutting down Simple Scheduled Export Service...');
    
    for (const [exportId, job] of this.activeJobs) {
      job.stop();
      job.destroy();
    }
    
    this.activeJobs.clear();
    this.isInitialized = false;
    
    console.log('✓ Simple Scheduled Export Service shutdown complete');
  }

  // Additional methods needed by routes
  async getAllScheduledExports() {
    const exports = await getRows(`
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
      GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.date_range_days, se.created_at, se.updated_at
      ORDER BY se.created_at DESC
    `);
    
    return exports;
  }

  async getExecutionLogs(exportId, limit = 20) {
    const logs = await getRows(`
      SELECT 
        log_id,
        export_id,
        status,
        started_at,
        completed_at,
        execution_time_ms,
        file_path,
        file_size,
        recipients_count,
        error_message,
        created_at
      FROM export_execution_logs
      WHERE export_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `, [exportId, limit]);
    
    return logs;
  }

  async scheduleExport(exportData) {
    // This method is called when creating/updating exports
    // For now, just start the job if it's active
    if (exportData.is_active) {
      await this.startJob(exportData);
    } else {
      await this.stopJob(exportData.export_id);
    }
  }

  async stopExport(exportId) {
    await this.stopJob(exportId);
  }

  // Get fresh export data with recipients for cron jobs
  async getFreshExportData(exportId) {
    try {
      const exportData = await getRow(`
        SELECT 
          se.export_id,
          se.name,
          se.description,
          se.frequency,
          se.cron_expression,
          se.is_active,
          se.time_zone,
          ec.device_ids,
          ec.parameters,
          ec.format,
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
        GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.cron_expression, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.date_range_days
      `, [exportId]);
      
      // Clean up recipients data - remove null entries
      if (exportData && exportData.recipients) {
        exportData.recipients = exportData.recipients.filter(recipient => 
          recipient && recipient.email && recipient.email.trim() !== ''
        );
      }
      
      // If no recipients, set empty array
      if (!exportData || !exportData.recipients || exportData.recipients.length === 0) {
        if (exportData) exportData.recipients = [];
      }
      
      return exportData;
    } catch (error) {
      console.error(`Failed to fetch fresh export data for ${exportId}:`, error);
      return null;
    }
  }

  async triggerExport(exportId) {
    try {
      // Get export data with recipients and device names
      const exportData = await getRow(`
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
          array_agg(
            CASE WHEN eer.email IS NOT NULL 
            THEN json_build_object('email', eer.email, 'name', eer.name)
            ELSE NULL END
          ) FILTER (WHERE eer.email IS NOT NULL) as recipients
        FROM scheduled_exports se
        LEFT JOIN export_configurations ec ON se.export_id = ec.export_id
        LEFT JOIN export_email_recipients eer ON se.export_id = eer.export_id AND eer.is_active = true
        WHERE se.export_id = $1
        GROUP BY se.export_id, ec.config_id, se.name, se.description, se.frequency, se.is_active, se.time_zone, ec.device_ids, ec.parameters, ec.format, ec.date_range_days
      `, [exportId]);
      
      // Get device names for the device IDs
      if (exportData && exportData.device_ids && exportData.device_ids.length > 0) {
        const deviceNames = await getRows(`
          SELECT device_id, name FROM devices WHERE device_id = ANY($1)
        `, [exportData.device_ids]);
        
        exportData.deviceNames = deviceNames.reduce((acc, device) => {
          acc[device.device_id] = device.name;
          return acc;
        }, {});
      }
      
      if (!exportData) {
        return { success: false, message: 'Export not found' };
      }
      
      if (!exportData.is_active) {
        return { success: false, message: 'Export is not active' };
      }
      
      // Execute the export
      await this.executeExport(exportData);
      
      return { success: true, message: 'Export triggered successfully' };
    } catch (error) {
      console.error('Failed to trigger export:', error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = new SimpleScheduledExportService();