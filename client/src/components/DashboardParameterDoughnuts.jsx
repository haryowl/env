import React, { useMemo, useState, useEffect } from 'react';
import { Box, Card, Typography, useTheme, useMediaQuery } from '@mui/material';
import TrendingDown from '@mui/icons-material/TrendingDown';
import TrendingUp from '@mui/icons-material/TrendingUp';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import moment from 'moment-timezone';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { API_BASE_URL } from '../config/api';

const TEAL_BORDER = '#0D9488';
const TOP_BG = 'rgba(20, 184, 166, 0.15)';
const BOTTOM_BG = 'rgba(13, 148, 136, 0.25)';
const ALERT_RED = '#DC2626';
const AVG_GREEN = '#059669';
const COLOR_TODAY = '#059669';
const COLOR_YESTERDAY = '#64748b';
const COLOR_RECENT = '#0d9488';
const COLOR_EARLIER = '#94a3b8';

const getUserTimezone = () => localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';

function parseNum(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

function aggregateDays(rows, param, tz) {
  const todayKey = moment.tz(tz).format('YYYY-MM-DD');
  const yestKey = moment.tz(tz).subtract(1, 'day').format('YYYY-MM-DD');
  let sumToday = 0;
  let sumYest = 0;
  let nToday = 0;
  let nYest = 0;

  for (const row of rows) {
    const raw = row.datetime || row.timestamp;
    if (!raw) continue;
    const dayKey = moment.utc(raw).tz(tz).format('YYYY-MM-DD');
    const v = parseNum(row[param]);
    if (Number.isNaN(v)) continue;
    if (dayKey === todayKey) {
      sumToday += v;
      nToday += 1;
    } else if (dayKey === yestKey) {
      sumYest += v;
      nYest += 1;
    }
  }

  return {
    avgToday: nToday > 0 ? sumToday / nToday : 0,
    avgYest: nYest > 0 ? sumYest / nYest : 0,
    nToday,
    nYest,
  };
}

/** Fallback: newer half vs older half of time window (same idea as NewParameterCards) */
function fallbackHalves(realtimeData, param) {
  const allRows = (realtimeData || [])
    .map((row) => {
      const t = new Date(row.timestamp || row.datetime);
      const v = parseNum(row[param]);
      return { t, v };
    })
    .filter((r) => !Number.isNaN(r.v) && !Number.isNaN(r.t.getTime()));
  if (allRows.length < 2) return null;
  allRows.sort((a, b) => a.t - b.t);
  const mid = Math.floor(allRows.length / 2);
  const older = allRows.slice(0, mid).map((r) => r.v);
  const newer = allRows.slice(mid).map((r) => r.v);
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
  const avgNewer = newer.reduce((a, b) => a + b, 0) / newer.length;
  return { avgOlder, avgNewer };
}

function buildPieSegments(realtimeData, param, tz) {
  const { avgToday, avgYest, nToday, nYest } = aggregateDays(realtimeData, param, tz);
  if (nToday > 0 || nYest > 0) {
    const T = avgToday + avgYest;
    if (T <= 0) return { segments: [], mode: 'empty' };
    return {
      mode: 'day',
      segments: [
        { name: 'Today', value: avgToday, color: COLOR_TODAY },
        { name: 'Yesterday', value: avgYest, color: COLOR_YESTERDAY },
      ],
    };
  }
  const halves = fallbackHalves(realtimeData, param);
  if (!halves) return { segments: [], mode: 'empty' };
  const T = halves.avgNewer + halves.avgOlder;
  if (T <= 0) return { segments: [], mode: 'empty' };
  return {
    mode: 'window',
    segments: [
      { name: 'Recent', value: halves.avgNewer, color: COLOR_RECENT },
      { name: 'Earlier', value: halves.avgOlder, color: COLOR_EARLIER },
    ],
  };
}

function useAvgComparisonByParam(realtimeData = [], params = []) {
  return useMemo(() => {
    const out = {};
    params.forEach((param) => {
      out[param] = { avgPct: null };
    });
    if (!Array.isArray(realtimeData) || realtimeData.length === 0) return out;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    params.forEach((param) => {
      const todayValues = [];
      const yesterdayValues = [];
      const allRows = [];
      realtimeData.forEach((row) => {
        const t = new Date(row.timestamp || row.datetime);
        if (Number.isNaN(t.getTime())) return;
        const v = row[param];
        if (v === undefined || v === null || Number.isNaN(Number(v))) return;
        const num = Number(v);
        allRows.push({ t, num });
        if (t >= todayStart) todayValues.push(num);
        else if (t >= yesterdayStart && t < todayStart) yesterdayValues.push(num);
      });
      let avgPct = null;
      if (yesterdayValues.length > 0 && todayValues.length > 0) {
        const avgToday = todayValues.reduce((a, b) => a + b, 0) / todayValues.length;
        const avgYesterday = yesterdayValues.reduce((a, b) => a + b, 0) / yesterdayValues.length;
        avgPct = avgYesterday !== 0 ? ((avgToday - avgYesterday) / avgYesterday) * 100 : 0;
      } else if (allRows.length >= 2) {
        allRows.sort((a, b) => a.t - b.t);
        const mid = Math.floor(allRows.length / 2);
        const older = allRows.slice(0, mid).map((r) => r.num);
        const newer = allRows.slice(mid).map((r) => r.num);
        const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
        const avgNewer = newer.reduce((a, b) => a + b, 0) / newer.length;
        avgPct = avgOlder !== 0 ? ((avgNewer - avgOlder) / avgOlder) * 100 : 0;
      }
      out[param] = { avgPct };
    });
    return out;
  }, [realtimeData, params.join(',')]);
}

/**
 * Parameter Overview as doughnut charts: share of today avg vs yesterday avg (or recent vs earlier window).
 * Matches Comparison Dashboard segment logic; center shows current live value.
 */
const DashboardParameterDoughnuts = ({
  data = {},
  realtimeParams = [],
  realtimeData = [],
  deviceId = null,
  formatDisplayName: formatDisplayNameProp,
  compact = false,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { formatDisplayName: formatDisplayNameHook } = useFieldMetadata();
  const formatDisplayName = formatDisplayNameProp || formatDisplayNameHook;
  const [alertStats, setAlertStats] = useState({});
  const tz = useMemo(() => getUserTimezone(), []);

  const paramsToShow = realtimeParams.length > 0
    ? realtimeParams.filter((p) => p !== 'datetime' && p !== 'timestamp')
    : Object.keys(data).filter((p) => p !== 'datetime' && p !== 'timestamp');

  const avgComparison = useAvgComparisonByParam(realtimeData, paramsToShow);

  useEffect(() => {
    if (!deviceId || paramsToShow.length === 0) {
      setAlertStats({});
      return;
    }
    const token = localStorage.getItem('iot_token');
    if (!token) return;
    const params = paramsToShow.join(',');
    fetch(
      `${API_BASE_URL}/alert-logs/parameter-stats?deviceId=${encodeURIComponent(deviceId)}&parameters=${encodeURIComponent(params)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((r) => (r.ok ? r.json() : { parameterStats: {} }))
      .then((d) => setAlertStats(d.parameterStats || {}))
      .catch(() => setAlertStats({}));
  }, [deviceId, paramsToShow.join(',')]);

  const cardWidth = paramsToShow.length > 0 ? `${100 / Math.min(paramsToShow.length, 6)}%` : '100%';
  const pieHeight = compact ? 132 : 200;
  const innerR = compact ? 36 : 52;
  const outerR = compact ? 58 : 78;

  return (
    <Box sx={{ width: '100%', height: compact ? '100%' : 'auto', mb: compact ? 0 : 3 }}>
      <Box
        sx={{
          display: compact ? 'grid' : 'flex',
          gridTemplateColumns: compact
            ? { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fill, minmax(168px, 1fr))' }
            : undefined,
          flexDirection: compact ? undefined : isMobile ? 'column' : 'row',
          flexWrap: compact ? undefined : 'wrap',
          gap: compact ? 0.75 : 2,
          width: '100%',
          height: compact ? '100%' : 'auto',
          alignItems: 'stretch',
          alignContent: compact ? 'start' : undefined,
        }}
      >
        {paramsToShow.map((param) => {
          const value = data[param] !== undefined && data[param] !== null ? Number(data[param]) : null;
          const displayValue =
            value !== null ? (Number.isFinite(value) ? value.toFixed(3) : String(data[param])) : '–';
          const label = formatDisplayName ? formatDisplayName(param, { withUnit: true }) : param;
          const avgData = avgComparison[param] || { avgPct: null };
          const alertData = alertStats[param] || { pctChange: null };
          const alertPct = alertData.pctChange;
          const avgPct = avgData.avgPct;

          const { segments, mode } = buildPieSegments(realtimeData, param, tz);
          const hasPie = segments.length === 2 && segments[0].value + segments[1].value > 0;

          return (
            <Card
              key={param}
              variant="outlined"
              sx={{
                width: compact ? 'auto' : isMobile ? '100%' : cardWidth,
                flex: compact ? undefined : isMobile ? 'none' : '1 1 0',
                minWidth: compact ? 0 : isMobile ? '100%' : 180,
                borderRadius: compact ? 1.25 : 2,
                border: `${compact ? 1.5 : 2}px solid ${TEAL_BORDER}`,
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                '&:hover': { boxShadow: `0 4px 12px ${TEAL_BORDER}40` },
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  bgcolor: TOP_BG,
                  px: compact ? 0.75 : 1.5,
                  py: compact ? 0.35 : 1,
                  borderBottom: `1px solid ${TEAL_BORDER}40`,
                  flexShrink: 0,
                }}
              >
                <Box sx={{ flex: 1, textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
                    {alertPct != null && alertPct >= 0 ? (
                      <TrendingUp sx={{ fontSize: compact ? 14 : 18, color: ALERT_RED }} />
                    ) : (
                      <TrendingDown sx={{ fontSize: compact ? 14 : 18, color: ALERT_RED }} />
                    )}
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: ALERT_RED, fontSize: compact ? '0.68rem' : '0.85rem', lineHeight: 1.1 }}
                    >
                      {alertPct != null ? `${alertPct > 0 ? '+' : ''}${alertPct.toFixed(0)}%` : '–'}
                    </Typography>
                  </Box>
                  {!compact && (
                    <Typography variant="caption" sx={{ color: ALERT_RED, fontWeight: 600, fontSize: '0.7rem' }}>
                      alert
                    </Typography>
                  )}
                </Box>
                <Box sx={{ flex: 1, textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
                    <TrendingUp sx={{ fontSize: compact ? 14 : 18, color: AVG_GREEN }} />
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: AVG_GREEN, fontSize: compact ? '0.68rem' : '0.85rem', lineHeight: 1.1 }}
                    >
                      {avgPct != null ? `${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(0)}%` : '–'}
                    </Typography>
                  </Box>
                  {!compact && (
                    <Typography variant="caption" sx={{ color: AVG_GREEN, fontWeight: 600, fontSize: '0.7rem' }}>
                      avg
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box
                sx={{
                  bgcolor: BOTTOM_BG,
                  py: compact ? 0.35 : 1,
                  px: compact ? 0.5 : 1,
                  textAlign: 'center',
                  position: 'relative',
                  minHeight: pieHeight,
                  minWidth: 0,
                }}
              >
                {hasPie ? (
                  <Box sx={{ width: '100%', height: pieHeight, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={segments}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={innerR}
                          outerRadius={outerR}
                          paddingAngle={2}
                          stroke="#fff"
                          strokeWidth={1}
                        >
                          {segments.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val, _n, p) => [
                            Number(val).toFixed(4),
                            `${p.payload.name} (avg)`,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <Box
                      sx={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                        textAlign: 'center',
                        maxWidth: '46%',
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 800,
                          color: theme.palette.text.primary,
                          fontSize: compact ? '0.82rem' : '1.1rem',
                          lineHeight: 1.15,
                        }}
                      >
                        {displayValue}
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: pieHeight,
                    }}
                  >
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      {displayValue}
                    </Typography>
                  </Box>
                )}
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: compact ? 0.25 : 0.5,
                    color: theme.palette.text.secondary,
                    fontWeight: 600,
                    fontSize: compact ? '0.62rem' : '0.75rem',
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: compact ? 'nowrap' : 'normal',
                  }}
                  title={label}
                >
                  {label}
                </Typography>
                {!compact && mode === 'window' && hasPie && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                    Recent vs earlier (window)
                  </Typography>
                )}
              </Box>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
};

export default DashboardParameterDoughnuts;
