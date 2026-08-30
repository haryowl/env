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
  Grid,
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import ThermostatOutlinedIcon from '@mui/icons-material/ThermostatOutlined';
import moment from 'moment-timezone';
import { API_BASE_URL } from '../config/api';
import DeviceGroupFilterSelect from './DeviceGroupFilterSelect';
import { useDeviceGroupFilter } from '../hooks/useDeviceGroupFilter';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { filterDataViewParams } from '../utils/fieldCategory';
import { getDeviceDisplayName } from '../utils/deviceLabel';
import { getChartCardSx, getChartColor } from '../utils/chartStyles';
import { compactMenuItemSx, compactSelectSx } from '../utils/compactUi';
import SiteHealthHeatAnalysis, { resolveSiteHealthProgram } from './SiteHealthHeatAnalysis';

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

function surfaceCardSx(theme) {
  return {
    ...getChartCardSx(theme),
    borderRadius: 2,
    boxShadow: theme.palette.mode === 'light'
      ? '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.04)'
      : 'none',
  };
}

function RankingBars({ rows, multiParam }) {
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  return (
    <Stack spacing={1.75}>
      {rows.map((row, idx) => {
        const pct = Math.max(4, (Number(row.value) / max) * 100);
        const color = STATUS_COLOR[row.status] || getChartColor(idx);
        return (
          <Box key={row.deviceId || row.name}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.84rem' }}>{row.name}</Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>
                {multiParam ? `${formatNum(row.value, 1)}%` : formatNum(row.value, 2)}
              </Typography>
            </Box>
            <Box sx={{ height: 10, borderRadius: 999, bgcolor: alpha(color, 0.12), overflow: 'hidden' }}>
              <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color, borderRadius: 999 }} />
            </Box>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', mt: 0.45 }}>
              {row.subtitle}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
}

function MiniFact({ icon, title, body }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              display: 'grid',
              placeItems: 'center',
              bgcolor: alpha('#2563EB', 0.1),
              color: 'primary.main',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: 0.3 }}>
              {title}
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', mt: 0.25 }}>{body}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function SiteHealthDashboard() {
  const theme = useTheme();
  const tz = getUserTimezone();
  const { formatDisplayName, metadata, getUnit, getDisplayRange } = useFieldMetadata();
  const [devices, setDevices] = useState([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);
  const [selectedParameters, setSelectedParameters] = useState([]);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [viewMode, setViewMode] = useState('ranking');
  const [heatRefreshKey, setHeatRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);

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
      setUpdatedAt(new Date());
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

  const selectedDevices = useMemo(
    () => filteredDevices.filter((d) => selectedDeviceIds.includes(d.device_id)),
    [filteredDevices, selectedDeviceIds]
  );
  const heatProgram = useMemo(
    () => resolveSiteHealthProgram(knownGroups, groupFilter, selectedDevices),
    [knownGroups, groupFilter, selectedDevices]
  );
  const selectedGroup = knownGroups.find((g) => String(g.id) === String(groupFilter));

  useEffect(() => {
    const program = resolveSiteHealthProgram(knownGroups, groupFilter, []);
    if (program === 'sparing' || program === 'tmat') setViewMode('heat');
    else setViewMode('ranking');
  }, [groupFilter, knownGroups]);

  const multiParam = selectedParameters.length > 1;
  const rows = payload?.rows || [];
  const summary = payload?.summary || {};

  const rankingRows = useMemo(
    () => rows
      .map((row) => ({
        deviceId: row.deviceId,
        name: getDeviceDisplayName({ name: row.name, device_id: row.deviceId }),
        value: multiParam ? row.overallPctInRange : row.periodAverage,
        status: row.status,
        subtitle: multiParam
          ? `${row.statusLabel || row.status}${row.sampleCount ? ` · ${row.sampleCount} samples` : ''}`
          : row.status === 'no_threshold'
            ? `No threshold · ${row.sampleCount || 0} samples`
            : `${row.statusLabel || row.status}${row.pctInRange != null ? ` · ${formatNum(row.pctInRange, 0)}% in range` : ''}`,
      }))
      .filter((row) => row.value != null),
    [rows, multiParam]
  );

  const totalSamples = rows.reduce((s, r) => s + (Number(r.sampleCount) || 0), 0);
  const scored = (summary.ok || 0) + (summary.watch || 0) + (summary.not_ok || 0);
  const compliant = summary.ok || 0;
  const avgCompliance = scored > 0 ? Math.round((compliant / scored) * 100) : null;
  const topOk = rows.find((r) => r.status === 'ok');
  const samplesPerDevice = rows.length ? Math.round(totalSamples / rows.length) : 0;

  const exportCsv = () => {
    if (!rows.length) return;
    const headers = multiParam
      ? ['rank', 'device', 'status', 'overall_pct_in_range', 'samples', 'days']
      : ['rank', 'device', 'status', 'period_avg', 'last', 'pct_in_range', 'samples', 'days'];
    const lines = [headers.join(',')];
    rows.forEach((row, index) => {
      const name = getDeviceDisplayName({ name: row.name, device_id: row.deviceId }).replace(/,/g, ' ');
      if (multiParam) {
        lines.push([index + 1, name, row.statusLabel || row.status, row.overallPctInRange ?? '', row.sampleCount || 0, row.dayCount || 0].join(','));
      } else {
        lines.push([
          index + 1,
          name,
          row.statusLabel || row.status,
          row.periodAverage ?? '',
          row.lastValue ?? '',
          row.pctInRange ?? '',
          row.sampleCount || 0,
          row.dayCount || 0,
        ].join(','));
      }
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `site-health-${period}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refreshAll = () => {
    loadHealth();
    setHeatRefreshKey((k) => k + 1);
  };

  const paramLabel = selectedParameters.length === 1
    ? formatDisplayName(selectedParameters[0], { withUnit: true })
    : selectedParameters.length
      ? `${selectedParameters.length} parameters`
      : '—';

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 }, pb: 10 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 1.5,
          mb: 1.75,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 1.5,
                display: 'grid',
                placeItems: 'center',
                bgcolor: alpha('#059669', 0.12),
                color: '#059669',
              }}
            >
              <HealthAndSafetyIcon fontSize="small" />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: 1.1 }}>
              Site health
            </Typography>
            <Chip
              size="small"
              label="BETA"
              sx={{ height: 20, fontWeight: 800, fontSize: '0.62rem', bgcolor: alpha('#2563EB', 0.1), color: '#2563EB' }}
            />
          </Stack>
          <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary', mt: 0.6, maxWidth: 720 }}>
            Pick a group and devices. Ranking compares period average and % in range.
            Heat analysis compares SPARING / TMAT derived metrics across selected sites.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
          onClick={refreshAll}
          disabled={loading}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
        >
          Refresh
        </Button>
      </Box>

      <Card sx={{ ...surfaceCardSx(theme), mb: 2 }}>
        <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} alignItems={{ lg: 'center' }} flexWrap="wrap">
            <DeviceGroupFilterSelect
              value={selectValue}
              onChange={setGroupFilter}
              knownGroups={knownGroups}
              labelId="site-health-group"
              sx={{ minWidth: 170 }}
            />
            <FormControl size="small" sx={{ minWidth: 180, maxWidth: 280 }}>
              <InputLabel id="site-health-devices">Devices</InputLabel>
              <Select
                multiple
                labelId="site-health-devices"
                label="Devices"
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
            <FormControl size="small" sx={{ minWidth: 180, maxWidth: 280 }}>
              <InputLabel id="site-health-params">Parameters</InputLabel>
              <Select
                multiple
                labelId="site-health-params"
                label="Parameters"
                value={selectedParameters}
                onChange={(e) => setSelectedParameters(e.target.value.slice(0, 12))}
                sx={compactSelectSx}
                disabled={viewMode === 'heat'}
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
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="site-health-period">Period</InputLabel>
              <Select
                labelId="site-health-period"
                label="Period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                sx={compactSelectSx}
                disabled={viewMode === 'heat'}
              >
                <MenuItem value="week" sx={compactMenuItemSx}>This week</MenuItem>
                <MenuItem value="month" sx={compactMenuItemSx}>This month</MenuItem>
              </Select>
            </FormControl>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={viewMode}
              onChange={(_, next) => { if (next) setViewMode(next); }}
              sx={{
                height: 34,
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                borderRadius: 2,
                p: 0.35,
                '& .MuiToggleButton-root': {
                  border: 0,
                  borderRadius: 1.5,
                  px: 1.25,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  textTransform: 'none',
                },
                '& .Mui-selected': {
                  bgcolor: `${theme.palette.background.paper} !important`,
                  boxShadow: '0 1px 3px rgba(15,23,42,0.12)',
                },
              }}
            >
              <ToggleButton value="ranking">Ranking</ToggleButton>
              <ToggleButton value="heat">Heat analysis</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </CardContent>
      </Card>

      {viewMode === 'ranking' && error ? (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      ) : null}

      {viewMode === 'heat' ? (
        <SiteHealthHeatAnalysis
          key={`${heatRefreshKey}-${selectedDevices.map((d) => d.device_id).join(',')}`}
          devices={selectedDevices}
          groupName={selectedGroup?.name || selectedDevices[0]?.group_name || ''}
          groupDescription={selectedGroup?.description || selectedDevices[0]?.group_description || ''}
          timezone={tz}
          getUnit={getUnit}
          getDisplayRange={getDisplayRange}
        />
      ) : (
        <Grid container spacing={2}>
          <Grid item xs={12} lg={5}>
            <Stack spacing={2}>
              <Card sx={surfaceCardSx(theme)}>
                <CardContent>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', mb: 0.35 }}>
                    Status overview
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 1.25 }}>
                    {paramLabel} · {period === 'month' ? 'This month' : 'This week'} · {tz}
                  </Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.75 }}>
                    <Chip size="small" label={`OK ${summary.ok || 0}`} color="success" sx={{ fontWeight: 700 }} />
                    <Chip size="small" label={`Watch ${summary.watch || 0}`} color="warning" sx={{ fontWeight: 700 }} />
                    <Chip size="small" label={`Not OK ${summary.not_ok || 0}`} color="error" sx={{ fontWeight: 700 }} />
                    <Chip size="small" label={`No data ${summary.no_data || 0}`} sx={{ fontWeight: 700 }} />
                    <Chip size="small" label={`No threshold ${summary.no_threshold || 0}`} color="secondary" sx={{ fontWeight: 700 }} />
                  </Stack>
                  <Grid container spacing={1}>
                    {[
                      { label: 'TOTAL SAMPLES', value: formatNum(totalSamples, 0), hint: period === 'month' ? 'This month' : 'This week' },
                      { label: 'AVG COMPLIANCE', value: avgCompliance == null ? '—' : `${avgCompliance}%`, hint: `${compliant} of ${scored || rows.length} scored` },
                      { label: 'DEVICES', value: String(rows.length), hint: tz },
                    ].map((item) => (
                      <Grid item xs={4} key={item.label}>
                        <Box
                          sx={{
                            p: 1.1,
                            borderRadius: 2,
                            bgcolor: alpha(theme.palette.text.primary, 0.03),
                            border: '1px solid',
                            borderColor: 'divider',
                            height: '100%',
                          }}
                        >
                          <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: 'text.secondary', letterSpacing: 0.4 }}>
                            {item.label}
                          </Typography>
                          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', mt: 0.35 }}>{item.value}</Typography>
                          <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>{item.hint}</Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>

              <Card sx={surfaceCardSx(theme)}>
                <CardContent>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', mb: 1.25 }}>
                    {multiParam ? 'Overall % in range ranking' : 'Period average ranking'}
                  </Typography>
                  {loading && !payload ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                      <CircularProgress size={28} />
                    </Box>
                  ) : rankingRows.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {selectedParameters.length
                        ? 'No numeric samples in this period for the selected devices.'
                        : 'Choose at least one parameter.'}
                    </Typography>
                  ) : (
                    <>
                      <RankingBars rows={rankingRows} multiParam={multiParam} />
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', mt: 1.5 }}>
                        Sorted by {multiParam ? '% in range' : 'period average'}. Devices without thresholds skip compliance scoring.
                      </Typography>
                    </>
                  )}
                </CardContent>
              </Card>
            </Stack>
          </Grid>

          <Grid item xs={12} lg={7}>
            <Stack spacing={2}>
              <Card sx={surfaceCardSx(theme)}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.82rem' }}>Device comparison</Typography>
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                        {rows.length} device{rows.length === 1 ? '' : 's'}
                        {updatedAt ? ` · updated ${moment(updatedAt).fromNow()}` : ''}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={exportCsv}
                      disabled={!rows.length}
                      sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                    >
                      Export CSV
                    </Button>
                  </Box>
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>#</TableCell>
                          <TableCell>Device</TableCell>
                          <TableCell>Status</TableCell>
                          {multiParam ? (
                            <>
                              <TableCell align="right">% in range</TableCell>
                              <TableCell>Parameters</TableCell>
                            </>
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
                          <TableRow key={row.deviceId} hover>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>
                              {getDeviceDisplayName({ name: row.name, device_id: row.deviceId })}
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={row.statusLabel || row.label || row.status}
                                color={STATUS_CHIP[row.status] || 'default'}
                                sx={{ fontWeight: 700 }}
                              />
                            </TableCell>
                            {multiParam ? (
                              <>
                                <TableCell align="right">
                                  {row.overallPctInRange == null ? '—' : `${formatNum(row.overallPctInRange, 1)}%`}
                                </TableCell>
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
                              </>
                            ) : (
                              <>
                                <TableCell align="right">{formatNum(row.periodAverage, 3)}</TableCell>
                                <TableCell align="right">{formatNum(row.lastValue, 3)}</TableCell>
                                <TableCell align="right">
                                  {row.pctInRange == null ? '—' : (
                                    <Chip
                                      size="small"
                                      label={`${formatNum(row.pctInRange, 0)}%`}
                                      color={row.pctInRange >= 90 ? 'success' : row.pctInRange >= 70 ? 'warning' : 'error'}
                                      sx={{ fontWeight: 700 }}
                                    />
                                  )}
                                </TableCell>
                                <TableCell align="right">{row.sampleCount || 0}</TableCell>
                                <TableCell align="right">{row.dayCount || 0}</TableCell>
                              </>
                            )}
                          </TableRow>
                        ))}
                        {!rows.length ? (
                          <TableRow>
                            <TableCell colSpan={multiParam ? 5 : 7}>
                              <Typography variant="body2" color="text.secondary">No devices selected.</Typography>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </Box>
                </CardContent>
              </Card>

              <Grid container spacing={1.25}>
                <Grid item xs={12} sm={4}>
                  <MiniFact
                    icon={<VerifiedUserOutlinedIcon fontSize="small" />}
                    title="COMPLIANCE"
                    body={topOk
                      ? `${getDeviceDisplayName({ name: topOk.name, device_id: topOk.deviceId })} stable${topOk.pctInRange != null ? ` at ${formatNum(topOk.pctInRange, 0)}%` : ''}`
                      : 'No OK devices yet'}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <MiniFact
                    icon={<ScienceOutlinedIcon fontSize="small" />}
                    title="COVERAGE"
                    body={rows.length ? `${formatNum(samplesPerDevice, 0)} samples / device` : '—'}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <MiniFact
                    icon={<ThermostatOutlinedIcon fontSize="small" />}
                    title="TIMEZONE"
                    body={tz}
                  />
                </Grid>
              </Grid>
            </Stack>
          </Grid>
        </Grid>
      )}

      <Box
        sx={{
          position: 'fixed',
          left: '50%',
          bottom: 18,
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.25,
          py: 0.75,
          borderRadius: 999,
          bgcolor: theme.palette.mode === 'dark' ? '#0F172A' : '#fff',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 10px 30px rgba(15,23,42,0.16)',
        }}
      >
        <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, px: 0.75, whiteSpace: 'nowrap' }}>
          Viewing {viewMode === 'heat' ? 'Heat' : 'Ranking'}
          {heatProgram !== 'both' ? ` · ${heatProgram.toUpperCase()}` : ''}
        </Typography>
        <Button
          size="small"
          variant="contained"
          onClick={() => setViewMode(viewMode === 'heat' ? 'ranking' : 'heat')}
          sx={{
            borderRadius: 999,
            textTransform: 'none',
            fontWeight: 800,
            bgcolor: '#0F172A',
            '&:hover': { bgcolor: '#1E293B' },
            px: 1.5,
          }}
        >
          Switch to {viewMode === 'heat' ? 'Ranking' : 'Heat analysis'}
        </Button>
      </Box>
    </Box>
  );
}
