import moment from 'moment-timezone';
import { getUserTimezone, formatInUserTimezone } from './timezoneUtils';
import {
  VALUE_KINDS,
  getEffectiveValueKind,
  getRateToHourlyFactor,
} from './valueKind';

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
    return 'Hourly total per calendar hour: flow rates use avg × 60 (L/min → L/h); rainfall/counters use sum; levels use average';
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

function aggregateHourlyValue(param, bucket, mode, fieldMetadata) {
  const n = bucket.counts[param] || 0;
  if (n === 0) return null;

  const sum = bucket.sums[param];
  const avg = sum / n;

  if (mode === REALTIME_CHART_DISPLAY_MODES.AVG_HOUR) {
    return avg;
  }

  const kind = getEffectiveValueKind(param, fieldMetadata);
  if (kind === VALUE_KINDS.RATE) {
    const unit = fieldMetadata?.[param]?.unit || '';
    return avg * getRateToHourlyFactor(unit);
  }
  if (kind === VALUE_KINDS.CUMULATIVE) {
    return sum;
  }
  return avg;
}

/**
 * Build chart series from raw /data-dash rows.
 * `datetime` is the mapped device time (primary); `timestamp` mirrors it for chart APIs.
 * @param {object[]} rows
 * @param {string[]} params - numeric series keys (no datetime/timestamp)
 * @param {'instant'|'avg_hour'|'total_hour'} mode
 * @param {Record<string, object>} [fieldMetadata] - from useFieldMetadata().metadata
 */
export function buildRealtimeChartSeries(rows, params, mode, fieldMetadata = {}) {
  if (!rows?.length) return [];

  const sorted = [...rows].sort((a, b) => {
    const ta = rowInstant(a)?.valueOf() ?? 0;
    const tb = rowInstant(b)?.valueOf() ?? 0;
    return ta - tb;
  });

  if (!mode || mode === REALTIME_CHART_DISPLAY_MODES.INSTANT) {
    return sorted.map((r) => {
      const iso = r.datetime ?? r.timestamp;
      return {
        ...r,
        originalTimestamp: iso,
        timestamp: iso,
      };
    });
  }

  const tz = getUserTimezone();
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
        point[p] = aggregateHourlyValue(p, bucket, mode, fieldMetadata);
        point[`_n_${p}`] = n;
        if (mode === REALTIME_CHART_DISPLAY_MODES.TOTAL_HOUR) {
          point[`_valueKind_${p}`] = getEffectiveValueKind(p, fieldMetadata);
        }
      }
      return point;
    });
}

/** Format chart tooltip time from payload (avoids double timezone conversion). */
export function formatChartTooltipTime(payload, label) {
  const iso = payload?.[0]?.payload?.datetime ?? payload?.[0]?.payload?.originalTimestamp ?? payload?.[0]?.payload?.timestamp;
  if (iso != null && iso !== '') {
    return formatInUserTimezone(iso);
  }
  if (typeof label === 'string' && label.includes('T')) {
    return formatInUserTimezone(label);
  }
  return label || '-';
}
