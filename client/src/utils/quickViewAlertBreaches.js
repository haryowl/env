/**
 * Shared Quick View alert helpers.
 * Parameter Analytics + Data Table highlight breaches from series × thresholds.
 * Alert Timeline previously used only /alert-logs — merge both so panels stay consistent.
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function matchesAlertParameter(alertParameter, chartParameter) {
  if (alertParameter == null || chartParameter == null) return false;
  const a = String(alertParameter).trim();
  const p = String(chartParameter).trim();
  if (!a || !p) return false;
  return (
    a === p
    || a === p.replace(/_/g, ' ')
    || a === p.replace(/_/g, '.')
    || a.replace(/_/g, ' ') === p.replace(/_/g, ' ')
    || a.replace(/[\s._-]/g, '').toLowerCase() === p.replace(/[\s._-]/g, '').toLowerCase()
  );
}

export function buildThresholdMap(alertConfigs = [], parameters = []) {
  const map = {};
  asArray(parameters).forEach((param) => {
    const configs = asArray(alertConfigs).filter(
      (a) => a.type === 'threshold' && matchesAlertParameter(a.parameter, param)
    );
    if (!configs.length) return;
    let min = null;
    let max = null;
    let severity = 'high';
    configs.forEach((a) => {
      if (a.min != null) min = min == null ? Number(a.min) : Math.min(min, Number(a.min));
      if (a.max != null) max = max == null ? Number(a.max) : Math.max(max, Number(a.max));
      const sev = String(a.severity || '').toLowerCase();
      if (['low', 'medium', 'high', 'critical'].includes(sev)) severity = sev;
    });
    if (min != null || max != null) {
      map[param] = { min, max, severity, configParameter: configs[0].parameter };
    }
  });
  return map;
}

export function isValueOutOfRange(value, thresholds) {
  if (!thresholds || (thresholds.min == null && thresholds.max == null)) return false;
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return false;
  return (thresholds.min != null && num < thresholds.min)
    || (thresholds.max != null && num > thresholds.max);
}

/**
 * Scan series rows against threshold rules → synthetic alert events
 * (same logic Data Table / charts use for red highlights).
 */
export function buildSyntheticThresholdAlerts({
  rows = [],
  parameters = [],
  alertConfigs = [],
}) {
  const thresholdsByParam = buildThresholdMap(alertConfigs, parameters);
  const events = [];
  const paramList = asArray(parameters);

  asArray(rows).forEach((row, rowIdx) => {
    const rawTs = row.datetime ?? row.timestamp ?? row.server_received_at;
    if (!rawTs) return;
    const d = new Date(rawTs);
    if (Number.isNaN(d.getTime())) return;

    paramList.forEach((param) => {
      const thr = thresholdsByParam[param];
      if (!thr) return;
      const value = row[param];
      if (!isValueOutOfRange(value, thr)) return;
      events.push({
        log_id: `scan_${d.getTime()}_${param}_${rowIdx}`,
        timestamp: d.toISOString(),
        detected_at: d.toISOString(),
        created_at: d.toISOString(),
        parameter: thr.configParameter || param,
        value,
        min: thr.min,
        max: thr.max,
        severity: thr.severity || 'high',
        status: 'threshold_breach',
        source: 'threshold_scan',
      });
    });
  });

  return events;
}

function alertDedupeKey(alert) {
  const ts = alert.timestamp || alert.detected_at || alert.created_at;
  const t = new Date(ts).getTime();
  const param = String(alert.parameter || alert.alert_name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
  if (!Number.isFinite(t) || !param) return null;
  // 1-minute bucket — collapses duplicate log + scan for the same breach
  return `${param}|${Math.floor(t / 60000)}`;
}

/**
 * Prefer real alert_logs when both exist for the same minute+parameter.
 */
export function mergeAlertLogsWithThresholdScans(alertLogs = [], syntheticAlerts = []) {
  const map = new Map();
  asArray(syntheticAlerts).forEach((a) => {
    const key = alertDedupeKey(a);
    if (!key) return;
    map.set(key, a);
  });
  asArray(alertLogs).forEach((a) => {
    const key = alertDedupeKey(a);
    if (!key) {
      // keep unmatched logs with unique fallback key
      map.set(`log_${a.log_id || Math.random()}`, a);
      return;
    }
    map.set(key, { ...a, source: a.source || 'alert_log' });
  });
  return [...map.values()];
}
