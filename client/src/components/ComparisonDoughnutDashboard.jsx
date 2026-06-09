import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Alert,
  Stack,
  Chip,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import moment from 'moment-timezone';
import { API_BASE_URL } from '../config/api';
import { getChartCardSx } from '../utils/chartStyles';
import { getDeviceDisplayName } from '../utils/deviceLabel';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { filterDataViewParams } from '../utils/fieldCategory';

const getUserTimezone = () => localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';

const METRIC_OPTIONS = [
  { id: 'realtime', label: 'Realtime A vs B' },
  { id: 'sum', label: 'Sum of samples' },
  { id: 'avg', label: 'Average of samples' },
  { id: 'accum', label: 'Accumulation (last − first in period)' },
];

const PERIOD_OPTIONS = [
  { id: 'day', label: 'Today vs yesterday' },
  { id: 'week', label: 'This week vs last week' },
  { id: 'month', label: 'This month vs last month' },
];

const COLORS = {
  primary: '#0d9488',
  secondary: '#6366f1',
  today: '#059669',
  yesterday: '#64748b',
  dominant: '#16a34a',
  other: '#3b82f6',
};

function parseNum(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

function rowMoment(row, tz) {
  const raw = row.datetime || row.timestamp;
  if (!raw) return null;
  return moment.utc(raw).tz(tz);
}

/** Bucket rows by calendar day in tz; sum and count per day for one parameter */
function aggregateDays(rows, param, tz) {
  const todayKey = moment.tz(tz).format('YYYY-MM-DD');
  const yestKey = moment.tz(tz).subtract(1, 'day').format('YYYY-MM-DD');
  let sumToday = 0;
  let sumYest = 0;
  let nToday = 0;
  let nYest = 0;

  for (const row of rows) {
    const raw = row.datetime || row.timestamp;
    if (!raw) continue;
    const dayKey = moment.utc(raw).tz(tz).format('YYYY-MM-DD');
    const v = parseNum(row[param]);
    if (Number.isNaN(v)) continue;
    if (dayKey === todayKey) {
      sumToday += v;
      nToday += 1;
    } else if (dayKey === yestKey) {
      sumYest += v;
      nYest += 1;
    }
  }

  return {
    sumToday,
    sumYest,
    avgToday: nToday > 0 ? sumToday / nToday : 0,
    avgYest: nYest > 0 ? sumYest / nYest : 0,
    nToday,
    nYest,
  };
}

function rowsInClosedRange(rows, tz, start, end) {
  return rows.filter((r) => {
    const m = rowMoment(r, tz);
    return m && m.isSameOrAfter(start) && m.isSameOrBefore(end);
  });
}

function sumAvgInRange(rows, param, tz, start, end) {
  let sum = 0;
  let n = 0;
  for (const row of rowsInClosedRange(rows, tz, start, end)) {
    const v = parseNum(row[param]);
    if (Number.isNaN(v)) continue;
    sum += v;
    n += 1;
  }
  return { sum, n, avg: n > 0 ? sum / n : 0 };
}

/** Monotonic-style delta: last reading in window minus first (by time). */
function accumInRange(rows, param, tz, start, end) {
  const list = rowsInClosedRange(rows, tz, start, end)
    .map((r) => {
      const m = rowMoment(r, tz);
      const v = parseNum(r[param]);
      return m && Number.isFinite(v) ? { t: m.valueOf(), v } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
  if (list.length < 2) {
    return { delta: 0, n: list.length, ok: list.length >= 2 };
  }
  return { delta: list[list.length - 1].v - list[0].v, n: list.length, ok: true };
}

/** Start/end moments for “current” vs “previous” windows (inclusive). */
function getComparisonWindows(tz, periodPair) {
  const now = moment.tz(tz);
  if (periodPair === 'day') {
    const todayStart = now.clone().startOf('day');
    const yestStart = todayStart.clone().subtract(1, 'day');
    const yestEnd = todayStart.clone().subtract(1, 'millisecond');
    return {
      curStart: todayStart,
      curEnd: now.clone(),
      prevStart: yestStart,
      prevEnd: yestEnd,
      curLabel: 'Today',
      prevLabel: 'Yesterday',
    };
  }
  if (periodPair === 'week') {
    const thisWeekStart = now.clone().startOf('isoWeek');
    const prevWeekStart = thisWeekStart.clone().subtract(1, 'week');
    const prevWeekEnd = thisWeekStart.clone().subtract(1, 'millisecond');
    return {
      curStart: thisWeekStart,
      curEnd: now.clone(),
      prevStart: prevWeekStart,
      prevEnd: prevWeekEnd,
      curLabel: 'This week',
      prevLabel: 'Last week',
    };
  }
  const thisMonthStart = now.clone().startOf('month');
  const prevMonthStart = thisMonthStart.clone().subtract(1, 'month');
  const prevMonthEnd = thisMonthStart.clone().subtract(1, 'millisecond');
  return {
    curStart: thisMonthStart,
    curEnd: now.clone(),
    prevStart: prevMonthStart,
    prevEnd: prevMonthEnd,
    curLabel: 'This month',
    prevLabel: 'Last month',
  };
}

function getFetchBounds(tz, periodPair) {
  const w = getComparisonWindows(tz, periodPair);
  return { start: w.prevStart.clone(), end: w.curEnd.clone() };
}

/**
 * @returns {{ v1: number, v2: number, label1: string, label2: string, n1: number, n2: number, accumWarning?: string }}
 */
function computeHistoricalPair(rows, param, tz, metricKind, periodPair) {
  const w = getComparisonWindows(tz, periodPair);
  const p = param;
  const metricLabel =
    metricKind === 'sum' ? 'sum' : metricKind === 'avg' ? 'avg' : 'accumulation';

  if (periodPair === 'day' && (metricKind === 'sum' || metricKind === 'avg')) {
    const agg = aggregateDays(rows, p, tz);
    const isSum = metricKind === 'sum';
    const v1 = isSum ? agg.sumToday : agg.avgToday;
    const v2 = isSum ? agg.sumYest : agg.avgYest;
    const n1 = agg.nToday;
    const n2 = agg.nYest;
    return {
      v1,
      v2,
      label1: `${w.curLabel} (${p} ${metricLabel})`,
      label2: `${w.prevLabel} (${p} ${metricLabel})`,
      n1,
      n2,
    };
  }

  if (metricKind === 'sum') {
    const a = sumAvgInRange(rows, p, tz, w.curStart, w.curEnd);
    const b = sumAvgInRange(rows, p, tz, w.prevStart, w.prevEnd);
    return {
      v1: a.sum,
      v2: b.sum,
      label1: `${w.curLabel} (${p} sum)`,
      label2: `${w.prevLabel} (${p} sum)`,
      n1: a.n,
      n2: b.n,
    };
  }

  if (metricKind === 'avg') {
    const a = sumAvgInRange(rows, p, tz, w.curStart, w.curEnd);
    const b = sumAvgInRange(rows, p, tz, w.prevStart, w.prevEnd);
    return {
      v1: a.avg,
      v2: b.avg,
      label1: `${w.curLabel} (${p} avg)`,
      label2: `${w.prevLabel} (${p} avg)`,
      n1: a.n,
      n2: b.n,
    };
  }

  // accumulation
  const a = accumInRange(rows, p, tz, w.curStart, w.curEnd);
  const b = accumInRange(rows, p, tz, w.prevStart, w.prevEnd);
  let accumWarning;
  if (!a.ok || !b.ok) {
    accumWarning =
      'Accumulation needs at least two readings in each period (monotonic totalizers). Single-point windows count as 0 delta.';
  }
  return {
    v1: a.delta,
    v2: b.delta,
    label1: `${w.curLabel} (${p} Δ)`,
    label2: `${w.prevLabel} (${p} Δ)`,
    n1: a.n,
    n2: b.n,
    accumWarning,
  };
}

export default function ComparisonDoughnutDashboard() {
  const theme = useTheme();
  const { metadata: fieldMetadata } = useFieldMetadata();
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [paramList, setParamList] = useState([]);
  const [metricKind, setMetricKind] = useState('realtime');
  const [periodPair, setPeriodPair] = useState('day');
  const [paramA, setParamA] = useState('');
  const [paramB, setParamB] = useState('');
  const [paramSingle, setParamSingle] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartData, setChartData] = useState([]);
  const [caption, setCaption] = useState('');
  const [deltaPct, setDeltaPct] = useState(null);
  const [notice, setNotice] = useState('');

  const tz = useMemo(() => getUserTimezone(), []);

  const loadDevices = useCallback(async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/devices/dropdown`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setDevices(list.filter((d) => d?.status !== 'deleted' && d?.is_deleted !== true));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadParamsForDevice = useCallback(async (id) => {
    if (!id) {
      setParamList([]);
      return;
    }
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/device-mapper-assignments/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setParamList([]);
        return;
      }
      const json = await res.json();
      const mappings = json.assignment?.mappings || [];
      const names = filterDataViewParams(
        [
          ...new Set(
            mappings
              .map((m) => m.target_field)
              .filter(
                (f) =>
                  f &&
                  !['datetime', 'timestamp', 'device_id', 'device_name'].includes(f)
              )
          ),
        ],
        fieldMetadata
      );
      setParamList(names.sort());
    } catch {
      setParamList([]);
    }
  }, [fieldMetadata]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    loadParamsForDevice(deviceId);
  }, [deviceId, loadParamsForDevice]);

  const fetchRealtime = useCallback(async () => {
    const token = localStorage.getItem('iot_token');
    const res = await fetch(`${API_BASE_URL}/devices/${deviceId}/latest-data?excludeCategories=Status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load latest data');
    }
    const json = await res.json();
    return json.data || {};
  }, [deviceId]);

  const fetchDataDashWindow = useCallback(
    async (param, startIso, endIso) => {
      const token = localStorage.getItem('iot_token');
      const params = new URLSearchParams({
        deviceIds: deviceId,
        parameters: param,
        startDate: startIso,
        endDate: endIso,
        limit: '100000',
        export: 'true',
        excludeCategories: 'Status',
      });
      const res = await fetch(`${API_BASE_URL}/data-dash?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load historical data');
      }
      const json = await res.json();
      return json.data || [];
    },
    [deviceId]
  );

  const runLoadRef = useRef(async () => {});

  const runLoad = useCallback(async () => {
    setError('');
    setCaption('');
    setNotice('');
    setDeltaPct(null);
    setChartData([]);

    if (!deviceId) {
      setError('Select a device');
      return;
    }

    if (metricKind === 'realtime') {
      if (!paramA || !paramB || paramA === paramB) {
        setError('Select two different parameters');
        return;
      }
    } else {
      if (!paramSingle) {
        setError('Select a parameter');
        return;
      }
    }

    setLoading(true);
    try {
      if (metricKind === 'realtime') {
        const data = await fetchRealtime();
        const A = parseNum(data[paramA]);
        const B = parseNum(data[paramB]);
        if (Number.isNaN(A) || Number.isNaN(B)) {
          setError('Latest values missing for one or both parameters');
          setLoading(false);
          return;
        }
        const T = A + B;
        if (T <= 0) {
          setError('A + B must be positive to show the chart');
          setLoading(false);
          return;
        }
        const segA = (A / T) * 100;
        const segB = (B / T) * 100;
        setChartData([
          { name: paramA, value: A, pct: segA },
          { name: paramB, value: B, pct: segB },
        ]);
        setCaption(`Share of total (A + B): ${paramA} ${segA.toFixed(1)}% · ${paramB} ${segB.toFixed(1)}%`);
      } else {
        const { start, end } = getFetchBounds(tz, periodPair);
        const rows = await fetchDataDashWindow(
          paramSingle,
          start.toISOString(),
          end.toISOString()
        );
        const pair = computeHistoricalPair(rows, paramSingle, tz, metricKind, periodPair);
        const { v1: S1, v2: S2, label1, label2, n1, n2, accumWarning } = pair;

        if (accumWarning) setNotice(accumWarning);

        if (n1 === 0 && n2 === 0) {
          setError('No data in the selected range for this parameter');
          setLoading(false);
          return;
        }

        const T = S1 + S2;
        if (!Number.isFinite(S1) || !Number.isFinite(S2) || !Number.isFinite(T) || T <= 0) {
          setError('Cannot compute chart (values must sum to a positive total)');
          setLoading(false);
          return;
        }
        const p1 = (S1 / T) * 100;
        const p2 = (S2 / T) * 100;
        setChartData([
          { name: label1, value: S1, pct: p1 },
          { name: label2, value: S2, pct: p2 },
        ]);
        setCaption(
          `${label1}: ${S1.toFixed(3)} · ${label2}: ${S2.toFixed(3)}`
        );
        setDeltaPct(S2 !== 0 ? ((S1 - S2) / S2) * 100 : null);
      }
    } catch (e) {
      setError(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [
    deviceId,
    metricKind,
    periodPair,
    paramA,
    paramB,
    paramSingle,
    fetchRealtime,
    fetchDataDashWindow,
    tz,
  ]);

  runLoadRef.current = runLoad;

  useEffect(() => {
    if (metricKind !== 'realtime' || !deviceId || !paramA || !paramB || paramA === paramB) return;
    const id = setInterval(() => runLoadRef.current(), 60000);
    return () => clearInterval(id);
  }, [metricKind, deviceId, paramA, paramB]);

  const cellColors = useMemo(() => {
    if (chartData.length !== 2) return [COLORS.primary, COLORS.secondary];
    const [a, b] = chartData;
    if (metricKind === 'realtime') {
      return a.value >= b.value
        ? [COLORS.dominant, COLORS.other]
        : [COLORS.other, COLORS.dominant];
    }
    return [COLORS.today, COLORS.yesterday];
  }, [chartData, metricKind]);

  return (
    <Box sx={{ p: 2, maxWidth: 960, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, color: 'primary.main' }}>
        Comparison metrics
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Compare two numbers as shares of their total. <strong>Realtime</strong> uses latest
        A vs B. <strong>Sum / Average</strong> use all samples in each window (day, ISO week, or
        calendar month vs the previous period). <strong>Accumulation</strong> is for monotonic
        totalizers: each slice is (last reading − first reading) in that window — e.g. midnight
        100 → midnight 150 gives a daily accumulation of 50 for that day.
      </Typography>

      <Card sx={{ ...getChartCardSx(theme), mb: 2 }}>
        <CardContent>
          <Stack spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Device</InputLabel>
              <Select
                value={deviceId}
                label="Device"
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {devices.map((d) => (
                  <MenuItem key={d.device_id} value={d.device_id}>
                    {getDeviceDisplayName(d)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Metric</InputLabel>
              <Select
                label="Metric"
                value={metricKind}
                onChange={(e) => setMetricKind(e.target.value)}
              >
                {METRIC_OPTIONS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" disabled={metricKind === 'realtime'}>
              <InputLabel>Period</InputLabel>
              <Select
                label="Period"
                value={periodPair}
                onChange={(e) => setPeriodPair(e.target.value)}
              >
                {PERIOD_OPTIONS.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {metricKind === 'realtime' ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Parameter A</InputLabel>
                  <Select
                    value={paramA}
                    label="Parameter A"
                    onChange={(e) => setParamA(e.target.value)}
                  >
                    {paramList.map((p) => (
                      <MenuItem key={p} value={p}>
                        {p}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <InputLabel>Parameter B</InputLabel>
                  <Select
                    value={paramB}
                    label="Parameter B"
                    onChange={(e) => setParamB(e.target.value)}
                  >
                    {paramList.map((p) => (
                      <MenuItem key={p} value={p}>
                        {p}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            ) : (
              <FormControl fullWidth size="small">
                <InputLabel>Parameter</InputLabel>
                <Select
                  value={paramSingle}
                  label="Parameter"
                  onChange={(e) => setParamSingle(e.target.value)}
                >
                  {paramList.map((p) => (
                    <MenuItem key={p} value={p}>
                      {p}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="contained" onClick={runLoad} disabled={loading}>
                {loading ? <CircularProgress size={20} /> : 'Load chart'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={runLoad}
                disabled={loading}
              >
                Refresh
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {notice && !error && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}

      {chartData.length === 2 && (
        <Card sx={getChartCardSx(theme)}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Doughnut (share of total)
            </Typography>
            <Box sx={{ width: '100%', height: 360 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={120}
                    paddingAngle={2}
                    label={({ name, pct }) => `${name}: ${pct.toFixed(1)}%`}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={cellColors[i]} stroke="#fff" strokeWidth={1} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _n, p) => [
                      `${Number(value).toFixed(4)} (${p.payload.pct.toFixed(2)}%)`,
                      p.payload.name,
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Box>
            {caption && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {caption}
              </Typography>
            )}
            {deltaPct !== null && metricKind !== 'realtime' && (
              <Chip
                sx={{ mt: 1 }}
                label={`Δ vs previous period: ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`}
                color={deltaPct >= 0 ? 'success' : 'error'}
                variant="outlined"
              />
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
