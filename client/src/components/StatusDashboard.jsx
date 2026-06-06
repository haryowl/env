import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import axios from 'axios';
import { subHours } from 'date-fns';
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
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { getDeviceDisplayName } from '../utils/deviceLabel';
import { filterStatusParams } from '../utils/fieldCategory';
import PageHeader from './PageHeader';
import { getChartCardSx, CHART_COLORS, getTooltipContentStyle } from '../utils/chartStyles';

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
  const { userPermissions } = usePermissions();
  const { formatDisplayName, getUnit, metadata: fieldMetadata } = useFieldMetadata();

  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [statusParams, setStatusParams] = useState([]);
  const [latest, setLatest] = useState({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const loadMapperParams = useCallback(async () => {
    if (!deviceId) {
      setStatusParams([]);
      return;
    }
    try {
      const token = localStorage.getItem('iot_token');
      const res = await axios.get(`${API_BASE_URL}/device-mapper-assignments/${deviceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const mapped = (res.data.assignment?.mappings || []).map((m) => m.target_field);
      setStatusParams(filterStatusParams(mapped, fieldMetadata));
    } catch {
      setStatusParams([]);
    }
  }, [deviceId, fieldMetadata]);

  const loadStatusData = useCallback(async () => {
    if (!deviceId || statusParams.length === 0) {
      setLatest({});
      setHistory([]);
      setLastUpdatedAt(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('iot_token');
      const headers = { Authorization: `Bearer ${token}` };
      const endDate = new Date().toISOString();
      const startDate = subHours(new Date(), 48).toISOString();

      const [latestRes, dashRes] = await Promise.all([
        fetch(`${API_BASE_URL}/devices/${deviceId}/latest-data?categories=Status`, { headers }),
        axios.get(`${API_BASE_URL}/data-dash`, {
          params: {
            deviceIds: deviceId,
            parameters: statusParams.join(','),
            startDate,
            endDate,
            limit: 2000,
            categories: 'Status',
          },
          headers,
        }),
      ]);

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
        [...rows].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      );
    } catch (e) {
      console.error(e);
      setError('Failed to load status data');
      setLatest({});
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [deviceId, statusParams]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (devices.length > 0 && !deviceId) {
      setDeviceId(devices[0].device_id);
    }
  }, [devices, deviceId]);

  useEffect(() => {
    loadMapperParams();
  }, [loadMapperParams]);

  useEffect(() => {
    loadStatusData();
    const id = setInterval(loadStatusData, 30000);
    return () => clearInterval(id);
  }, [loadStatusData]);

  useEffect(() => {
    if (!socket || !deviceId || statusParams.length === 0) return undefined;

    const handler = (payload) => {
      const id = payload?.deviceId || payload?.device_id;
      if (id !== deviceId || !payload?.data) return;

      const row = {
        timestamp: payload.timestamp ? new Date(payload.timestamp).toISOString() : new Date().toISOString(),
      };
      let hasStatusValue = false;

      setLatest((prev) => {
        const next = { ...prev };
        let changed = false;
        statusParams.forEach((param) => {
          if (payload.data[param] !== undefined && payload.data[param] !== null) {
            next[param] = payload.data[param];
            row[param] = payload.data[param];
            hasStatusValue = true;
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      if (hasStatusValue) {
        setHistory((prev) => [row, ...prev].slice(0, 2000));
      }
      if (payload.timestamp) {
        setLastUpdatedAt(new Date(payload.timestamp).toISOString());
      }
    };

    socket.on('device_data', handler);
    return () => socket.off('device_data', handler);
  }, [socket, deviceId, statusParams]);

  /** Count received readings grouped by status value text (48h history). */
  const statusValueCounts = useMemo(() => {
    if (!history.length || statusParams.length === 0) return [];

    return statusParams.map((param) => {
      const counts = {};
      history.forEach((row) => {
        const raw = row[param];
        if (raw === null || raw === undefined || raw === '') return;
        const label = formatStatusValue(raw);
        if (label === '–') return;
        counts[label] = (counts[label] || 0) + 1;
      });

      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      const segments = Object.entries(counts)
        .map(([name, value]) => ({
          name,
          value,
          pct: total > 0 ? (value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);

      return { param, segments, total };
    });
  }, [history, statusParams]);

  const selectedDevice = devices.find((d) => d.device_id === deviceId);

  return (
    <Box sx={{ p: { xs: 1, sm: 1.5 }, maxWidth: 1400, mx: 'auto' }}>
      <PageHeader
        icon={<InfoOutlinedIcon sx={{ fontSize: 18 }} />}
        title="Status"
        subtitle="Device health and status parameters (Field Creator category: Status)"
        sx={{
          mb: 1.5,
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
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 260 }, mt: 0.5 }}>
              <InputLabel id="status-device-label">Device</InputLabel>
              <Select
                labelId="status-device-label"
                label="Device"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
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
          <Card sx={{ mb: 1.5, borderRadius: 1, ...getChartCardSx(theme) }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Current status values
              </Typography>
              {lastUpdatedAt && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Last update: {formatInUserTimezone(lastUpdatedAt)}
                </Typography>
              )}
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Parameter</TableCell>
                      <TableCell align="right">Value</TableCell>
                      <TableCell>Unit</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {statusParams.map((param) => (
                      <TableRow key={param}>
                        <TableCell>{formatDisplayName(param, { withUnit: false })}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatStatusValue(latest[param])}
                        </TableCell>
                        <TableCell>{getUnit(param) || '–'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          <Card sx={{ mb: 1.5, borderRadius: 1, ...getChartCardSx(theme) }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Status value distribution (48h)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Count of received readings grouped by status value content
              </Typography>
              {statusValueCounts.every(({ segments }) => segments.length === 0) ? (
                <Typography variant="body2" color="text.secondary">
                  No status values in the selected period.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: statusValueCounts.length > 1 ? '1fr 1fr' : '1fr' },
                    gap: 2,
                  }}
                >
                  {statusValueCounts.map(({ param, segments, total }, chartIdx) => {
                    if (segments.length === 0) return null;
                    return (
                      <Box key={param}>
                        {statusValueCounts.length > 1 && (
                          <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
                            {formatDisplayName(param, { withUnit: false })}
                          </Typography>
                        )}
                        <Box sx={{ height: 280 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={segments}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={56}
                                outerRadius={96}
                                paddingAngle={2}
                                label={({ name, value, pct }) =>
                                  `${name}: ${value} (${pct.toFixed(1)}%)`
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
                              <Legend />
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
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 1, ...getChartCardSx(theme) }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Status history
                </Typography>
                <Chip label={`${history.length} rows`} size="small" />
              </Box>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Time</TableCell>
                      {statusParams.map((p) => (
                        <TableCell key={p} align="right">
                          {formatDisplayName(p, { withUnit: false })}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {history.slice(0, 200).map((row, idx) => (
                      <TableRow key={`${row.timestamp}-${idx}`}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {formatInUserTimezone(row.timestamp)}
                        </TableCell>
                        {statusParams.map((p) => (
                          <TableCell key={p} align="right">
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
