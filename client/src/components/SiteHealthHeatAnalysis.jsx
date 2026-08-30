import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API_BASE_URL } from '../config/api';
import { alertAppliesToDevice } from '../utils/alertDevices';
import { buildSparingCards } from '../utils/sparingAnalysis';
import { buildTmatCards, isTmatKindParam } from '../utils/tmatAnalysis';
import { getDeviceDisplayName } from '../utils/deviceLabel';
import { appendCategoryQuery, EXCLUDE_STATUS_QUERY } from '../utils/fieldCategory';
import {
  getAxisTickStyle,
  getCartesianGridProps,
  getChartColor,
  getTooltipContentStyle,
} from '../utils/chartStyles';
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
  if (t.includes('Ammonia')) return 'Ammonia';
  if (t.includes('Physical') || t.includes('COD')) return 'COD/TSS';
  if (t.includes('WWTP')) return 'WWTP IP';
  if (t.includes('Infiltration')) return 'Infiltration';
  if (t.includes('Flood')) return 'Flood risk';
  if (t.includes('Drought')) return 'Drought';
  if (t.includes('Recharge')) return 'Recharge';
  return t;
}

export default function SiteHealthHeatAnalysis({
  devices = [],
  groupName,
  groupDescription,
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

  const chartData = useMemo(() => {
    return bundles.map((bundle) => {
      const all = [...bundle.sparingCards, ...bundle.tmatCards];
      const byId = Object.fromEntries(all.map((c) => [c.id, c]));
      const row = {
        name: getDeviceDisplayName(bundle.device),
        deviceId: bundle.device.device_id,
      };
      comparisonCards.forEach((card) => {
        row[card.id] = cardNumeric(byId[card.id]);
      });
      return row;
    });
  }, [bundles, comparisonCards]);

  const activeMetric = comparisonCards.find((c) => c.id === chartMetricId) || comparisonCards[0];
  const chartHasValues = chartData.some((row) => row[chartMetricId] != null);

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
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', mb: 0.5 }}>
        {programLabel} · analysis comparison
      </Typography>
      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 1.5 }}>
        {groupName || 'Group'} · last reading · derived metrics (COD×Flow, COD/TSS, IP, infiltration, flood, drought). Click a column or pick a metric to chart it.
      </Typography>

      {loading && !bundles.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box sx={{ overflowX: 'auto', mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Device</TableCell>
                  <TableCell>Overall</TableCell>
                  {comparisonCards.map((card) => (
                    <TableCell
                      key={card.id}
                      onClick={() => setChartMetricId(card.id)}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: chartMetricId === card.id ? alpha(theme.palette.primary.main, 0.08) : undefined,
                        fontWeight: chartMetricId === card.id ? 800 : 600,
                      }}
                    >
                      {card.title}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {bundles.map((bundle) => {
                  const allCards = [...bundle.sparingCards, ...bundle.tmatCards];
                  const byId = Object.fromEntries(allCards.map((c) => [c.id, c]));
                  const selected = highlightDeviceId === bundle.device.device_id;
                  return (
                    <TableRow
                      key={bundle.device.device_id}
                      hover
                      selected={selected}
                      onClick={() => setHighlightDeviceId(bundle.device.device_id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ fontWeight: 700 }}>{getDeviceDisplayName(bundle.device)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={bundle.overall?.label || '—'}
                          sx={{
                            fontWeight: 800,
                            bgcolor: alpha(bundle.overall?.color || '#64748B', 0.18),
                            color: bundle.overall?.color,
                          }}
                        />
                      </TableCell>
                      {comparisonCards.map((card) => {
                        const cell = byId[card.id];
                        const empty = !cell?.ready || cell?.primary === '—' || cell?.primary === '-';
                        return (
                          <TableCell
                            key={card.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChartMetricId(card.id);
                              setHighlightDeviceId(bundle.device.device_id);
                            }}
                            sx={{
                              bgcolor: chartMetricId === card.id ? alpha(theme.palette.primary.main, 0.06) : undefined,
                            }}
                          >
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                              {empty ? '—' : cell.primary}
                            </Typography>
                            {!empty && cell?.label && cell.label !== '—' ? (
                              <Chip
                                size="small"
                                label={cell.label}
                                sx={{
                                  mt: 0.35,
                                  height: 18,
                                  fontSize: '0.6rem',
                                  fontWeight: 800,
                                  bgcolor: alpha(cell.color || '#64748B', 0.16),
                                  color: cell.color,
                                }}
                              />
                            ) : null}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>

          <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', mb: 1 }}>
            Chart comparison
          </Typography>
          <FormControl size="small" sx={{ minWidth: 260, mb: 1.5 }}>
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
          {!chartHasValues ? (
            <Typography variant="body2" color="text.secondary">
              No numeric values for {activeMetric?.title || 'this metric'} on the selected devices.
            </Typography>
          ) : (
            <Box sx={{ width: '100%', height: Math.max(260, 56 * chartData.length + 80) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                  onClick={(state) => {
                    const id = state?.activePayload?.[0]?.payload?.deviceId;
                    if (id) setHighlightDeviceId(id);
                  }}
                >
                  <CartesianGrid {...getCartesianGridProps(theme)} />
                  <XAxis type="number" tick={getAxisTickStyle(theme)} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={getAxisTickStyle(theme)}
                    interval={0}
                  />
                  <Tooltip
                    contentStyle={getTooltipContentStyle(theme)}
                    formatter={(value, _name, item) => {
                      const deviceId = item?.payload?.deviceId;
                      const bundle = bundles.find((b) => b.device.device_id === deviceId);
                      const all = bundle ? [...bundle.sparingCards, ...bundle.tmatCards] : [];
                      const card = all.find((c) => c.id === chartMetricId);
                      return [card?.primary || value, shortMetricLabel(activeMetric?.title)];
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey={chartMetricId}
                    name={shortMetricLabel(activeMetric?.title)}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={28}
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.deviceId}
                        fill={
                          highlightDeviceId && entry.deviceId !== highlightDeviceId
                            ? alpha(getChartColor(0), 0.35)
                            : getChartColor(0)
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </>
      )}
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
