import moment from 'moment-timezone';
import { getUserTimezone, formatInUserTimezone } from './timezoneUtils';

export const REALTIME_CHART_DISPLAY_MODES = {
  INSTANT: 'instant',
  AVG_HOUR: 'avg_hour',
  TOTAL_HOUR: 'total_hour',
};

export const REALTIME_CHART_DISPLAY_OPTIONS = [
  { value: REALTIME_CHART_DISPLAY_MODES.INSTANT, label: 'Instant' },
  { value: REALTIME_CHART_DISPLAY_MODES.AVG_HOUR, label: 'Avg / hour' },
  { value: REALTIME_CHART_DISPLAY_MODES.TOTAL_HOUR, label: 'Total / hour' },
];

export function isHourlyChartDisplayMode(mode) {
  return (
    mode === REALTIME_CHART_DISPLAY_MODES.AVG_HOUR ||
    mode === REALTIME_CHART_DISPLAY_MODES.TOTAL_HOUR
  );
}

export function hourlyChartDisplayLabel(mode) {
  if (mode === REALTIME_CHART_DISPLAY_MODES.AVG_HOUR) {
    return 'Average per calendar hour (user timezone)';
  }
  if (mode === REALTIME_CHART_DISPLAY_MODES.TOTAL_HOUR) {
    return 'Sum of readings per calendar hour (best for rainfall, counters)';
  }
  return '';
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function rowInstant(row) {
  const raw = row?.datetime ?? row?.timestamp ?? row?.originalTimestamp;
  if (raw == null || raw === '') return null;
  const m = moment.utc(raw);
  return m.isValid() ? m : null;
}

/**
 * Build chart series from raw /data-dash rows.
 * `timestamp` and `originalTimestamp` are always UTC ISO strings; format for display in the chart axis/tooltip only.
 * @param {object[]} rows
 * @param {string[]} params - numeric series keys (no datetime/timestamp)
 * @param {'instant'|'avg_hour'|'total_hour'} mode
 */
export function buildRealtimeChartSeries(rows, params, mode) {
  if (!rows?.length) return [];

  const sorted = [...rows].sort((a, b) => {
    const ta = rowInstant(a)?.valueOf() ?? 0;
    const tb = rowInstant(b)?.valueOf() ?? 0;
    return ta - tb;
  });

  if (!mode || mode === REALTIME_CHART_DISPLAY_MODES.INSTANT) {
    return sorted.map((r) => {
      const iso = r.timestamp || r.datetime;
      return {
        ...r,
        originalTimestamp: iso,
        timestamp: iso,
      };
    });
  }

  const tz = getUserTimezone();
  const useSum = mode === REALTIME_CHART_DISPLAY_MODES.TOTAL_HOUR;
  const buckets = new Map();

  for (const row of sorted) {
    const m = rowInstant(row);
    if (!m) continue;
    const hourLocal = m.tz(tz).startOf('hour');
    const hourKey = hourLocal.format('YYYY-MM-DD HH:00');
    if (!buckets.has(hourKey)) {
      buckets.set(hourKey, {
        originalTimestamp: hourLocal.toISOString(),
        sums: {},
        counts: {},
      });
    }
    const bucket = buckets.get(hourKey);
    for (const p of params) {
      const v = parseNumeric(row[p]);
      if (v === null) continue;
      bucket.sums[p] = (bucket.sums[p] || 0) + v;
      bucket.counts[p] = (bucket.counts[p] || 0) + 1;
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bucket]) => {
      const point = {
        timestamp: bucket.originalTimestamp,
        originalTimestamp: bucket.originalTimestamp,
        _hourlyAggregate: mode,
      };
      for (const p of params) {
        const n = bucket.counts[p] || 0;
        if (n === 0) continue;
        point[p] = useSum ? bucket.sums[p] : bucket.sums[p] / n;
        point[`_n_${p}`] = n;
      }
      return point;
    });
}

/** Format chart tooltip time from payload (avoids double timezone conversion). */
export function formatChartTooltipTime(payload, label) {
  const iso = payload?.[0]?.payload?.originalTimestamp ?? payload?.[0]?.payload?.timestamp;
  if (iso != null && iso !== '') {
    return formatInUserTimezone(iso);
  }
  if (typeof label === 'string' && label.includes('T')) {
    return formatInUserTimezone(label);
  }
  return label || '-';
}
