import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDeviceSocketSubscription } from '../hooks/useDeviceSocketSubscription';
import { useSocketEvent } from '../hooks/useSocketEvent';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import axios from 'axios';
import { subHours } from 'date-fns';
import moment from 'moment-timezone';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { API_BASE_URL } from '../config/api';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { usePermissions } from '../hooks/usePermissions';
import { formatInUserTimezone, getUserTimezone } from '../utils/timezoneUtils';
import { getDeviceDisplayName } from '../utils/deviceLabel';
import { filterStatusParams } from '../utils/fieldCategory';
import {
  classifyStatusValue,
  getStatusKeywordsForParam,
  hasStatusValue,
  parseStatusKeywords,
  rowHasStatusValues,
  usesDefaultStatusKeywords,
} from '../utils/statusKeywords';
import PageHeader from './PageHeader';
import { compactSelectSx, compactMenuItemSx, compactSectionTitleSx } from '../utils/compactUi';
import { getChartCardSx, CHART_COLORS, getTooltipContentStyle } from '../utils/chartStyles';
import { exportTableToCSV, exportTableToXLSX } from '../utils/exportUtils';

const HISTORY_PERIOD_OPTIONS = [
  { label: 'Last 24 hours', value: 24 },
  { label: 'Last 48 hours', value: 48 },
  { label: 'Last 7 days', value: 168 },
  { label: 'Last 30 days', value: 720 },
];

const DAY_COMPARE_COLORS = {
  Today: '#2563EB',
  Yesterday: '#64748B',
};

const rowTimeMs = (row) => {
  const raw = row?.datetime ?? row?.timestamp;
  if (raw == null || raw === '') return NaN;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : NaN;
};

const rowCalendarDayKey = (row, userTz) => {
  const raw = row?.datetime ?? row?.timestamp;
  if (!raw) return null;
  const s = String(raw).trim();
  const m = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s) ? moment.parseZone(s) : moment.utc(s);
  if (!m.isValid()) return null;
  return m.tz(userTz || 'UTC').format('YYYY-MM-DD');
};

const getPeriodLabel = (hours) =>
  HISTORY_PERIOD_OPTIONS.find((o) => o.value === hours)?.label?.replace(/^Last /i, '') || `${hours}h`;

const responsiveCardSx = {
  width: '100%',
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

const wrapTextCellSx = {
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  whiteSpace: 'normal',
  verticalAlign: 'top',
  fontSize: { xs: '0.72rem', sm: '0.8125rem' },
  px: { xs: 0.75, sm: 1.5 },
};

const tableScrollSx = {
  width: '100%',
  maxWidth: '100%',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
};

const formatStatusValue = (value, precision = 3) => {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toFixed(precision) : String(value);
  }
  const n = parseFloat(value);
  if (!Number.isNaN(n)) return n.toFixed(precision);
  return String(value);
};

