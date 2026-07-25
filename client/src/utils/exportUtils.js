import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatInUserTimezone, getUserTimezone } from './timezoneUtils';

const A4_W = 210;
const A4_H = 297;
const MARGIN = 14;
const CONTENT_BOTTOM = A4_H - MARGIN;
const CONTENT_WIDTH = A4_W - MARGIN * 2;

const toFinite = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const safeFilePart = (value) =>
  String(value || 'export')
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);

const rowTimestamp = (row) => row?.datetime ?? row?.timestamp;

export function computeParamStats(rows, fieldKey) {
  const values = (rows || [])
    .map((row) => toFinite(row?.[fieldKey]))
    .filter((n) => n !== null);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
  return { min, max, avg, count: values.length };
}

function formatAlertThreshold(alert) {
  if (alert?.threshold != null && alert.threshold !== '') return String(alert.threshold);
  const details =
    typeof alert?.details === 'string'
      ? (() => {
          try {
            return JSON.parse(alert.details);
          } catch {
            return {};
          }
        })()
      : alert?.details || {};
  if (details.min != null || details.max != null) {
    return [details.min != null ? `min: ${details.min}` : '', details.max != null ? `max: ${details.max}` : '']
      .filter(Boolean)
      .join(', ');
  }
  if (details.threshold != null) return `${details.threshold} min`;
  return '-';
}

function mapAlertRows(alerts, labelByKey) {
  return (alerts || []).map((alert) => {
    const ts = alert.detected_at || alert.timestamp || alert.created_at;
    const key = alert.parameter ?? '';
    return {
      timestamp: ts ? formatInUserTimezone(ts, 'YYYY-MM-DD HH:mm:ss') : '-',
      parameter: labelByKey.get(key) || key || '-',
      value: alert.value != null ? alert.value : '-',
      threshold: formatAlertThreshold(alert),
      type: alert.type != null ? String(alert.type) : '-',
      status: alert.severity != null ? String(alert.severity) : alert.status != null ? String(alert.status) : '-',
    };
  });
}

function startNewPage(doc) {
  doc.addPage();
  return MARGIN;
}

/** If block of `needed` mm won't fit, start a new page. Never splits a block across pages. */
function ensureBlockSpace(doc, y, needed) {
  if (y + needed <= CONTENT_BOTTOM) return y;
  return startNewPage(doc);
}

async function captureChartPng(chartRef) {
  const el = chartRef?.current;
  if (!el) return null;
  const svg = el.querySelector?.('svg');
  if (!svg) return null;

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
    try {
      const rect = svg.getBBox?.();
      w = rect?.width || 800;
      h = rect?.height || 400;
    } catch {
      w = 800;
      h = 400;
    }
  }
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));

  let svgData = new XMLSerializer().serializeToString(svg);
  const svgTag = svgData.substring(0, svgData.indexOf('>'));
  if (!/width\s*=/.test(svgTag)) {
    svgData = svgData.replace(/<svg/, `<svg width="${w}" height="${h}"`);
  }
  const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ png: canvas.toDataURL('image/png', 1.0), width: w, height: h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function runAutoTable(doc, options) {
  if (typeof autoTable === 'function') {
    autoTable(doc, options);
    return;
  }
  if (typeof doc.autoTable === 'function') {
    doc.autoTable(options);
  }
}

/**
 * Quick View PDF — cover/summary + one chart per page + alerts table.
 * Charts never share a page with other charts to avoid overlap/clipping.
 */
