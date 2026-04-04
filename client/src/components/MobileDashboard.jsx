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
  Chip,
  Stack,
  IconButton,
} from '@mui/material';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios from 'axios';
import { subHours } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { usePermissions } from '../hooks/usePermissions';
import moment from 'moment-timezone';
import { CHART_COLORS, getTooltipContentStyle, LEGEND_WRAPPER_STYLE } from '../utils/chartStyles';

const getUserTimezone = () => localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';
const formatInUserTimezone = (dt, fmt = 'YYYY-MM-DD HH:mm:ss') => {
  if (!dt) return '-';
  return moment.utc(dt).tz(getUserTimezone()).format(fmt);
};

/**
 * Mobile-first dashboard: same data sources as the standard Dashboard, separate layout only.
 */
const MobileDashboard = ({ socket }) => {
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
        const sorted = [...mappedData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const latestRecord = sorted[0];
        const latest = {};
        realtimeParams.forEach((k) => {
          if (latestRecord[k] !== undefined) {
            latest[k] =
              k === 'datetime' || k === 'timestamp'
                ? formatInUserTimezone(latestRecord[k])
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
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((r) => ({
        t: formatInUserTimezone(r.timestamp, 'MM-DD HH:mm'),
        ...numericParams.reduce((acc, p) => {
          const v = r[p];
          acc[p] = typeof v === 'number' && !Number.isNaN(v) ? v : null;
          return acc;
        }, {}),
      }));
  }, [realtimeData, numericParams]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', pb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <PhoneAndroidIcon color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={800}>
              Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Mobile layout · touch-friendly
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={() => fetchRealtimeData()} disabled={refreshBusy} size="large" aria-label="Refresh">
          <RefreshIcon />
        </IconButton>
      </Stack>

      <Typography variant="caption" color="primary" sx={{ display: 'block', mb: 2 }}>
        <Link to="/dashboard">Open standard Dashboard</Link>
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {isAdmin && overview && (
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
          <Chip size="small" color="default" label={`Devices ${overview.totalDevices ?? 0}`} />
          <Chip size="small" color="success" variant="outlined" label={`Online ${devices.filter((d) => d.status === 'online').length}`} />
          <Chip size="small" label={`Users ${overview.totalUsers ?? 0}`} />
        </Stack>
      )}

      <FormControl fullWidth size="medium" sx={{ mb: 2 }}>
        <InputLabel id="m-dash-device">Device</InputLabel>
        <Select
          labelId="m-dash-device"
          label="Device"
          value={realtimeDevice}
          onChange={(e) => setRealtimeDevice(e.target.value)}
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
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
          Latest readings
        </Typography>
      )}
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        {numericParams.map((p) => (
          <Chip
            key={p}
            label={`${p}: ${realtimeLatest[p] != null ? String(realtimeLatest[p]) : '—'}`}
            variant="outlined"
            sx={{ maxWidth: '100%', '& .MuiChip-label': { whiteSpace: 'normal' } }}
          />
        ))}
      </Stack>

      {realtimeError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {realtimeError}
        </Alert>
      )}

      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Trend (24h)
          </Typography>
          {chartRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No data in this range.
            </Typography>
          ) : (
            <Box sx={{ width: '100%', height: 300, touchAction: 'pan-y' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows} margin={{ top: 8, right: 4, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="t" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9 }} width={32} />
                  <Tooltip contentStyle={getTooltipContentStyle()} />
                  <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
                  {numericParams.slice(0, 6).map((p, i) => (
                    <Line
                      key={p}
                      type="monotone"
                      dataKey={p}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      dot={false}
                      strokeWidth={2}
                      connectNulls
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
