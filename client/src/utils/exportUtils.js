import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatInUserTimezone, getUserTimezone } from './timezoneUtils';

const MARGIN = 14;

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

/** Parse #rgb / #rrggbb / rgb() / rgba() → [r,g,b] or null. */
function parseRgbColor(value) {
  if (!value || value === 'none' || value === 'transparent') return null;
  const s = String(value).trim().toLowerCase();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16));
    }
    if (hex.length === 6 || hex.length === 8) {
      return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    }
    return null;
  }
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function colorLuminance(rgb) {
  if (!rgb) return 0;
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

function isLightColor(value) {
  const rgb = parseRgbColor(value);
  if (!rgb) return false;
  return colorLuminance(rgb) > 0.62;
}

/**
 * Clone chart SVG and force print-friendly colors.
 * Dark-theme Recharts ticks/axes use light fills that vanish on the white PDF canvas.
 */
function cloneSvgForPdf(svg) {
  const clone = svg.cloneNode(true);
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const forceAttr = (el, attr, color) => {
    el.setAttribute(attr, color);
    const style = el.getAttribute('style');
    if (style && new RegExp(`${attr}\\s*:`, 'i').test(style)) {
      el.setAttribute(
        'style',
        style.replace(new RegExp(`${attr}\\s*:[^;]+`, 'gi'), `${attr}:${color}`)
      );
    }
  };

  clone.querySelectorAll('text').forEach((el) => {
    const fill = el.getAttribute('fill');
    // Always readable on white; also replace light fills from dark theme
    if (!fill || fill === 'currentColor' || fill === 'none' || isLightColor(fill)) {
      forceAttr(el, 'fill', '#334155');
    }
  });

  clone.querySelectorAll('.recharts-cartesian-axis-tick text, .recharts-label, .recharts-text').forEach((el) => {
    forceAttr(el, 'fill', '#334155');
  });

  clone.querySelectorAll(
    '.recharts-cartesian-axis-line, .recharts-cartesian-axis-tick-line, .recharts-cartesian-axis line'
  ).forEach((el) => {
    const stroke = el.getAttribute('stroke');
    if (!stroke || stroke === 'currentColor' || isLightColor(stroke)) {
      forceAttr(el, 'stroke', '#64748b');
    }
  });

  clone.querySelectorAll('.recharts-cartesian-grid line, .recharts-cartesian-grid path').forEach((el) => {
    const stroke = el.getAttribute('stroke');
    if (!stroke || stroke === 'currentColor' || isLightColor(stroke)) {
      forceAttr(el, 'stroke', '#cbd5e1');
    }
  });

  // Bake computed fills for any text still light via CSS class (live SVG → clone)
  try {
    const srcTexts = svg.querySelectorAll('text');
    const cloneTexts = clone.querySelectorAll('text');
    srcTexts.forEach((src, i) => {
      const dest = cloneTexts[i];
      if (!dest || typeof window === 'undefined' || !window.getComputedStyle) return;
      const computed = window.getComputedStyle(src).fill;
      if (!computed || computed === 'none' || isLightColor(computed)) {
        forceAttr(dest, 'fill', '#334155');
      } else if (!dest.getAttribute('fill') || dest.getAttribute('fill') === 'currentColor') {
        forceAttr(dest, 'fill', computed);
      }
    });
  } catch {
    /* ignore */
  }

  return clone;
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

  const pdfSvg = cloneSvgForPdf(svg);
  let svgData = new XMLSerializer().serializeToString(pdfSvg);
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

/** Helvetica cannot render most Unicode — strip/replace so jsPDF does not garble lines. */
function pdfSafe(value) {
  return String(value ?? '')
    .replace(/→/g, 'to')
    .replace(/[–—]/g, '-')
    .replace(/³/g, '3')
    .replace(/²/g, '2')
    .replace(/°/g, ' deg')
    .replace(/μ|µ/g, 'u')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function setPdfFont(doc, style = 'normal') {
  doc.setFont('helvetica', style);
}

function pageSize(doc) {
  return {
    w: doc.internal.pageSize.getWidth(),
    h: doc.internal.pageSize.getHeight(),
  };
}

function fitImageInBox(srcW, srcH, boxW, boxH) {
  if (!srcW || !srcH || !boxW || !boxH) return { w: boxW, h: boxH };
  const scale = Math.min(boxW / srcW, boxH / srcH);
  return { w: srcW * scale, h: srcH * scale };
}

function drawFooter(doc, payload) {
  const { w, h } = pageSize(doc);
  setPdfFont(doc, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120);
  const left = pdfSafe(`${payload.deviceName || ''} | ${payload.periodLabel || ''}`);
  const right = `Page ${doc.internal.getNumberOfPages()}`;
  doc.text(left, MARGIN, h - 8);
  doc.text(right, w - MARGIN, h - 8, { align: 'right' });
  doc.setTextColor(0);
}

/**
 * Quick View PDF — cover + 2-column chart grid + alerts when present.
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

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const labelByKey = new Map(parameters.map((p) => [p.fieldKey, p.label]));
  let y = MARGIN;
  const contentW = () => pageSize(doc).w - MARGIN * 2;
  const contentBottom = () => pageSize(doc).h - MARGIN - 6;

  // ---- Cover / summary ----------------------------------------------------
  setPdfFont(doc, 'bold');
  doc.setFontSize(18);
  doc.text('Quick View Report', MARGIN, y);
  y += 8;

  setPdfFont(doc, 'normal');
  doc.setFontSize(10);
  const rangeText = `Range: ${pdfSafe(formatInUserTimezone(startISO))} to ${pdfSafe(formatInUserTimezone(endISO))}`;
  const metaLines = [
    `Device: ${pdfSafe(deviceName || '-')}`,
    `Period: ${pdfSafe(periodLabel || '-')}`,
    rangeText,
    `Timezone: ${pdfSafe(timezone || getUserTimezone())}`,
    `Generated: ${pdfSafe(formatInUserTimezone(generatedAt || new Date().toISOString()))}`,
    `Data points: ${rows.length}`,
    `Alerts in range: ${alerts.length}`,
  ];
  metaLines.forEach((line) => {
    doc.text(line, MARGIN, y);
    y += 5.5;
  });

  y += 3;
  setPdfFont(doc, 'bold');
  doc.setFontSize(12);
  doc.text('Summary Statistics', MARGIN, y);
  y += 4;
  setPdfFont(doc, 'normal');

  const statsBody = parameters.map((param) => {
    const stats = computeParamStats(rows, param.fieldKey);
    if (!stats) return [pdfSafe(param.label), '-', '-', '-', '0'];
    return [
      pdfSafe(param.label),
      stats.min.toFixed(3),
      stats.max.toFixed(3),
      stats.avg.toFixed(3),
      String(stats.count),
    ];
  });

  runAutoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 16 },
    head: [['Parameter', 'Min', 'Max', 'Average', 'Count']],
    body: statsBody.length ? statsBody : [['No parameters', '-', '-', '-', '-']],
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [33, 100, 140], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  y = (doc.lastAutoTable?.finalY || y) + 8;
  setPdfFont(doc, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    pdfSafe('Full raw readings are in the Excel Data sheet. This PDF is the visual report.'),
    MARGIN,
    y
  );
  doc.setTextColor(0);
  drawFooter(doc, { deviceName, periodLabel });

  // ---- Charts: 2 side-by-side per row; pack as many rows as fit on each page ----
  const chartParams = parameters.filter((p) => chartRefs?.[p.fieldKey]);
  const capturedCharts = [];
  for (const param of chartParams) {
    const captured = await captureChartPng(chartRefs[param.fieldKey]);
    capturedCharts.push({ param, captured });
  }

  const COL_GAP = 6;
  const ROW_GAP = 8;
  const TITLE_H = 6;
  let chartPageOpen = false;
  let rowY = MARGIN;

  const openChartPage = () => {
    doc.addPage('a4', 'portrait');
    drawFooter(doc, { deviceName, periodLabel });
    rowY = MARGIN;
    chartPageOpen = true;
  };

  for (let i = 0; i < capturedCharts.length; i += 2) {
    const pair = capturedCharts.slice(i, i + 2);
    const cols = pair.length;
    const fullW = contentW();
    const colW = cols === 1 ? fullW : (fullW - COL_GAP) / 2;
    const { h: pageH } = pageSize(doc);
    const usableBottom = pageH - 12;

    const prepared = pair.map(({ param, captured }) => {
      let fitted = null;
      let frameH = 48;
      if (captured?.png) {
        const maxImgH = Math.max(50, usableBottom - MARGIN - TITLE_H - 4);
        fitted = fitImageInBox(captured.width, captured.height, colW - 4, maxImgH);
        frameH = Math.max(40, fitted.h + 4);
      }
      return { param, captured, fitted, frameH };
    });

    const rowFrameH = Math.max(...prepared.map((p) => p.frameH));
    const rowH = TITLE_H + rowFrameH;

    if (!chartPageOpen || rowY + rowH > usableBottom) {
      openChartPage();
    }

    prepared.forEach((item, col) => {
      const boxX = MARGIN + col * (colW + COL_GAP);
      const boxY = rowY + TITLE_H;
      let fitted = item.fitted;
      if (item.captured?.png) {
        fitted = fitImageInBox(item.captured.width, item.captured.height, colW - 4, rowFrameH - 4);
      }

      setPdfFont(doc, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30);
      doc.text(pdfSafe(item.param.label), boxX, rowY + 4, { maxWidth: colW - 2 });

      doc.setDrawColor(210);
      doc.setFillColor(252, 252, 252);
      doc.roundedRect(boxX, boxY, colW, rowFrameH, 1.5, 1.5, 'FD');

      if (!item.captured?.png || !fitted) {
        setPdfFont(doc, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text('Chart image unavailable.', boxX + 3, boxY + 10);
        doc.setTextColor(0);
        return;
      }

      const imgX = boxX + (colW - fitted.w) / 2;
      const imgY = boxY + (rowFrameH - fitted.h) / 2;
      doc.addImage(item.captured.png, 'PNG', imgX, imgY, fitted.w, fitted.h);
      doc.setTextColor(0);
    });

    rowY += rowH + ROW_GAP;
  }

  // ---- Alerts table (only when there are alerts) --------------------------
  const alertRows = mapAlertRows(alerts, labelByKey);
  if (alertRows.length > 0) {
    doc.addPage('a4', 'portrait');
    y = MARGIN;
    setPdfFont(doc, 'bold');
    doc.setFontSize(13);
    doc.text('Alerts', MARGIN, y);
    y += 6;
    setPdfFont(doc, 'normal');

    runAutoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 16 },
      head: [['Timestamp', 'Parameter', 'Value', 'Threshold', 'Type', 'Status']],
      body: alertRows.map((r) => [
        pdfSafe(r.timestamp),
        pdfSafe(r.parameter),
        pdfSafe(r.value),
        pdfSafe(r.threshold),
        pdfSafe(r.type),
        pdfSafe(r.status),
      ]),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [33, 100, 140], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 40 },
        2: { cellWidth: 22 },
        3: { cellWidth: 32 },
        4: { cellWidth: 24 },
        5: { cellWidth: 22 },
      },
    });
    drawFooter(doc, { deviceName, periodLabel });
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
