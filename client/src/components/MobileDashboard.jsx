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
  CircularProgress,
  Alert,
  Stack,
  IconButton,
  Paper,
  Grid,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WifiIcon from '@mui/icons-material/Wifi';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import StorageIcon from '@mui/icons-material/Storage';
import axios from 'axios';
import { subHours } from 'date-fns';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useTheme, alpha } from '@mui/material/styles';
import { API_BASE_URL } from '../config/api';
import { usePermissions } from '../hooks/usePermissions';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { CHART_COLORS, getTooltipContentStyle, LEGEND_WRAPPER_STYLE } from '../utils/chartStyles';
import { formatInUserTimezone, getUserTimezone } from '../utils/timezoneUtils';

function rowTimeMs(row) {
  const raw = row?.datetime ?? row?.timestamp;
  if (raw == null || raw === '') return NaN;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function toNumeric(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatReading(val, decimals = 2) {
  if (val == null || val === '') return '—';
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
  if (!Number.isFinite(n)) return String(val);
  return n.toFixed(decimals);
}

const TREND_HOURS_OPTIONS = [
  { value: 1, label: '1h' },
  { value: 2, label: '2h' },
  { value: 3, label: '3h' },
];

/**
 * Mobile-only live overview: compact chrome, 1–3h trend, readable metrics.
 */
const MobileDashboard = ({ socket }) => {
  const theme = useTheme();
  const { formatDisplayName, getUnit } = useFieldMetadata();
  const { userPermissions } = usePermissions();
  const [overview, setOverview] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [realtimeDevice, setRealtimeDevice] = useState('');
  const [realtimeData, setRealtimeData] = useState([]);
  const [realtimeParams, setRealtimeParams] = useState([]);
  const [realtimeLatest, setRealtimeLatest] = useState({});
  const [realtimeError, setRealtimeError] = useState('');
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [trendHours, setTrendHours] = useState(3);

  const isAdmin = useMemo(() => {
    if (!userPermissions) return false;
    const r = userPermissions.role;
    return r === 'admin' || r === 'super_admin';
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

  const loadBase = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const [overviewResponse, devicesResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/dashboard/overview`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/devices/dropdown`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (overviewResponse.ok) {
        const j = await overviewResponse.json();
        setOverview(j.overview);
      }
      if (devicesResponse.ok) {
        const devicesData = await devicesResponse.json();
        const deviceList = Array.isArray(devicesData) ? devicesData : devicesData.devices || [];
        const visibleDevices = deviceList.filter(
          (d) => d?.status !== 'deleted' && d?.is_deleted !== true
        );
        setDevices(visibleDevices);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (devices.length > 0 && !realtimeDevice) {
      const preferred = devices.find((d) => isDeviceAccessValid(d)) || devices[0];
      setRealtimeDevice(preferred.device_id);
    }
  }, [devices, realtimeDevice, isDeviceAccessValid]);

  useEffect(() => {
    if (!realtimeDevice) {
      setRealtimeParams([]);
      return;
    }
    (async () => {
      try {
        const token = localStorage.getItem('iot_token');
        const res = await axios.get(`${API_BASE_URL}/device-mapper-assignments/${realtimeDevice}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const mappedParams = (res.data.assignment?.mappings || []).map((m) => m.target_field);
        if (!mappedParams.includes('datetime')) mappedParams.unshift('datetime');
        setRealtimeParams(mappedParams);
      } catch {
        setRealtimeParams([]);
      }
    })();
  }, [realtimeDevice]);

  const fetchRealtimeData = useCallback(async () => {
    if (!realtimeDevice || realtimeParams.length === 0) return;
    try {
      setRefreshBusy(true);
      const token = localStorage.getItem('iot_token');
      const startDate = subHours(new Date(), trendHours).toISOString();
      const endDate = new Date().toISOString();
      const limit = trendHours <= 1 ? 2000 : trendHours <= 2 ? 3500 : 5000;
      const response = await axios.get(`${API_BASE_URL}/data-dash`, {
        params: {
          deviceIds: realtimeDevice,
          parameters: realtimeParams.join(','),
          startDate,
          endDate,
          limit,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const mappedData = response.data.data || [];
      setRealtimeData(mappedData);
      setRealtimeError('');
      if (mappedData.length > 0) {
        const sorted = [...mappedData]
          .filter((r) => Number.isFinite(rowTimeMs(r)))
          .sort((a, b) => rowTimeMs(b) - rowTimeMs(a));
        const latestRecord = sorted[0];
        const latest = {};
        realtimeParams.forEach((k) => {
          if (latestRecord[k] !== undefined) {
            latest[k] =
              k === 'datetime' || k === 'timestamp'
                ? formatInUserTimezone(latestRecord.datetime ?? latestRecord.timestamp)
                : latestRecord[k];
          }
        });
        setRealtimeLatest(latest);
      } else {
        setRealtimeLatest({});
      }
    } catch (e) {
      console.error(e);
      setRealtimeError('Failed to load device data');
      setRealtimeData([]);
    } finally {
      setRefreshBusy(false);
    }
  }, [realtimeDevice, realtimeParams, trendHours]);

  useEffect(() => {
    if (!realtimeDevice || realtimeParams.length === 0) return undefined;
    fetchRealtimeData();
    const interval = setInterval(() => fetchRealtimeData(), 15000);
    return () => clearInterval(interval);
  }, [realtimeDevice, realtimeParams, fetchRealtimeData]);

  useEffect(() => {
    if (!socket || !realtimeDevice) return undefined;
    const handler = (payload) => {
      if (payload.deviceId !== realtimeDevice || !payload.data) return;
      setRealtimeLatest((prev) => {
        const next = { ...prev };
        let updated = false;
        Object.keys(payload.data).forEach((param) => {
          if (payload.data[param] != null) {
            next[param] = payload.data[param];
            updated = true;
          }
        });
        return updated ? next : prev;
      });
    };
    socket.on('device_data', handler);
    return () => socket.off('device_data', handler);
  }, [socket, realtimeDevice]);

  const numericParams = useMemo(
    () => realtimeParams.filter((p) => p !== 'datetime' && p !== 'timestamp'),
    [realtimeParams]
  );

  const chartRows = useMemo(() => {
    return [...realtimeData]
      .filter((r) => Number.isFinite(rowTimeMs(r)))
      .sort((a, b) => rowTimeMs(a) - rowTimeMs(b))
      .map((r) => ({
        t: formatInUserTimezone(r.datetime ?? r.timestamp, 'MM-DD HH:mm'),
        ...numericParams.reduce((acc, p) => {
          acc[p] = toNumeric(r[p]);
          return acc;
        }, {}),
      }));
  }, [realtimeData, numericParams]);

  const firstParam = numericParams[0];
  const chartBg =
    theme.palette.mode === 'dark' ? alpha('#0f172a', 0.5) : alpha(theme.palette.primary.main, 0.04);
  const gridStroke = theme.palette.mode === 'dark' ? alpha('#fff', 0.08) : alpha('#64748b', 0.2);

  const onlineCount = devices.filter((d) => d.status === 'online').length;

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', pb: 3, px: { xs: 1.5, sm: 0 } }}>
      {/* Compact toolbar — no large hero */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800} noWrap>
            Mobile dashboard
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {getUserTimezone()}
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton onClick={() => fetchRealtimeData()} disabled={refreshBusy} aria-label="Refresh" size="small">
            <RefreshIcon />
          </IconButton>
        </Stack>
      </Stack>
      <Typography
        component={Link}
        to="/dashboard"
        variant="caption"
        color="primary"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 2, fontWeight: 600 }}
      >
        <OpenInNewIcon sx={{ fontSize: 14 }} /> Desktop dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {isAdmin && overview && (
        <Grid container spacing={1} sx={{ mb: 1.5 }}>
          <Grid size={{ xs: 4 }}>
            <Paper variant="outlined" sx={{ py: 1, px: 0.75, borderRadius: 2, textAlign: 'center' }}>
              <WifiIcon color="success" sx={{ fontSize: 18 }} />
              <Typography variant="subtitle1" fontWeight={800}>
                {onlineCount}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>
                Online
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <Paper variant="outlined" sx={{ py: 1, px: 0.75, borderRadius: 2, textAlign: 'center' }}>
              <StorageIcon color="primary" sx={{ fontSize: 18 }} />
              <Typography variant="subtitle1" fontWeight={800}>
                {overview.totalDevices ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>
                Devices
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <Paper variant="outlined" sx={{ py: 1, px: 0.75, borderRadius: 2, textAlign: 'center' }}>
              <PeopleAltIcon color="secondary" sx={{ fontSize: 18 }} />
              <Typography variant="subtitle1" fontWeight={800}>
                {overview.totalUsers ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>
                Users
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 0.5, letterSpacing: 0.6 }}>
        DEVICE
      </Typography>
      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
        <InputLabel id="m-dash-device">Select device</InputLabel>
        <Select
          labelId="m-dash-device"
          label="Select device"
          value={realtimeDevice}
          onChange={(e) => setRealtimeDevice(e.target.value)}
          sx={{ borderRadius: 2 }}
        >
          {devices.map((d) => (
            <MenuItem key={d.device_id} value={d.device_id} disabled={!isDeviceAccessValid(d) && !isAdmin}>
              {d.name} ({d.device_id})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {!isAdmin && realtimeDevice && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {(() => {
            const sel = devices.find((d) => d.device_id === realtimeDevice);
            if (!sel?.valid_to) return null;
            return isDeviceAccessValid(sel)
              ? `Access valid until ${new Date(sel.valid_to).toLocaleDateString()}`
              : 'Access period expired for this device';
          })()}
        </Typography>
      )}

      {numericParams.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 0.75, letterSpacing: 0.6 }}>
            CURRENT READINGS
          </Typography>
          <Grid container spacing={1} sx={{ mb: 1.5 }}>
            {numericParams.map((p) => {
              const unit = getUnit(p);
              const raw = realtimeLatest[p];
              return (
                <Grid key={p} size={{ xs: 6 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      py: 1,
                      px: 1.25,
                      borderRadius: 2,
                      borderColor: alpha(theme.palette.primary.main, 0.2),
                      bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.03),
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 700, display: 'block', fontSize: '0.7rem', lineHeight: 1.2 }}
                    >
                      {formatDisplayName(p)}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.25,
                        fontSize: '1.35rem',
                        fontWeight: 800,
                        lineHeight: 1.15,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {formatReading(raw)}
                      {unit ? (
                        <Typography
                          component="span"
                          sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'text.secondary', ml: 0.5 }}
                        >
                          {unit}
                        </Typography>
                      ) : null}
                    </Typography>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}

      {realtimeError && (
        <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }}>
          {realtimeError}
        </Alert>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: 0.6 }}>
          TREND
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={trendHours}
          onChange={(_, v) => v != null && setTrendHours(v)}
          sx={{
            '& .MuiToggleButton-root': {
              px: 1.75,
              py: 0.5,
              fontWeight: 800,
              textTransform: 'none',
              fontSize: '0.8rem',
            },
          }}
        >
          {TREND_HOURS_OPTIONS.map((o) => (
            <ToggleButton key={o.value} value={o.value}>
              {o.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Last {trendHours} hour{trendHours > 1 ? 's' : ''} · multi-series
      </Typography>

      <Card
        elevation={0}
        sx={{
          borderRadius: 3,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.9),
          boxShadow: theme.palette.mode === 'dark' ? '0 8px 32px rgba(0,0,0,0.35)' : '0 8px 28px rgba(15,23,42,0.08)',
        }}
      >
        <CardContent sx={{ p: 1.25, pb: 1.5, '&:last-child': { pb: 1.5 } }}>
          {chartRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No data in this window.
            </Typography>
          ) : (
            <Box
              sx={{
                width: '100%',
                minWidth: 0,
                height: 300,
                minHeight: 300,
                borderRadius: 2,
                bgcolor: chartBg,
                touchAction: 'pan-y',
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{ top: 16, right: 10, left: 0, bottom: 4 }}>
                  <defs>
                    {firstParam ? (
                      <linearGradient id="mDashAreaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                      </linearGradient>
                    ) : null}
                  </defs>
                  <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                    tickLine={false}
                    axisLine={{ stroke: gridStroke }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                    width={36}
                    domain={['auto', 'auto']}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={getTooltipContentStyle(theme)}
                    formatter={(v) => (v != null && Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—')}
                  />
                  <Legend
                    wrapperStyle={{ ...LEGEND_WRAPPER_STYLE, paddingTop: 6, fontSize: 11 }}
                    iconType="circle"
                    iconSize={8}
                  />
                  {firstParam ? (
                    <Area
                      type="monotone"
                      dataKey={firstParam}
                      fill="url(#mDashAreaFill)"
                      stroke="none"
                      connectNulls
                      isAnimationActive={false}
                    />
                  ) : null}
                  {numericParams.slice(0, 6).map((p, i) => (
                    <Line
                      key={p}
                      type="monotone"
                      dataKey={p}
                      name={formatDisplayName(p)}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={i === 0 ? 3 : 2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default MobileDashboard;
