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
  ToggleButton,
  ToggleButtonGroup,
  Stack,
  Chip,
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
import { CHART_CARD_SX } from '../utils/chartStyles';

const getUserTimezone = () => localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';

const MODES = [
  { id: 'realtime_ab', label: 'Realtime A vs B' },
  { id: 'sum_day', label: 'Sum today vs yesterday' },
  { id: 'avg_day', label: 'Avg today vs yesterday' },
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

export default function ComparisonDoughnutDashboard() {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [paramList, setParamList] = useState([]);
  const [mode, setMode] = useState('realtime_ab');
  const [paramA, setParamA] = useState('');
  const [paramB, setParamB] = useState('');
  const [paramSingle, setParamSingle] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartData, setChartData] = useState([]);
  const [caption, setCaption] = useState('');
  const [deltaPct, setDeltaPct] = useState(null);

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
      setDevices(list.filter((d) => d.status !== 'deleted'));
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
      const names = [
        ...new Set(
          mappings
            .map((m) => m.target_field)
            .filter(
              (f) =>
                f &&
                !['datetime', 'timestamp', 'device_id', 'device_name'].includes(f)
            )
        ),
      ];
      setParamList(names.sort());
    } catch {
      setParamList([]);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    loadParamsForDevice(deviceId);
  }, [deviceId, loadParamsForDevice]);

  const fetchRealtime = useCallback(async () => {
    const token = localStorage.getItem('iot_token');
    const res = await fetch(`${API_BASE_URL}/devices/${deviceId}/latest-data`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load latest data');
    }
    const json = await res.json();
    return json.data || {};
  }, [deviceId]);

  const fetchDataDashRange = useCallback(async (param) => {
    const token = localStorage.getItem('iot_token');
    const start = moment.tz(tz).subtract(1, 'day').startOf('day').toISOString();
    const end = moment.tz(tz).endOf('day').toISOString();
    const params = new URLSearchParams({
      deviceIds: deviceId,
      parameters: param,
      startDate: start,
      endDate: end,
      limit: '50000',
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
  }, [deviceId, tz]);

  const runLoadRef = useRef(async () => {});

  const runLoad = useCallback(async () => {
    setError('');
    setCaption('');
    setDeltaPct(null);
    setChartData([]);

    if (!deviceId) {
      setError('Select a device');
      return;
    }

    if (mode === 'realtime_ab') {
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
      if (mode === 'realtime_ab') {
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
        const rows = await fetchDataDashRange(paramSingle);
        const agg = aggregateDays(rows, paramSingle, tz);
        const S1 = mode === 'sum_day' ? agg.sumToday : agg.avgToday;
        const S2 = mode === 'sum_day' ? agg.sumYest : agg.avgYest;
        const labelToday =
          mode === 'sum_day' ? `Today (${paramSingle} sum)` : `Today (${paramSingle} avg)`;
        const labelYest =
          mode === 'sum_day'
            ? `Yesterday (${paramSingle} sum)`
            : `Yesterday (${paramSingle} avg)`;

        if (mode === 'sum_day' && agg.nToday === 0 && agg.nYest === 0) {
          setError('No data in the selected days for this parameter');
          setLoading(false);
          return;
        }
        if (mode === 'avg_day' && agg.nToday === 0 && agg.nYest === 0) {
          setError('No data in the selected days for this parameter');
          setLoading(false);
          return;
        }

        const T = S1 + S2;
        if (T <= 0) {
          setError('Cannot compute chart (both sides are zero)');
          setLoading(false);
          return;
        }
        const p1 = (S1 / T) * 100;
        const p2 = (S2 / T) * 100;
        setChartData([
          { name: labelToday, value: S1, pct: p1 },
          { name: labelYest, value: S2, pct: p2 },
        ]);
        setCaption(
          `${labelToday}: ${S1.toFixed(3)} · ${labelYest}: ${S2.toFixed(3)}`
        );
        if (S2 !== 0) {
          setDeltaPct(((S1 - S2) / S2) * 100);
        } else {
          setDeltaPct(null);
        }
      }
    } catch (e) {
      setError(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [
    deviceId,
    mode,
    paramA,
    paramB,
    paramSingle,
    fetchRealtime,
    fetchDataDashRange,
    tz,
  ]);

  runLoadRef.current = runLoad;

  useEffect(() => {
    if (mode !== 'realtime_ab' || !deviceId || !paramA || !paramB || paramA === paramB) return;
    const id = setInterval(() => runLoadRef.current(), 60000);
    return () => clearInterval(id);
  }, [mode, deviceId, paramA, paramB]);

  const cellColors = useMemo(() => {
    if (chartData.length !== 2) return [COLORS.primary, COLORS.secondary];
    const [a, b] = chartData;
    if (mode === 'realtime_ab') {
      return a.value >= b.value
        ? [COLORS.dominant, COLORS.other]
        : [COLORS.other, COLORS.dominant];
    }
    return [COLORS.today, COLORS.yesterday];
  }, [chartData, mode]);

  return (
    <Box sx={{ p: 2, maxWidth: 960, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, color: 'primary.main' }}>
        Comparison metrics
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        One doughnut chart: switch mode to compare realtime parameters or today vs
        yesterday (sum or average). Segments are shares of the pair total; day modes
        show day-over-day % change below.
      </Typography>

      <Card sx={{ ...CHART_CARD_SX, mb: 2 }}>
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
                    {d.name} ({d.device_id})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Comparison mode
              </Typography>
              <ToggleButtonGroup
                exclusive
                color="primary"
                size="small"
                value={mode}
                onChange={(_, v) => v && setMode(v)}
                sx={{ flexWrap: 'wrap' }}
              >
                {MODES.map((m) => (
                  <ToggleButton key={m.id} value={m.id}>
                    {m.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            {mode === 'realtime_ab' ? (
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

      {chartData.length === 2 && (
        <Card sx={CHART_CARD_SX}>
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
            {deltaPct !== null && mode !== 'realtime_ab' && (
              <Chip
                sx={{ mt: 1 }}
                label={`Δ vs yesterday: ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`}
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
