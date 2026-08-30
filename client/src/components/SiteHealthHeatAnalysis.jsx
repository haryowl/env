import React, { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FavoriteIcon from '@mui/icons-material/Favorite';
import OpacityIcon from '@mui/icons-material/Opacity';
import { alpha } from '@mui/material/styles';
import { API_BASE_URL } from '../config/api';
import { alertAppliesToDevice } from '../utils/alertDevices';
import { buildSparingCards, toNum } from '../utils/sparingAnalysis';
import {
  buildTmatCards,
  isTmatKindParam,
} from '../utils/tmatAnalysis';
import { getDeviceDisplayName } from '../utils/deviceLabel';
import { appendCategoryQuery, EXCLUDE_STATUS_QUERY } from '../utils/fieldCategory';
import {
  buildHeatRows,
  HeatBar,
  HEAT_GRADIENT,
  HEAT_SCALE_MAX,
  heatStatus,
  LEGEND_CHIPS,
  MiniHeatBar,
  ratioForRow,
  resolveHeatProgram,
} from './HeatRatioModal';

const MAX_HEAT_DEVICES = 12;
const STATUS_RANK = { ok: 0, aman: 0, no_data: 1, unknown: 1, no_threshold: 2, watch: 3, waspada: 3, not_ok: 4, melebihi: 4, kritis: 4 };

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
    const a = STATUS_RANK[card?.key] ?? 0;
    const b = STATUS_RANK[worst?.key] ?? 0;
    return a > b ? card : worst;
  }, cards?.[0] || { key: 'unknown', label: '—', color: '#64748B' });
}

function HeatLegend() {
  return (
    <Box
      sx={{
        mb: 2,
        p: 1.5,
        borderRadius: 2,
        bgcolor: '#0F172A',
        border: '1px solid',
        borderColor: alpha('#fff', 0.08),
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.78rem', color: '#F8FAFC', mb: 1 }}>
        LEGENDA HEAT — 0% — {HEAT_SCALE_MAX}%
      </Typography>
      <Box sx={{ height: 14, borderRadius: 999, background: HEAT_GRADIENT, mb: 0.75 }} />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.62rem',
          color: '#94A3B8',
          fontWeight: 600,
          mb: 1,
        }}
      >
        <span>0% AMAN</span>
        <span>75%</span>
        <span>100% KRITIS</span>
        <span>{HEAT_SCALE_MAX}% MELEBIHI</span>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 0.75 }}>
        {LEGEND_CHIPS.map((c) => (
          <Box
            key={c.label}
            sx={{
              px: 1,
              py: 0.65,
              borderRadius: 1.25,
              bgcolor: c.color,
              color: c.text,
              fontSize: '0.68rem',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            {c.label}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function AnalysisCardGrid({ cards }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
        gap: 1.25,
      }}
    >
      {(cards || []).map((card) => (
        <Box
          key={card.id}
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: '#0F172A',
            border: '1px solid',
            borderColor: alpha(card.color || '#94A3B8', 0.35),
            minHeight: 110,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.78rem', color: '#F8FAFC' }}>
              {card.title}
            </Typography>
            <Chip
              size="small"
              label={card.label}
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 800,
                bgcolor: alpha(card.color, 0.2),
                color: card.color,
                border: `1px solid ${alpha(card.color, 0.45)}`,
                '& .MuiChip-label': { px: 0.7 },
              }}
            />
          </Box>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#F8FAFC', mb: 0.35 }}>
            {card.primary}
          </Typography>
          <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8' }}>
            {card.ready ? card.detail : `Data kurang: ${(card.missing || []).join(', ') || '-'}`}
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: '#64748B', mt: 0.5, fontFamily: 'monospace' }}>
            {card.formula}
          </Typography>
          <MiniHeatBar ratio={card.ratio} color={card.color} />
        </Box>
      ))}
    </Box>
  );
}

function ParamHeatList({ rows, formatDisplayName, getUnit }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.1 }}>
      {rows.map((row) => {
        const ratio = ratioForRow(row);
        const status = heatStatus(ratio);
        const unit = getUnit ? getUnit(row.param) : '';
        return (
          <Box
            key={row.param}
            sx={{
              p: 1.1,
              borderRadius: 2,
              bgcolor: alpha('#fff', 0.03),
              border: '1px solid',
              borderColor: alpha('#fff', 0.06),
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#F8FAFC' }}>
                    {formatDisplayName ? formatDisplayName(row.param, { withUnit: false }) : row.param}
                  </Typography>
                  <Chip
                    size="small"
                    label={status.label}
                    sx={{
                      height: 20,
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      bgcolor: alpha(status.color, 0.2),
                      color: status.color,
                      border: `1px solid ${alpha(status.color, 0.45)}`,
                    }}
                  />
                </Box>
                <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                  Nilai {row.nilai || '—'}
                  {toNum(row.bakuMin) != null || toNum(row.bakuMax) != null
                    ? ` · baku ${row.bakuMin || '—'} … ${row.bakuMax || '—'}`
                    : ''}
                  {unit ? ` | ${unit}` : ''}
                </Typography>
              </Box>
              <Box
                sx={{
                  minWidth: 58,
                  height: 32,
                  px: 1,
                  borderRadius: 999,
                  bgcolor: '#fff',
                  color: ratio != null && ratio >= 100 ? '#DC2626' : '#0F172A',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: '0.75rem',
                }}
              >
                {ratio == null ? '-' : `${ratio.toFixed(1)}%`}
              </Box>
            </Box>
            <HeatBar ratio={ratio} />
          </Box>
        );
      })}
    </Box>
  );
}

