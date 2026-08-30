import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import moment from 'moment-timezone';
import { API_BASE_URL } from '../config/api';
import PageHeader from './PageHeader';
import DeviceGroupFilterSelect from './DeviceGroupFilterSelect';
import { useDeviceGroupFilter } from '../hooks/useDeviceGroupFilter';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { filterDataViewParams } from '../utils/fieldCategory';
import { getDeviceDisplayName } from '../utils/deviceLabel';
import {
  getAxisTickStyle,
  getCartesianGridProps,
  getChartCardSx,
  getTooltipContentStyle,
} from '../utils/chartStyles';
import { compactMenuItemSx, compactSelectSx } from '../utils/compactUi';

const getUserTimezone = () => localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';

const STATUS_COLOR = {
  ok: '#059669',
  watch: '#D97706',
  not_ok: '#DC2626',
  no_data: '#64748B',
  no_threshold: '#7C3AED',
};

const STATUS_CHIP = {
  ok: 'success',
  watch: 'warning',
  not_ok: 'error',
  no_data: 'default',
  no_threshold: 'secondary',
};

function formatNum(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export default function SiteHealthDashboard() {
  const theme = useTheme();
  const tz = getUserTimezone();
  const { formatDisplayName, metadata } = useFieldMetadata();
  const [devices, setDevices] = useState([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);
  const [selectedParameters, setSelectedParameters] = useState([]);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  const { setGroupFilter, knownGroups, filteredDevices, selectValue, groupFilter } =
    useDeviceGroupFilter(devices, 'site_health_group_filter');

  const filteredIdKey = filteredDevices.map((d) => d.device_id).join(',');

  useEffect(() => {
    const token = localStorage.getItem('iot_token');
    if (!token) return undefined;
    let cancelled = false;
    fetch(`${API_BASE_URL}/devices/dropdown`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data.devices || [];
        setDevices(list.filter((d) => d?.status !== 'deleted' && d?.is_deleted !== true));
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load devices');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedDeviceIds(filteredDevices.map((d) => d.device_id));
  }, [groupFilter, filteredIdKey]);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('iot_token');
      const qs = new URLSearchParams({
        groupId: groupFilter || 'all',
        period,
        timezone: tz,
      });
      if (selectedDeviceIds.length) qs.set('deviceIds', selectedDeviceIds.join(','));
      if (selectedParameters.length) qs.set('parameters', selectedParameters.join(','));
      const res = await fetch(`${API_BASE_URL}/site-health?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.parameters) {
        setPayload((prev) => ({
          parameters: data.parameters,
          rows: data.rows || [],
          summary: data.summary || prev?.summary || {},
          range: data.range,
          ...data,
        }));
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load site health');
      }
      setPayload(data);
    } catch (e) {
      setError(e.message || 'Failed to load site health');
    } finally {
      setLoading(false);
    }
  }, [groupFilter, selectedDeviceIds, selectedParameters, period, tz]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const apiParams = payload?.parameters || [];
  const paramOptions = useMemo(
    () => filterDataViewParams(apiParams.length ? apiParams : [], metadata),
    [apiParams, metadata]
  );

  useEffect(() => {
    if (!paramOptions.length) return;
    setSelectedParameters((prev) => {
      const kept = prev.filter((p) => paramOptions.includes(p));
      if (kept.length === prev.length && kept.every((p, i) => p === prev[i])) return prev;
      if (kept.length) return kept;
      return [paramOptions[0]];
    });
  }, [paramOptions]);

  const multiParam = selectedParameters.length > 1;
  const rows = payload?.rows || [];
  const chartData = rows
    .map((row) => ({
      name: getDeviceDisplayName({ name: row.name, device_id: row.deviceId }),
      value: multiParam ? row.overallPctInRange : row.periodAverage,
      status: row.status,
    }))
    .filter((row) => row.value != null);

  const chartHeight = Math.max(240, Math.min(720, 36 * chartData.length + 80));
  const chartLabel = multiParam ? '% in range (mean of selected parameters)' : 'Period average';

  return (
    <Box sx={{ p: 2 }}>
      <PageHeader
        icon={<HealthAndSafetyIcon fontSize="small" />}
        title="Site health"
        subtitle="Pick a group, then optionally a subset of those devices. Compare one or more parameters for this week or this month. Overall status is the worst result among the selected parameters. Average is the mean of daily means so different sampling rates stay comparable."
        right={
          <Button
            size="small"
            variant="outlined"
            startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
            onClick={loadHealth}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      <Card sx={{ ...getChartCardSx(theme), mt: 2, mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'flex-start' }} flexWrap="wrap">
            <DeviceGroupFilterSelect
              value={selectValue}
              onChange={setGroupFilter}
              knownGroups={knownGroups}
              labelId="site-health-group"
              sx={{ minWidth: 200 }}
            />
            <FormControl size="small" sx={{ minWidth: 240, maxWidth: 360 }}>
              <InputLabel id="site-health-devices">Devices in group</InputLabel>
              <Select
                multiple
                labelId="site-health-devices"
                label="Devices in group"
                value={selectedDeviceIds}
                onChange={(e) => setSelectedDeviceIds(e.target.value)}
                sx={compactSelectSx}
                renderValue={(selected) => {
                  if (selected.length === filteredDevices.length) return `All (${selected.length})`;
                  if (!selected.length) return 'None';
                  if (selected.length <= 2) {
                    return selected
                      .map((id) => getDeviceDisplayName(filteredDevices.find((d) => d.device_id === id) || { device_id: id }))
                      .join(', ');
                  }
                  return `${selected.length} of ${filteredDevices.length}`;
                }}
              >
                {filteredDevices.map((device) => (
                  <MenuItem key={device.device_id} value={device.device_id} sx={compactMenuItemSx}>
                    <Checkbox size="small" checked={selectedDeviceIds.includes(device.device_id)} />
                    <ListItemText primary={getDeviceDisplayName(device)} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 240, maxWidth: 360 }}>
              <InputLabel id="site-health-params">Parameters</InputLabel>
              <Select
                multiple
                labelId="site-health-params"
                label="Parameters"
                value={selectedParameters}
                onChange={(e) => setSelectedParameters(e.target.value.slice(0, 12))}
                sx={compactSelectSx}
                renderValue={(selected) => {
                  if (!selected.length) return 'None';
                  if (selected.length === 1) return formatDisplayName(selected[0], { withUnit: true });
                  return `${selected.length} parameters`;
                }}
              >
                {paramOptions.map((p) => (
                  <MenuItem key={p} value={p} sx={compactMenuItemSx}>
                    <Checkbox size="small" checked={selectedParameters.includes(p)} />
                    <ListItemText primary={formatDisplayName(p, { withUnit: true })} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="site-health-period">Period</InputLabel>
              <Select
                labelId="site-health-period"
                label="Period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                sx={compactSelectSx}
              >
                <MenuItem value="week" sx={compactMenuItemSx}>This week</MenuItem>
                <MenuItem value="month" sx={compactMenuItemSx}>This month</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ pt: 1 }}>
              {selectedDeviceIds.length} device{selectedDeviceIds.length === 1 ? '' : 's'} · {tz}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {payload?.summary ? (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
          <Chip size="small" label={`OK ${payload.summary.ok || 0}`} color="success" />
          <Chip size="small" label={`Watch ${payload.summary.watch || 0}`} color="warning" />
          <Chip size="small" label={`Not OK ${payload.summary.not_ok || 0}`} color="error" />
          <Chip size="small" label={`No data ${payload.summary.no_data || 0}`} />
          <Chip size="small" label={`No threshold ${payload.summary.no_threshold || 0}`} color="secondary" />
        </Stack>
      ) : null}

      <Card sx={{ ...getChartCardSx(theme), mb: 2 }}>
        <CardContent>
          <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', mb: 1 }}>
            {multiParam ? 'Overall % in range ranking' : 'Period average ranking'}
          </Typography>
          {loading && !payload ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : chartData.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {selectedParameters.length
                ? 'No numeric samples in this period for the selected devices.'
                : 'Choose at least one parameter.'}
            </Typography>
          ) : (
            <Box sx={{ width: '100%', height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                >
                  <CartesianGrid {...getCartesianGridProps(theme)} />
                  <XAxis type="number" tick={getAxisTickStyle(theme)} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={getAxisTickStyle(theme)}
                    interval={0}
                  />
                  <Tooltip
                    contentStyle={getTooltipContentStyle(theme)}
                    formatter={(value) => [
                      multiParam ? `${formatNum(value, 1)}%` : formatNum(value, 3),
                      chartLabel,
                    ]}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLOR[entry.status] || STATUS_COLOR.no_data} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={getChartCardSx(theme)}>
        <CardContent>
          <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', mb: 1 }}>
            Device comparison
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Device</TableCell>
                <TableCell>Overall</TableCell>
                {multiParam ? (
                  <TableCell>Parameters</TableCell>
                ) : (
                  <>
                    <TableCell align="right">Period avg</TableCell>
                    <TableCell align="right">Last</TableCell>
                    <TableCell align="right">% in range</TableCell>
                    <TableCell align="right">Samples</TableCell>
                    <TableCell align="right">Days</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.deviceId}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{getDeviceDisplayName({ name: row.name, device_id: row.deviceId })}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.statusLabel || row.label || row.status}
                      color={STATUS_CHIP[row.status] || 'default'}
                    />
                  </TableCell>
                  {multiParam ? (
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {selectedParameters.map((p) => {
                          const cell = row.byParameter?.[p];
                          return (
                            <Chip
                              key={p}
                              size="small"
                              variant="outlined"
                              color={STATUS_CHIP[cell?.status] || 'default'}
                              label={`${formatDisplayName(p)}: ${cell?.statusLabel || '—'}${
                                cell?.pctInRange != null ? ` ${formatNum(cell.pctInRange, 0)}%` : ''
                              }`}
                            />
                          );
                        })}
                      </Stack>
                    </TableCell>
                  ) : (
                    <>
                      <TableCell align="right">{formatNum(row.periodAverage, 3)}</TableCell>
                      <TableCell align="right">{formatNum(row.lastValue, 3)}</TableCell>
                      <TableCell align="right">
                        {row.pctInRange == null ? '—' : `${formatNum(row.pctInRange, 1)}%`}
                      </TableCell>
                      <TableCell align="right">{row.sampleCount || 0}</TableCell>
                      <TableCell align="right">{row.dayCount || 0}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={multiParam ? 4 : 7}>
                    <Typography variant="body2" color="text.secondary">
                      No devices selected.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
}
