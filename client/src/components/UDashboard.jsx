/**
 * U-Dashboard: compact single-view layout (map + parameter overview + realtime chart).
 * Menu permission path is /u-dashboard (see navigationConfig ROUTE_MENU_PATH_MAP).
 * Does not modify the classic Dashboard component.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  CircularProgress,
} from '@mui/material';
import { LocalizationProvider, DateTimePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import axios from 'axios';
import { subHours } from 'date-fns';
import {
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ComposedChart,
} from 'recharts';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { Dashboard as DashboardIcon } from '@mui/icons-material';

import { API_BASE_URL } from '../config/api';
import {
  CHART_COLORS,
  CARTESIAN_GRID_PROPS,
  AXIS_TICK_STYLE,
  getTooltipContentStyle,
  getChartCardSx,
} from '../utils/chartStyles';
import DashboardMap from './DashboardMap';
import DashboardParameterDoughnuts from './DashboardParameterDoughnuts';
import PageHeader from './PageHeader';
import { usePermissions } from '../hooks/usePermissions';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { getDeviceDisplayName } from '../utils/deviceLabel';

const REALTIME_LINE_CHART_MARGIN = { top: 6, right: 14, left: 2, bottom: 0 };

const padRealtimeChartYDomain = ([dMin, dMax]) => {
  if (!Number.isFinite(dMin) || !Number.isFinite(dMax)) {
    return [0, 'auto'];
  }
  if (dMin === dMax) {
    const pad = Math.max(Math.abs(dMin) * 0.05, 1e-9);
    return [dMin - pad, dMax + pad];
  }
  const hi = dMax + 0.05 * Math.abs(dMax);
  let lo = dMin - 0.05 * Math.abs(dMin);
  if (dMin === 0) lo = 0;
  if (lo >= hi) return [dMin, dMax];
  return [lo, hi];
};

const realtimeGradientId = (param) => `ud_rtg_${String(param).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

const REALTIME_RANGE_OPTIONS = [
  { value: '48h', label: 'Default' },
  { value: '2h', label: 'Last 2 hours' },
  { value: '3h', label: 'Last 3 hours' },
  { value: '6h', label: 'Last 6 hours' },
  { value: 'custom', label: 'Custom' },
];

function panelTitle(text) {
  return (
    <Typography
      variant="overline"
      sx={{ display: 'block', fontWeight: 800, letterSpacing: 0.06, color: 'text.secondary', mb: 0.25, fontSize: '0.65rem', lineHeight: 1.2 }}
    >
      {text}
    </Typography>
  );
}

const panelCardContentSx = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 0.75, pt: 0.5, '&:last-child': { pb: 0.75 } };
const parameterPanelContentSx = {
  ...panelCardContentSx,
  p: 0.5,
  pt: 0.35,
  '&:last-child': { pb: 0.5 },
};

export default function UDashboard({ socket }) {
  const theme = useMuiTheme();
  const { userPermissions } = usePermissions();
  const { formatDisplayName, getUnit } = useFieldMetadata();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [realtimeDevice, setRealtimeDevice] = useState('');
  const [realtimeData, setRealtimeData] = useState([]);
  const [realtimeError, setRealtimeError] = useState('');
  const [realtimeParams, setRealtimeParams] = useState([]);
  const [realtimeLatest, setRealtimeLatest] = useState({});
  const [visibleParams, setVisibleParams] = useState([]);
  const [activeRealtimeParam, setActiveRealtimeParam] = useState('');
  const [realtimeAlertLogs, setRealtimeAlertLogs] = useState([]);
  const [realtimeAlertThresholds, setRealtimeAlertThresholds] = useState({});
  const [realtimeChartRange, setRealtimeChartRange] = useState('48h');
  const [realtimeCustomStart, setRealtimeCustomStart] = useState(() => subHours(new Date(), 2));
  const [realtimeCustomEnd, setRealtimeCustomEnd] = useState(() => new Date());

  const isGpsDisplayField = useCallback((p) => {
    const k = String(p || '').toLowerCase();
    return k === 'latitude' || k === 'longitude' || k === 'lat' || k === 'lon' || k === 'lng';
  }, []);

  const realtimeRangeHours = useMemo(
    () => ({ '2h': 2, '3h': 3, '6h': 6, '48h': 48 })[realtimeChartRange] ?? 48,
    [realtimeChartRange]
  );

  const realtimeCustomWindow = useMemo(() => {
    if (realtimeChartRange !== 'custom') return null;
    const start = realtimeCustomStart instanceof Date ? realtimeCustomStart : new Date(realtimeCustomStart);
    const end = realtimeCustomEnd instanceof Date ? realtimeCustomEnd : new Date(realtimeCustomEnd);
    const startMs = start?.getTime?.();
    const endMs = end?.getTime?.();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return null;
    const hours = Math.max(0, (endMs - startMs) / (1000 * 60 * 60));
    const limit = hours <= 6 ? 1000 : 5000;
    return { startISO: start.toISOString(), endISO: end.toISOString(), limit };
  }, [realtimeChartRange, realtimeCustomStart, realtimeCustomEnd]);

  const isAdmin = useMemo(() => {
    if (!userPermissions) return false;
    const userRole = userPermissions.role;
    return userRole === 'admin' || userRole === 'super_admin';
  }, [userPermissions]);

  const normalizeParamForAlert = (p) => (p || '').toString().toLowerCase().replace(/\s+/g, '_');

  const memoizedChartData = useMemo(() => {
    if (!realtimeData || realtimeData.length === 0) return [];
    return realtimeData
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((r) => ({
        timestamp: formatInUserTimezone(r.timestamp),
        originalTimestamp: r.timestamp,
        ...r,
      }));
  }, [realtimeData]);

  const chartDataWithAlerts = useMemo(() => {
    if (!memoizedChartData.length || !realtimeAlertLogs.length) return memoizedChartData;
    const dataParams = realtimeParams.filter((p) => p !== 'datetime' && p !== 'timestamp' && !isGpsDisplayField(p));
    const points = memoizedChartData.map((pt) => ({ ...pt, _alerts: {} }));
    const getPointTime = (pt) => new Date(pt.originalTimestamp).getTime();

    realtimeAlertLogs.forEach((log) => {
      const norm = normalizeParamForAlert(log.parameter);
      if (!norm) return;
      const paramKey = dataParams.find((p) => normalizeParamForAlert(p) === norm);
      if (!paramKey) return;
      const thresholds = realtimeAlertThresholds[norm];
      const logTime = new Date(log.detected_at).getTime();
      let bestIdx = -1;
      let bestDiff = Infinity;
      points.forEach((pt, idx) => {
        const v = pt[paramKey];
        if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) return;
        const d = Math.abs(logTime - getPointTime(pt));
        if (d < bestDiff) {
          bestDiff = d;
          bestIdx = idx;
        }
      });
      if (bestIdx >= 0 && thresholds) {
        const val = points[bestIdx][paramKey];
        const numVal = typeof val === 'number' ? val : parseFloat(val);
        if (!Number.isFinite(numVal)) return;
        const outOfRange =
          (thresholds.min != null && numVal < thresholds.min) || (thresholds.max != null && numVal > thresholds.max);
        if (outOfRange) points[bestIdx]._alerts[paramKey] = true;
      }
    });

    return points;
  }, [memoizedChartData, realtimeAlertLogs, realtimeParams, realtimeAlertThresholds, isGpsDisplayField]);

  const chartParamOptions = useMemo(
    () => realtimeParams.filter((p) => p !== 'datetime' && p !== 'timestamp' && !isGpsDisplayField(p)),
    [realtimeParams, isGpsDisplayField]
  );

  const toggleVisibleParam = useCallback((param) => {
    setVisibleParams((v) => (v.includes(param) ? v.filter((p) => p !== param) : [...v, param]));
  }, []);

  const focusParam = useCallback((param) => {
    setActiveRealtimeParam((prev) => (prev === param ? '' : param));
  }, []);

  const getTooltipRows = useCallback(
    (payload = []) => {
      const hashColor = (param) => {
        const s = String(param || '');
        let hash = 0;
        for (let i = 0; i < s.length; i++) {
          hash = (hash << 5) - hash + s.charCodeAt(i);
          hash &= hash;
        }
        return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length];
      };

      const fmtValue = (param, value, precision = 3) => {
        if (value === null || value === undefined || value === '') return '-';
        const unit = getUnit(param);
        const withUnit = unit ? ` ${unit}` : '';
        if (typeof value === 'number') {
          const formatted = Number.isFinite(value) ? value.toFixed(precision) : String(value);
          return `${formatted}${withUnit}`;
        }
        if (typeof value === 'string') {
          const numeric = parseFloat(value);
          if (!Number.isNaN(numeric)) {
            const formatted = Number.isFinite(numeric) ? numeric.toFixed(precision) : String(numeric);
            return `${formatted}${withUnit}`;
          }
          return `${value}${withUnit}`;
        }
        return `${String(value)}${withUnit}`;
      };

      const filtered = (payload || []).filter((p) => p && p.dataKey && visibleParams.includes(p.dataKey));
      const lastByKey = new Map();
      const isStrokeSeries = (p) => p?.stroke && String(p.stroke).toLowerCase() !== 'none';
      filtered.forEach((p) => {
        const prev = lastByKey.get(p.dataKey);
        if (!prev || isStrokeSeries(p)) lastByKey.set(p.dataKey, p);
      });

      return Array.from(lastByKey.values())
        .map((p) => {
          const raw = p.value;
          const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
          const sortVal = Number.isFinite(n) ? n : -Infinity;
          return {
            key: p.dataKey,
            color: p.color || hashColor(p.dataKey),
            label: formatDisplayName(p.dataKey, { withUnit: true }),
            valueText: fmtValue(p.dataKey, raw, 3),
            sortVal,
          };
        })
        .sort((a, b) => b.sortVal - a.sortVal);
    },
    [visibleParams, formatDisplayName, getUnit]
  );

  const RealtimeTooltip = useCallback(
    ({ active, payload, label }) => {
      if (!active) return null;
      const rows = getTooltipRows(payload);
      if (!rows.length) return null;
      return (
        <Box sx={{ ...getTooltipContentStyle(theme), p: 1.1, borderRadius: 1.25, minWidth: 240 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', mb: 0.5, color: 'text.primary' }}>
            {formatInUserTimezone(label)}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35 }}>
            {rows.map((r) => (
              <Box key={r.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.color, flexShrink: 0 }} />
                  <Typography
                    sx={{
                      fontSize: '0.78rem',
                      fontWeight: 650,
                      color: 'text.primary',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.label}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, flexShrink: 0, color: 'text.primary' }}>
                  {r.valueText}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      );
    },
    [getTooltipRows, theme]
  );

  const getParameterColor = (param) => {
    let hash = 0;
    for (let i = 0; i < String(param).length; i++) {
      hash = ((hash << 5) - hash) + String(param).charCodeAt(i);
      hash &= hash;
    }
    return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length];
  };

  const renderAlertDot = (param) => (props) => {
    const { cx, cy, payload } = props;
    if (payload._alerts && payload._alerts[param]) {
      return <circle cx={cx} cy={cy} r={7} fill="#EF4444" stroke="#fff" strokeWidth={2} />;
    }
    return null;
  };

  const memoizedChartLines = useMemo(
    () =>
      visibleParams.map((param) => {
        const color = getParameterColor(param);
        const focused = !activeRealtimeParam || activeRealtimeParam === param;
        return (
          <Line
            key={param}
            type="monotone"
            dataKey={param}
            name={formatDisplayName(param, { withUnit: true })}
            stroke={color}
            strokeWidth={focused ? 2.5 : 1.2}
            strokeOpacity={focused ? 1 : 0.28}
            dot={renderAlertDot(param)}
            activeDot={{ r: focused ? 5 : 3, strokeWidth: 2, fill: color }}
            isAnimationActive={false}
            connectNulls={false}
          />
        );
      }),
    [visibleParams, formatDisplayName, activeRealtimeParam]
  );

  const memoizedGradientDefs = useMemo(
    () =>
      visibleParams.map((param) => {
        const color = getParameterColor(param);
        const focused = !activeRealtimeParam || activeRealtimeParam === param;
        const topA = focused ? 0.22 : 0.08;
        const gid = realtimeGradientId(param);
        return (
          <linearGradient key={gid} id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={topA} />
            <stop offset="50%" stopColor={color} stopOpacity={topA * 0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        );
      }),
    [visibleParams, activeRealtimeParam]
  );

  const memoizedChartAreas = useMemo(
    () =>
      visibleParams.map((param) => {
        const gid = realtimeGradientId(param);
        return (
          <Area
            key={`area-${param}`}
            type="monotone"
            dataKey={param}
            stroke="none"
            fill={`url(#${gid})`}
            fillOpacity={1}
            isAnimationActive={false}
            connectNulls={false}
            legendType="none"
            dot={false}
            activeDot={false}
            baseLine={0}
          />
        );
      }),
    [visibleParams]
  );

  const loadDevices = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const devicesResponse = await fetch(`${API_BASE_URL}/devices/dropdown`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (devicesResponse.ok) {
        const devicesData = await devicesResponse.json();
        const deviceList = Array.isArray(devicesData) ? devicesData : devicesData.devices || [];
        const visibleDevices = deviceList.filter((device) => device?.status !== 'deleted' && device?.is_deleted !== true);
        setDevices(visibleDevices);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
    const id = setInterval(loadDevices, 30000);
    const handleVisibility = () => {
      if (document.visibilityState !== 'hidden') loadDevices();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (socket) {
      const handleDeviceUpdate = (data) => {
        setDevices((prev) =>
          prev.map((device) => (device.device_id === data.device_id ? { ...device, status: data.status } : device))
        );
      };
      socket.on('device_status_update', handleDeviceUpdate);
      return () => socket.off('device_status_update', handleDeviceUpdate);
    }
    return undefined;
  }, [socket]);

  useEffect(() => {
    if (devices.length > 0 && !realtimeDevice) {
      setRealtimeDevice(devices[0].device_id);
    }
  }, [devices, realtimeDevice]);

  const isDeviceAccessValid = useCallback(
    (device) => {
      if (isAdmin) return true;
      const from = device?.valid_from;
      const to = device?.valid_to;
      if (!from && !to) return true;
      if (!from || !to) return false;
      const today = new Date().toISOString().slice(0, 10);
      return today >= (from?.slice?.(0, 10) ?? from) && today <= (to?.slice?.(0, 10) ?? to);
    },
    [isAdmin]
  );

  useEffect(() => {
    if (!realtimeDevice) {
      setRealtimeParams([]);
      return;
    }
    const fetchMapper = async () => {
      try {
        const token = localStorage.getItem('iot_token');
        const res = await axios.get(`${API_BASE_URL}/device-mapper-assignments/${realtimeDevice}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const mappedParams = res.data.assignment.mappings.map((m) => m.target_field);
        if (!mappedParams.includes('datetime')) mappedParams.unshift('datetime');
        setRealtimeParams(mappedParams);
      } catch {
        setRealtimeParams([]);
      }
    };
    fetchMapper();
  }, [realtimeDevice]);

  useEffect(() => {
    const chartParams = realtimeParams.filter((p) => p !== 'datetime' && p !== 'timestamp' && !isGpsDisplayField(p));
    setVisibleParams(chartParams);
    setActiveRealtimeParam('');
  }, [realtimeParams, isGpsDisplayField]);

  const fetchRealtimeData = async (deviceId, params, windowOrRangeHours = 48) => {
    if (!deviceId || !params || params.length === 0) return;
    setRealtimeError('');
    try {
      const token = localStorage.getItem('iot_token');
      const isObj = windowOrRangeHours && typeof windowOrRangeHours === 'object';
      const startDate = isObj ? windowOrRangeHours.startISO : subHours(new Date(), windowOrRangeHours).toISOString();
      const endDate = isObj ? windowOrRangeHours.endISO : new Date().toISOString();
      const limit = isObj ? windowOrRangeHours.limit : windowOrRangeHours <= 6 ? 1000 : 5000;
      const response = await axios.get(`${API_BASE_URL}/data-dash`, {
        params: {
          deviceIds: deviceId,
          parameters: params.join(','),
          startDate,
          endDate,
          limit,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const mappedData = response.data.data || [];
      setRealtimeData(mappedData);
      if (mappedData.length > 0) {
        const sortedData = mappedData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const latestRecord = sortedData[0];
        const latest = {};
        params.forEach((k) => {
          if (latestRecord[k] !== undefined) {
            latest[k] = k === 'datetime' || k === 'timestamp' ? formatInUserTimezone(latestRecord[k]) : latestRecord[k];
          }
        });
        setRealtimeLatest(latest);
      } else {
        setRealtimeLatest({});
      }
    } catch (e) {
      console.error(e);
      setRealtimeError('Failed to load realtime data');
      setRealtimeData([]);
      setRealtimeLatest({});
    }
  };

  useEffect(() => {
    if (!realtimeDevice || !realtimeData?.length) {
      setRealtimeAlertLogs([]);
      return;
    }
    const startDate = realtimeData.reduce((min, r) => {
      const t = new Date(r.timestamp).getTime();
      return t < min ? t : min;
    }, Infinity);
    const endDate = realtimeData.reduce((max, r) => {
      const t = new Date(r.timestamp).getTime();
      return t > max ? t : max;
    }, -Infinity);
    if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) {
      setRealtimeAlertLogs([]);
      return;
    }
    const token = localStorage.getItem('iot_token');
    fetch(
      `${API_BASE_URL}/alert-logs?deviceId=${encodeURIComponent(realtimeDevice)}&startDate=${new Date(startDate).toISOString()}&endDate=${new Date(endDate).toISOString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((res) => (res.ok ? res.json() : Promise.resolve({ logs: [] })))
      .then((data) => setRealtimeAlertLogs(data.logs || []))
      .catch(() => setRealtimeAlertLogs([]));
  }, [realtimeDevice, realtimeData]);

  useEffect(() => {
    if (!realtimeDevice) {
      setRealtimeAlertThresholds({});
      return;
    }
    const token = localStorage.getItem('iot_token');
    fetch(`${API_BASE_URL}/alerts`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.resolve({ alerts: [] })))
      .then((data) => {
        const list = data.alerts || [];
        const byParam = {};
        list
          .filter((a) => a.device_id === realtimeDevice)
          .forEach((a) => {
            const norm = normalizeParamForAlert(a.parameter);
            if (!norm) return;
            const min = a.min != null ? Number(a.min) : null;
            const max = a.max != null ? Number(a.max) : null;
            if (byParam[norm]) {
              if (min != null && (byParam[norm].min == null || min < byParam[norm].min)) byParam[norm].min = min;
              if (max != null && (byParam[norm].max == null || max > byParam[norm].max)) byParam[norm].max = max;
            } else {
              byParam[norm] = { min, max };
            }
          });
        setRealtimeAlertThresholds(byParam);
      })
      .catch(() => setRealtimeAlertThresholds({}));
  }, [realtimeDevice]);

  useEffect(() => {
    if (!realtimeDevice || realtimeParams.length === 0) return;
    if (realtimeChartRange === 'custom') {
      if (!realtimeCustomWindow) return;
      fetchRealtimeData(realtimeDevice, realtimeParams, realtimeCustomWindow);
      return;
    }
    fetchRealtimeData(realtimeDevice, realtimeParams, realtimeRangeHours);
    const interval = setInterval(() => {
      fetchRealtimeData(realtimeDevice, realtimeParams, realtimeRangeHours);
    }, 10000);

    let deviceDataHandler;
    if (socket) {
      deviceDataHandler = (payload) => {
        if (payload.deviceId === realtimeDevice && payload.data) {
          setRealtimeLatest((prevLatest) => {
            const newLatest = { ...prevLatest };
            let hasUpdates = false;
            realtimeParams.forEach((param) => {
              if (payload.data[param] !== undefined && payload.data[param] !== null) {
                newLatest[param] = payload.data[param];
                hasUpdates = true;
              }
            });
            return hasUpdates ? newLatest : prevLatest;
          });
        }
      };
      socket.on('device_data', deviceDataHandler);
    }

    return () => {
      clearInterval(interval);
      if (socket && deviceDataHandler) socket.off('device_data', deviceDataHandler);
    };
  }, [realtimeDevice, realtimeParams, realtimeRangeHours, realtimeChartRange, realtimeCustomWindow, socket]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={320}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  const pageShellSx = {
    height: { xs: 'auto', md: 'calc(100dvh - 72px)' },
    maxHeight: { md: 'calc(100dvh - 72px)' },
    overflow: { xs: 'visible', md: 'hidden' },
    display: 'flex',
    flexDirection: 'column',
    pb: { xs: 2, md: 0 },
  };

  const gridSx = {
    flex: 1,
    minHeight: { md: 0 },
    display: 'grid',
    gap: 0.75,
    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
    // Desktop layout ratio: top 35% / chart 65%
    gridTemplateRows: { xs: 'none', md: 'minmax(0, 0.35fr) minmax(0, 0.65fr)' },
    gridAutoRows: { xs: 'minmax(240px, auto)', md: 'none' },
  };

  return (
    <Box sx={pageShellSx}>
      <PageHeader
        icon={<DashboardIcon sx={{ fontSize: 18 }} />}
        title="U-Dashboard"
        subtitle="Map, parameter overview, and realtime chart — single-screen layout"
        sx={{
          mb: 0.5,
          flexShrink: 0,
          py: 0.5,
          border: 'none',
          boxShadow: 'none',
          borderRadius: 1,
          bgcolor: alpha(theme.palette.background.paper, 0.55),
        }}
        right={(
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' } }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              Device
            </Typography>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 240 }, mt: 0.5 }}>
              <InputLabel id="ud-device-label">Device</InputLabel>
              <Select
                labelId="ud-device-label"
                label="Device"
                value={realtimeDevice}
                onChange={(e) => setRealtimeDevice(e.target.value)}
                sx={{ height: 34, fontWeight: 700, fontSize: '0.88rem' }}
              >
                {devices.map((d) => {
                  const valid = isDeviceAccessValid(d);
                  return (
                    <MenuItem key={d.device_id} value={d.device_id} sx={{ opacity: valid ? 1 : 0.55 }}>
                      {getDeviceDisplayName(d)}
                      {!valid && (
                        <Typography component="span" variant="caption" color="error" sx={{ ml: 1 }}>
                          – Access expired
                        </Typography>
                      )}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </Box>
        )}
      />

      <Box sx={gridSx}>
        {/* Map */}
        <Card
          sx={{
            gridColumn: { xs: '1', md: '1' },
            gridRow: { xs: 'auto', md: '1' },
            minHeight: { xs: 260, md: 0 },
            height: { md: '100%' },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            ...getChartCardSx(theme),
          }}
        >
          <CardContent sx={panelCardContentSx}>
            {panelTitle('Device location')}
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <DashboardMap
                socket={socket}
                fillHeight
                cardSx={{ m: 0, mt: 0, mb: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', boxShadow: 'none' }}
                mapBoxSx={{ flex: 1, minHeight: 0, height: '100%' }}
                compactPopup
              />
            </Box>
          </CardContent>
        </Card>

        {/* Parameter overview */}
        <Card
          sx={{
            gridColumn: { xs: '1', md: '2' },
            gridRow: { xs: 'auto', md: '1' },
            minHeight: { xs: 240, md: 0 },
            height: { md: '100%' },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            ...getChartCardSx(theme),
          }}
        >
          <CardContent sx={parameterPanelContentSx}>
            {panelTitle('Parameter overview')}
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {realtimeParams.length > 0 ? (
                <DashboardParameterDoughnuts
                  compact
                  data={realtimeLatest}
                  realtimeParams={realtimeParams}
                  realtimeData={realtimeData}
                  deviceId={realtimeDevice}
                  formatDisplayName={formatDisplayName}
                />
              ) : (
                <Alert severity="info" sx={{ py: 0.35, fontSize: '0.75rem' }}>
                  Select a device with a mapper to see parameters.
                </Alert>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* Realtime chart */}
        <Card
          sx={{
            gridColumn: { xs: '1', md: '1 / -1' },
            gridRow: { xs: 'auto', md: '2' },
            minHeight: { xs: 320, md: 0 },
            height: { md: '100%' },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            ...getChartCardSx(theme),
          }}
        >
          <CardContent sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 0 }}>
            <Box
              sx={{
                px: 0.75,
                py: 0.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 0.75,
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              {panelTitle('Realtime graph')}
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel id="ud-range">Period</InputLabel>
                <Select
                  labelId="ud-range"
                  label="Period"
                  value={realtimeChartRange}
                  onChange={(e) => setRealtimeChartRange(e.target.value)}
                  sx={{ height: 30, fontSize: '0.78rem', fontWeight: 700 }}
                >
                  {REALTIME_RANGE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {realtimeChartRange === 'custom' && (
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <Box
                  sx={{
                    px: 0.75,
                    py: 0.5,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 0.5,
                    flexShrink: 0,
                  }}
                >
                  <DateTimePicker
                    label="Start"
                    value={realtimeCustomStart}
                    onChange={(v) => setRealtimeCustomStart(v)}
                    renderInput={(params) => <TextField {...params} size="small" fullWidth />}
                    ampm={false}
                    format="yyyy-MM-dd HH:mm"
                  />
                  <DateTimePicker
                    label="End"
                    value={realtimeCustomEnd}
                    onChange={(v) => setRealtimeCustomEnd(v)}
                    renderInput={(params) => <TextField {...params} size="small" fullWidth />}
                    ampm={false}
                    format="yyyy-MM-dd HH:mm"
                  />
                </Box>
              </LocalizationProvider>
            )}

            <Box sx={{ px: 0.75, py: 0.5, flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
              {realtimeError && (
                <Alert severity="error" sx={{ mb: 0.5, py: 0, fontSize: '0.75rem' }}>
                  {realtimeError}
                </Alert>
              )}
              <Box sx={{ maxHeight: 56, overflowY: 'auto', pr: 0.25 }}>
                <ToggleButtonGroup
                  value={visibleParams}
                  onChange={(_, newValue) => setVisibleParams(newValue)}
                  size="small"
                  sx={{ flexWrap: 'wrap', gap: 0.35, '& .MuiToggleButtonGroup-grouped': { border: 'none' } }}
                >
                  {chartParamOptions.map((param) => {
                    const color = getParameterColor(param);
                    const selected = visibleParams.includes(param);
                    const dim = activeRealtimeParam && activeRealtimeParam !== param;
                    return (
                      <ToggleButton
                        key={param}
                        value={param}
                        selected={selected}
                        onClick={() => toggleVisibleParam(param)}
                        onDoubleClick={() => focusParam(param)}
                        sx={{
                          textTransform: 'none',
                          borderRadius: 1,
                          px: 0.5,
                          py: 0.15,
                          minHeight: 22,
                          opacity: dim ? 0.45 : 1,
                          bgcolor: selected ? `${color}14` : 'transparent',
                          border: `1px solid ${selected ? `${color}45` : 'rgba(0,0,0,0.1)'}`,
                        }}
                      >
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, mr: 0.35 }} />
                        <Typography sx={{ fontSize: '0.62rem', fontWeight: 650, lineHeight: 1.1 }}>
                          {formatDisplayName(param, { withUnit: true })}
                        </Typography>
                      </ToggleButton>
                    );
                  })}
                </ToggleButtonGroup>
              </Box>
            </Box>

            <Box sx={{ flex: 1, minHeight: { xs: 200, md: 0 }, px: 0.35, pb: 0.35, pt: 0.25, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ flex: 1, minHeight: 120, ...getChartCardSx(theme), overflow: 'hidden' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartDataWithAlerts} margin={REALTIME_LINE_CHART_MARGIN}>
                    <defs>{memoizedGradientDefs}</defs>
                    <CartesianGrid {...CARTESIAN_GRID_PROPS} />
                    <XAxis
                      dataKey="timestamp"
                      minTickGap={20}
                      tick={AXIS_TICK_STYLE}
                      tickFormatter={(value) => {
                        if (typeof value === 'string' && !value.includes('T')) return value;
                        return formatInUserTimezone(value);
                      }}
                    />
                    <YAxis
                      type="number"
                      tick={AXIS_TICK_STYLE}
                      domain={padRealtimeChartYDomain}
                      allowDataOverflow
                      tickFormatter={(v) => {
                        if (v === null || v === undefined || v === '') return '';
                        const n = typeof v === 'number' ? v : Number(v);
                        return Number.isFinite(n) ? n.toFixed(2) : String(v);
                      }}
                    />
                    <Tooltip content={RealtimeTooltip} cursor={{ stroke: 'rgba(2, 132, 199, 0.45)', strokeWidth: 1 }} />
                    {memoizedChartAreas}
                    {memoizedChartLines}
                    <Brush dataKey="timestamp" height={16} stroke="rgba(2, 132, 199, 0.45)" travellerWidth={8} tickFormatter={() => ''} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5, pt: 0.2, fontSize: '0.6rem', lineHeight: 1.2 }}>
                Click line on/off · double-click focus · red dot = threshold breach
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
