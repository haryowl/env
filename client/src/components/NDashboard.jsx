import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { filterDataViewParams } from '../utils/fieldCategory';
import { alertAppliesToDevice } from '../utils/alertDevices';
import DashboardMap from './DashboardMap';
import RealtimeChartDisplaySelect from './RealtimeChartDisplaySelect';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import HeatRatioModal, { resolveHeatProgram } from './HeatRatioModal';
import TmatSimulationModal from './TmatSimulationModal';
import { hasTmatSimulationParams } from '../utils/tmatSimulationData';
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

const GROUP_FILTER_ALL = 'all';
const GROUP_FILTER_UNGROUPED = 'ungrouped';

/** Fit Y-axis to data with light padding so single-parameter fluctuations are visible. */
const padChartYDomain = ([dMin, dMax]) => {
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

function newestHistoryRow(rows) {
  if (!rows?.length) return null;
  return rows.reduce((best, row) => {
    const t = new Date(row.datetime ?? row.timestamp).getTime();
    if (!Number.isFinite(t)) return best;
    const bt = best ? new Date(best.datetime ?? best.timestamp).getTime() : -Infinity;
    return t > bt ? row : best;
  }, null);
}

function snapshotFromHistoryRow(row, params) {
  if (!row) return { fields: {}, updatedAt: null };
  const fields = {};
  params.forEach((p) => {
    const v = toNumber(row[p]);
    if (v !== null) fields[p] = v;
  });
  return {
    fields,
    updatedAt: row.datetime ?? row.timestamp ?? null,
  };
}

/** Normalize a parameter name to match how alerts store their `parameter` field. */
function normalizeParamKey(p) {
  return (p || '').toString().toLowerCase().replace(/\s+/g, '_');
}

const BAR_GREEN = '#10B981';
const BAR_RED = '#EF4444';

/**
 * Resolve how the Latest Readings bar for a parameter should render.
 * Length scale: field display range -> alert threshold band -> window max.
 * Color: green/red from alert thresholds when configured, else neutral param color.
 */
function resolveBar({ value, displayRange, threshold, windowMax, neutralColor }) {
  let pct = 0;
  if (displayRange) {
    pct = ((value - displayRange.min) / (displayRange.max - displayRange.min)) * 100;
  } else if (threshold && threshold.min != null && threshold.max != null && threshold.max > threshold.min) {
    pct = ((value - threshold.min) / (threshold.max - threshold.min)) * 100;
  } else if (windowMax && windowMax !== 0) {
    pct = (value / windowMax) * 100;
  }
  pct = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));

  let color = neutralColor;
  let breached = false;
  if (threshold && (threshold.min != null || threshold.max != null)) {
    breached =
      (threshold.min != null && value < threshold.min) ||
      (threshold.max != null && value > threshold.max);
    color = breached ? BAR_RED : BAR_GREEN;
  }
  return { pct, color, breached, hasThreshold: !!(threshold && (threshold.min != null || threshold.max != null)) };
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
  const { formatDisplayName, getUnit, getDisplayRange, metadata: fieldMetadata } = useFieldMetadata();

  const [devices, setDevices] = useState([]);
  const [catalogGroups, setCatalogGroups] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [groupFilter, setGroupFilter] = useState(() => {
    try {
      return localStorage.getItem('n_dashboard_group_filter') || GROUP_FILTER_ALL;
    } catch {
      return GROUP_FILTER_ALL;
    }
  });
  const [latest, setLatest] = useState({ fields: {}, updatedAt: null });
  const [mappedParams, setMappedParams] = useState([]);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [alertThresholds, setAlertThresholds] = useState({});
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
  /** null = show all params; string[] = multi-select combine mode */
  const [selectedChartParams, setSelectedChartParams] = useState(null);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [heatRatioOpen, setHeatRatioOpen] = useState(false);
  const [tmat3dOpen, setTmat3dOpen] = useState(false);

  const selectedDevice = devices.find((d) => d.device_id === selectedDeviceId) || null;
  const rangeHours = ({ '2h': 2, '3h': 3, '6h': 6, '48h': 48 })[chartRange] ?? 48;

  const knownGroups = useMemo(() => {
    const map = new Map();
    catalogGroups.forEach((g) => {
      if (g?.group_id && g?.name) {
        map.set(String(g.group_id), {
          id: String(g.group_id),
          name: g.name,
          description: g.description || '',
        });
      }
    });
    devices.forEach((d) => {
      if (d.group_id && d.group_name && !map.has(String(d.group_id))) {
        map.set(String(d.group_id), {
          id: String(d.group_id),
          name: d.group_name,
          description: d.group_description || '',
        });
      }
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogGroups, devices]);

  const filteredDevices = useMemo(() => {
    if (groupFilter === GROUP_FILTER_ALL) return devices;
    if (groupFilter === GROUP_FILTER_UNGROUPED) return devices.filter((d) => !d.group_id);
    return devices.filter((d) => String(d.group_id) === String(groupFilter));
  }, [devices, groupFilter]);

  const siteOverviewSections = useMemo(() => {
    const byKey = new Map();
    filteredDevices.forEach((d) => {
      const key = d.group_id ? String(d.group_id) : GROUP_FILTER_UNGROUPED;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          name: d.group_id ? (d.group_name || 'Group') : 'Ungrouped',
          devices: [],
        });
      }
      byKey.get(key).devices.push(d);
    });
    const named = [...byKey.values()]
      .filter((section) => section.key !== GROUP_FILTER_UNGROUPED)
      .sort((a, b) => a.name.localeCompare(b.name));
    const ungrouped = byKey.get(GROUP_FILTER_UNGROUPED);
    return ungrouped ? [...named, ungrouped] : named;
  }, [filteredDevices]);

  const overviewSubtitle = useMemo(() => {
    const fromDevice = selectedDevice?.group_description?.trim();
    if (fromDevice) return fromDevice;
    if (groupFilter !== GROUP_FILTER_ALL && groupFilter !== GROUP_FILTER_UNGROUPED) {
      const group = knownGroups.find((g) => g.id === String(groupFilter));
      if (group?.description?.trim()) return group.description.trim();
    }
    return 'Monitoring overview';
  }, [selectedDevice, groupFilter, knownGroups]);

  useEffect(() => {
    try {
      localStorage.setItem('n_dashboard_group_filter', groupFilter);
    } catch {
      // Ignore storage restrictions.
    }
  }, [groupFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('realtime_chart_display_mode', chartDisplayMode);
    } catch {
      // Ignore storage restrictions.
    }
  }, [chartDisplayMode]);

  useEffect(() => {
    if (!filteredDevices.length) return;
    if (!filteredDevices.some((d) => d.device_id === selectedDeviceId)) {
      setSelectedDeviceId(filteredDevices[0].device_id);
    }
  }, [filteredDevices, selectedDeviceId]);

  // ---- Data loading -------------------------------------------------------
  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem('iot_token')}`,
  }), []);

  useEffect(() => {
    const load = async () => {
      setLoadingDevices(true);
      try {
        const [allRes, coordRes, groupsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/devices`, { headers: authHeaders() }),
          axios.get(`${API_BASE_URL}/devices/with-coordinates`, { headers: authHeaders() }).catch(() => ({ data: { devices: [] } })),
          axios.get(`${API_BASE_URL}/device-groups`, { headers: authHeaders() }).catch(() => ({ data: { groups: [] } })),
        ]);
        setCatalogGroups(groupsRes.data.groups || []);
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

  // Load mapped parameters from device mapper (same source as U-Dashboard)
  useEffect(() => {
    if (!selectedDeviceId) {
      setMappedParams([]);
      setLatest({ fields: {}, updatedAt: null });
      return;
    }
    let cancelled = false;
    const loadMapper = async () => {
      setMappedParams([]);
      setLatest({ fields: {}, updatedAt: null });
      try {
        const res = await axios.get(
          `${API_BASE_URL}/device-mapper-assignments/${selectedDeviceId}`,
          { headers: authHeaders() }
        );
        if (cancelled) return;
        let params = (res.data.assignment?.mappings || []).map((m) => m.target_field);
        params = filterDataViewParams(params, fieldMetadata);
        setMappedParams(orderParams(params.filter((p) => !NON_PARAM_KEYS.has(p))));
      } catch {
        if (!cancelled) setMappedParams([]);
      }
    };
    loadMapper();
    return () => { cancelled = true; };
  }, [selectedDeviceId, authHeaders, fieldMetadata]);

  // Numeric parameters available on the selected device (drives KPIs, chart, readings)
  const availableParams = useMemo(() => {
    const keySet = new Set(mappedParams);
    const addKeysFrom = (obj) => {
      Object.keys(obj || {}).forEach((k) => {
        if (NON_PARAM_KEYS.has(k)) return;
        if (toNumber(obj[k]) !== null) keySet.add(k);
      });
    };
    addKeysFrom(latest.fields);
    history.forEach((row) => addKeysFrom(row));
    return orderParams([...keySet]);
  }, [mappedParams, latest.fields, history]);

  const showTmat3dButton = useMemo(() => {
    const groupMeta = knownGroups.find((g) => {
      if (selectedDevice?.group_id && String(g.id) === String(selectedDevice.group_id)) return true;
      if (groupFilter !== GROUP_FILTER_ALL && groupFilter !== GROUP_FILTER_UNGROUPED
        && String(g.id) === String(groupFilter)) return true;
      return false;
    });
    const program = resolveHeatProgram(
      selectedDevice?.group_name || groupMeta?.name,
      selectedDevice?.group_description || groupMeta?.description
    );
    if (program === 'tmat') return true;
    return hasTmatSimulationParams(availableParams);
  }, [selectedDevice, availableParams, knownGroups, groupFilter]);

  // All numeric mapped parameters are represented. The layout wraps as needed.
  const chartParams = availableParams;
  const kpiParams = availableParams;

  useEffect(() => {
    if (!selectedChartParams) return;
    const next = selectedChartParams.filter((p) => availableParams.includes(p));
    if (next.length === 0) {
      setSelectedChartParams(null);
    } else if (next.length !== selectedChartParams.length) {
      setSelectedChartParams(next);
    }
  }, [availableParams, selectedChartParams]);

  const toggleChartParam = useCallback((key) => {
    if (key === 'all') {
      setSelectedChartParams(null);
      return;
    }
    setSelectedChartParams((prev) => {
      // From All: start combine mode with this parameter only
      if (prev == null) return [key];
      if (prev.includes(key)) {
        const next = prev.filter((p) => p !== key);
        return next.length === 0 ? null : next;
      }
      const next = [...prev, key];
      // Selecting every parameter collapses back to All
      if (chartParams.length > 0 && next.length >= chartParams.length) return null;
      return next;
    });
  }, [chartParams.length]);

  const historyFetchAbortRef = useRef(null);

  const fetchHistory = useCallback(async ({ silent = false } = {}) => {
    if (!selectedDeviceId || chartParams.length === 0) {
      setHistory([]);
      return;
    }
    historyFetchAbortRef.current?.abort();
    const controller = new AbortController();
    historyFetchAbortRef.current = controller;
    if (!silent) setLoadingHistory(true);
    try {
      const isCustom = chartRange === 'custom';
      const end = isCustom ? new Date(customEnd) : new Date();
      const start = isCustom ? new Date(customStart) : new Date(end.getTime() - rangeHours * 3600 * 1000);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
        setHistory([]);
        if (!silent) setLoadingHistory(false);
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
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const rows = (res.data.data || []).map((row) => {
        const out = { datetime: row.datetime, timestamp: row.timestamp };
        chartParams.forEach((p) => { out[p] = toNumber(row[p]); });
        return out;
      });
      setHistory(rows);
      const snapshot = snapshotFromHistoryRow(newestHistoryRow(rows), chartParams);
      if (Object.keys(snapshot.fields).length > 0) {
        setLatest(snapshot);
      }
    } catch (e) {
      if (controller.signal.aborted || e?.code === 'ERR_CANCELED') return;
      setHistory([]);
      setLatest({ fields: {}, updatedAt: null });
    } finally {
      if (!controller.signal.aborted && !silent) setLoadingHistory(false);
    }
  }, [selectedDeviceId, chartParams.join(','), chartRange, rangeHours, customStart, customEnd, authHeaders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Match Dashboard / U-Dashboard: keep preset ranges live via polling (skip custom fixed window).
  useEffect(() => {
    if (!selectedDeviceId || chartParams.length === 0) return undefined;
    if (chartRange === 'custom') {
      fetchHistory({ silent: false });
      return () => {
        historyFetchAbortRef.current?.abort();
      };
    }

    fetchHistory({ silent: false });
    let interval = null;
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        fetchHistory({ silent: true });
      }, 15000);
    };
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopPolling();
      else {
        fetchHistory({ silent: true });
        startPolling();
      }
    };
    if (document.visibilityState !== 'hidden') startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      historyFetchAbortRef.current?.abort();
    };
  }, [fetchHistory, selectedDeviceId, chartParams.length, chartRange]);

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

  // Per-device alert thresholds drive Latest Readings colors (green in-range / red breach)
  useEffect(() => {
    if (!selectedDeviceId) {
      setAlertThresholds({});
      return;
    }
    let cancelled = false;
    const loadThresholds = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/alerts`, { headers: authHeaders() });
        if (cancelled) return;
        const byParam = {};
        (res.data.alerts || [])
          .filter((a) => alertAppliesToDevice(a, selectedDeviceId))
          .forEach((a) => {
            const key = normalizeParamKey(a.parameter);
            if (!key) return;
            const min = a.min != null ? Number(a.min) : null;
            const max = a.max != null ? Number(a.max) : null;
            const existing = byParam[key] || { min: null, max: null };
            if (min != null && (existing.min == null || min < existing.min)) existing.min = min;
            if (max != null && (existing.max == null || max > existing.max)) existing.max = max;
            byParam[key] = existing;
          });
        setAlertThresholds(byParam);
      } catch {
        if (!cancelled) setAlertThresholds({});
      }
    };
    loadThresholds();
    return () => { cancelled = true; };
  }, [selectedDeviceId, authHeaders]);

  // ---- Live socket updates (cards + chart point; poll refreshes full window) ----
  useDeviceSocketSubscription(socket, selectedDeviceId);
  useSocketEvent(
    socket,
    'device_data',
    (payload) => {
      if (!payload || payload.deviceId !== selectedDeviceId || !payload.data) return;
      const patch = {};
      const row = {};
      availableParams.forEach((p) => {
        if (payload.data[p] !== undefined && payload.data[p] !== null) {
          patch[p] = payload.data[p];
          const n = toNumber(payload.data[p]);
          if (n !== null) row[p] = n;
        }
      });
      if (Object.keys(patch).length === 0) return;
      const updatedAt = payload.timestamp
        ? new Date(payload.timestamp).toISOString()
        : new Date().toISOString();
      setLatest((prev) => ({
        fields: { ...prev.fields, ...patch },
        updatedAt,
      }));
      // Instant chart update between polls (preset ranges only — custom is a fixed historical window)
      if (chartRange === 'custom' || Object.keys(row).length === 0) return;
      setHistory((prev) => {
        const nextRow = { datetime: updatedAt, timestamp: updatedAt, ...row };
        const last = newestHistoryRow(prev);
        if (last) {
          const lastTs = new Date(last.datetime ?? last.timestamp).getTime();
          const nextTs = new Date(updatedAt).getTime();
          if (Number.isFinite(lastTs) && Number.isFinite(nextTs) && nextTs <= lastTs) {
            return prev;
          }
        }
        return [...prev, nextRow];
      });
    },
    Boolean(selectedDeviceId && availableParams.length > 0)
  );

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

  const showAllChartParams = selectedChartParams == null;
  const visibleChartParams = showAllChartParams
    ? chartParams
    : chartParams.filter((p) => selectedChartParams.includes(p));
  const chartData = useMemo(
    () => buildRealtimeChartSeries(history, chartParams, chartDisplayMode, fieldMetadata)
      .map((row) => {
        const raw = row.originalTimestamp ?? row.datetime ?? row.timestamp;
        const t = raw != null && raw !== '' ? new Date(raw).getTime() : NaN;
        return { ...row, t: Number.isFinite(t) ? t : 0 };
      })
      .filter((row) => row.t > 0),
    [history, chartParams, chartDisplayMode, fieldMetadata]
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
            {overviewSubtitle}
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
          <FormControl size="small" sx={{ minWidth: 140, maxWidth: { xs: 180, sm: 220 } }}>
            <InputLabel id="nd-group">Group</InputLabel>
            <Select
              labelId="nd-group"
              label="Group"
              value={
                groupFilter === GROUP_FILTER_ALL
                || groupFilter === GROUP_FILTER_UNGROUPED
                || knownGroups.some((g) => g.id === String(groupFilter))
                  ? groupFilter
                  : GROUP_FILTER_ALL
              }
              onChange={(e) => setGroupFilter(e.target.value)}
              sx={{ fontSize: '0.75rem', minHeight: 32, borderRadius: 1.5, '& .MuiSelect-select': { py: 0.6 } }}
            >
              <MenuItem value={GROUP_FILTER_ALL} sx={{ fontSize: '0.78rem' }}>All groups</MenuItem>
              <MenuItem value={GROUP_FILTER_UNGROUPED} sx={{ fontSize: '0.78rem' }}>Ungrouped</MenuItem>
              {knownGroups.map((group) => (
                <MenuItem key={group.id} value={group.id} sx={{ fontSize: '0.78rem' }}>
                  {group.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120, maxWidth: { xs: 160, sm: 220 } }}>
            <Select
              value={selectedDeviceId && filteredDevices.some((d) => d.device_id === selectedDeviceId) ? selectedDeviceId : ''}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              renderValue={(value) => {
                const d = filteredDevices.find((x) => x.device_id === value) || devices.find((x) => x.device_id === value);
                const label = d?.name || value || '-';
                return (
                  <Typography noWrap sx={{ fontSize: '0.75rem', maxWidth: '100%' }} title={label}>
                    {label}
                  </Typography>
                );
              }}
              sx={{ fontSize: '0.75rem', minHeight: 32, borderRadius: 1.5, '& .MuiSelect-select': { py: 0.6 } }}
            >
              {filteredDevices.map((d) => (
                <MenuItem key={d.device_id} value={d.device_id} sx={{ fontSize: '0.78rem' }}>
                  {d.name}
                </MenuItem>
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
            <Box sx={{ height: { xs: 210, md: 240 }, minHeight: 210, display: 'flex', flexDirection: 'column' }}>
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
                  <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }} noWrap title={selectedDevice?.name || ''}>
                    {rangeLabel} · {selectedDevice?.name || '-'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  {['all', ...chartParams].map((p) => {
                    const active = p === 'all' ? showAllChartParams : !showAllChartParams && selectedChartParams?.includes(p);
                    return (
                      <Button
                        key={p}
                        size="small"
                        onClick={() => toggleChartParam(p)}
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
                    <YAxis
                      type="number"
                      tick={{ fontSize: 9, fill: theme.palette.text.secondary }}
                      width={44}
                      domain={visibleChartParams.length === 1 ? padChartYDomain : [0, 'auto']}
                      allowDataOverflow={visibleChartParams.length === 1}
                      tickFormatter={(v) => {
                        if (v === null || v === undefined || v === '') return '';
                        const n = typeof v === 'number' ? v : Number(v);
                        return Number.isFinite(n) ? n.toFixed(2) : String(v);
                      }}
                    />
                    <ReTooltip
                      contentStyle={{
                        backgroundColor: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(ms) => (Number.isFinite(ms) ? formatInUserTimezone(new Date(ms).toISOString()) : '')}
                      formatter={(value, name) => [fmtVal(value, 3), formatDisplayName(name, { withUnit: true, chartDisplayMode })]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                      formatter={(value) => formatDisplayName(value, { withUnit: true, chartDisplayMode })}
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
                {siteOverviewSections.map((section) => (
                  <Box key={section.key}>
                    <Typography
                      sx={{
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        px: 0.25,
                        pt: 0.4,
                        pb: 0.35,
                      }}
                    >
                      {section.name}
                    </Typography>
                    {section.devices.map((d) => {
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
                  </Box>
                ))}
                {filteredDevices.length === 0 && (
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', textAlign: 'center', py: 1 }}>
                    No devices found
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* Latest Readings — click to open heat-ratio visualization */}
          <Card
            sx={{
              ...cardSx,
              cursor: 'pointer',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              '&:hover': {
                borderColor: alpha(theme.palette.primary.main, 0.45),
                boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.12)}`,
              },
            }}
            onClick={() => setHeatRatioOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setHeatRatioOpen(true);
              }
            }}
            aria-label="Open heat ratio visualization"
          >
            <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75, gap: 0.75 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={sectionTitleSx}>Latest Readings</Typography>
                  <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.15 }}>
                    Click for heat / rasio view
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  icon={<SensorsIcon sx={{ fontSize: '11px !important' }} />}
                  label={selectedDevice?.name || '-'}
                  title={selectedDevice?.name || ''}
                  sx={{
                    height: 20,
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    maxWidth: 140,
                    flexShrink: 0,
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    '& .MuiChip-label': { px: 0.6, overflow: 'hidden', textOverflow: 'ellipsis' },
                  }}
                />
              </Box>
              {showTmat3dButton && (
                <Button
                  fullWidth
                  size="small"
                  variant="contained"
                  startIcon={<ViewInArIcon sx={{ fontSize: '16px !important' }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTmat3dOpen(true);
                  }}
                  sx={{
                    mb: 1,
                    py: 0.55,
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    bgcolor: '#0e7490',
                    '&:hover': { bgcolor: '#155e75' },
                  }}
                >
                  3D View
                </Button>
              )}
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {availableParams.slice(0, 6).map((p, idx) => {
                  const st = paramStats[p] || {};
                  const val = st.latest;
                  const bar = val === null
                    ? { pct: 0, color: getChartParamColor(p), breached: false, hasThreshold: false }
                    : resolveBar({
                        value: val,
                        displayRange: getDisplayRange(p),
                        threshold: alertThresholds[normalizeParamKey(p)],
                        windowMax: st.max,
                        neutralColor: getChartParamColor(p),
                      });
                  return (
                    <Box key={p} sx={{ py: 0.75, ...(idx > 0 && { borderTop: '1px solid', borderColor: 'divider' }) }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                          <Typography noWrap sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                            {formatDisplayName(p, { withUnit: false })}
                          </Typography>
                          {bar.hasThreshold && (
                            <Box
                              title={bar.breached ? 'Outside alert range' : 'Within alert range'}
                              sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, bgcolor: bar.color }}
                            />
                          )}
                        </Box>
                        <Typography sx={{ fontSize: '0.74rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: bar.breached ? BAR_RED : 'text.primary' }}>
                          {fmtVal(val)}
                          <Typography component="span" sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'text.secondary', ml: 0.3 }}>
                            {getUnit(p) || ''}
                          </Typography>
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={bar.pct}
                        sx={{
                          height: 5,
                          borderRadius: 3,
                          bgcolor: alpha(bar.color, 0.12),
                          '& .MuiLinearProgress-bar': { bgcolor: bar.color, borderRadius: 3 },
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

      <HeatRatioModal
        open={heatRatioOpen}
        onClose={() => setHeatRatioOpen(false)}
        deviceName={selectedDevice?.name}
        groupName={selectedDevice?.group_name}
        groupDescription={selectedDevice?.group_description}
        params={availableParams}
        latestFields={latest.fields}
        alertThresholds={alertThresholds}
        history={history}
        formatDisplayName={formatDisplayName}
        getUnit={getUnit}
        getDisplayRange={getDisplayRange}
      />

      <TmatSimulationModal
        open={tmat3dOpen}
        onClose={() => setTmat3dOpen(false)}
        deviceName={selectedDevice?.name}
        groupName={selectedDevice?.group_name}
        params={availableParams}
        latestFields={latest.fields}
        history={history}
      />
    </Box>
  );
}