export const exportToPDF = async (payload) => {
  const {
    deviceName,
    periodLabel,
    startISO,
    endISO,
    timezone,
    generatedAt,
    parameters = [],
    rows = [],
    alerts = [],
    chartRefs = {},
  } = payload || {};

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const labelByKey = new Map(parameters.map((p) => [p.fieldKey, p.label]));
  let y = MARGIN;

  // ---- Cover / summary ----------------------------------------------------
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('Quick View Report', MARGIN, y);
  y += 10;

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  const metaLines = [
    `Device: ${deviceName || '-'}`,
    `Period: ${periodLabel || '-'}`,
    `Range: ${formatInUserTimezone(startISO)}  →  ${formatInUserTimezone(endISO)}`,
    `Timezone: ${timezone || getUserTimezone()}`,
    `Generated: ${formatInUserTimezone(generatedAt || new Date().toISOString())}`,
    `Data points: ${rows.length}`,
  ];
  metaLines.forEach((line) => {
    doc.text(line, MARGIN, y);
    y += 6;
  });

  y += 4;
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text('Summary Statistics', MARGIN, y);
  y += 8;
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);

  if (!parameters.length) {
    doc.text('No parameters available for this device.', MARGIN, y);
    y += 6;
  } else {
    parameters.forEach((param) => {
      const stats = computeParamStats(rows, param.fieldKey);
      const line = stats
        ? `${param.label}: Min=${stats.min.toFixed(3)}, Max=${stats.max.toFixed(3)}, Avg=${stats.avg.toFixed(3)} (n=${stats.count})`
        : `${param.label}: no numeric values`;
      y = ensureBlockSpace(doc, y, 6);
      const wrapped = doc.splitTextToSize(line, CONTENT_WIDTH);
      doc.text(wrapped, MARGIN, y);
      y += wrapped.length * 5;
    });
  }

  y += 4;
  y = ensureBlockSpace(doc, y, 12);
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text('Alert Summary', MARGIN, y);
  y += 7;
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text(`Total alerts in range: ${alerts.length}`, MARGIN, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Full raw readings are in the Excel Data sheet. This PDF is the visual report.', MARGIN, y);
  doc.setTextColor(0);

  // ---- Charts: one per page (no overlap risk) -----------------------------
  const chartParams = parameters.filter((p) => chartRefs?.[p.fieldKey]);
  for (const param of chartParams) {
    y = startNewPage(doc);

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(param.label, MARGIN, y);
    y += 8;
    doc.setFont(undefined, 'normal');

    const captured = await captureChartPng(chartRefs[param.fieldKey]);
    if (!captured?.png) {
      doc.setFontSize(10);
      doc.text('Chart image unavailable for this parameter.', MARGIN, y);
      continue;
    }

    const maxImgHeight = CONTENT_BOTTOM - y;
    let imgW = CONTENT_WIDTH;
    let imgH = (captured.height * imgW) / captured.width;
    if (imgH > maxImgHeight) {
      imgH = maxImgHeight;
      imgW = (captured.width * imgH) / captured.height;
    }
    // Keep title + image on this page only
    doc.addImage(captured.png, 'PNG', MARGIN, y, imgW, imgH);
  }

  // ---- Alerts table -------------------------------------------------------
  y = startNewPage(doc);
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text('Alerts', MARGIN, y);
  y += 6;
  doc.setFont(undefined, 'normal');

  const alertRows = mapAlertRows(alerts, labelByKey);
  if (!alertRows.length) {
    doc.setFontSize(10);
    doc.text('No alerts in this period.', MARGIN, y + 4);
  } else {
    runAutoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
      head: [['Timestamp', 'Parameter', 'Value', 'Threshold', 'Type', 'Status']],
      body: alertRows.map((r) => [r.timestamp, r.parameter, r.value, r.threshold, r.type, r.status]),
      styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [33, 100, 140], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 40 },
        2: { cellWidth: 22 },
        3: { cellWidth: 32 },
        4: { cellWidth: 24 },
        5: { cellWidth: 22 },
      },
    });
  }

  const fileName = `quick-view-${safeFilePart(deviceName)}-${safeFilePart(periodLabel)}.pdf`;
  doc.save(fileName);
};

/**
 * Quick View Excel — Summary + Data + Alerts (always present).
 */
export const exportToExcel = (payload) => {
  const {
    deviceName,
    periodLabel,
    startISO,
    endISO,
    timezone,
    generatedAt,
    parameters = [],
    rows = [],
    alerts = [],
  } = payload || {};

  const workbook = XLSX.utils.book_new();
  const labelByKey = new Map(parameters.map((p) => [p.fieldKey, p.label]));

  const summaryAoA = [
    ['Quick View Report'],
    [],
    ['Device', deviceName || '-'],
    ['Period', periodLabel || '-'],
    ['Start', formatInUserTimezone(startISO)],
    ['End', formatInUserTimezone(endISO)],
    ['Timezone', timezone || getUserTimezone()],
    ['Generated', formatInUserTimezone(generatedAt || new Date().toISOString())],
    ['Data points', rows.length],
    [],
    ['Summary Statistics'],
    ['Parameter', 'Min', 'Max', 'Average', 'Count'],
  ];

  parameters.forEach((param) => {
    const stats = computeParamStats(rows, param.fieldKey);
    if (!stats) {
      summaryAoA.push([param.label, '-', '-', '-', 0]);
      return;
    }
    summaryAoA.push([
      param.label,
      Number(stats.min.toFixed(6)),
      Number(stats.max.toFixed(6)),
      Number(stats.avg.toFixed(6)),
      stats.count,
    ]);
  });

  summaryAoA.push([]);
  summaryAoA.push(['Alert count', alerts.length]);

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryAoA), 'Summary');

  const dataHeaders = ['DateTime', ...parameters.map((p) => p.label)];
  const dataRows = (rows || []).map((row) => [
    formatInUserTimezone(rowTimestamp(row), 'YYYY-MM-DD HH:mm:ss'),
    ...parameters.map((p) => {
      const n = toFinite(row?.[p.fieldKey]);
      return n === null ? null : n;
    }),
  ]);
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([dataHeaders, ...dataRows]),
    'Data'
  );

  const alertMapped = mapAlertRows(alerts, labelByKey);
  const alertAoA = [
    ['Timestamp', 'Parameter', 'Value', 'Threshold', 'Type', 'Status'],
    ...alertMapped.map((r) => [r.timestamp, r.parameter, r.value, r.threshold, r.type, r.status]),
  ];
  if (alertMapped.length === 0) {
    alertAoA.push(['No alerts in this period', '', '', '', '', '']);
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(alertAoA), 'Alerts');

  const fileName = `quick-view-${safeFilePart(deviceName)}-${safeFilePart(periodLabel)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

/** Generic table export — columns: { field, headerName }[] */
export function exportTableToCSV(data, columns, filename = 'export.csv') {
  const header = columns.map((col) => col.headerName).join(',');
  const rows = data.map((row) =>
    columns.map((col) => JSON.stringify(row[col.field] ?? '')).join(',')
  );
  const csvContent = [header, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function exportTableToXLSX(data, columns, filename = 'export.xlsx') {
  const wsData = [
    columns.map((col) => col.headerName),
    ...data.map((row) => columns.map((col) => row[col.field] ?? '')),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
}
