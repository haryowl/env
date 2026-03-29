import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Alert,
  Collapse,
  IconButton,
} from '@mui/material';
import {
  Devices as DevicesIcon,
  Wifi as WifiIcon,
  People as PeopleIcon,
  DataUsage as DataIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Map as MapIcon,
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import { FormControl, InputLabel, Select, MenuItem, CardActions, Button, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import axios from 'axios';
import { subHours } from 'date-fns';
import moment from 'moment-timezone';
import { min as d3min, max as d3max } from 'd3-array';

import { API_BASE_URL } from '../config/api';
import { CHART_COLORS, CARTESIAN_GRID_PROPS, AXIS_TICK_STYLE, CHART_MARGIN, TOOLTIP_CONTENT_STYLE, LEGEND_WRAPPER_STYLE, CHART_CARD_SX } from '../utils/chartStyles';
import DashboardMap from './DashboardMap';
import KPICards from './KPICards';
import DynamicParameterCards from './DynamicParameterCards';
import FullWidthParameterCards from './FullWidthParameterCards';
import SingleRowParameterCards from './SingleRowParameterCards';
import DashboardParameterDoughnuts from './DashboardParameterDoughnuts';
import PageHeader from './PageHeader';
import SectionHeader from './SectionHeader';
import { useFont } from '../contexts/FontContext';
import { getOptimalTextColor } from '../utils/colorUtils';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { usePermissions } from '../hooks/usePermissions';

// Utility: Format datetime in user's selected timezone
const getUserTimezone = () => localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';
const formatInUserTimezone = (dt, fmt = 'YYYY-MM-DD HH:mm:ss') => {
  if (!dt) return '-';
  return moment.utc(dt).tz(getUserTimezone()).format(fmt);
};

const Dashboard = ({ socket }) => {
  const { getFontColor } = useFont();
  const theme = useMuiTheme();
  const { userPermissions } = usePermissions();
  const [overview, setOverview] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [realtimeDevice, setRealtimeDevice] = useState('');
  const [realtimeData, setRealtimeData] = useState([]);
  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [realtimeError, setRealtimeError] = useState('');
  const [realtimeDeviceMapper, setRealtimeDeviceMapper] = useState(null);
  const [parameterColors, setParameterColors] = useState({});
  const [realtimeParams, setRealtimeParams] = useState([]);
  const [realtimeLatest, setRealtimeLatest] = useState({});
  const [visibleParams, setVisibleParams] = useState([]);
  const [activeRealtimeParam, setActiveRealtimeParam] = useState('');
  const [realtimeParamSearch, setRealtimeParamSearch] = useState('');
  const [realtimeAlertLogs, setRealtimeAlertLogs] = useState([]);
  const [realtimeAlertThresholds, setRealtimeAlertThresholds] = useState({}); // { normalizedParam: { min, max } } for realtime device
  const [realtimeChartRange, setRealtimeChartRange] = useState('48h'); // '2h' | '3h' | '6h' | '48h' (default)
  const { formatDisplayName, getUnit } = useFieldMetadata();

  const REALTIME_RANGE_OPTIONS = [
    { value: '48h', label: 'Default' },
    { value: '2h', label: 'Last 2 hours' },
    { value: '3h', label: 'Last 3 hours' },
    { value: '6h', label: 'Last 6 hours' },
  ];
  const realtimeRangeHours = useMemo(() => ({ '2h': 2, '3h': 3, '6h': 6, '48h': 48 })[realtimeChartRange] ?? 48, [realtimeChartRange]);

  const [paramOverviewOpen, setParamOverviewOpen] = useState(() => {
    try {
      return localStorage.getItem('dashboard_param_overview_open') !== '0';
    } catch {
      return true;
    }
  });
  const [mapSectionOpen, setMapSectionOpen] = useState(() => {
    try {
      return localStorage.getItem('dashboard_map_open') !== '0';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('dashboard_param_overview_open', paramOverviewOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [paramOverviewOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('dashboard_map_open', mapSectionOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [mapSectionOpen]);

  // Normalize parameter name for matching (alert_logs may use spaces or underscores)
  const normalizeParamForAlert = (p) => (p || '').toString().toLowerCase().replace(/\s+/g, '_');

  // Check if user is admin or super_admin
  const isAdmin = useMemo(() => {
    if (!userPermissions) return false;
    const userRole = userPermissions.role;
    return userRole === 'admin' || userRole === 'super_admin';
  }, [userPermissions]);

  // Memoized chart data to prevent flickering
  const memoizedChartData = useMemo(() => {
    if (!realtimeData || realtimeData.length === 0) return [];
    
    return realtimeData
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) // Sort by timestamp (oldest to newest)
      .map(r => ({
        timestamp: formatInUserTimezone(r.timestamp),
        originalTimestamp: r.timestamp, // Keep original for sorting
        ...r
      }));
  }, [realtimeData]);

  // Merge alert timestamps into chart data: one red dot per alert at the closest chart point, only if that point's value is actually out of range (above max or below min)
  const chartDataWithAlerts = useMemo(() => {
    if (!memoizedChartData.length || !realtimeAlertLogs.length) return memoizedChartData;
    const dataParams = realtimeParams.filter(p => p !== 'datetime' && p !== 'timestamp');
    const points = memoizedChartData.map(pt => ({ ...pt, _alerts: {} }));
    const getPointTime = (pt) => new Date(pt.originalTimestamp).getTime();

    realtimeAlertLogs.forEach((log) => {
      const norm = normalizeParamForAlert(log.parameter);
      if (!norm) return;
      const paramKey = dataParams.find(p => normalizeParamForAlert(p) === norm);
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
        const outOfRange = (thresholds.min != null && numVal < thresholds.min) || (thresholds.max != null && numVal > thresholds.max);
        if (outOfRange) points[bestIdx]._alerts[paramKey] = true;
      }
    });

    return points;
  }, [memoizedChartData, realtimeAlertLogs, realtimeParams, realtimeAlertThresholds]);

  const selectableRealtimeParams = useMemo(() => {
    const list = realtimeParams.filter(p => p !== 'datetime' && p !== 'timestamp');
    const q = (realtimeParamSearch || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      const label = formatDisplayName(p, { withUnit: true });
      return p.toLowerCase().includes(q) || (label || '').toLowerCase().includes(q);
    });
  }, [realtimeParams, realtimeParamSearch, formatDisplayName]);

  const toggleVisibleParam = useCallback((param) => {
    setVisibleParams((v) => (v.includes(param) ? v.filter((p) => p !== param) : [...v, param]));
  }, []);

  const focusParam = useCallback((param) => {
    setActiveRealtimeParam((prev) => (prev === param ? '' : param));
  }, []);

  const getTooltipRows = useCallback((payload = []) => {
    const hashColor = (param) => {
      const s = String(param || '');
      let hash = 0;
      for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash &= hash;
      }
      const colors = CHART_COLORS;
      return colors[Math.abs(hash) % colors.length];
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

    return (payload || [])
      .filter((p) => p && p.dataKey && visibleParams.includes(p.dataKey))
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
  }, [visibleParams, formatDisplayName, getUnit]);

  const RealtimeTooltip = useCallback(({ active, payload, label }) => {
    if (!active) return null;
    const rows = getTooltipRows(payload);
    if (!rows.length) return null;
    return (
      <Box
        sx={{
          ...TOOLTIP_CONTENT_STYLE,
          padding: 1.25,
          borderRadius: 1.5,
          minWidth: 260,
        }}
      >
        <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', mb: 0.75 }}>
          {formatInUserTimezone(label)}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {rows.map((r) => (
            <Box
              key={r.key}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: r.color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.label}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, flexShrink: 0 }}>
                {r.valueText}
              </Typography>
            </Box>
          ))}
        </Box>
        {activeRealtimeParam && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.secondary', fontWeight: 600 }}>
            Focus: {formatDisplayName(activeRealtimeParam, { withUnit: true })}
          </Typography>
        )}
      </Box>
    );
  }, [getTooltipRows, activeRealtimeParam, formatDisplayName]);

  const colorPalette = CHART_COLORS;

  // Function to get color for parameter based on name hash
  const getParameterColor = (param) => {
    let hash = 0;
    for (let i = 0; i < param.length; i++) {
      const char = param.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const index = Math.abs(hash) % colorPalette.length;
    return colorPalette[index];
  };

  // Red dot shown at data points where an alert occurred for this parameter (a bit bigger for visibility)
  const renderAlertDot = (param) => (props) => {
    const { cx, cy, payload } = props;
    if (payload._alerts && payload._alerts[param]) {
      return (
        <circle cx={cx} cy={cy} r={8} fill="#EF4444" stroke="#fff" strokeWidth={2} />
      );
    }
    return null;
  };

  // Memoized chart lines to prevent unnecessary re-renders
  const memoizedChartLines = useMemo(() => 
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
          strokeWidth={focused ? 3 : 1.5}
          strokeOpacity={focused ? 1 : 0.28}
          dot={renderAlertDot(param)}
          activeDot={{ r: focused ? 6 : 4, strokeWidth: 2, fill: color }}
          isAnimationActive={false}
          connectNulls={false}
        />
      );
    }), [visibleParams, formatDisplayName, activeRealtimeParam]);

  // Phase-II: sparkline + delta per parameter (computed from realtimeData)
  const realtimeCardMetrics = useMemo(() => {
    const params = realtimeParams.filter(p => p !== 'datetime' && p !== 'timestamp');
    const out = {};
    if (!Array.isArray(realtimeData) || realtimeData.length === 0 || params.length === 0) {
      params.forEach(p => { out[p] = { spark: [], deltaPct: null }; });
      return out;
    }

    // Ensure chronological order (oldest -> newest)
    const rows = [...realtimeData].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const getNum = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n : null;
    };

    const sparkPoints = 30; // last N points displayed
    const win = 10; // delta computed as avg(last win) vs avg(prev win)

    params.forEach((p) => {
      const series = rows
        .map(r => ({ t: r.timestamp, v: getNum(r[p]) }))
        .filter(pt => pt.v !== null);

      const sparkSlice = series.slice(Math.max(0, series.length - sparkPoints));
      const spark = sparkSlice.map((pt, idx) => ({ idx, value: pt.v }));

      let deltaPct = null;
      if (series.length >= win * 2) {
        const prev = series.slice(series.length - win * 2, series.length - win).map(x => x.v);
        const curr = series.slice(series.length - win).map(x => x.v);
        const avgPrev = prev.reduce((a, b) => a + b, 0) / prev.length;
        const avgCurr = curr.reduce((a, b) => a + b, 0) / curr.length;
        if (avgPrev !== 0) deltaPct = ((avgCurr - avgPrev) / avgPrev) * 100;
        else deltaPct = null;
      }
      out[p] = { spark, deltaPct };
    });
    return out;
  }, [realtimeData, realtimeParams]);

  const formatParameterValue = useCallback(
    (param, value, precision = 2, includeUnit = true) => {
      if (value === null || value === undefined || value === '') {
        return '-';
      }
      const unit = getUnit(param);
      if (typeof value === 'number') {
        const formatted = Number.isFinite(value) ? value.toFixed(precision) : value;
        return includeUnit && unit ? `${formatted} ${unit}` : `${formatted}`;
      }
      if (typeof value === 'string') {
        const numeric = parseFloat(value);
        if (!Number.isNaN(numeric)) {
          const formatted = Number.isFinite(numeric) ? numeric.toFixed(precision) : numeric;
          return includeUnit && unit ? `${formatted} ${unit}` : `${formatted}`;
        }
        return includeUnit && unit ? `${value} ${unit}` : value;
      }
      return includeUnit && unit ? `${value} ${unit}` : value;
    },
    [getUnit]
  );

  useEffect(() => {
    loadDashboardData();
    
    // Load parameter colors
    const loadParameterColors = () => {
      const savedColors = localStorage.getItem('kima_parameter_colors');
      if (savedColors) {
        setParameterColors(JSON.parse(savedColors));
      }
    };
    
    loadParameterColors();
    
    // Listen for parameter color changes (throttled; paused when tab hidden)
    let colorInterval = null;
    
    // Set up real-time updates
    if (socket) {
      socket.on('device_status_update', handleDeviceUpdate);
      socket.on('data_update', handleDataUpdate);
    }

    // Refresh data every 30 seconds (paused when tab hidden)
    let dataInterval = null;

    const startIntervals = () => {
      if (!colorInterval) colorInterval = setInterval(loadParameterColors, 3000);
      if (!dataInterval) dataInterval = setInterval(loadDashboardData, 30000);
    };
    const stopIntervals = () => {
      if (colorInterval) {
        clearInterval(colorInterval);
        colorInterval = null;
      }
      if (dataInterval) {
        clearInterval(dataInterval);
        dataInterval = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') stopIntervals();
      else {
        startIntervals();
        // refresh once when returning
        loadDashboardData();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    // Start intervals immediately if visible
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      startIntervals();
    }

    return () => {
      stopIntervals();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (socket) {
        socket.off('device_status_update', handleDeviceUpdate);
        socket.off('data_update', handleDataUpdate);
      }
    };
  }, [socket]);

  // Set default device when devices are loaded
  useEffect(() => {
    if (devices.length > 0 && !realtimeDevice) {
      setRealtimeDevice(devices[0].device_id);
    }
  }, [devices, realtimeDevice]);

  // When realtimeParams change, reset visibleParams to all (exclude datetime/timestamp so they don't appear as a chart series)
  useEffect(() => {
    const chartParams = realtimeParams.filter(p => p !== 'datetime' && p !== 'timestamp');
    setVisibleParams(chartParams);
    setActiveRealtimeParam('');
  }, [realtimeParams]);

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      
      // Load overview data
      const overviewResponse = await fetch(`${API_BASE_URL}/dashboard/overview`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (overviewResponse.ok) {
        const overviewData = await overviewResponse.json();
        setOverview(overviewData.overview);
      }

      // Load devices (use dropdown to get all devices with valid_from/valid_to for access period display)
      const devicesResponse = await fetch(`${API_BASE_URL}/devices/dropdown`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (devicesResponse.ok) {
        const devicesData = await devicesResponse.json();
        const deviceList = Array.isArray(devicesData) ? devicesData : (devicesData.devices || []);
        const activeDevices = deviceList.filter(device => device.status !== 'offline' && device.status !== 'deleted');
        setDevices(activeDevices);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceUpdate = (data) => {
    setDevices(prevDevices =>
      prevDevices.map(device =>
        device.device_id === data.device_id
          ? { ...device, status: data.status }
          : device
      )
    );
  };

  // Check if device access is valid for non-admins (valid_from/valid_to period)
  const isDeviceAccessValid = useCallback((device) => {
    if (isAdmin) return true;
    const from = device?.valid_from;
    const to = device?.valid_to;
    if (!from || !to) return false;
    const today = new Date().toISOString().slice(0, 10);
    return today >= (from?.slice?.(0, 10) ?? from) && today <= (to?.slice?.(0, 10) ?? to);
  }, [isAdmin]);

  const handleDataUpdate = (data) => {
    // Update overview statistics if needed
    if (overview) {
      setOverview(prev => ({
        ...prev,
        totalSensorData: prev.totalSensorData + (data.data_type === 'sensor' ? 1 : 0),
        totalGpsData: prev.totalGpsData + (data.data_type === 'gps' ? 1 : 0),
      }));
    }
  };

  // Fetch device mapper assignment and mapped fields for selected device
  useEffect(() => {
    if (!realtimeDevice) {
      setRealtimeDeviceMapper(null);
      setRealtimeParams([]);
      return;
    }
    const fetchMapper = async () => {
      try {
        const token = localStorage.getItem('iot_token');
        const res = await axios.get(`${API_BASE_URL}/device-mapper-assignments/${realtimeDevice}`, { headers: { 'Authorization': `Bearer ${token}` } });
        setRealtimeDeviceMapper(res.data.assignment);
        const mappedParams = res.data.assignment.mappings.map(m => m.target_field);
        // Add datetime if not already included
        if (!mappedParams.includes('datetime')) {
          mappedParams.unshift('datetime');
        }
        setRealtimeParams(mappedParams);
      } catch (e) {
        console.error('fetchMapper: Error', e);
        setRealtimeDeviceMapper(null);
        setRealtimeParams([]);
      }
    };
    fetchMapper();
  }, [realtimeDevice]);

  // Fetch mapped data from /data-dash for the selected time range (chart view); Parameter Overview still uses full 48h when range is default
  const fetchRealtimeData = async (deviceId, params, rangeHours = 48) => {
    if (!deviceId || !params || params.length === 0) {
      return;
    }
    try {
      const token = localStorage.getItem('iot_token');
      const startDate = subHours(new Date(), rangeHours).toISOString();
      const endDate = new Date().toISOString();
      const limit = rangeHours <= 6 ? 1000 : 5000;
      const response = await axios.get(`${API_BASE_URL}/data-dash`, {
        params: {
          deviceIds: deviceId,
          parameters: params.join(','),
          startDate,
          endDate,
          limit,
        },
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const mappedData = response.data.data || [];
      setRealtimeData(mappedData);
      
      // Set latest values for cards - find the actual latest data by timestamp
      if (mappedData.length > 0) {
        // Sort data by timestamp to find the actual latest
        const sortedData = mappedData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const latestRecord = sortedData[0]; // Get the newest record
        
        const latest = {};
        params.forEach(k => {
          if (latestRecord[k] !== undefined) {
            // Format datetime values properly
            if (k === 'datetime' || k === 'timestamp') {
              latest[k] = formatInUserTimezone(latestRecord[k]);
            } else {
              latest[k] = latestRecord[k];
            }
          }
        });
        setRealtimeLatest(latest);
      } else {
        setRealtimeLatest({});
      }
    } catch (e) {
      console.error('fetchRealtimeData: Error', e);
      setRealtimeError('Failed to load realtime data');
      setRealtimeData([]);
      setRealtimeLatest({});
    }
  };

  // Fetch alert logs for the realtime chart time range (so we can show red dots at alert points)
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
      .then((res) => res.ok ? res.json() : Promise.resolve({ logs: [] }))
      .then((data) => setRealtimeAlertLogs(data.logs || []))
      .catch(() => setRealtimeAlertLogs([]));
  }, [realtimeDevice, realtimeData]);

  // Fetch alert definitions (min/max thresholds) for the realtime device so we only show red dots when value is actually out of range
  useEffect(() => {
    if (!realtimeDevice) {
      setRealtimeAlertThresholds({});
      return;
    }
    const token = localStorage.getItem('iot_token');
    fetch(`${API_BASE_URL}/alerts`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.ok ? res.json() : Promise.resolve({ alerts: [] }))
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

  // Poll and socket for live updates
  useEffect(() => {
    if (!realtimeDevice || realtimeParams.length === 0) return;
    
    // Initial load
    fetchRealtimeData(realtimeDevice, realtimeParams, realtimeRangeHours);
    
    // Poll every 10 seconds
    const interval = setInterval(() => {
      fetchRealtimeData(realtimeDevice, realtimeParams, realtimeRangeHours);
    }, 10000);
    
    // WebSocket for real-time updates
    let deviceDataHandler;
    if (socket) {
      deviceDataHandler = (payload) => {
        if (payload.deviceId === realtimeDevice && payload.data) {
          // Update cards with real-time data using functional update
          setRealtimeLatest(prevLatest => {
            const newLatest = { ...prevLatest };
            let hasUpdates = false;
            
            realtimeParams.forEach(param => {
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
      if (socket && deviceDataHandler) {
        socket.off('device_data', deviceDataHandler);
      }
    };
  }, [realtimeDevice, realtimeParams, realtimeRangeHours, socket]);

  // Calculate Y axis min/max for visible parameters (exclude non-numeric like 'datetime')
  const getYDomain = () => {
    if (!realtimeData.length || !visibleParams.length) return [0, 'auto'];
    // Only consider numeric params (exclude 'datetime', 'timestamp', etc.)
    const numericParams = visibleParams.filter(
      p => p !== 'datetime' && p !== 'timestamp'
    );
    if (!numericParams.length) return [0, 'auto'];
    let minVal = Infinity, maxVal = -Infinity;
    for (const param of numericParams) {
      for (const row of realtimeData) {
        const v = row[param];
        if (typeof v === 'number' && !isNaN(v)) {
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
      }
    }
    if (minVal === Infinity || maxVal === -Infinity) return [0, 'auto'];
    if (minVal === maxVal) return [minVal - 1, maxVal + 1];
    return [minVal, maxVal];
  };

  const getStatusColor = (status) => {
    return status === 'online' ? 'success' : 'error';
  };

  const getStatusIcon = (status) => {
    return status === 'online' ? <CheckCircleIcon /> : <CancelIcon />;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <PageHeader
          icon={<DevicesIcon sx={{ fontSize: 18 }} />}
          title="Dashboard"
          subtitle="Overview, device status, and realtime monitoring"
          right={(
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' } }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                Device
              </Typography>
              <FormControl size="medium" sx={{ minWidth: { xs: '100%', sm: 260, md: 320 }, mt: 0.5 }}>
                <Select
                  value={realtimeDevice}
                  onChange={e => setRealtimeDevice(e.target.value)}
                  displayEmpty
                  sx={{
                    height: 36,
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.14)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                  }}
                >
                  {devices.map(d => {
                    const valid = isDeviceAccessValid(d);
                    return (
                      <MenuItem
                        key={d.device_id}
                        value={d.device_id}
                        sx={{ opacity: valid ? 1 : 0.6 }}
                      >
                        {d.name} ({d.device_id})
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
              {!isAdmin && realtimeDevice && (() => {
                const sel = devices.find(d => d.device_id === realtimeDevice);
                if (!sel) return null;
                const valid = isDeviceAccessValid(sel);
                return (
                  <Typography
                    variant="caption"
                    sx={{
                      mt: 0.5,
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      color: valid ? '#1B5E20' : 'error.main',
                    }}
                  >
                    {valid
                      ? `Valid until ${sel.valid_to ? new Date(sel.valid_to).toLocaleDateString() : '–'}`
                      : 'Access expired'}
                  </Typography>
                );
              })()}
            </Box>
          )}
        />
      </Box>

      {/* Statistics Cards - Only visible to admin/super_admin */}
      {isAdmin && (
        <Grid container spacing={{ xs: 2, sm: 2.5 }} sx={{ mb: { xs: 2, sm: 3 } }}>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <Box sx={{ mr: { xs: 1.5, sm: 2 }, p: 1.25, borderRadius: 1, bgcolor: 'rgba(37, 99, 235, 0.12)', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DevicesIcon sx={{ fontSize: { xs: 28, sm: 36 } }} />
                </Box>
                <Box>
                  <Typography color="textSecondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                    Total Devices
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                    {overview?.totalDevices || 0}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <Box sx={{ mr: { xs: 1.5, sm: 2 }, p: 1.25, borderRadius: 1, bgcolor: 'rgba(34, 197, 94, 0.12)', color: 'success.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <WifiIcon sx={{ fontSize: { xs: 28, sm: 36 } }} />
                </Box>
                <Box>
                  <Typography color="textSecondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                    Online Devices
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                    {devices.filter(d => d.status === 'online').length}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <Box sx={{ mr: { xs: 1.5, sm: 2 }, p: 1.25, borderRadius: 1, bgcolor: 'rgba(59, 130, 246, 0.12)', color: 'info.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PeopleIcon sx={{ fontSize: { xs: 28, sm: 36 } }} />
                </Box>
                <Box>
                  <Typography color="textSecondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                    Total Users
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                    {overview?.totalUsers || 0}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <Box sx={{ mr: { xs: 1.5, sm: 2 }, p: 1.25, borderRadius: 1, bgcolor: 'rgba(100, 116, 139, 0.12)', color: 'secondary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DataIcon sx={{ fontSize: { xs: 28, sm: 36 } }} />
                </Box>
                <Box>
                  <Typography color="textSecondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                    Data Points
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                    {(overview?.totalSensorData || 0) + (overview?.totalGpsData || 0)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      )}

      {/* Parameter Overview - visible to all users; collapsible */}
      <Box sx={{ mb: paramOverviewOpen ? 2 : 0, mt: 3 }}>
        <SectionHeader
          icon={<DataIcon sx={{ fontSize: 18 }} />}
          title="Parameter Overview"
          subtitle="Today vs yesterday average share (center shows current value)"
          right={
            <IconButton
              size="small"
              onClick={() => setParamOverviewOpen((v) => !v)}
              aria-expanded={paramOverviewOpen}
              aria-label={paramOverviewOpen ? 'Hide parameter overview' : 'Show parameter overview'}
              edge="end"
            >
              {paramOverviewOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          }
        />
      </Box>
      <Collapse in={paramOverviewOpen}>
        <Box>
          {realtimeParams.length > 0 ? (
            <DashboardParameterDoughnuts
              data={realtimeLatest}
              realtimeParams={realtimeParams}
              realtimeData={realtimeData}
              deviceId={realtimeDevice}
              formatDisplayName={formatDisplayName}
            />
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>
              No realtime parameters available. Please select a device with mapped parameters.
            </Alert>
          )}
        </Box>
      </Collapse>

      {/* Device Map Section — collapsible */}
      <Box sx={{ mt: 3 }}>
        <SectionHeader
          icon={<MapIcon sx={{ fontSize: 18 }} />}
          title="Device locations"
          subtitle="Map view of devices with GPS coordinates"
          right={
            <IconButton
              size="small"
              onClick={() => setMapSectionOpen((v) => !v)}
              aria-expanded={mapSectionOpen}
              aria-label={mapSectionOpen ? 'Hide map' : 'Show map'}
              edge="end"
            >
              {mapSectionOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          }
        />
      </Box>
      <Collapse in={mapSectionOpen}>
        <Box>
          <DashboardMap socket={socket} cardSx={{ mt: 0, mb: 2 }} />
        </Box>
      </Collapse>

      {/* Realtime Data View Section - Site Location style header */}
      <Card sx={{ 
        mt: 4, 
        mb: 4,
        borderRadius: 1,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        overflow: 'hidden'
      }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            px: 2.25,
            py: 1.25,
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            flexWrap: 'wrap',
            gap: 1
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mr: 1.25,
                  bgcolor: 'rgba(37, 99, 235, 0.10)',
                  color: 'primary.main',
                }}
              >
                <DataIcon sx={{ fontSize: 18 }} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: '1rem', lineHeight: 1.1 }}>
                Realtime Data View
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Monitor live parameters and alerts
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                Time range
              </Typography>
              <FormControl size="small" sx={{ minWidth: 170 }}>
                <Select
                  value={realtimeChartRange}
                  onChange={(e) => setRealtimeChartRange(e.target.value)}
                  sx={{
                    height: 34,
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.14)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                  }}
                >
                  {REALTIME_RANGE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>
          
          <Box sx={{ p: 3 }}>
          {realtimeError ? (
              <Alert severity="error" sx={{ borderRadius: 1, mb: 3 }}>
                {realtimeError}
              </Alert>
          ) : (
            <>
                {/* Modern KPI Cards */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ 
                    fontWeight: 600, 
                    color: theme.palette.text.primary, 
                    mb: 2,
                    fontSize: '1.1rem'
                  }}>
                    Current Values
                  </Typography>
                  <Grid container spacing={2}>
                    {realtimeParams.filter(p => p !== 'datetime' && p !== 'timestamp').map((param, idx) => {
                      const formattedLabel = formatDisplayName(param, { withUnit: true });
                      const formattedValue = formatParameterValue(param, realtimeLatest[param]);
                      const isFocused = activeRealtimeParam === param;
                      const metric = realtimeCardMetrics[param] || { spark: [], deltaPct: null };
                      const delta = metric.deltaPct;
                      const deltaColor = delta == null ? 'text.secondary' : (delta >= 0 ? 'success.main' : 'error.main');
                      return (
                      <Grid size={{ xs: 6, sm: 4, md: 2 }} key={param}>
                        <Card sx={{
                          p: 2,
                          textAlign: 'center',
                          borderRadius: 1,
                          border: `1px solid ${colorPalette[idx % colorPalette.length]}30`,
                          bgcolor: `${colorPalette[idx % colorPalette.length]}10`,
                          transition: 'all 0.2s ease',
                          height: 118,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          boxShadow: isFocused ? `0 0 0 2px ${colorPalette[idx % colorPalette.length]}70` : 'none',
                          transform: isFocused ? 'translateY(-1px)' : 'none',
                          '&:hover': { boxShadow: `0 4px 12px ${colorPalette[idx % colorPalette.length]}25` }
                        }}>
                          <Box
                            onClick={() => setActiveRealtimeParam(prev => (prev === param ? '' : param))}
                            sx={{ width: '100%' }}
                          >
                          <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 500, mb: 1, fontSize: '0.8125rem', minHeight: '2.5em', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {formattedLabel}
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 700, color: colorPalette[idx % colorPalette.length], fontSize: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {formattedValue}
                          </Typography>
                          <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: deltaColor }}>
                              {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
                            </Typography>
                            <Box sx={{ flex: 1, height: 22, minWidth: 60 }}>
                              {metric.spark.length >= 2 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={metric.spark} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                                    <Line
                                      type="monotone"
                                      dataKey="value"
                                      stroke={colorPalette[idx % colorPalette.length]}
                                      strokeWidth={2}
                                      dot={false}
                                      isAnimationActive={false}
                                      opacity={0.9}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              ) : (
                                <Box sx={{ height: 22 }} />
                              )}
                            </Box>
                          </Box>
                          </Box>
                    </Card>
                  </Grid>
                );})}
              </Grid>
                </Box>

                {/* Modern Parameter Controls */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ 
                    fontWeight: 600, 
                    color: theme.palette.text.primary, 
                    mb: 1.25,
                    fontSize: '1rem'
                  }}>
                    Chart Controls
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75, gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.72rem' }}>
                      Click a metric card to focus a line. Use chips to show/hide lines.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          const chartParams = realtimeParams.filter(p => p !== 'datetime' && p !== 'timestamp');
                          setVisibleParams(chartParams);
                          setActiveRealtimeParam('');
                        }}
                        sx={{ py: 0.25, minHeight: 28, fontSize: '0.75rem' }}
                      >
                        Show all
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setActiveRealtimeParam('')}
                        sx={{ py: 0.25, minHeight: 28, fontSize: '0.75rem' }}
                      >
                        Clear focus
                      </Button>
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      p: 1.5,
                      backgroundColor: 'rgba(0,0,0,0.02)',
                      borderRadius: 1,
                      border: '1px solid rgba(0,0,0,0.06)',
                    }}
                  >
                    <TextField
                      size="small"
                      placeholder="Search parameter…"
                      value={realtimeParamSearch}
                      onChange={(e) => setRealtimeParamSearch(e.target.value)}
                      sx={{ mb: 1, maxWidth: 320, '& input': { fontSize: '0.82rem' } }}
                    />
                    <ToggleButtonGroup
                      value={visibleParams}
                      onChange={(_, newValue) => setVisibleParams(newValue)}
                      size="small"
                      sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButtonGroup-grouped': { border: 'none' } }}
                    >
                      {selectableRealtimeParams.map((param) => {
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
                              borderRadius: 2,
                              px: 1,
                              py: 0.5,
                              minHeight: 30,
                              gap: 1,
                              opacity: dim ? 0.55 : 1,
                              bgcolor: selected ? `${color}18` : 'transparent',
                              border: `1px solid ${selected ? `${color}55` : 'rgba(0,0,0,0.14)'}`,
                              '&:hover': { bgcolor: selected ? `${color}24` : 'rgba(0,0,0,0.04)' },
                            }}
                          >
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 650 }}>
                              {formatDisplayName(param, { withUnit: true })}
                            </Typography>
                          </ToggleButton>
                        );
                      })}
                    </ToggleButtonGroup>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.secondary', fontSize: '0.72rem' }}>
                      Tip: double‑click a toggle to focus its line.
                    </Typography>
                  </Box>
                </Box>

                {/* Chart */}
                <Box sx={{ height: 420, ...CHART_CARD_SX }}>
                  <ResponsiveContainer key={`responsive-${visibleParams.join('-')}-${realtimeDevice}`} width="100%" height="100%">
                    <LineChart data={chartDataWithAlerts} margin={CHART_MARGIN}>
                      <CartesianGrid {...CARTESIAN_GRID_PROPS} />
                      <XAxis
                        dataKey="timestamp"
                        minTickGap={24}
                        tick={AXIS_TICK_STYLE}
                        tickFormatter={(value) => {
                          if (typeof value === 'string' && !value.includes('T')) return value;
                          return formatInUserTimezone(value);
                        }}
                      />
                      <YAxis type="number" tick={AXIS_TICK_STYLE} domain={([dataMin, dataMax]) => (dataMin === 0 ? [0, dataMax] : [dataMin, dataMax])} allowDataOverflow />
                      <Tooltip
                        content={RealtimeTooltip}
                        cursor={{ stroke: 'rgba(2, 132, 199, 0.45)', strokeWidth: 1 }}
                      />
                      <Legend
                        wrapperStyle={LEGEND_WRAPPER_STYLE}
                        formatter={(value, entry) => formatDisplayName(entry?.dataKey || value, { withUnit: true })}
                        onClick={(e) => {
                          const key = e?.dataKey || e?.value;
                          if (!key) return;
                          toggleVisibleParam(key);
                        }}
                        onDoubleClick={(e) => {
                          const key = e?.dataKey || e?.value;
                          if (!key) return;
                          focusParam(key);
                        }}
                      />
                      {memoizedChartLines}
                      <Brush
                        dataKey="timestamp"
                        height={24}
                        stroke="rgba(2, 132, 199, 0.55)"
                        travellerWidth={10}
                        tickFormatter={() => ''}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#EF4444', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(239,68,68,0.35)' }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 650 }}>
                      Alert dot = threshold breach
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Tip: click legend to hide/show; double‑click to focus.
                  </Typography>
                </Box>
            </>
          )}
          </Box>
        </CardContent>
      </Card>

      {/* Device Status and System Status - Only visible to admin/super_admin */}
      {isAdmin && (
        <Grid container spacing={{ xs: 2, sm: 2.5 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography 
                variant="h6" 
                gutterBottom 
                sx={{ 
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                  color: theme.palette.text.primary + ' !important' // Theme-aware text color
                }}
              >
                Device Status
              </Typography>
              {devices.length === 0 ? (
                <Typography 
                  sx={{ 
                    fontSize: { xs: '0.875rem', sm: '1rem' },
                    color: theme.palette.text.primary + ' !important' // Theme-aware text color
                  }}
                >
                  No devices found. Add your first device to get started!
                </Typography>
              ) : (
                <List sx={{ p: 0 }}>
                  {devices.map((device) => (
                    <ListItem key={device.device_id} divider sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        {getStatusIcon(device.status)}
                      </ListItemIcon>
                      <ListItemText
                        primary={device.name}
                        secondary={`${device.device_id} • ${device.protocol}`}
                        sx={{
                          '& .MuiListItemText-primary': { 
                            fontSize: { xs: '0.875rem', sm: '1rem' },
                            color: theme.palette.text.primary + ' !important' // Theme-aware text color
                          },
                          '& .MuiListItemText-secondary': { 
                            fontSize: { xs: '0.75rem', sm: '0.875rem' },
                            color: theme.palette.text.primary + ' !important' // Theme-aware text color
                          }
                        }}
                      />
                      <Chip
                        label={device.status}
                        color={getStatusColor(device.status)}
                        size="small"
                        sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' }, fontWeight: 600 }}>
                System Status
              </Typography>
              <List sx={{ p: 0 }}>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <CheckCircleIcon color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Database Connection"
                    secondary="Connected"
                    sx={{
                      '& .MuiListItemText-primary': { 
                        fontSize: { xs: '0.875rem', sm: '1rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      },
                      '& .MuiListItemText-secondary': { 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      }
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <CheckCircleIcon color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="MQTT Broker"
                    secondary="Connected"
                    sx={{
                      '& .MuiListItemText-primary': { 
                        fontSize: { xs: '0.875rem', sm: '1rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      },
                      '& .MuiListItemText-secondary': { 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      }
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <CheckCircleIcon color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Real-time Updates"
                    secondary="Active"
                    sx={{
                      '& .MuiListItemText-primary': { 
                        fontSize: { xs: '0.875rem', sm: '1rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      },
                      '& .MuiListItemText-secondary': { 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      }
                    }}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      )}
    </Box>
  );
};

export default Dashboard; 