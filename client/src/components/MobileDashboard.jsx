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
  Button,
  Paper,
  Grid,
} from '@mui/material';
import SensorsIcon from '@mui/icons-material/Sensors';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WifiIcon from '@mui/icons-material/Wifi';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import StorageIcon from '@mui/icons-material/Storage';
import axios from 'axios';
import { subHours } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { useTheme, alpha } from '@mui/material/styles';
import { API_BASE_URL } from '../config/api';
import { usePermissions } from '../hooks/usePermissions';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import moment from 'moment-timezone';
import { CHART_COLORS, getTooltipContentStyle, LEGEND_WRAPPER_STYLE } from '../utils/chartStyles';

const getUserTimezone = () => localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';
const formatInUserTimezone = (dt, fmt = 'YYYY-MM-DD HH:mm:ss') => {
  if (!dt) return '-';
  return moment.utc(dt).tz(getUserTimezone()).format(fmt);
};

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

/**
 * Mobile-only live overview: full-width shell, formatted readings, robust chart (API often returns strings).
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
      const rangeHours = 24;
      const startDate = subHours(new Date(), rangeHours).toISOString();
      const endDate = new Date().toISOString();
      const response = await axios.get(`${API_BASE_URL}/data-dash`, {
        params: {
          deviceIds: realtimeDevice,
          parameters: realtimeParams.join(','),
          startDate,
          endDate,
          limit: 4000,
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
  }, [realtimeDevice, realtimeParams]);

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

  const onlineCount = devices.filter((d) => d.status === 'online').length;
  const grad =
    theme.palette.mode === 'dark'
      ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.85)} 0%, ${alpha('#0c4a6e', 0.95)} 100%)`
      : `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`;

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', pb: 3, px: { xs: 1.5, sm: 0 } }}>
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          overflow: 'hidden',
          mb: 2,
          background: grad,
          color: '#fff',
        }}
      >
        <Box sx={{ p: 2.25, pr: 1 }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: alpha('#fff', 0.2),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SensorsIcon sx={{ fontSize: 26 }} />
              </Box>
              <Box>
                <Typography variant="overline" sx={{ opacity: 0.9, letterSpacing: 1.2, fontWeight: 700 }}>
                  Live overview
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  Mobile dashboard
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.85, display: 'block', mt: 0.5 }}>
                  {getUserTimezone()} · pull to refresh via button
                </Typography>
              </Box>
            </Stack>
            <IconButton
              onClick={() => fetchRealtimeData()}
              disabled={refreshBusy}
              aria-label="Refresh"
              sx={{ color: '#fff', bgcolor: alpha('#fff', 0.12), '&:hover': { bgcolor: alpha('#fff', 0.2) } }}
            >
              <RefreshIcon />
            </IconButton>
          </Stack>
          <Button
            component={Link}
            to="/dashboard"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
            sx={{
              mt: 2,
              color: '#fff',
              borderColor: alpha('#fff', 0.5),
              '&:hover': { borderColor: '#fff', bgcolor: alpha('#fff', 0.08) },
            }}
            variant="outlined"
          >
            Full desktop dashboard
          </Button>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {isAdmin && overview && (
        <Grid container spacing={1.25} sx={{ mb: 2 }}>
          <Grid size={{ xs: 4 }}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, textAlign: 'center', height: '100%' }}>
              <WifiIcon color="success" sx={{ fontSize: 22, mb: 0.5 }} />
              <Typography variant="h6" fontWeight={800}>
                {onlineCount}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Online
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, textAlign: 'center', height: '100%' }}>
              <StorageIcon color="primary" sx={{ fontSize: 22, mb: 0.5 }} />
              <Typography variant="h6" fontWeight={800}>
                {overview.totalDevices ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Devices
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, textAlign: 'center', height: '100%' }}>
              <PeopleAltIcon color="secondary" sx={{ fontSize: 22, mb: 0.5 }} />
              <Typography variant="h6" fontWeight={800}>
                {overview.totalUsers ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Users
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      <Typography variant="subtitle2" color="text.secondary" fontWeight={700} sx={{ mb: 0.75, letterSpacing: 0.5 }}>
        DEVICE
      </Typography>
      <FormControl fullWidth size="medium" sx={{ mb: 2 }}>
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
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
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
          <Typography variant="subtitle2" color="text.secondary" fontWeight={700} sx={{ mb: 1, letterSpacing: 0.5 }}>
            CURRENT READINGS
          </Typography>
          <Grid container spacing={1.25} sx={{ mb: 2 }}>
            {numericParams.map((p) => {
              const unit = getUnit(p);
              const raw = realtimeLatest[p];
              return (
                <Grid key={p} size={{ xs: 6 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      height: '100%',
                      borderColor: alpha(theme.palette.primary.main, 0.25),
                      background:
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.background.paper, 0.6)
                          : alpha(theme.palette.primary.main, 0.04),
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block' }}>
                      {formatDisplayName(p)}
                    </Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5, lineHeight: 1.2 }}>
                      {formatReading(raw)}
                      {unit ? (
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ fontWeight: 600, ml: 0.5 }}>
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
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
          {realtimeError}
        </Alert>
      )}

      <Typography variant="subtitle2" color="text.secondary" fontWeight={700} sx={{ mb: 1, letterSpacing: 0.5 }}>
        TREND · LAST 24 HOURS
      </Typography>
      <Card
        elevation={0}
        variant="outlined"
        sx={{
          borderRadius: 3,
          borderColor: alpha(theme.palette.divider, 0.9),
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          {chartRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No series data in this range.
            </Typography>
          ) : (
            <Box
              sx={{
                width: '100%',
                minWidth: 0,
                height: 320,
                minHeight: 320,
                touchAction: 'pan-y',
                mx: 'auto',
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows} margin={{ top: 12, right: 8, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} width={40} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={getTooltipContentStyle(theme)} formatter={(v) => (v != null ? Number(v).toFixed(2) : '—')} />
                  <Legend wrapperStyle={{ ...LEGEND_WRAPPER_STYLE, paddingTop: 8 }} />
                  {numericParams.slice(0, 6).map((p, i) => (
                    <Line
                      key={p}
                      type="monotone"
                      dataKey={p}
                      name={formatDisplayName(p)}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      dot={false}
                      strokeWidth={2.5}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default MobileDashboard;