export default function SiteHealthHeatAnalysis({
  devices = [],
  groupName,
  groupDescription,
  formatDisplayName,
  getUnit,
  getDisplayRange,
}) {
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
            const sparingRows = showSparing
              ? (program === 'sparing' ? rows : rows.filter((r) => !isTmatKindParam(r.param)))
              : [];
            const tmatRows = showTmat
              ? (program === 'tmat' ? rows : rows.filter((r) => isTmatKindParam(r.param)))
              : [];
            const sparingCards = showSparing ? buildSparingCards(rows, getUnit) : [];
            const tmatCards = showTmat
              ? buildTmatCards(rows, historyByDevice[device.device_id] || [], getUnit)
              : [];
            const overall = worstCard([...sparingCards, ...tmatCards]);
            return {
              device,
              params,
              rows,
              sparingRows,
              tmatRows,
              sparingCards,
              tmatCards,
              overall,
            };
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
        Visualisasi Rasio — Heat Gradation
      </Typography>
      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 1.5 }}>
        {groupName || 'Group'} · {programLabel} · last reading vs baku mutu / EWS · derived cards combine parameters (COD×Flow, COD/TSS, IP, infiltration, flood, drought)
      </Typography>

      <HeatLegend />

      {loading && !bundles.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', mb: 1 }}>
            {programLabel} · analysis comparison
          </Typography>
          <Box sx={{ overflowX: 'auto', mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Device</TableCell>
                  <TableCell>Overall</TableCell>
                  {comparisonCards.map((card) => (
                    <TableCell key={card.id}>{card.title}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {bundles.map((bundle) => {
                  const allCards = [...bundle.sparingCards, ...bundle.tmatCards];
                  const byId = Object.fromEntries(allCards.map((c) => [c.id, c]));
                  return (
                    <TableRow key={bundle.device.device_id}>
                      <TableCell>{getDeviceDisplayName(bundle.device)}</TableCell>
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
                        return (
                          <TableCell key={card.id}>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>
                              {cell?.primary || '—'}
                            </Typography>
                            <Typography sx={{ fontSize: '0.65rem', color: cell?.color || 'text.secondary' }}>
                              {cell?.label || '—'}
                            </Typography>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>

          {bundles.map((bundle) => (
            <Accordion
              key={bundle.device.device_id}
              defaultExpanded={capped.length <= 3}
              sx={{
                mb: 1,
                bgcolor: '#0F172A',
                color: '#E2E8F0',
                '&:before': { display: 'none' },
                border: '1px solid',
                borderColor: alpha('#fff', 0.08),
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#94A3B8' }} />}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography sx={{ fontWeight: 800, fontSize: '0.85rem' }}>
                    {getDeviceDisplayName(bundle.device)}
                  </Typography>
                  <Chip
                    size="small"
                    label={bundle.overall?.label || '—'}
                    sx={{
                      fontWeight: 800,
                      bgcolor: alpha(bundle.overall?.color || '#64748B', 0.2),
                      color: bundle.overall?.color,
                    }}
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                {showSparing ? (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <FavoriteIcon sx={{ color: '#F43F5E', fontSize: 18 }} />
                      <Typography sx={{ fontWeight: 800, fontSize: '0.78rem' }}>
                        SECTION A — SPARING · WATER QUALITY COMPLIANCE
                      </Typography>
                    </Box>
                    {bundle.sparingRows.length ? (
                      <ParamHeatList
                        rows={bundle.sparingRows}
                        formatDisplayName={formatDisplayName}
                        getUnit={getUnit}
                      />
                    ) : (
                      <Typography sx={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        No SPARING parameters on this device.
                      </Typography>
                    )}
                    <Typography sx={{ fontWeight: 800, fontSize: '0.75rem', mt: 1.5, mb: 1 }}>
                      SPARING · Analysis cards (Table 1)
                    </Typography>
                    <AnalysisCardGrid cards={bundle.sparingCards} />
                  </Box>
                ) : null}

                {showTmat ? (
                  <Box>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <OpacityIcon sx={{ color: '#38BDF8', fontSize: 18 }} />
                      <Typography sx={{ fontWeight: 800, fontSize: '0.78rem' }}>
                        SECTION B — TMAT · GROUNDWATER & PEAT EWS
                      </Typography>
                    </Box>
                    {bundle.tmatRows.length ? (
                      <ParamHeatList
                        rows={bundle.tmatRows}
                        formatDisplayName={formatDisplayName}
                        getUnit={getUnit}
                      />
                    ) : (
                      <Typography sx={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        No TMAT parameters on this device.
                      </Typography>
                    )}
                    <Typography sx={{ fontWeight: 800, fontSize: '0.75rem', mt: 1.5, mb: 1 }}>
                      TMAT · Analysis cards (Table 2)
                    </Typography>
                    <AnalysisCardGrid cards={bundle.tmatCards} />
                  </Box>
                ) : null}
              </AccordionDetails>
            </Accordion>
          ))}
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
