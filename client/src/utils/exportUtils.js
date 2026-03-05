import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatInUserTimezone } from './timezoneUtils';

// Export to PDF with charts
export const exportToPDF = async ({ deviceName, period, chartData, alertData, tableData, parameters, chartRefs = {} }) => {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.text('Quick View Report', 20, 20);
  
  // Device and period info
  doc.setFontSize(12);
  doc.text(`Device: ${deviceName}`, 20, 35);
  doc.text(`Period: ${period}`, 20, 45);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 55);
  
  // Summary statistics
  doc.setFontSize(14);
  doc.text('Summary Statistics', 20, 75);
  
  let yPos = 85;
  if (chartData && chartData.length > 0) {
    doc.setFontSize(10);
    doc.text(`Total Data Points: ${chartData.length}`, 20, yPos);
    yPos += 10;
    
    parameters.forEach(param => {
      const values = chartData.filter(item => item[param] !== undefined).map(item => parseFloat(item[param]));
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
        doc.text(`${param}: Min=${min.toFixed(3)}, Max=${max.toFixed(3)}, Avg=${avg.toFixed(3)}`, 20, yPos);
        yPos += 8;
      }
    });
  }
  
  // Alert summary
  if (alertData && alertData.length > 0) {
    yPos += 10;
    doc.setFontSize(14);
    doc.text('Alert Summary', 20, yPos);
    yPos += 10;
    doc.setFontSize(10);
    doc.text(`Total Alerts: ${alertData.length}`, 20, yPos);
  }
  
  // Add charts if available
  if (chartRefs && Object.keys(chartRefs).length > 0) {
    yPos += 20;
    doc.setFontSize(14);
    doc.text('Parameter Charts', 20, yPos);
    yPos += 10;
    
    // Process charts sequentially to avoid async issues
    for (const [param, chartRef] of Object.entries(chartRefs)) {
      if (chartRef && chartRef.current) {
        try {
          console.log(`Attempting to capture chart for ${param}:`, chartRef.current);
          
          // For Recharts, we need to find the SVG element
          const svg = chartRef.current.querySelector('svg');
          
          if (svg) {
            // Get dimensions: Recharts often uses viewBox only, so width/height may be 0
            let w = svg.width?.baseVal?.value;
            let h = svg.height?.baseVal?.value;
            if (!w || !h) {
              const vb = svg.getAttribute('viewBox');
              if (vb) {
                const parts = vb.trim().split(/\s+/);
                if (parts.length >= 4) {
                  w = Number(parts[2]) || 800;
                  h = Number(parts[3]) || 400;
                }
              }
            }
            if (!w || !h) {
              const rect = svg.getBBox?.();
              if (rect) {
                w = rect.width || 800;
                h = rect.height || 400;
              }
            }
            w = w || 800;
            h = h || 400;
            console.log(`SVG found for ${param}, dimensions:`, w, 'x', h);

            let svgData = new XMLSerializer().serializeToString(svg);
            // Ensure root SVG has explicit width/height so it loads reliably as Image
            const svgTag = svgData.substring(0, svgData.indexOf('>'));
            if (!/width\s*=/.test(svgTag)) {
              svgData = svgData.replace(/<svg/, `<svg width="${w}" height="${h}"`);
            }
            // Use data URL instead of blob URL: more reliable for SVG in Image/canvas in many browsers
            const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));

            await new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = w;
                  canvas.height = h;
                  ctx.drawImage(img, 0, 0, w, h);
                  const imgData = canvas.toDataURL('image/png', 1.0);
                  console.log(`Image data generated for ${param}, length:`, imgData.length);

                  doc.setFontSize(12);
                  doc.text(`${param.toUpperCase()} Chart`, 20, yPos);
                  yPos += 8;

                  const imgWidth = 170;
                  const imgHeight = (h * imgWidth) / w;
                  if (yPos + imgHeight > 250) {
                    doc.addPage();
                    yPos = 20;
                  }
                  doc.addImage(imgData, 'PNG', 20, yPos, imgWidth, imgHeight);
                  yPos += imgHeight + 10;
                  console.log(`Chart ${param} added to PDF successfully`);
                  resolve();
                } catch (imgError) {
                  console.error(`Error generating image for ${param}:`, imgError);
                  doc.setFontSize(10);
                  doc.text(`${param} Chart (image generation failed)`, 20, yPos);
                  yPos += 8;
                  resolve();
                }
              };

              img.onerror = () => {
                console.error(`Failed to load SVG image for ${param}`);
                doc.setFontSize(10);
                doc.text(`${param} Chart (SVG load failed)`, 20, yPos);
                yPos += 8;
                resolve();
              };

              img.src = dataUrl;
            });
          } else {
            console.log(`No SVG found for ${param}, adding text fallback`);
            // Add text fallback
            doc.setFontSize(10);
            doc.text(`${param} Chart (no SVG found)`, 20, yPos);
            yPos += 8;
          }
        } catch (error) {
          console.error(`Error adding chart for ${param}:`, error);
          // Add text fallback
          doc.setFontSize(10);
          doc.text(`${param} Chart (error: ${error.message})`, 20, yPos);
          yPos += 8;
        }
      } else {
        console.log(`Chart ref not available for ${param}`);
      }
    }
  }
  
  // Data table
  if (tableData && tableData.length > 0) {
    // Check if we need a new page for the table
    if (yPos > 200) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.text('Data Table', 20, yPos);
    yPos += 10;
    
    // Prepare table data - use all data, not limited to 50 rows
    const tableHeaders = ['DateTime', ...parameters];
    const tableRows = tableData.map(row => [
      formatInUserTimezone(row.datetime, 'YYYY-MM-DD HH:mm:ss'),
      ...parameters.map(param => row[param] !== undefined ? parseFloat(row[param]).toFixed(3) : 'N/A')
    ]);
    
    console.log(`Exporting table with ${tableRows.length} rows (was limited to 50, now using all data)`);
    
    // Add table to PDF with error handling
    try {
      if (typeof doc.autoTable === 'function') {
        doc.autoTable({
          head: [tableHeaders],
          body: tableRows,
          startY: yPos,
          styles: {
            fontSize: 8,
            cellPadding: 2
          },
          headStyles: {
            fillColor: [66, 139, 202],
            textColor: 255
          }
        });
      } else {
        // Fallback: create a simple table without autoTable
        createSimpleTable(doc, tableHeaders, tableRows, yPos);
      }
    } catch (error) {
      console.error('Error creating table with autoTable:', error);
      // Fallback: create a simple table
      createSimpleTable(doc, tableHeaders, tableRows, yPos);
    }
  }
  
  // Save PDF
  doc.save(`quick-view-${deviceName}-${period}.pdf`);
};

