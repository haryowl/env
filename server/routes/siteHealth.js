const express = require('express');
const moment = require('moment-timezone');
const { getRows } = require('../config/database');
const { authenticateToken, authorizeMenuAccess } = require('../middleware/auth');
const { alertAppliesToDevice } = require('../utils/alertDevices');
const { SITE_HEALTH_MENU_PATH } = require('../utils/ensureSiteHealthMenu');

const router = express.Router();
router.use(authenticateToken);

const MAX_DEVICES = 80;
const MAX_PARAMETERS = 12;
const MENU_PATH = SITE_HEALTH_MENU_PATH;

const NUMERIC_SQL = `CASE
  WHEN sr.value IS NULL THEN NULL
  WHEN btrim(sr.value::text) ~ '^-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?$'
    THEN btrim(sr.value::text)::float8
  ELSE NULL
END`;

const STATUS_RANK = {
  ok: 0,
  no_data: 1,
  no_threshold: 2,
  watch: 3,
  not_ok: 4,
};

function mappingTarget(mapping) {
  return mapping?.target_field ?? mapping?.target ?? null;
}

function mappingSource(mapping) {
  return mapping?.source_field ?? mapping?.source ?? null;
}

function parseMappings(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function sensorTypesForParameter(mappings, parameter) {
  const types = new Set();
  for (const mapping of parseMappings(mappings)) {
    const tgt = mappingTarget(mapping);
    if (String(tgt || '').trim() !== String(parameter)) continue;
    const src = mappingSource(mapping);
    [src, tgt].forEach((key) => {
      const k = String(key || '').trim();
      if (k) types.add(k);
    });
  }
  if (types.size === 0) types.add(String(parameter).trim());
  return [...types];
}

function collectParameters(devices) {
  const set = new Set();
  for (const device of devices) {
    for (const mapping of parseMappings(device.mappings)) {
      const tgt = mappingTarget(mapping);
      if (tgt) set.add(String(tgt).trim());
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function toFinite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseList(value) {
  if (value == null || value === '') return [];
  const parts = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(parts.map((p) => String(p).trim()).filter(Boolean))];
}

function mergeThresholds(alerts) {
  let min = null;
  let max = null;
  for (const alert of alerts) {
    const aMin = toFinite(alert.min);
    const aMax = toFinite(alert.max);
    if (aMin != null) min = min == null ? aMin : Math.max(min, aMin);
    if (aMax != null) max = max == null ? aMax : Math.min(max, aMax);
  }
  if (min != null && max != null && min > max) {
    return { min: null, max: null, invalid: true };
  }
  return { min, max, invalid: false };
}

function inRange(value, min, max) {
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return min != null || max != null;
}

function scoreHealth({ sampleCount, lastValue, pctInRange, min, max, invalidRange }) {
  if (!sampleCount) {
    return { status: 'no_data', label: 'No data', statusLabel: 'No data' };
  }
  if (invalidRange || (min == null && max == null)) {
    return { status: 'no_threshold', label: 'No threshold', statusLabel: 'No threshold' };
  }
  if (lastValue != null && !inRange(lastValue, min, max)) {
    return { status: 'not_ok', label: 'Not OK', statusLabel: 'Not OK' };
  }
  if (pctInRange != null && pctInRange < 70) {
    return { status: 'not_ok', label: 'Not OK', statusLabel: 'Not OK' };
  }
  if (pctInRange != null && pctInRange < 90) {
    return { status: 'watch', label: 'Watch', statusLabel: 'Watch' };
  }
  return { status: 'ok', label: 'OK', statusLabel: 'OK' };
}

function worstHealth(items) {
  if (!items.length) return { status: 'no_data', label: 'No data', statusLabel: 'No data' };
  return items.reduce((worst, item) => (
    (STATUS_RANK[item.status] || 0) > (STATUS_RANK[worst.status] || 0) ? item : worst
  ));
}

function resolveTimezone(raw) {
  const tz = String(raw || '').trim() || 'UTC';
  return moment.tz.zone(tz) ? tz : 'UTC';
}

function periodWindow(period, tz) {
  const now = moment.tz(tz);
  const end = now.clone();
  const start = period === 'month' ? now.clone().startOf('month') : now.clone().startOf('isoWeek');
  return { start: start.toDate(), end: end.toDate(), startIso: start.toISOString(), endIso: end.toISOString() };
}

function scopedDeviceIds(req) {
  if (req.allowedDeviceIdsForData !== null && req.allowedDeviceIdsForData !== undefined) {
    return req.allowedDeviceIdsForData;
  }
  if (req.allowedDeviceIds !== null && req.allowedDeviceIds !== undefined) {
    return req.allowedDeviceIds;
  }
  return null;
}

async function loadGroupDevices(req, groupId) {
  const allowed = scopedDeviceIds(req);
  const params = [];
  const where = ['COALESCE(d.is_deleted, false) = false'];
  let idx = 1;

  if (Array.isArray(allowed)) {
    if (allowed.length === 0) return [];
    where.push(`d.device_id = ANY($${idx++})`);
    params.push(allowed);
  }

  if (groupId === 'ungrouped') {
    where.push('d.group_id IS NULL');
  } else if (groupId && groupId !== 'all') {
    where.push(`d.group_id = $${idx++}`);
    params.push(groupId);
  }

  return getRows(
    `SELECT d.device_id, d.name, d.group_id, dg.name AS group_name,
            dma.template_id, mt.mappings
     FROM devices d
     LEFT JOIN device_groups dg ON d.group_id = dg.group_id
     LEFT JOIN device_mapper_assignments dma ON d.device_id = dma.device_id
     LEFT JOIN mapper_templates mt ON dma.template_id = mt.template_id
     WHERE ${where.join(' AND ')}
     ORDER BY d.name ASC`,
    params
  );
}

router.get('/', authorizeMenuAccess(MENU_PATH, 'access'), async (req, res) => {
  try {
    const groupId = String(req.query.groupId || 'all').trim() || 'all';
    const requestedDeviceIds = parseList(req.query.deviceIds || req.query.deviceId);
    const selectedParameters = parseList(req.query.parameters || req.query.parameter);
    const period = req.query.period === 'month' ? 'month' : 'week';
    const timezone = resolveTimezone(req.query.timezone);

    const groupDevices = await loadGroupDevices(req, groupId);
    let devices = groupDevices;
    if (requestedDeviceIds.length) {
      devices = groupDevices.filter((d) => requestedDeviceIds.includes(String(d.device_id)));
    }
    const parametersCatalog = collectParameters(groupDevices);

    if (devices.length > MAX_DEVICES) {
      return res.status(400).json({
        error: `This selection has ${devices.length} devices. Pick fewer devices or a smaller group (max ${MAX_DEVICES}).`,
        code: 'TOO_MANY_DEVICES',
        parameters: parametersCatalog,
        devices: [],
        rows: [],
      });
    }

    if (selectedParameters.length > MAX_PARAMETERS) {
      return res.status(400).json({
        error: `Pick at most ${MAX_PARAMETERS} parameters.`,
        code: 'TOO_MANY_PARAMETERS',
        parameters: parametersCatalog,
        rows: [],
      });
    }

    const payload = {
      groupId,
      parameter: selectedParameters[0] || null,
      parameters: parametersCatalog,
      selectedParameters,
      period,
      timezone,
      chartMetric: selectedParameters.length > 1 ? 'overallPctInRange' : 'periodAverage',
      range: periodWindow(period, timezone),
      rows: [],
      summary: { ok: 0, watch: 0, not_ok: 0, no_data: 0, no_threshold: 0 },
    };

    if (!selectedParameters.length || !devices.length) {
      return res.json(payload);
    }

    const alerts = await getRows(
      `SELECT alert_id, name, device_id, device_ids, parameter, min, max, type
       FROM alerts
       WHERE type = 'threshold' AND parameter = ANY($1)`,
      [selectedParameters]
    );

    const threshKey = (deviceId, parameter) => `${String(deviceId)}::${parameter}`;
    const thresholdsByKey = {};
    for (const device of devices) {
      for (const parameter of selectedParameters) {
        const matching = (alerts || []).filter(
          (alert) => String(alert.parameter) === parameter && alertAppliesToDevice(alert, device.device_id)
        );
        thresholdsByKey[threshKey(device.device_id, parameter)] = mergeThresholds(matching);
      }
    }

    const pairDeviceIds = [];
    const pairSensorTypes = [];
    const pairParameters = [];
    for (const device of devices) {
      for (const parameter of selectedParameters) {
        const types = sensorTypesForParameter(device.mappings, parameter);
        for (const sensorType of types) {
          pairDeviceIds.push(String(device.device_id));
          pairSensorTypes.push(sensorType);
          pairParameters.push(parameter);
        }
      }
    }

    const emptyParamScore = (device, parameter) => {
      const thresh = thresholdsByKey[threshKey(device.device_id, parameter)] || {};
      return {
        parameter,
        ...scoreHealth({ sampleCount: 0, min: thresh.min, max: thresh.max, invalidRange: thresh.invalid }),
        sampleCount: 0,
        dayCount: 0,
        periodAverage: null,
        lastValue: null,
        pctInRange: null,
        min: thresh.min ?? null,
        max: thresh.max ?? null,
      };
    };

    let dayMap = {};
    let lastMap = {};
    let rangeMap = {};
    const { start, end } = payload.range;

    if (pairDeviceIds.length) {
      const dayRows = await getRows(
        `WITH pairs AS (
           SELECT unnest($1::text[]) AS device_id,
                  unnest($2::text[]) AS sensor_type,
                  unnest($3::text[]) AS parameter
         ),
         numbered AS (
           SELECT sr.device_id, p.parameter,
                  (sr.timestamp AT TIME ZONE $6)::date AS day,
                  ${NUMERIC_SQL} AS num_value
           FROM sensor_readings sr
           INNER JOIN pairs p ON p.device_id = sr.device_id::text AND p.sensor_type = sr.sensor_type
           WHERE sr.timestamp >= $4 AND sr.timestamp <= $5
         )
         SELECT device_id, parameter,
                AVG(day_avg)::float8 AS period_average,
                SUM(sample_count)::int AS sample_count,
                COUNT(*)::int AS day_count
         FROM (
           SELECT device_id, parameter, day, AVG(num_value) AS day_avg,
                  COUNT(*) FILTER (WHERE num_value IS NOT NULL) AS sample_count
           FROM numbered
           WHERE num_value IS NOT NULL
           GROUP BY device_id, parameter, day
         ) daily
         GROUP BY device_id, parameter`,
        [pairDeviceIds, pairSensorTypes, pairParameters, start, end, timezone]
      );

      const lastRows = await getRows(
        `WITH pairs AS (
           SELECT unnest($1::text[]) AS device_id,
                  unnest($2::text[]) AS sensor_type,
                  unnest($3::text[]) AS parameter
         )
         SELECT DISTINCT ON (sr.device_id, p.parameter)
                sr.device_id, p.parameter,
                ${NUMERIC_SQL} AS last_value,
                sr.timestamp AS last_at
         FROM sensor_readings sr
         INNER JOIN pairs p ON p.device_id = sr.device_id::text AND p.sensor_type = sr.sensor_type
         WHERE sr.timestamp >= $4 AND sr.timestamp <= $5
           AND ${NUMERIC_SQL} IS NOT NULL
         ORDER BY sr.device_id, p.parameter, sr.timestamp DESC`,
        [pairDeviceIds, pairSensorTypes, pairParameters, start, end]
      );

      const rangeRows = await getRows(
        `WITH pairs AS (
           SELECT unnest($1::text[]) AS device_id,
                  unnest($2::text[]) AS sensor_type,
                  unnest($3::text[]) AS parameter
         ),
         thresh AS (
           SELECT t.device_id, t.parameter, t.min_v, t.max_v
           FROM jsonb_to_recordset($4::jsonb)
             AS t(device_id text, parameter text, min_v float8, max_v float8)
         )
         SELECT sr.device_id, p.parameter,
                COUNT(*) FILTER (WHERE ${NUMERIC_SQL} IS NOT NULL)::int AS sample_count,
                COUNT(*) FILTER (
                  WHERE ${NUMERIC_SQL} IS NOT NULL
                    AND (t.min_v IS NULL OR ${NUMERIC_SQL} >= t.min_v)
                    AND (t.max_v IS NULL OR ${NUMERIC_SQL} <= t.max_v)
                    AND (t.min_v IS NOT NULL OR t.max_v IS NOT NULL)
                )::int AS in_range_count
         FROM sensor_readings sr
         INNER JOIN pairs p ON p.device_id = sr.device_id::text AND p.sensor_type = sr.sensor_type
         LEFT JOIN thresh t ON t.device_id = sr.device_id::text AND t.parameter = p.parameter
         WHERE sr.timestamp >= $5 AND sr.timestamp <= $6
         GROUP BY sr.device_id, p.parameter`,
        [
          pairDeviceIds,
          pairSensorTypes,
          pairParameters,
          JSON.stringify(devices.flatMap((d) => selectedParameters.map((parameter) => {
            const thresh = thresholdsByKey[threshKey(d.device_id, parameter)] || {};
            return {
              device_id: String(d.device_id),
              parameter,
              min_v: thresh.min ?? null,
              max_v: thresh.max ?? null,
            };
          }))),
          start,
          end,
        ]
      );

      const byPair = (rows) => {
        const map = {};
        for (const row of rows || []) {
          map[threshKey(row.device_id, row.parameter)] = row;
        }
        return map;
      };
      dayMap = byPair(dayRows);
      lastMap = byPair(lastRows);
      rangeMap = byPair(rangeRows);
    }

    const summary = { ok: 0, watch: 0, not_ok: 0, no_data: 0, no_threshold: 0 };

    payload.rows = devices.map((device) => {
      const byParameter = {};
      const paramScores = selectedParameters.map((parameter) => {
        const key = threshKey(device.device_id, parameter);
        const thresh = thresholdsByKey[key] || {};
        const day = dayMap[key];
        const last = lastMap[key];
        const rangeStats = rangeMap[key];
        const sampleCount = Number(day?.sample_count || rangeStats?.sample_count || 0);
        const inRangeCount = Number(rangeStats?.in_range_count || 0);
        const hasBound = thresh.min != null || thresh.max != null;
        const pctInRange = hasBound && sampleCount > 0
          ? (inRangeCount / Number(rangeStats?.sample_count || sampleCount)) * 100
          : null;
        const scored = {
          parameter,
          ...scoreHealth({
            sampleCount,
            lastValue: toFinite(last?.last_value),
            pctInRange,
            min: thresh.min,
            max: thresh.max,
            invalidRange: thresh.invalid,
          }),
          sampleCount,
          dayCount: Number(day?.day_count || 0),
          periodAverage: toFinite(day?.period_average),
          lastValue: toFinite(last?.last_value),
          lastAt: last?.last_at || null,
          pctInRange,
          min: thresh.min ?? null,
          max: thresh.max ?? null,
        };
        byParameter[parameter] = scored;
        return scored;
      });

      const overall = worstHealth(paramScores);
      const pctValues = paramScores.map((p) => p.pctInRange).filter((v) => v != null);
      const overallPctInRange = pctValues.length
        ? pctValues.reduce((sum, v) => sum + v, 0) / pctValues.length
        : null;
      const primary = paramScores[0] || emptyParamScore(device, selectedParameters[0]);
      summary[overall.status] = (summary[overall.status] || 0) + 1;

      return {
        deviceId: device.device_id,
        name: device.name,
        groupName: device.group_name,
        ...overall,
        periodAverage: selectedParameters.length === 1 ? primary.periodAverage : null,
        lastValue: selectedParameters.length === 1 ? primary.lastValue : null,
        lastAt: selectedParameters.length === 1 ? primary.lastAt : null,
        pctInRange: selectedParameters.length === 1 ? primary.pctInRange : overallPctInRange,
        overallPctInRange,
        sampleCount: selectedParameters.length === 1 ? primary.sampleCount : paramScores.reduce((s, p) => s + (p.sampleCount || 0), 0),
        dayCount: selectedParameters.length === 1 ? primary.dayCount : Math.max(...paramScores.map((p) => p.dayCount || 0), 0),
        min: selectedParameters.length === 1 ? primary.min : null,
        max: selectedParameters.length === 1 ? primary.max : null,
        byParameter,
      };
    });

    payload.rows.sort((a, b) => {
      const rankDiff = (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0);
      if (rankDiff) return rankDiff;
      const av = selectedParameters.length === 1 ? a.periodAverage : a.overallPctInRange;
      const bv = selectedParameters.length === 1 ? b.periodAverage : b.overallPctInRange;
      if (av == null && bv == null) return String(a.name || '').localeCompare(String(b.name || ''));
      if (av == null) return 1;
      if (bv == null) return -1;
      return selectedParameters.length === 1 ? bv - av : av - bv;
    });
    payload.summary = summary;
    res.json(payload);
  } catch (error) {
    console.error('Site health error:', error);
    res.status(500).json({
      error: 'Failed to compute site health',
      code: 'SITE_HEALTH_ERROR',
      details: error.message,
    });
  }
});

module.exports = router;