export default function StatusDashboard({ socket }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const { userPermissions } = usePermissions();
  const { formatDisplayName, getUnit, metadata: fieldMetadata } = useFieldMetadata();
  const fieldMetadataRef = useRef(fieldMetadata);
  const statusFetchAbortRef = useRef(null);
  fieldMetadataRef.current = fieldMetadata;

  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  useDeviceSocketSubscription(socket, deviceId);
  const [statusParams, setStatusParams] = useState([]);
  const [latest, setLatest] = useState({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyPeriodHours, setHistoryPeriodHours] = useState(48);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  /** Per-parameter keyword filter for Today vs yesterday chart (`all` = every reading). */
  const [dayCompareFilterByParam, setDayCompareFilterByParam] = useState({});

  const isAdmin = useMemo(() => {
    const role = userPermissions?.role;
    return role === 'admin' || role === 'super_admin';
  }, [userPermissions]);

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

  const loadDevices = useCallback(async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/devices/dropdown`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.devices || [];
      setDevices(list.filter((d) => d?.status !== 'deleted' && d?.is_deleted !== true));
    } catch (e) {
      console.error(e);
      setError('Failed to load devices');
    }
  }, []);

  const loadStatusBundle = useCallback(async () => {
    if (!deviceId) {
      setStatusParams([]);
      setLatest({});
      setHistory([]);
      setLastUpdatedAt(null);
      return;
    }

    statusFetchAbortRef.current?.abort();
    const controller = new AbortController();
    statusFetchAbortRef.current = controller;
    const requestDeviceId = deviceId;

    setLoading(true);
    setError('');
    setStatusParams([]);
    setLatest({});
    setHistory([]);

    try {
      const token = localStorage.getItem('iot_token');
      const headers = { Authorization: `Bearer ${token}` };

      const mapperRes = await axios.get(
        `${API_BASE_URL}/device-mapper-assignments/${requestDeviceId}`,
        { headers, signal: controller.signal }
      );
      if (controller.signal.aborted || requestDeviceId !== deviceId) return;

      const mapped = (mapperRes.data.assignment?.mappings || []).map((m) => m.target_field);
      const params = filterStatusParams(mapped, fieldMetadataRef.current);
      setStatusParams(params);

      if (params.length === 0) return;

      const endDate = new Date().toISOString();
      const fetchHours = Math.max(historyPeriodHours, 48);
      const startDate = subHours(new Date(), fetchHours).toISOString();
      const fetchLimit =
        fetchHours >= 720 ? 10000 : fetchHours >= 168 ? 5000 : 2000;

      const [latestRes, dashRes] = await Promise.all([
        fetch(`${API_BASE_URL}/devices/${requestDeviceId}/latest-data?categories=Status`, {
          headers,
          signal: controller.signal,
        }),
        axios.get(`${API_BASE_URL}/data-dash`, {
          params: {
            deviceIds: requestDeviceId,
            parameters: params.join(','),
            startDate,
            endDate,
            limit: fetchLimit,
            categories: 'Status',
          },
          headers,
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted || requestDeviceId !== deviceId) return;

      if (latestRes.ok) {
        const json = await latestRes.json();
        setLatest(json.data || {});
        setLastUpdatedAt(json.last_updated_at || null);
      } else {
        setLatest({});
        setLastUpdatedAt(null);
      }

      const rows = dashRes.data?.data || [];
      setHistory(
        [...rows].sort(
          (a, b) =>
            new Date(b.datetime ?? b.timestamp).getTime() -
            new Date(a.datetime ?? b.timestamp).getTime()
        )
      );
    } catch (e) {
      if (controller.signal.aborted || e?.code === 'ERR_CANCELED') return;
      console.error(e);
      setError('Failed to load status data');
      setLatest({});
      setHistory([]);
      setStatusParams([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [deviceId, historyPeriodHours]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    setDayCompareFilterByParam({});
  }, [deviceId]);

  useEffect(() => {
    if (devices.length > 0 && !deviceId) {
      setDeviceId(devices[0].device_id);
    }
  }, [devices, deviceId]);

  useEffect(() => {
    loadStatusBundle();
    let interval = null;
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        loadStatusBundle();
      }, 30000);
    };
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopPolling();
      else startPolling();
    };
    if (document.visibilityState !== 'hidden') startPolling();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      statusFetchAbortRef.current?.abort();
    };
  }, [loadStatusBundle]);

  useSocketEvent(
    socket,
    'device_data',
    (payload) => {
      const id = payload?.deviceId || payload?.device_id;
      if (id !== deviceId || !payload?.data) return;

      const row = {
        timestamp: payload.timestamp ? new Date(payload.timestamp).toISOString() : new Date().toISOString(),
      };
      let receivedStatusValue = false;

      setLatest((prev) => {
        const next = { ...prev };
        let changed = false;
        statusParams.forEach((param) => {
          if (payload.data[param] !== undefined && payload.data[param] !== null) {
            next[param] = payload.data[param];
            row[param] = payload.data[param];
            receivedStatusValue = true;
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      if (receivedStatusValue && rowHasStatusValues(row, statusParams)) {
        setHistory((prev) => [row, ...prev].slice(0, 2000));
      }
      if (payload.timestamp) {
        setLastUpdatedAt(new Date(payload.timestamp).toISOString());
      }
    },
    Boolean(deviceId && statusParams.length > 0)
  );

  const filteredHistory = useMemo(
    () => history.filter((row) => rowHasStatusValues(row, statusParams)),
    [history, statusParams]
  );

  const historyInPeriod = useMemo(() => {
    const cutoff = subHours(new Date(), historyPeriodHours).getTime();
    return filteredHistory.filter((row) => {
      const t = rowTimeMs(row);
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [filteredHistory, historyPeriodHours]);

  /** Count received readings grouped by status keyword or value text (selected period). */
  const statusValueCounts = useMemo(() => {
    if (!historyInPeriod.length || statusParams.length === 0) return [];

    return statusParams.map((param) => {
      const keywords = getStatusKeywordsForParam(fieldMetadata, param);
      const isDefaultKeywords = usesDefaultStatusKeywords(fieldMetadata, param);
      const counts = {};

      historyInPeriod.forEach((row) => {
        const raw = row[param];
        if (!hasStatusValue(raw)) return;
        const bucket = classifyStatusValue(raw, keywords);
        if (!bucket) return;
        counts[bucket] = (counts[bucket] || 0) + 1;
      });

      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      const keywordOrder = parseStatusKeywords(keywords);
      const segments = Object.entries(counts)
        .map(([name, value]) => ({
          name,
          value,
          pct: total > 0 ? (value / total) * 100 : 0,
        }))
        .sort((a, b) => {
          const ai = keywordOrder.indexOf(a.name);
          const bi = keywordOrder.indexOf(b.name);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          if (a.name === 'Other') return 1;
          if (b.name === 'Other') return -1;
          return b.value - a.value;
        });

      return { param, segments, total, keywords, isDefaultKeywords };
    });
  }, [historyInPeriod, statusParams, fieldMetadata]);

  /** Reading count: calendar Today vs Yesterday (user timezone), optional keyword filter. */
  const statusDayComparison = useMemo(() => {
    if (!filteredHistory.length || statusParams.length === 0) return [];

    const userTz = getUserTimezone();
    const todayKey = moment.tz(userTz).format('YYYY-MM-DD');
    const yesterdayKey = moment.tz(userTz).subtract(1, 'day').format('YYYY-MM-DD');

    return statusParams.map((param) => {
      const keywords = getStatusKeywordsForParam(fieldMetadata, param);
      const filterKey = dayCompareFilterByParam[param] || 'all';
      let today = 0;
      let yesterday = 0;

      filteredHistory.forEach((row) => {
        if (!hasStatusValue(row[param])) return;
        if (filterKey !== 'all') {
          const bucket = classifyStatusValue(row[param], keywords);
          if (bucket !== filterKey) return;
        }
        const dayKey = rowCalendarDayKey(row, userTz);
        if (dayKey === todayKey) today += 1;
        else if (dayKey === yesterdayKey) yesterday += 1;
      });

      const total = today + yesterday;
      const segments = [
        { name: 'Today', value: today, pct: total > 0 ? (today / total) * 100 : 0 },
        { name: 'Yesterday', value: yesterday, pct: total > 0 ? (yesterday / total) * 100 : 0 },
      ];

      return {
        param,
        today,
        yesterday,
        total,
        segments,
        filterKey,
        filterLabel: filterKey === 'all' ? 'All status values' : filterKey,
        keywordOptions: parseStatusKeywords(keywords),
      };
    });
  }, [filteredHistory, statusParams, fieldMetadata, dayCompareFilterByParam]);

  const historyExportColumns = useMemo(
    () => [
      { field: 'timestamp', headerName: 'Time' },
      ...statusParams.map((p) => ({
        field: p,
        headerName: formatDisplayName(p, { withUnit: false }),
      })),
    ],
    [statusParams, formatDisplayName]
  );

  const buildHistoryExportRows = useCallback(
    (rows) =>
      rows.map((row) => {
        const out = { timestamp: formatInUserTimezone(row.timestamp) };
        statusParams.forEach((p) => {
          out[p] = formatStatusValue(row[p]);
        });
        return out;
      }),
    [statusParams]
  );

  const fetchHistoryForExport = useCallback(async () => {
    const token = localStorage.getItem('iot_token');
    const endDate = new Date().toISOString();
    const startDate = subHours(new Date(), historyPeriodHours).toISOString();
    const response = await axios.get(`${API_BASE_URL}/data-dash`, {
      params: {
        deviceIds: deviceId,
        parameters: statusParams.join(','),
        startDate,
        endDate,
        limit: 100000,
        export: true,
        categories: 'Status',
      },
      headers: { Authorization: `Bearer ${token}` },
    });
    const rows = response.data?.data || [];
    return rows
      .filter((row) => rowHasStatusValues(row, statusParams))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [deviceId, statusParams, historyPeriodHours]);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const rows = await fetchHistoryForExport();
      const deviceLabel = selectedDevice ? getDeviceDisplayName(selectedDevice) : deviceId;
      const periodSlug = getPeriodLabel(historyPeriodHours).replace(/\s+/g, '-');
      exportTableToCSV(
        buildHistoryExportRows(rows),
        historyExportColumns,
        `status-history_${deviceLabel}_${periodSlug}_${new Date().toISOString().slice(0, 10)}.csv`
      );
    } catch (e) {
      console.error('Status history CSV export failed:', e);
      setError('Failed to export status history');
    } finally {
      setExporting(false);
    }
  };

  const handleExportXLSX = async () => {
    setExporting(true);
    try {
      const rows = await fetchHistoryForExport();
      const deviceLabel = selectedDevice ? getDeviceDisplayName(selectedDevice) : deviceId;
      const periodSlug = getPeriodLabel(historyPeriodHours).replace(/\s+/g, '-');
      exportTableToXLSX(
        buildHistoryExportRows(rows),
        historyExportColumns,
        `status-history_${deviceLabel}_${periodSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (e) {
      console.error('Status history XLSX export failed:', e);
      setError('Failed to export status history');
    } finally {
      setExporting(false);
    }
  };

  const selectedDevice = devices.find((d) => d.device_id === deviceId);
  const periodLabel = getPeriodLabel(historyPeriodHours);

  return (
    <Box
      sx={{
        p: { xs: 0.5, sm: 1, md: 1.5 },
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      <PageHeader
        icon={<InfoOutlinedIcon sx={{ fontSize: 18 }} />}
        title="Status"
        subtitle={
          isMobile
            ? 'Status parameters (Field Creator: Status)'
            : 'Device health and status parameters (Field Creator category: Status)'
        }
        sx={{
          mb: 1.5,
          border: 'none',
          boxShadow: 'none',
          borderRadius: 1,
          bgcolor: alpha(theme.palette.background.paper, 0.55),
          width: '100%',
          minWidth: 0,
        }}
        right={(
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: { xs: 'stretch', sm: 'flex-end' },
              width: { xs: '100%', sm: 'auto' },
              minWidth: 0,
            }}
          >
            <FormControl
              size="small"
              sx={{
                minWidth: 0,
                width: { xs: '100%', sm: 200 },
                maxWidth: '100%',
                mt: 0.5,
              }}
            >
              <InputLabel id="status-device-label">Device</InputLabel>
              <Select
                labelId="status-device-label"
                label="Device"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                sx={compactSelectSx}
              >
                {devices.map((d) => {
                  const valid = isDeviceAccessValid(d);
                  return (
                    <MenuItem key={d.device_id} value={d.device_id} sx={{ ...compactMenuItemSx, opacity: valid ? 1 : 0.55 }}>
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
            {!isAdmin && deviceId && selectedDevice && (
              <Typography
                variant="caption"
                sx={{
                  mt: 0.5,
                  fontWeight: 800,
                  color: isDeviceAccessValid(selectedDevice) ? '#1B5E20' : 'error.main',
                }}
              >
                {isDeviceAccessValid(selectedDevice)
                  ? `Valid until ${selectedDevice.valid_to ? new Date(selectedDevice.valid_to).toLocaleDateString() : '–'}`
                  : 'Access expired'}
              </Typography>
            )}
          </Box>
        )}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      {statusParams.length === 0 && deviceId && !loading && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          No Status-category parameters are mapped for this device. In Field Creator set category to Status and map the
          field in Device Mapper (target field must match field name).
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && statusParams.length > 0 && (
        <>
          <Card sx={{ mb: 1.5, borderRadius: 1, ...getChartCardSx(theme), ...responsiveCardSx }}>
            <CardContent sx={{ p: { xs: 1, sm: 1.5, md: 2 }, '&:last-child': { pb: { xs: 1, sm: 1.5, md: 2 } } }}>
              <Typography gutterBottom sx={compactSectionTitleSx}>
                Current status values
              </Typography>
              {lastUpdatedAt && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Last update: {formatInUserTimezone(lastUpdatedAt)}
                </Typography>
              )}
              <TableContainer component={Paper} variant="outlined" sx={tableScrollSx}>
                <Table size="small" sx={{ tableLayout: 'fixed', width: '100%', minWidth: 0 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: { xs: '28%', sm: '34%' } }}>Parameter</TableCell>
                      <TableCell sx={{ width: { xs: '52%', sm: 'auto' } }}>Value</TableCell>
                      <TableCell sx={{ width: { xs: '20%', sm: '12%' }, whiteSpace: 'nowrap' }}>Unit</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {statusParams.map((param) => (
                      <TableRow key={param}>
                        <TableCell sx={wrapTextCellSx}>{formatDisplayName(param, { withUnit: false })}</TableCell>
                        <TableCell sx={{ ...wrapTextCellSx, fontWeight: 700 }}>
                          {formatStatusValue(latest[param])}
                        </TableCell>
                        <TableCell sx={{ ...wrapTextCellSx, whiteSpace: 'nowrap' }}>{getUnit(param) || '–'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          <Card sx={{ mb: 1.5, borderRadius: 1, ...getChartCardSx(theme), ...responsiveCardSx }}>
            <CardContent sx={{ p: { xs: 1, sm: 1.5, md: 2 }, '&:last-child': { pb: { xs: 1, sm: 1.5, md: 2 } } }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                  gap: { xs: 2, md: 2.5 },
                  width: '100%',
                  minWidth: 0,
                  alignItems: 'start',
                }}
              >
                {/* Distribution — selected period */}
                <Box sx={{ minWidth: 0 }}>
                  <Typography gutterBottom sx={compactSectionTitleSx}>
                    Status value distribution ({periodLabel})
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 1.5, wordBreak: 'break-word' }}
                  >
                    Count of received readings grouped by status keywords (Field Creator) or full value text
                  </Typography>
                  {statusValueCounts.every(({ segments }) => segments.length === 0) ? (
                    <Typography variant="body2" color="text.secondary">
                      No status values in the selected period.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {statusValueCounts.map(({ param, segments, total, keywords, isDefaultKeywords }, chartIdx) => {
                        if (segments.length === 0) return null;
                        const keywordList = parseStatusKeywords(keywords);
                        return (
                          <Box key={param} sx={{ minWidth: 0, width: '100%' }}>
                            {statusValueCounts.length > 1 && (
                              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5, wordBreak: 'break-word' }}>
                                {formatDisplayName(param, { withUnit: false })}
                              </Typography>
                            )}
                            {keywordList.length > 0 && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mb: 0.5, wordBreak: 'break-word' }}
                              >
                                Keywords: {keywordList.join(', ')}
                                {isDefaultKeywords ? ' (default)' : ''}
                              </Typography>
                            )}
                            <Box sx={{ height: { xs: 220, sm: 260 }, width: '100%', minWidth: 0 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={segments}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={isMobile ? 38 : isCompact ? 44 : 50}
                                    outerRadius={isMobile ? 62 : isCompact ? 74 : 84}
                                    paddingAngle={2}
                                    label={
                                      isMobile
                                        ? false
                                        : ({ name, value, pct }) => `${name}: ${value} (${pct.toFixed(1)}%)`
                                    }
                                  >
                                    {segments.map((_, i) => (
                                      <Cell
                                        key={i}
                                        fill={CHART_COLORS[(chartIdx * 3 + i) % CHART_COLORS.length]}
                                        stroke="#fff"
                                        strokeWidth={1}
                                      />
                                    ))}
                                  </Pie>
                                  <Tooltip
                                    contentStyle={getTooltipContentStyle(theme)}
                                    formatter={(value, _name, entry) => [
                                      `${Number(value)} readings (${entry.payload.pct.toFixed(1)}%)`,
                                      entry.payload.name,
                                    ]}
                                  />
                                  <Legend
                                    wrapperStyle={{
                                      width: '100%',
                                      fontSize: isMobile ? 11 : 12,
                                      paddingTop: 8,
                                    }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                              {total} readings with a value
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>

                {/* Today vs yesterday — calendar days + keyword filter */}
                <Box
                  sx={{
                    minWidth: 0,
                    pl: { md: 0 },
                    borderTop: { xs: '1px solid', md: 'none' },
                    borderColor: { xs: 'divider', md: 'transparent' },
                    pt: { xs: 2, md: 0 },
                  }}
                >
                  <Typography gutterBottom sx={compactSectionTitleSx}>
                    Today vs yesterday
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                    Count by calendar day ({getUserTimezone()}) — filter by status keyword
                  </Typography>
                  {statusDayComparison.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No status parameters loaded.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {statusDayComparison.map(
                        ({ param, segments, today, yesterday, total, filterKey, filterLabel, keywordOptions }, chartIdx) => (
                          <Box key={`day-${param}`} sx={{ minWidth: 0, width: '100%' }}>
                            {statusDayComparison.length > 1 && (
                              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5, wordBreak: 'break-word' }}>
                                {formatDisplayName(param, { withUnit: false })}
                              </Typography>
                            )}
                            <FormControl size="small" fullWidth sx={{ mb: 1, maxWidth: 280 }}>
                              <InputLabel id={`day-compare-filter-${param}`}>Status keyword</InputLabel>
                              <Select
                                labelId={`day-compare-filter-${param}`}
                                label="Status keyword"
                                value={filterKey}
                                onChange={(e) =>
                                  setDayCompareFilterByParam((prev) => ({
                                    ...prev,
                                    [param]: e.target.value,
                                  }))
                                }
                                sx={compactSelectSx}
                              >
                                <MenuItem value="all" sx={compactMenuItemSx}>All status values</MenuItem>
                                {keywordOptions.map((kw) => (
                                  <MenuItem key={kw} value={kw} sx={compactMenuItemSx}>
                                    {kw}
                                  </MenuItem>
                                ))}
                                {keywordOptions.length > 0 && <MenuItem value="Other" sx={compactMenuItemSx}>Other</MenuItem>}
                              </Select>
                            </FormControl>
                            {total === 0 ? (
                              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                No readings for today or yesterday
                                {filterKey !== 'all' ? ` matching “${filterLabel}”` : ''}.
                              </Typography>
                            ) : (
                              <>
                                <Box sx={{ height: { xs: 220, sm: 260 }, width: '100%', minWidth: 0 }}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={segments}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={isMobile ? 38 : isCompact ? 44 : 50}
                                        outerRadius={isMobile ? 62 : isCompact ? 74 : 84}
                                        paddingAngle={3}
                                        label={
                                          isMobile
                                            ? false
                                            : ({ name, value, pct }) => `${name}: ${value} (${pct.toFixed(1)}%)`
                                        }
                                      >
                                        {segments.map((seg) => (
                                          <Cell
                                            key={seg.name}
                                            fill={DAY_COMPARE_COLORS[seg.name] || CHART_COLORS[chartIdx % CHART_COLORS.length]}
                                            stroke="#fff"
                                            strokeWidth={1}
                                          />
                                        ))}
                                      </Pie>
                                      <Tooltip
                                        contentStyle={getTooltipContentStyle(theme)}
                                        formatter={(value, _name, entry) => [
                                          `${Number(value)} readings (${entry.payload.pct.toFixed(1)}%)`,
                                          entry.payload.name,
                                        ]}
                                      />
                                      <Legend
                                        wrapperStyle={{
                                          width: '100%',
                                          fontSize: isMobile ? 11 : 12,
                                          paddingTop: 8,
                                        }}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                                  {filterKey !== 'all' ? `${filterLabel}: ` : ''}
                                  Today {today} · Yesterday {yesterday}
                                </Typography>
                              </>
                            )}
                          </Box>
                        )
                      )}
                    </Box>
                  )}
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 1, ...getChartCardSx(theme), ...responsiveCardSx }}>
            <CardContent sx={{ p: { xs: 1, sm: 1.5, md: 2 }, '&:last-child': { pb: { xs: 1, sm: 1.5, md: 2 } } }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: { xs: 'stretch', sm: 'center' },
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1,
                  mb: 1,
                  width: '100%',
                  minWidth: 0,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                  <Typography sx={compactSectionTitleSx}>
                    Status history
                  </Typography>
                  <Chip label={`${historyInPeriod.length} rows`} size="small" />
                </Box>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={0.75}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: 0 }}
                >
                  <FormControl
                    size="small"
                    sx={{
                      minWidth: 0,
                      width: { xs: '100%', sm: 160 },
                      maxWidth: '100%',
                    }}
                  >
                    <InputLabel id="status-history-period-label">Period</InputLabel>
                    <Select
                      labelId="status-history-period-label"
                      label="Period"
                      value={historyPeriodHours}
                      onChange={(e) => setHistoryPeriodHours(Number(e.target.value))}
                      sx={compactSelectSx}
                    >
                      {HISTORY_PERIOD_OPTIONS.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value} sx={compactMenuItemSx}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    size="small"
                    fullWidth={isMobile}
                    disabled={exporting || !deviceId || statusParams.length === 0}
                    onClick={handleExportCSV}
                    sx={{ textTransform: 'none', fontWeight: 600, minHeight: 34 }}
                  >
                    Export CSV
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    fullWidth={isMobile}
                    disabled={exporting || !deviceId || statusParams.length === 0}
                    onClick={handleExportXLSX}
                    sx={{ textTransform: 'none', fontWeight: 600, minHeight: 34 }}
                  >
                    Export XLSX
                  </Button>
                </Stack>
              </Box>
              {exporting && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Preparing export…
                </Typography>
              )}
              <TableContainer
                component={Paper}
                variant="outlined"
                sx={{ ...tableScrollSx, maxHeight: { xs: 320, sm: 360 } }}
              >
                <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%', minWidth: 0 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: { xs: '34%', sm: '28%' }, whiteSpace: 'nowrap' }}>Time</TableCell>
                      {statusParams.map((p) => (
                        <TableCell key={p} sx={{ ...wrapTextCellSx, width: { xs: '66%', sm: 'auto' } }}>
                          {formatDisplayName(p, { withUnit: false })}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {historyInPeriod.slice(0, 200).map((row, idx) => (
                      <TableRow key={`${row.timestamp}-${idx}`}>
                        <TableCell sx={{ ...wrapTextCellSx, whiteSpace: 'nowrap', width: { xs: '34%', sm: '28%' } }}>
                          {formatInUserTimezone(row.timestamp)}
                        </TableCell>
                        {statusParams.map((p) => (
                          <TableCell key={p} sx={{ ...wrapTextCellSx, width: { xs: '66%', sm: 'auto' } }}>
                            {formatStatusValue(row[p])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
