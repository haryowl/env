import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
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
import { alpha } from '@mui/material/styles';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { API_BASE_URL } from '../config/api';
import { alertAppliesToDevice } from '../utils/alertDevices';
import { buildSparingCards } from '../utils/sparingAnalysis';
import { buildTmatCards, isTmatKindParam } from '../utils/tmatAnalysis';
import { getDeviceDisplayName } from '../utils/deviceLabel';
import { appendCategoryQuery, EXCLUDE_STATUS_QUERY } from '../utils/fieldCategory';
import { getChartCardSx, getChartColor } from '../utils/chartStyles';
import { compactMenuItemSx, compactSelectSx } from '../utils/compactUi';
import { buildHeatRows, resolveHeatProgram } from './HeatRatioModal';

const MAX_HEAT_DEVICES = 12;
const STATUS_RANK = {
  ok: 0,
  aman: 0,
  no_data: 1,
  unknown: 1,
  no_threshold: 2,
  watch: 3,
  waspada: 3,
  not_ok: 4,
  melebihi: 4,
  kritis: 4,
  kimia: 4,
};

function authHeaders() {
  const token = localStorage.getItem('iot_token');
  return { Authorization: `Bearer ${token}` };
}

function normalizeParamKey(p) {
  return String(p || '').toLowerCase().replace(/\s+/g, '_');
}

function thresholdsForDevice(alerts, deviceId) {
  const byParam = {};
  (alerts || [])
    .filter((a) => a.type === 'threshold' && alertAppliesToDevice(a, deviceId))
    .forEach((a) => {
      const key = normalizeParamKey(a.parameter);
      if (!key) return;
      const min = a.min != null ? Number(a.min) : null;
      const max = a.max != null ? Number(a.max) : null;
      const existing = byParam[key] || { min: null, max: null };
      if (min != null && Number.isFinite(min) && (existing.min == null || min > existing.min)) existing.min = min;
      if (max != null && Number.isFinite(max) && (existing.max == null || max < existing.max)) existing.max = max;
      byParam[key] = existing;
    });
  return byParam;
}

function worstCard(cards) {
  return (cards || []).reduce((worst, card) => {
    const a = STATUS_RANK[String(card?.key || '').toLowerCase()] ?? 0;
    const b = STATUS_RANK[String(worst?.key || '').toLowerCase()] ?? 0;
    return a > b ? card : worst;
  }, cards?.[0] || { key: 'unknown', label: '—', color: '#64748B' });
}

function parsePrimaryNumber(primary) {
  if (primary == null || primary === '—' || primary === '-' || primary === '---') return null;
  const m = String(primary).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function cardNumeric(card) {
  const n = parsePrimaryNumber(card?.primary);
  return Number.isFinite(n) ? n : null;
}

function shortMetricLabel(title) {
  const t = String(title || '');
  if (t.includes('Organic Load')) return 'Organic load';
  if (t.includes('Ammonia')) return 'Toxic ammonia';
  if (t.includes('Physical') || t.includes('COD')) return 'COD/TSS';
  if (t.includes('WWTP')) return 'WWTP IP';
  if (t.includes('Infiltration')) return 'Infiltration';
  if (t.includes('Flood')) return 'Flood risk';
  if (t.includes('Drought')) return 'Drought';
  if (t.includes('Recharge')) return 'Recharge';
  return t;
}

function metricHint(title) {
  const t = String(title || '');
  if (t.includes('Organic Load')) return 'COD × Flow · kg/hari';
  if (t.includes('Ammonia')) return 'NH₃N × pH';
  if (t.includes('Physical') || t.includes('COD')) return 'COD/TSS ratio';
  if (t.includes('WWTP')) return 'IP score';
  if (t.includes('Infiltration')) return 'Δ moisture / rainfall';
  if (t.includes('Flood')) return 'TMAT + water + moisture';
  if (t.includes('Drought')) return 'moisture · temp · dry spell';
  if (t.includes('Recharge')) return 'ΔTMAT / rainfall';
  return '';
}

function overallExplain(label) {
  const key = String(label || '').toUpperCase();
  if (key === 'KIMIA') return 'Chemical anomaly';
  if (key === 'AMAN') return 'Within safe band';
  if (key === 'WASPADA') return 'Watch threshold';
  if (key === 'MELEBIHI' || key === 'KRITIS') return 'Above critical limit';
  if (key === 'HITUNG') return 'Calculated load';
  return label || '—';
}

function StatusPill({ label, color }) {
  if (!label || label === '—') return null;
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 20,
        fontSize: '0.62rem',
        fontWeight: 800,
        bgcolor: alpha(color || '#64748B', 0.14),
        color: color || '#64748B',
        border: `1px solid ${alpha(color || '#64748B', 0.28)}`,
      }}
    />
  );
}