// Helper function to create a simple table without autoTable
const createSimpleTable = (doc, headers, rows, startY) => {
  doc.setFontSize(8);
  let y = startY;
  
  // Headers
  headers.forEach((header, index) => {
    doc.text(header, 20 + (index * 30), y);
  });
  y += 10;
  
  // Data rows (handle larger datasets with pagination)
  const rowsPerPage = 25; // Adjust based on page size
  rows.forEach((row, rowIndex) => {
    // Check if we need a new page
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    
    row.forEach((cell, index) => {
      // Truncate long cell content to fit
      const cellText = cell.toString().substring(0, 15);
      doc.text(cellText, 20 + (index * 30), y);
    });
    y += 8;
  });
};

// Export to Excel
export const exportToExcel = ({ deviceName, period, chartData, alertData, tableData, parameters }) => {
  const workbook = XLSX.utils.book_new();
  
  // Summary sheet
  const summaryData = [
    ['Quick View Report'],
    [''],
    ['Device', deviceName],
    ['Period', period],
    ['Generated', new Date().toLocaleString()],
    [''],
    ['Summary Statistics']
  ];
  
  if (chartData && chartData.length > 0) {
    summaryData.push(['Total Data Points', chartData.length]);
    summaryData.push(['']);
    
    parameters.forEach(param => {
      const values = chartData.filter(item => item[param] !== undefined).map(item => parseFloat(item[param]));
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
  
  if (alertData && alertData.length > 0) {
    summaryData.push(['Alert Summary']);
    summaryData.push(['Total Alerts', alertData.length]);
  }
  
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  
  // Data sheet
  if (tableData && tableData.length > 0) {
    const dataHeaders = ['DateTime', ...parameters];
    const dataRows = tableData.map(row => [
      formatInUserTimezone(row.datetime, 'YYYY-MM-DD HH:mm:ss'),
      ...parameters.map(param => row[param] !== undefined ? parseFloat(row[param]) : null)
    ]);
    
    const dataSheet = XLSX.utils.aoa_to_sheet([dataHeaders, ...dataRows]);
    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data');
  }
  
  // Alert sheet – use detected_at for Timestamp; Threshold from details JSONB; Severity from status
  if (alertData && alertData.length > 0) {
    const alertHeaders = ['Timestamp', 'Parameter', 'Value', 'Threshold', 'Type', 'Severity'];
    const alertRows = alertData.map(alert => {
      const ts = alert.detected_at || alert.timestamp || alert.created_at;
      const timestampStr = ts ? formatInUserTimezone(ts, 'YYYY-MM-DD HH:mm:ss') : '-';
      let thresholdStr = alert.threshold;
      if (thresholdStr === undefined || thresholdStr === null || thresholdStr === '') {
        const details = alert.details;
        if (details) {
          const d = typeof details === 'string' ? (() => { try { return JSON.parse(details); } catch { return {}; } })() : details;
          if (d.min != null || d.max != null) {
            thresholdStr = [d.min != null ? `min: ${d.min}` : '', d.max != null ? `max: ${d.max}` : ''].filter(Boolean).join(', ');
          } else if (d.threshold != null) {
            thresholdStr = `${d.threshold} min`;
          } else {
            thresholdStr = '-';
          }
        } else {
          thresholdStr = '-';
        }
      }
      const typeStr = alert.type != null ? String(alert.type) : '-';
      const severityStr = alert.severity != null ? String(alert.severity) : (alert.status != null ? String(alert.status) : '-');
      return [
        timestampStr,
        alert.parameter ?? '-',
        alert.value != null ? alert.value : '-',
        thresholdStr,
        typeStr,
        severityStr
      ];
    });
    const alertSheet = XLSX.utils.aoa_to_sheet([alertHeaders, ...alertRows]);
    XLSX.utils.book_append_sheet(workbook, alertSheet, 'Alerts');
  }
  
  // Save Excel file
  XLSX.writeFile(workbook, `quick-view-${deviceName}-${period}.xlsx`);
};

// Export table data only
export const exportTableToExcel = (tableData, parameters, deviceName) => {
  const workbook = XLSX.utils.book_new();
  
  const headers = ['DateTime', ...parameters];
  const rows = tableData.map(row => [
    formatInUserTimezone(row.datetime, 'YYYY-MM-DD HH:mm:ss'),
    ...parameters.map(param => row[param] !== undefined ? parseFloat(row[param]) : null)
  ]);
  
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
  
  XLSX.writeFile(workbook, `table-${deviceName}-${new Date().toISOString().split('T')[0]}.xlsx`);
};

// Export chart data
export const exportChartToPDF = (chartData, parameter, deviceName) => {
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.text(`${parameter.toUpperCase()} Chart`, 20, 20);
  doc.setFontSize(12);
  doc.text(`Device: ${deviceName}`, 20, 35);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 45);
  
  if (chartData && chartData.length > 0) {
    const values = chartData.map(item => parseFloat(item[parameter])).filter(val => !isNaN(val));
    if (values.length > 0) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
      
      doc.setFontSize(14);
      doc.text('Statistics:', 20, 65);
      doc.setFontSize(10);
      doc.text(`Min: ${min.toFixed(3)}`, 20, 75);
      doc.text(`Max: ${max.toFixed(3)}`, 20, 85);
      doc.text(`Average: ${avg.toFixed(3)}`, 20, 95);
    }
  }
  
  doc.save(`chart-${parameter}-${deviceName}.pdf`);
};