import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Chip, CircularProgress,
  Select, MenuItem, FormControl, LinearProgress, useTheme, Button, TextField, InputLabel,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { DateTimePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import axios from 'axios';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import ScienceIcon from '@mui/icons-material/Science';
import OpacityIcon from '@mui/icons-material/Opacity';
import SpeedIcon from '@mui/icons-material/Speed';
import PlaceIcon from '@mui/icons-material/Place';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import SensorsIcon from '@mui/icons-material/Sensors';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { API_BASE_URL } from '../config/api';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { getParameterColor as getChartParamColor } from '../utils/chartStyles';
import { useDeviceSocketSubscription } from '../hooks/useDeviceSocketSubscription';
import { useSocketEvent } from '../hooks/useSocketEvent';
import DashboardMap from './DashboardMap';
import RealtimeChartDisplaySelect from './RealtimeChartDisplaySelect';
import {
  buildRealtimeChartSeries,
  REALTIME_CHART_DISPLAY_MODES,
} from '../utils/realtimeChartAggregation';

const NON_PARAM_KEYS = new Set([
  'datetime', 'timestamp', 'device_id', 'device_name', 'server_received_at',
  'latitude', 'longitude', 'altitude', 'speed', 'heading', 'accuracy', 'satellites',
  '_terminalTime', '_groupName', '_chartTime',
]);

/** Preferred KPI/chart order for water-quality deployments; anything else appended after. */
const PREFERRED_PARAM_ORDER = ['cod_mg_l', 'tss_mg_l', 'ph_value', 'flow_rate', 'nh3n', 'debit', 'temperature', 'humidity'];

const KPI_ICONS = [
  <WaterDropIcon key="i0" />, <ScienceIcon key="i1" />, <OpacityIcon key="i2" />, <SpeedIcon key="i3" />,
];
const KPI_TINTS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'];

const RANGE_OPTIONS = [
  { value: '48h', label: 'Default' },
  { value: '2h', label: 'Last 2 hours' },
  { value: '3h', label: 'Last 3 hours' },
  { value: '6h', label: 'Last 6 hours' },
  { value: 'custom', label: 'Custom' },
];

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function orderParams(keys) {
  const set = new Set(keys);
  const ordered = PREFERRED_PARAM_ORDER.filter((k) => set.has(k));
  const rest = keys.filter((k) => !ordered.includes(k)).sort();
  return [...ordered, ...rest];
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const statusDotColor = (status) => {
  if (status === 'online' || status === 'active') return '#10B981';
  if (status === 'warning') return '#F59E0B';
  return '#94A3B8';
};

export default function NDashboard({ socket }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { formatDisplayName, getUnit } = useFieldMetadata();

  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [latest, setLatest] = useState({ fields: {}, updatedAt: null });
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [chartRange, setChartRange] = useState('48h');
  const [chartDisplayMode, setChartDisplayMode] = useState(() => {
    try {
      return localStorage.getItem('realtime_chart_display_mode') || REALTIME_CHART_DISPLAY_MODES.INSTANT;
    } catch {
      return REALTIME_CHART_DISPLAY_MODES.INSTANT;
    }
  });
  const [customStart, setCustomStart] = useState(() => new Date(Date.now() - 2 * 3600 * 1000));
  const [customEnd, setCustomEnd] = useState(() => new Date());
  const [paramFilter, setParamFilter] = useState('all');
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const selectedDevice = devices.find((d) => d.device_id === selectedDeviceId) || null;
  const rangeHours = ({ '2h': 2, '3h': 3, '6h': 6, '48h': 48 })[chartRange] ?? 48;

  useEffect(() => {
    try {
      localStorage.setItem('realtime_chart_display_mode', chartDisplayMode);
    } catch {
      // Ignore storage restrictions.
    }
  }, [chartDisplayMode]);

  // ---- Data loading -------------------------------------------------------
  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem('iot_token')}`,
  }), []);

  useEffect(() => {
    const load = async () => {
      setLoadingDevices(true);
      try {
        const [allRes, coordRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/devices`, { headers: authHeaders() }),
          axios.get(`${API_BASE_URL}/devices/with-coordinates`, { headers: authHeaders() }).catch(() => ({ data: { devices: [] } })),
        ]);
        const coordMap = new Map((coordRes.data.devices || []).map((d) => [d.device_id, d]));
        const list = (allRes.data.devices || [])
          .filter((d) => d?.status !== 'deleted' && d?.is_deleted !== true)
          .map((d) => ({
            ...d,
            latitude: coordMap.get(d.device_id)?.latitude ?? null,
            longitude: coordMap.get(d.device_id)?.longitude ?? null,
          }));
        setDevices(list);
        if (list.length > 0) setSelectedDeviceId((prev) => prev || list[0].device_id);
      } catch {
        setDevices([]);
      }
      setLoadingDevices(false);
    };
    load();
  }, [authHeaders]);

  const fetchLatest = useCallback(async (deviceId) => {
    if (!deviceId) return;
    try {
      const res = await axios.get(
        `${API_BASE_URL}/devices/${deviceId}/latest-data`,
        { params: { excludeCategories: 'Status' }, headers: authHeaders() }
      );
      setLatest({ fields: res.data.data || {}, updatedAt: res.data.last_updated_at || null });
    } catch {
      setLatest({ fields: {}, updatedAt: null });
    }
  }, [authHeaders]);

  useEffect(() => { fetchLatest(selectedDeviceId); }, [selectedDeviceId, fetchLatest]);

  // Numeric parameters available on the selected device (drives KPIs, chart, readings)
  const availableParams = useMemo(() => {
    const keys = Object.keys(latest.fields || {}).filter((k) => {
      if (NON_PARAM_KEYS.has(k)) return false;
      return toNumber(latest.fields[k]) !== null;
    });
    return orderParams(keys);
  }, [latest.fields]);

  // All numeric mapped parameters are represented. The layout wraps as needed.
  const chartParams = availableParams;
  const kpiParams = availableParams;

  useEffect(() => {
    if (paramFilter !== 'all' && !availableParams.includes(paramFilter)) {
      setParamFilter('all');
    }
  }, [availableParams, paramFilter]);

  const fetchHistory = useCallback(async () => {
    if (!selectedDeviceId || chartParams.length === 0) {
      setHistory([]);
      return;
    }
    setLoadingHistory(true);
    try {
      const isCustom = chartRange === 'custom';
      const end = isCustom ? new Date(customEnd) : new Date();
      const start = isCustom ? new Date(customStart) : new Date(end.getTime() - rangeHours * 3600 * 1000);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
        setHistory([]);
        setLoadingHistory(false);
        return;
      }
      const windowHours = (end.getTime() - start.getTime()) / 3600000;
      const res = await axios.get(`${API_BASE_URL}/data-dash`, {
        params: {
          deviceIds: selectedDeviceId,
          parameters: ['datetime', ...chartParams].join(','),
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          limit: windowHours <= 6 ? 1000 : 5000,
          excludeCategories: 'Status',
        },
        headers: authHeaders(),
      });
      const rows = (res.data.data || []).map((row) => {
        const out = { datetime: row.datetime, timestamp: row.timestamp };
        chartParams.forEach((p) => { out[p] = toNumber(row[p]); });
        return out;
      });
      setHistory(rows);
    } catch {
      setHistory([]);
    }
    setLoadingHistory(false);
  }, [selectedDeviceId, chartParams.join(','), chartRange, rangeHours, customStart, customEnd, authHeaders]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/alert-logs`, { headers: authHeaders() });
        setAlerts((res.data.logs || []).slice(0, 5));
      } catch {
        setAlerts([]);
      }
    };
    loadAlerts();
  }, [authHeaders]);

  // ---- Live socket updates ------------------------------------------------
  useDeviceSocketSubscription(socket, selectedDeviceId);
  useSocketEvent(socket, 'device_data', (payload) => {
    if (!payload || payload.deviceId !== selectedDeviceId || !payload.data) return;
    setLatest((prev) => ({
      fields: { ...prev.fields, ...payload.data },
      updatedAt: new Date().toISOString(),
    }));
  });

  // ---- Derived stats ------------------------------------------------------
  const paramStats = useMemo(() => {
    const stats = {};
    availableParams.forEach((p) => {
      const values = history.map((r) => r[p]).filter((v) => v !== null && v !== undefined);
      const latestVal = toNumber(latest.fields[p]);
      if (values.length === 0) {
        stats[p] = { latest: latestVal, avg: null, min: null, max: null, deltaPct: null };
        return;
      }
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const deltaPct = avg !== 0 && latestVal !== null ? ((latestVal - avg) / Math.abs(avg)) * 100 : null;
      stats[p] = { latest: latestVal, avg, min, max, deltaPct };
    });
    return stats;
  }, [availableParams, history, latest.fields]);

  const fmtVal = useCallback((v, digits = 2) => {
    const n = toNumber(v);
    if (n === null) return '-';
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }, []);

  const visibleChartParams = paramFilter === 'all' ? chartParams : chartParams.filter((p) => p === paramFilter);
  const chartData = useMemo(
    () => buildRealtimeChartSeries(history, chartParams, chartDisplayMode)
      .map((row) => {
        const raw = row.originalTimestamp ?? row.datetime ?? row.timestamp;
        const t = raw != null && raw !== '' ? new Date(raw).getTime() : NaN;
        return { ...row, t: Number.isFinite(t) ? t : 0 };
      })
      .filter((row) => row.t > 0),
    [history, chartParams, chartDisplayMode]
  );
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === chartRange)?.label || 'Default';

  // ---- Shared styles ------------------------------------------------------
  const cardSx = {
    borderRadius: 2,
    border: '1px solid',
    borderColor: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(226,232,240,1)',
    bgcolor: 'background.paper',
    boxShadow: isDark ? 'none' : '0 1px 3px rgba(15,23,42,0.04)',
  };
  const sectionTitleSx = { fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' };
  const railItemSx = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 1,
    p: 1,
    borderRadius: 1.5,
    border: '1px solid',
    borderColor: 'divider',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
  };

  if (loadingDevices) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 360 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        fontFamily: 'Inter, sans-serif',
        minHeight: '100%',
        p: { xs: 0.5, md: 1 },
        bgcolor: 'transparent',
        color: 'text.primary',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.25, px: 0.25 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2, color: 'text.primary' }}>
            N-Dashboard
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
            Water quality monitoring overview
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 125 }}>
            <InputLabel id="nd-period">Period</InputLabel>
            <Select
              labelId="nd-period"
              label="Period"
              value={chartRange}
              onChange={(e) => setChartRange(e.target.value)}
              sx={{ fontSize: '0.75rem', minHeight: 32, borderRadius: 1.5, '& .MuiSelect-select': { py: 0.6 } }}
            >
              {RANGE_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value} sx={{ fontSize: '0.78rem' }}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <RealtimeChartDisplaySelect
            value={chartDisplayMode}
            onChange={setChartDisplayMode}
            minWidth={130}
            label="Display"
            labelId="nd-chart-display"
            sx={{ '& .MuiSelect-select': { fontSize: '0.75rem' } }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={selectedDeviceId || ''}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              sx={{ fontSize: '0.75rem', minHeight: 32, borderRadius: 1.5, '& .MuiSelect-select': { py: 0.6 } }}
            >
              {devices.map((d) => (
                <MenuItem key={d.device_id} value={d.device_id} sx={{ fontSize: '0.78rem' }}>{d.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Box>
      {chartRange === 'custom' && (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 1,
              maxWidth: 620,
              ml: 'auto',
              mb: 1.25,
            }}
          >
            <DateTimePicker
              label="Start"
              value={customStart}
              onChange={setCustomStart}
              renderInput={(params) => <TextField {...params} size="small" fullWidth />}
              ampm={false}
            />
            <DateTimePicker
              label="End"
              value={customEnd}
              onChange={setCustomEnd}
              renderInput={(params) => <TextField {...params} size="small" fullWidth />}
              ampm={false}
            />
          </Box>
        </LocalizationProvider>
      )}

      {/* Main grid: content + right rail */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 300px' },
          gap: 1.25,
          alignItems: 'start',
        }}
      >
        {/* ---- Left column ---- */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
          {/* KPI row */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(auto-fit, minmax(185px, 1fr))' },
              gap: 1.25,
            }}
          >
            {kpiParams.length === 0 && (
              <Card sx={{ ...cardSx, gridColumn: '1 / -1' }}>
                <CardContent sx={{ p: 2, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                    No numeric readings yet for this device.
                  </Typography>
                </CardContent>
              </Card>
            )}
            {kpiParams.map((p, idx) => {
              const tint = KPI_TINTS[idx % KPI_TINTS.length];
              const st = paramStats[p] || {};
              const up = (st.deltaPct ?? 0) >= 0;
              return (
                <Card key={p} sx={cardSx}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Box
                        sx={{
                          width: 30, height: 30, borderRadius: 1.25, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          bgcolor: alpha(tint, 0.12), color: tint,
                          '& svg': { fontSize: 17 },
                        }}
                      >
                        {KPI_ICONS[idx % KPI_ICONS.length]}
                      </Box>
                      {st.deltaPct !== null && Number.isFinite(st.deltaPct) && (
                        <Chip
                          size="small"
                          icon={up
                            ? <TrendingUpIcon sx={{ fontSize: '12px !important' }} />
                            : <TrendingDownIcon sx={{ fontSize: '12px !important' }} />}
                          label={`${up ? '+' : ''}${st.deltaPct.toFixed(1)}%`}
                          sx={{
                            height: 20,
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            color: up
                              ? (isDark ? '#6EE7B7' : '#047857')
                              : (isDark ? '#FCA5A5' : '#B91C1C'),
                            bgcolor: up ? alpha('#10B981', isDark ? 0.18 : 0.12) : alpha('#EF4444', isDark ? 0.18 : 0.12),
                            '& .MuiChip-label': { px: 0.6 },
                            '& .MuiChip-icon': { color: 'inherit', ml: 0.5 },
                          }}
                        />
                      )}
                    </Box>
                    <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtVal(st.latest)}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: '0.68rem', color: 'text.secondary', mt: 0.25 }}>
                      {formatDisplayName(p, { withUnit: false })}{getUnit(p) ? ` (${getUnit(p)})` : ''}
                    </Typography>
                  </CardContent>
                </Card>
              );
            })}
          </Box>

          {/* Map */}
          <Card sx={{ ...cardSx, overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <PlaceIcon sx={{ fontSize: 16, color: theme.palette.primary.main }} />
                <Typography sx={sectionTitleSx}>Site Locations</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {[['Active', '#10B981'], ['Warning', '#F59E0B'], ['Inactive', '#94A3B8']].map(([label, color]) => (
                  <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color }} />
                    <Typography sx={{ fontSize: '0.64rem', color: 'text.secondary' }}>{label}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
            <Box sx={{ height: { xs: 210, md: 240 }, display: 'flex', flexDirection: 'column' }}>
              <DashboardMap
                socket={socket}
                fillHeight
                embedded
                compactPopup
                lazyDeviceData
                priorityDeviceId={selectedDeviceId}
              />
            </Box>
          </Card>

          {/* Time series */}
          <Card sx={cardSx}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                <Box>
                  <Typography sx={sectionTitleSx}>Environment Quality Time Series</Typography>
                  <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                    {rangeLabel} · {selectedDevice?.name || '-'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {['all', ...chartParams].map((p) => {
                    const active = paramFilter === p;
                    return (
                      <Button
                        key={p}
                        size="small"
                        onClick={() => setParamFilter(p)}
                        sx={{
                          minWidth: 0,
                          px: 1.1,
                          py: 0.3,
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          textTransform: 'none',
                          borderRadius: 5,
                          color: active ? '#fff' : 'text.secondary',
                          bgcolor: active ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.05),
                          '&:hover': { bgcolor: active ? theme.palette.primary.dark : alpha(theme.palette.text.primary, 0.1) },
                        }}
                      >
                        {p === 'all' ? 'All' : formatDisplayName(p, { withUnit: false })}
                      </Button>
                    );
                  })}
                </Box>
              </Box>
              {loadingHistory ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={390}>
                  <AreaChart data={chartData} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
                    <defs>
                      {visibleChartParams.map((p) => {
                        const c = getChartParamColor(p);
                        return (
                          <linearGradient key={p} id={`nd-grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={c} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={c} stopOpacity={0.02} />
                          </linearGradient>
                        );
                      })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} vertical={false} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tick={{ fontSize: 9, fill: theme.palette.text.secondary }}
                      tickMargin={6}
                      minTickGap={40}
                      tickFormatter={(ms) => (Number.isFinite(ms) ? formatInUserTimezone(new Date(ms).toISOString(), chartRange === '48h' || chartRange === 'custom' ? 'MM/DD HH:mm' : 'HH:mm') : '')}
                    />
                    <YAxis tick={{ fontSize: 9, fill: theme.palette.text.secondary }} width={40} />
                    <ReTooltip
                      contentStyle={{
                        backgroundColor: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(ms) => (Number.isFinite(ms) ? formatInUserTimezone(new Date(ms).toISOString()) : '')}
                      formatter={(value, name) => [fmtVal(value, 3), formatDisplayName(name, { withUnit: true })]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                      formatter={(value) => formatDisplayName(value, { withUnit: true })}
                    />
                    {visibleChartParams.map((p) => (
                      <Area
                        key={p}
                        type="monotone"
                        dataKey={p}
                        stroke={getChartParamColor(p)}
                        strokeWidth={2}
                        fill={`url(#nd-grad-${p})`}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* ---- Right rail ---- */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
          {/* Site Overview */}
          <Card sx={cardSx}>
            <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={sectionTitleSx}>Site Overview</Typography>
                <Chip
                  size="small"
                  icon={<Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#10B981', ml: 0.5 }} />}
                  label="Live"
                  sx={{
                    height: 20,
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    color: isDark ? '#6EE7B7' : '#047857',
                    bgcolor: alpha('#10B981', isDark ? 0.18 : 0.1),
                    '& .MuiChip-label': { px: 0.6 },
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6, maxHeight: 240, overflowY: 'auto' }}>
                {devices.map((d) => {
                  const selected = d.device_id === selectedDeviceId;
                  return (
                    <Box
                      key={d.device_id}
                      onClick={() => setSelectedDeviceId(d.device_id)}
                      sx={{
                        ...railItemSx,
                        ...(selected && {
                          borderColor: alpha(theme.palette.primary.main, 0.5),
                          bgcolor: alpha(theme.palette.primary.main, 0.06),
                        }),
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: statusDotColor(d.ui_status || d.status) }} />
                        <Typography noWrap sx={{ fontSize: '0.72rem', fontWeight: 600 }}>{d.name}</Typography>
                      </Box>
                      {d.latitude != null && d.longitude != null && (
                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                            {Number(d.latitude).toFixed(4)}°
                          </Typography>
                          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                            {Number(d.longitude).toFixed(4)}°
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  );
                })}
                {devices.length === 0 && (
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', textAlign: 'center', py: 1 }}>
                    No devices found
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* Latest Readings */}
          <Card sx={cardSx}>
            <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={sectionTitleSx}>Latest Readings</Typography>
                <Chip
                  size="small"
                  icon={<SensorsIcon sx={{ fontSize: '11px !important' }} />}
                  label={selectedDevice?.name || '-'}
                  sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, maxWidth: 140, bgcolor: alpha(theme.palette.primary.main, 0.08), '& .MuiChip-label': { px: 0.6 } }}
                />
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {availableParams.slice(0, 6).map((p, idx) => {
                  const st = paramStats[p] || {};
                  const val = st.latest;
                  const color = getChartParamColor(p);
                  // Progress relative to the max observed in the loaded window
                  const pct = st.max && st.max !== 0 && val !== null
                    ? Math.max(0, Math.min(100, (val / st.max) * 100))
                    : 0;
                  return (
                    <Box key={p} sx={{ py: 0.75, ...(idx > 0 && { borderTop: '1px solid', borderColor: 'divider' }) }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
                        <Typography noWrap sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                          {formatDisplayName(p, { withUnit: false })}
                        </Typography>
                        <Typography sx={{ fontSize: '0.74rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtVal(val)}
                          <Typography component="span" sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'text.secondary', ml: 0.3 }}>
                            {getUnit(p) || ''}
                          </Typography>
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          height: 5,
                          borderRadius: 3,
                          bgcolor: alpha(color, 0.12),
                          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
                        }}
                      />
                    </Box>
                  );
                })}
                {availableParams.length === 0 && (
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', textAlign: 'center', py: 1 }}>
                    No readings available
                  </Typography>
                )}
              </Box>
              {latest.updatedAt && (
                <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.75, textAlign: 'right' }}>
                  Updated {timeAgo(latest.updatedAt)}
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Recent Alerts */}
          <Card sx={cardSx}>
            <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={sectionTitleSx}>Recent Alerts</Typography>
                {alerts.length > 0 && (
                  <Chip
                    size="small"
                    icon={<NotificationsActiveIcon sx={{ fontSize: '11px !important' }} />}
                    label={`${alerts.length} new`}
                    sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, color: '#B91C1C', bgcolor: alpha('#EF4444', 0.1), '& .MuiChip-label': { px: 0.6 } }}
                  />
                )}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                {alerts.map((a, i) => {
                  const sevColor = a.status === 'active' ? '#EF4444' : a.status === 'acknowledged' ? '#F59E0B' : '#94A3B8';
                  return (
                    <Box
                      key={a.log_id || i}
                      sx={{
                        p: 1,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: alpha(sevColor, 0.25),
                        bgcolor: alpha(sevColor, 0.05),
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: sevColor, mt: 0.5, flexShrink: 0 }} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, lineHeight: 1.35 }}>
                            {a.alert_name || a.parameter || 'Alert'} — {a.device_name || a.device_id}
                          </Typography>
                          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                            {timeAgo(a.detected_at)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
                {alerts.length === 0 && (
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', textAlign: 'center', py: 1 }}>
                    No recent alerts
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