function MetricCellBar({ value, max, color }) {
  if (value == null || !(max > 0)) return null;
  const pct = Math.max(4, Math.min(100, (value / max) * 100));
  return (
    <Box sx={{ mt: 0.7, height: 6, borderRadius: 999, bgcolor: alpha(color || '#2563EB', 0.12), overflow: 'hidden', maxWidth: 140 }}>
      <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color || '#2563EB', borderRadius: 999 }} />
    </Box>
  );
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

export default function SiteHealthHeatAnalysis({
  devices = [],
  groupName,
  groupDescription,
  timezone,
  getUnit,
  getDisplayRange,
}) {
  const theme = useTheme();
  const program = useMemo(
    () => resolveHeatProgram(groupName, groupDescription),
    [groupName, groupDescription]
  );
  const showSparing = program === 'sparing' || program === 'both';
  const showTmat = program === 'tmat' || program === 'both';
  const programLabel =
    program === 'sparing' ? 'SPARING' : program === 'tmat' ? 'TMAT' : 'SPARING + TMAT';

  const capped = devices.slice(0, MAX_HEAT_DEVICES);
  const deviceKey = capped.map((d) => d.device_id).join(',');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bundles, setBundles] = useState([]);
  const [chartMetricId, setChartMetricId] = useState('');
  const [highlightDeviceId, setHighlightDeviceId] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    if (!capped.length) {
      setBundles([]);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const alertsRes = await fetch(`${API_BASE_URL}/alerts`, { headers: authHeaders() });
        const alertsJson = alertsRes.ok ? await alertsRes.json() : { alerts: [] };
        const alerts = alertsJson.alerts || [];

        const latestList = await Promise.all(
          capped.map(async (device) => {
            const res = await fetch(
              appendCategoryQuery(`${API_BASE_URL}/devices/${device.device_id}/latest-data`, EXCLUDE_STATUS_QUERY),
              { headers: authHeaders() }
            );
            const json = res.ok ? await res.json() : {};
            return { device, fields: json.data || json || {} };
          })
        );

        let historyByDevice = {};
        if (showTmat) {
          const paramSet = new Set();
          latestList.forEach(({ fields }) => {
            Object.keys(fields || {}).forEach((k) => {
              if (isTmatKindParam(k)) paramSet.add(k);
            });
          });
          if (paramSet.size) {
            const end = new Date();
            const start = new Date(end.getTime() - 6 * 3600 * 1000);
            const qs = new URLSearchParams({
              deviceIds: capped.map((d) => d.device_id).join(','),
              parameters: ['datetime', ...paramSet].join(','),
              startDate: start.toISOString(),
              endDate: end.toISOString(),
              limit: '4000',
              excludeCategories: 'Status',
            });
            const histRes = await fetch(`${API_BASE_URL}/data-dash?${qs}`, { headers: authHeaders() });
            const histJson = histRes.ok ? await histRes.json() : { data: [] };
            (histJson.data || []).forEach((row) => {
              const id = row.device_id;
              if (!id) return;
              if (!historyByDevice[id]) historyByDevice[id] = [];
              historyByDevice[id].push(row);
            });
            Object.values(historyByDevice).forEach((list) => {
              list.sort((a, b) => new Date(a.datetime || a.timestamp || 0) - new Date(b.datetime || b.timestamp || 0));
            });
          }
        }

        if (cancelled) return;
        setBundles(
          latestList.map(({ device, fields }) => {
            const params = Object.keys(fields || {}).filter((k) => k && k !== 'datetime' && k !== 'timestamp');
            const rows = buildHeatRows(params, fields, thresholdsForDevice(alerts, device.device_id), getDisplayRange);
            const sparingCards = showSparing ? buildSparingCards(rows, getUnit) : [];
            const tmatCards = showTmat
              ? buildTmatCards(rows, historyByDevice[device.device_id] || [], getUnit)
              : [];
            const overall = worstCard([...sparingCards, ...tmatCards]);
            return { device, sparingCards, tmatCards, overall };
          })
        );
        setUpdatedAt(new Date());
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load heat analysis');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [deviceKey, showSparing, showTmat, program, getDisplayRange, getUnit]);

  const comparisonCards = useMemo(() => {
    if (!bundles.length) return [];
    if (showSparing && !showTmat) return bundles[0].sparingCards;
    if (showTmat && !showSparing) return bundles[0].tmatCards;
    return [...(bundles[0].sparingCards || []), ...(bundles[0].tmatCards || [])];
  }, [bundles, showSparing, showTmat]);

  useEffect(() => {
    if (!comparisonCards.length) return;
    setChartMetricId((prev) => {
      if (prev && comparisonCards.some((c) => c.id === prev)) return prev;
      const withValue = comparisonCards.find((c) =>
        bundles.some((b) => {
          const all = [...b.sparingCards, ...b.tmatCards];
          return cardNumeric(all.find((x) => x.id === c.id)) != null;
        })
      );
      return withValue?.id || comparisonCards[0].id;
    });
  }, [comparisonCards, bundles]);

  useEffect(() => {
    if (!highlightDeviceId && bundles[0]?.device?.device_id) {
      setHighlightDeviceId(bundles[0].device.device_id);
    }
  }, [bundles, highlightDeviceId]);

  const metricMaxById = useMemo(() => {
    const map = {};
    comparisonCards.forEach((card) => {
      const values = bundles
        .map((b) => cardNumeric([...b.sparingCards, ...b.tmatCards].find((c) => c.id === card.id)))
        .filter((v) => v != null);
      map[card.id] = values.length ? Math.max(...values) * 1.15 : 1;
    });
    return map;
  }, [bundles, comparisonCards]);

  const activeMetric = comparisonCards.find((c) => c.id === chartMetricId) || comparisonCards[0];
  const chartSeries = useMemo(() => {
    if (!activeMetric) return [];
    return bundles.map((bundle, idx) => {
      const card = [...bundle.sparingCards, ...bundle.tmatCards].find((c) => c.id === activeMetric.id);
      return {
        deviceId: bundle.device.device_id,
        name: getDeviceDisplayName(bundle.device),
        value: cardNumeric(card),
        primary: card?.primary || '—',
        label: card?.label || '—',
        color: card?.color || getChartColor(idx),
      };
    });
  }, [bundles, activeMetric]);

  const chartValues = chartSeries.map((s) => s.value).filter((v) => v != null);
  const chartMax = chartValues.length ? Math.max(...chartValues) * 1.2 : 1;
  const ranked = [...chartSeries].filter((s) => s.value != null).sort((a, b) => b.value - a.value);
  const deltaPct = ranked.length >= 2 && ranked[1].value
    ? ((ranked[0].value - ranked[1].value) / Math.abs(ranked[1].value)) * 100
    : null;

  const kimiaDevices = bundles.filter((b) => String(b.overall?.label || '').toUpperCase() === 'KIMIA');
  const wwtpBest = bundles
    .map((b) => {
      const card = [...b.sparingCards, ...b.tmatCards].find((c) => c.id === 'wwtp_ip' || c.id === 'infiltration');
      return { bundle: b, card, value: cardNumeric(card) };
    })
    .filter((x) => x.card?.ready)
    .sort((a, b) => {
      if (a.card?.id === 'wwtp_ip') return (a.value ?? 99) - (b.value ?? 99);
      return (b.value ?? 0) - (a.value ?? 0);
    })[0];

  if (!capped.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Select devices in the group to run SPARING / TMAT heat analysis.
      </Typography>
    );
  }

  return (
    <Box>
      {devices.length > MAX_HEAT_DEVICES ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Heat analysis shows the first {MAX_HEAT_DEVICES} selected devices. Uncheck others to choose which sites to compare.
        </Alert>
      ) : null}
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Card sx={{ ...surfaceCardSx(theme), mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1.25 }}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  {programLabel} · analysis comparison
                </Typography>
                <Chip
                  size="small"
                  icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important', color: '#16A34A !important' }} />}
                  label="LIVE"
                  sx={{ height: 22, fontWeight: 800, fontSize: '0.62rem', bgcolor: alpha('#16A34A', 0.12), color: '#15803D' }}
                />
              </Stack>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 0.4 }}>
                Last reading · derived metrics · {capped.length} device{capped.length === 1 ? '' : 's'}
                {timezone ? ` · ${timezone}` : ''}
                {groupName ? ` · ${groupName}` : ''}
                {updatedAt ? ` · updated ${Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 1000))}s ago` : ''}
              </Typography>
            </Box>
          </Box>

          {loading && !bundles.length ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 640 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, minWidth: 180 }}>Metric</TableCell>
                    {bundles.map((bundle) => (
                      <TableCell
                        key={bundle.device.device_id}
                        align="left"
                        onClick={() => setHighlightDeviceId(bundle.device.device_id)}
                        sx={{
                          cursor: 'pointer',
                          minWidth: 140,
                          bgcolor: highlightDeviceId === bundle.device.device_id
                            ? alpha(theme.palette.primary.main, 0.06)
                            : undefined,
                        }}
                      >
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Typography sx={{ fontWeight: 800 }}>
                            {getDeviceDisplayName(bundle.device)}
                          </Typography>
                          <StatusPill label={bundle.overall?.label} color={bundle.overall?.color} />
                        </Stack>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow
                    sx={{
                      bgcolor: theme.palette.mode === 'dark' ? alpha('#fff', 0.06) : '#0F172A',
                      '& td': { color: '#F8FAFC', borderBottomColor: alpha('#fff', 0.08) },
                    }}
                  >
                    <TableCell sx={{ fontWeight: 800 }}>Overall</TableCell>
                    {bundles.map((bundle) => (
                      <TableCell key={`overall-${bundle.device.device_id}`}>
                        <Typography sx={{ fontWeight: 800, fontSize: '0.84rem' }}>
                          {overallExplain(bundle.overall?.label)}
                        </Typography>
                        <Box sx={{ mt: 0.5 }}>
                          <StatusPill label={bundle.overall?.label} color={bundle.overall?.color} />
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>

                  {comparisonCards.map((card) => (
                    <TableRow
                      key={card.id}
                      hover
                      selected={chartMetricId === card.id}
                      onClick={() => setChartMetricId(card.id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Typography sx={{ fontWeight: 800, fontSize: '0.8rem' }}>
                          {shortMetricLabel(card.title)}
                        </Typography>
                        <Typography sx={{ fontSize: '0.64rem', color: 'text.secondary' }}>
                          {metricHint(card.title)}
                        </Typography>
                      </TableCell>
                      {bundles.map((bundle, idx) => {
                        const cell = [...bundle.sparingCards, ...bundle.tmatCards].find((c) => c.id === card.id);
                        const empty = !cell?.ready || cell?.primary === '—' || cell?.primary === '-';
                        const value = cardNumeric(cell);
                        return (
                          <TableCell
                            key={`${bundle.device.device_id}-${card.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChartMetricId(card.id);
                              setHighlightDeviceId(bundle.device.device_id);
                            }}
                          >
                            <Typography sx={{ fontWeight: 800, fontSize: '0.88rem' }}>
                              {empty ? '—' : cell.primary}
                            </Typography>
                            {!empty ? <StatusPill label={cell.label} color={cell.color} /> : (
                              <Typography sx={{ fontSize: '0.64rem', color: 'text.secondary', mt: 0.35 }}>
                                {(cell?.missing || []).length ? `No ${(cell.missing || []).join(', ')}` : 'No data'}
                              </Typography>
                            )}
                            {!empty ? (
                              <MetricCellBar
                                value={value}
                                max={metricMaxById[card.id]}
                                color={cell.color || getChartColor(idx)}
                              />
                            ) : null}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={{ ...surfaceCardSx(theme), mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>
                {shortMetricLabel(activeMetric?.title)} comparison
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                Click a metric row above or choose a metric to compare sites.
              </Typography>
            </Box>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="heat-chart-metric">Metric</InputLabel>
              <Select
                labelId="heat-chart-metric"
                label="Metric"
                value={chartMetricId || ''}
                onChange={(e) => setChartMetricId(e.target.value)}
                sx={compactSelectSx}
              >
                {comparisonCards.map((card) => (
                  <MenuItem key={card.id} value={card.id} sx={compactMenuItemSx}>
                    {card.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {!chartValues.length ? (
            <Typography variant="body2" color="text.secondary">
              No numeric values for {activeMetric?.title || 'this metric'} on the selected devices.
            </Typography>
          ) : (
            <Stack spacing={1.75}>
              {chartSeries.map((row) => {
                const pct = row.value == null ? 0 : Math.max(4, Math.min(100, (row.value / chartMax) * 100));
                const active = highlightDeviceId === row.deviceId;
                return (
                  <Box
                    key={row.deviceId}
                    onClick={() => setHighlightDeviceId(row.deviceId)}
                    sx={{
                      p: 1.25,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: active ? alpha(row.color, 0.45) : 'divider',
                      bgcolor: active ? alpha(row.color, 0.06) : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.7 }}>
                      <Typography sx={{ fontWeight: 800 }}>{row.name}</Typography>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography sx={{ fontWeight: 800 }}>{row.primary}</Typography>
                        <StatusPill label={row.label} color={row.color} />
                      </Stack>
                    </Box>
                    <Box sx={{ height: 12, borderRadius: 999, bgcolor: alpha(row.color, 0.12), overflow: 'hidden' }}>
                      <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: row.color, borderRadius: 999 }} />
                    </Box>
                  </Box>
                );
              })}
              {deltaPct != null && ranked.length >= 2 ? (
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                  {ranked[0].name} is {Math.abs(deltaPct).toFixed(0)}% {deltaPct >= 0 ? 'higher' : 'lower'} than {ranked[1].name}.
                </Typography>
              ) : null}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={1.5}>
        <Grid item xs={12} md={4}>
          <Card sx={{ ...surfaceCardSx(theme), height: '100%' }}>
            <CardContent>
              <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', mb: 0.75 }}>
                Why {kimiaDevices[0]?.overall?.label || bundles[0]?.overall?.label || 'this status'}?
              </Typography>
              <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary', mb: 1.25, lineHeight: 1.5 }}>
                {kimiaDevices.length
                  ? 'COD/TSS above ~1.5 suggests dissolved chemical dominance (industrial influent). Check COD and TSS sensors, then verify sampling timing.'
                  : 'Overall status is the worst badge among derived cards for each site. Investigate the metric that drives the badge.'}
              </Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}>
                  COD/TSS high
                </Button>
                <Button size="small" variant="outlined" sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}>
                  Check COD sensor
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ ...surfaceCardSx(theme), height: '100%' }}>
            <CardContent>
              <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', mb: 0.75 }}>
                {showSparing && !showTmat ? 'WWTP health' : showTmat && !showSparing ? 'Site EWS' : 'Health highlight'}
              </Typography>
              {wwtpBest ? (
                <>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.15rem' }}>
                      {getDeviceDisplayName(wwtpBest.bundle.device)}
                    </Typography>
                    <StatusPill label={wwtpBest.card.label} color={wwtpBest.card.color} />
                  </Stack>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', mb: 0.5 }}>
                    {wwtpBest.card.primary}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 1 }}>
                    {wwtpBest.card.detail || wwtpBest.card.formula}
                  </Typography>
                  <Box sx={{ height: 8, borderRadius: 999, bgcolor: alpha(wwtpBest.card.color || '#16A34A', 0.12), overflow: 'hidden' }}>
                    <Box
                      sx={{
                        width: `${Math.max(8, Math.min(100, Number(wwtpBest.card.ratio) || 40))}%`,
                        height: '100%',
                        bgcolor: wwtpBest.card.color || '#16A34A',
                        borderRadius: 999,
                      }}
                    />
                  </Box>
                </>
              ) : (
                <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>
                  Not enough derived metrics yet for a highlight.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ ...surfaceCardSx(theme), height: '100%' }}>
            <CardContent>
              <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', mb: 1 }}>
                Derived metrics legend
              </Typography>
              <Stack spacing={0.85}>
                {[
                  { label: 'HITUNG', color: '#38BDF8', text: 'Calculated from COD × Flow' },
                  { label: 'AMAN', color: '#16A34A', text: 'Within safe threshold' },
                  { label: 'KIMIA', color: '#DC2626', text: 'Chemical dominance / anomaly' },
                  { label: 'WASPADA', color: '#EA580C', text: 'Approaching limit' },
                ].map((item) => (
                  <Stack key={item.label} direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="small"
                      label={item.label}
                      sx={{
                        height: 20,
                        fontWeight: 800,
                        fontSize: '0.6rem',
                        bgcolor: alpha(item.color, 0.14),
                        color: item.color,
                        minWidth: 72,
                      }}
                    />
                    <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{item.text}</Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export function resolveSiteHealthProgram(knownGroups, groupFilter, selectedDevices) {
  const group = (knownGroups || []).find((g) => String(g.id) === String(groupFilter));
  if (group) return resolveHeatProgram(group.name, group.description);
  const names = (selectedDevices || []).map((d) => d.group_name).filter(Boolean).join(' ');
  const descs = (selectedDevices || []).map((d) => d.group_description).filter(Boolean).join(' ');
  return resolveHeatProgram(names, descs);
}
