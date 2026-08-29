import React, { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  FormControl,
  Select,
  MenuItem,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import TimelineIcon from '@mui/icons-material/Timeline';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import {
  CHART_MARGIN,
  getCartesianGridProps,
  getAxisTickStyle,
  getTooltipContentStyle,
} from '../utils/chartStyles';
import {
  buildSyntheticThresholdAlerts,
  mergeAlertLogsWithThresholdScans,
} from '../utils/quickViewAlertBreaches';

const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };

function useAlertThemeTokens() {
  const theme = useTheme();
  return useMemo(() => {
    const isDark = theme.palette.mode === 'dark';
    return {
      theme,
      isDark,
      surface: theme.palette.background.default,
      card: theme.palette.background.paper,
      text: theme.palette.text.primary,
      muted: theme.palette.text.secondary,
      border: theme.palette.divider,
      primary: theme.palette.primary.main,
      accent: theme.palette.secondary.main,
      success: theme.palette.success.main,
      warning: theme.palette.warning.main,
      error: theme.palette.error.main,
      info: theme.palette.info.main,
      shadow: isDark
        ? '0 8px 28px rgba(0,0,0,0.35)'
        : '0 8px 28px rgba(15,23,42,0.06)',
      cardShadow: isDark
        ? '0 1px 2px rgba(0,0,0,0.35)'
        : '0 1px 2px rgba(15,23,42,0.04)',
      severity: {
        low: { color: theme.palette.success.main, label: 'LOW' },
        medium: { color: theme.palette.warning.main, label: 'MEDIUM' },
        high: { color: theme.palette.error.main, label: 'HIGH' },
        critical: { color: theme.palette.info.main, label: 'CRITICAL' },
      },
    };
  }, [theme]);
}

function getSelectSx(t) {
  return {
    minWidth: { xs: '100%', sm: 128 },
    bgcolor: t.card,
    borderRadius: 999,
    color: t.text,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: t.border },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(t.primary, 0.45) },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: t.primary },
    '& .MuiSelect-select': {
      py: 0.85,
      px: 1.5,
      fontSize: '0.78rem',
      fontWeight: 700,
      color: t.text,
    },
    '& .MuiSvgIcon-root': { color: t.muted },
  };
}

function MetricCard({ title, value, subtitle, dotColor, icon, t }) {
  return (
    <Box
      sx={{
        position: 'relative',
        p: 1.75,
        borderRadius: 2,
        bgcolor: t.card,
        border: '1px solid',
        borderColor: t.border,
        boxShadow: t.cardShadow,
        minHeight: 96,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 10,
          height: 10,
          borderRadius: '50%',
          bgcolor: dotColor,
          boxShadow: `0 0 0 3px ${alpha(dotColor, 0.18)}`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: t.muted,
          textTransform: 'uppercase',
          mb: 0.75,
          pr: 2,
        }}
      >
        {title}
      </Typography>
      <Typography sx={{ fontSize: '1.55rem', fontWeight: 800, color: t.text, lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography sx={{ mt: 0.6, fontSize: '0.72rem', color: t.muted, fontWeight: 500 }}>
        {subtitle}
      </Typography>
    </Box>
  );
}

function InsightCard({ title, value, subtitle, accent, footer, t }) {
  return (
    <Box
      sx={{
        position: 'relative',
        p: 1.75,
        pl: 2,
        borderRadius: 2,
        bgcolor: t.card,
        border: '1px solid',
        borderColor: t.border,
        boxShadow: t.cardShadow,
        borderLeft: `4px solid ${accent}`,
        minHeight: 108,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography
        sx={{
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: t.muted,
          textTransform: 'uppercase',
          mb: 0.75,
        }}
      >
        {title}
      </Typography>
      <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: t.text, lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography sx={{ mt: 0.5, fontSize: '0.72rem', color: t.muted, fontWeight: 500, flexGrow: 1 }}>
        {subtitle}
      </Typography>
      {footer}
    </Box>
  );
}

function MetaPill({ label, value, accent, endAdornment, t }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.15,
        py: 0.55,
        borderRadius: 999,
        bgcolor: t.card,
        border: '1px solid',
        borderColor: t.border,
        maxWidth: '100%',
      }}
    >
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: accent || t.text, flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', color: t.muted }}>
        {label}
      </Typography>
      <Typography
        noWrap
        sx={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: accent || t.text,
          maxWidth: 220,
        }}
      >
        {value}
      </Typography>
      {endAdornment}
    </Box>
  );
}

const QuickViewAlertChart = ({
  alertData,
  deviceName,
  seriesData = [],
  parameters = [],
  alertConfigs = [],
}) => {
  const t = useAlertThemeTokens();
  const { theme } = t;
  const { formatDisplayName } = useFieldMetadata();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [parameterFilter, setParameterFilter] = useState('all');
  const [bucket, setBucket] = useState('hour');
  const selectSx = getSelectSx(t);
  const chartBar = t.primary;

  const mergedAlertSource = useMemo(() => {
    const synthetic = buildSyntheticThresholdAlerts({
      rows: seriesData,
      parameters,
      alertConfigs,
    });
    return mergeAlertLogsWithThresholdScans(alertData, synthetic);
  }, [alertData, seriesData, parameters, alertConfigs]);

  const normalizedAlerts = useMemo(() => {
    if (!Array.isArray(mergedAlertSource)) return [];
    return mergedAlertSource
      .map((a) => {
        const ts = a.timestamp || a.detected_at || a.created_at;
        if (!ts) return null;
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return null;
        const sevRaw = String(a.severity || a.status || 'high').toLowerCase();
        const sev = ['low', 'medium', 'high', 'critical'].includes(sevRaw) ? sevRaw : 'high';
        const param = a.parameter || a.alert_name || 'Unknown';
        return {
          id: a.log_id || `${d.getTime()}_${param}`,
          timestamp: d.getTime(),
          detectedAt: d,
          severity: sev,
          parameter: param,
          parameterLabel: formatDisplayName(param, { withUnit: true }),
          value: a.value,
          min: a.min,
          max: a.max,
          status: a.status || '',
          source: a.source || 'alert_log',
        };
      })
      .filter(Boolean)
      .sort((x, y) => x.timestamp - y.timestamp);
  }, [mergedAlertSource, formatDisplayName]);

  const parameterOptions = useMemo(
    () => [...new Set(normalizedAlerts.map((a) => a.parameter))],
    [normalizedAlerts]
  );

  const filteredAlerts = useMemo(() => {
    return normalizedAlerts.filter((a) => {
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (parameterFilter !== 'all' && a.parameter !== parameterFilter) return false;
      return true;
    });
  }, [normalizedAlerts, severityFilter, parameterFilter]);

  const bucketLabel = bucket === 'day' ? 'Day' : bucket === '15m' ? '15 min' : 'Hour';
  const volumeTitle = bucket === 'day'
    ? 'Alert Volume by Day'
    : bucket === '15m'
      ? 'Alert Volume by 15 min'
      : 'Alert Volume by Hour';

  const timelineData = useMemo(() => {
    const grouped = {};
    const keyFmt = bucket === 'day' ? 'MM/DD' : bucket === '15m' ? 'MM/DD HH:mm' : 'MM/DD HH:00';

    filteredAlerts.forEach((a) => {
      const base = new Date(a.timestamp);
      if (bucket === '15m') {
        const min = base.getMinutes();
        base.setMinutes(min - (min % 15), 0, 0);
      } else if (bucket === 'hour') {
        base.setMinutes(0, 0, 0);
      } else {
        base.setHours(0, 0, 0, 0);
      }
      const key = formatInUserTimezone(base, keyFmt);
      if (!grouped[key]) {
        grouped[key] = {
          hour: key,
          timestamp: base.getTime(),
          alertCount: 0,
          parameters: new Set(),
          severity: 'low',
        };
      }
      grouped[key].alertCount += 1;
      grouped[key].parameters.add(a.parameterLabel);
      if (severityRank[a.severity] > severityRank[grouped[key].severity]) {
        grouped[key].severity = a.severity;
      }
    });

    return Object.values(grouped)
      .map((item) => ({
        ...item,
        parameters: Array.from(item.parameters).join(', '),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [filteredAlerts, bucket]);

  const stats = useMemo(() => {
    if (!timelineData.length) {
      return { totalAlerts: 0, maxAlerts: 0, avgAlerts: 0, criticalHours: 0, highHours: 0 };
    }
    const totalAlerts = timelineData.reduce((sum, item) => sum + item.alertCount, 0);
    const maxAlerts = Math.max(...timelineData.map((item) => item.alertCount));
    const avgAlerts = totalAlerts / timelineData.length;
    const criticalHours = timelineData.filter((item) => item.severity === 'critical').length;
    const highHours = timelineData.filter((item) => item.severity === 'high').length;
    return { totalAlerts, maxAlerts, avgAlerts, criticalHours, highHours };
  }, [timelineData]);

  const insights = useMemo(() => {
    if (!filteredAlerts.length) return null;
    const last = filteredAlerts[filteredAlerts.length - 1];
    const byParam = {};
    filteredAlerts.forEach((a) => {
      byParam[a.parameterLabel] = (byParam[a.parameterLabel] || 0) + 1;
    });
    const topParam = Object.entries(byParam).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    const half = Math.floor(filteredAlerts.length / 2);
    let trendPct = null;
    if (half > 0) {
      const prev = filteredAlerts.slice(0, half).length;
      const curr = filteredAlerts.slice(half).length;
      if (prev > 0) trendPct = ((curr - prev) / prev) * 100;
    }
    return {
      lastAlertAt: formatInUserTimezone(last.detectedAt),
      topParam,
      trendPct,
    };
  }, [filteredAlerts]);

  const incidentSparkData = useMemo(() => {
    if (!timelineData.length) return [];
    return timelineData.slice(-18).map((row, idx) => ({ idx, count: row.alertCount }));
  }, [timelineData]);

  const incidentTrendPct = useMemo(() => {
    if (timelineData.length < 2) return null;
    const last = timelineData[timelineData.length - 1].alertCount;
    const prev = timelineData[timelineData.length - 2].alertCount;
    if (prev <= 0) return last > 0 ? 100 : 0;
    return ((last - prev) / prev) * 100;
  }, [timelineData]);

  const resolutionInsights = useMemo(() => {
    if (!normalizedAlerts.length) return null;
    const sorted = [...normalizedAlerts].sort((a, b) => a.timestamp - b.timestamp);
    const total = sorted.length;
    const recovered = sorted.filter((a) => a.severity === 'low' || a.severity === 'medium').length;
    const recoveryRate = total > 0 ? (recovered / total) * 100 : 0;

    const gaps = [];
    for (let i = 1; i < sorted.length; i += 1) {
      gaps.push((sorted[i].timestamp - sorted[i - 1].timestamp) / (1000 * 60));
    }
    const sortedGaps = gaps.sort((a, b) => a - b);
    let medianGapMin = null;
    if (sortedGaps.length) {
      const mid = Math.floor(sortedGaps.length / 2);
      medianGapMin = sortedGaps.length % 2 === 0
        ? (sortedGaps[mid - 1] + sortedGaps[mid]) / 2
        : sortedGaps[mid];
    }

    const lastAlert = sorted[sorted.length - 1];
    const noAlertStreakMin = Math.max(0, (Date.now() - lastAlert.timestamp) / (1000 * 60));

    return { recoveryRate, medianGapMin, noAlertStreakMin };
  }, [normalizedAlerts]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload;
    return (
      <Box sx={{ ...getTooltipContentStyle(theme), border: `1px solid ${t.border}`, p: 1.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', mb: 0.75, color: t.text }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.78rem', color: t.muted }}>
          Alerts: <Box component="span" sx={{ fontWeight: 800, color: t.text }}>{data.alertCount}</Box>
        </Typography>
        {data.parameters && (
          <Typography sx={{ fontSize: '0.72rem', color: t.muted, mt: 0.35 }}>
            {data.parameters}
          </Typography>
        )}
      </Box>
    );
  };

  const severeBuckets = stats.criticalHours + stats.highHours;
  const totalLabel = stats.totalAlerts || filteredAlerts.length;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 520,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: t.border,
        bgcolor: t.surface,
        boxShadow: t.shadow,
        overflow: 'hidden',
      }}
    >
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: { xs: 2, md: 2.5 } }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1.5,
            mb: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1.5,
                display: 'grid',
                placeItems: 'center',
                bgcolor: alpha(t.primary, 0.12),
                color: t.primary,
                flexShrink: 0,
              }}
            >
              <TimelineIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: t.text, letterSpacing: '-0.01em' }}>
                Alert Timeline
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', color: t.muted, fontWeight: 500 }}>
                {deviceName
                  ? `${deviceName} · ${totalLabel} threshold violation${totalLabel === 1 ? '' : 's'}`
                  : `${totalLabel} threshold violation${totalLabel === 1 ? '' : 's'}`}
                {' · logs + live series scan'}
              </Typography>
            </Box>
          </Box>
          <Chip
            size="small"
            label={`${totalLabel} total`}
            icon={(
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: totalLabel > 0 ? t.error : t.success,
                  ml: '8px !important',
                }}
              />
            )}
            sx={{
              height: 28,
              fontWeight: 800,
              fontSize: '0.72rem',
              bgcolor: t.card,
              color: t.text,
              border: `1px solid ${t.border}`,
              '& .MuiChip-label': { px: 1 },
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 2 }}>
          {insights && (
            <>
              <MetaPill t={t} label="LAST ALERT" value={insights.lastAlertAt} />
              <MetaPill t={t} label="TOP PARAMETER" value={insights.topParam} />
              {insights.trendPct != null && (
                <MetaPill
                  t={t}
                  label="TREND"
                  value={`${insights.trendPct >= 0 ? '+' : ''}${insights.trendPct.toFixed(0)}%`}
                  accent={insights.trendPct >= 0 ? t.warning : t.success}
                  endAdornment={insights.trendPct >= 0
                    ? <TrendingUpIcon sx={{ fontSize: 14, color: t.warning }} />
                    : <TrendingDownIcon sx={{ fontSize: 14, color: t.success }} />}
                />
              )}
            </>
          )}
          <Box sx={{ flex: 1, minWidth: 8 }} />
          <FormControl size="small">
            <Select
              value={severityFilter}
              displayEmpty
              onChange={(e) => setSeverityFilter(e.target.value)}
              sx={selectSx}
              renderValue={(v) => `Severity ${v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}`}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <Select
              value={parameterFilter}
              displayEmpty
              onChange={(e) => setParameterFilter(e.target.value)}
              sx={{ ...selectSx, minWidth: { xs: '100%', sm: 150 } }}
              renderValue={(v) => (
                v === 'all'
                  ? 'Parameter All'
                  : `Parameter ${formatDisplayName(v, { withUnit: false })}`
              )}
            >
              <MenuItem value="all">All</MenuItem>
              {parameterOptions.map((p) => (
                <MenuItem key={p} value={p}>{formatDisplayName(p, { withUnit: true })}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <Select
              value={bucket}
              displayEmpty
              onChange={(e) => setBucket(e.target.value)}
              sx={selectSx}
              renderValue={(v) => `Bucket ${v === '15m' ? '15 min' : v === 'day' ? 'Day' : 'Hour'}`}
            >
              <MenuItem value="15m">15 min</MenuItem>
              <MenuItem value="hour">Hour</MenuItem>
              <MenuItem value="day">Day</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: 1.25,
            mb: 1.25,
          }}
        >
          <MetricCard
            t={t}
            title="Total Alerts"
            value={stats.totalAlerts}
            subtitle="All time in range"
            dotColor={t.error}
          />
          <MetricCard
            t={t}
            title={`Max / ${bucketLabel}`}
            value={stats.maxAlerts}
            subtitle="Peak intensity"
            dotColor={t.warning}
          />
          <MetricCard
            t={t}
            title={`Avg / ${bucketLabel}`}
            value={stats.avgAlerts ? stats.avgAlerts.toFixed(1) : '0'}
            subtitle="Steady state"
            dotColor={t.muted}
          />
          <MetricCard
            t={t}
            title="Critical / High Hours"
            value={severeBuckets}
            subtitle={severeBuckets === 0 ? 'No severe incidents' : 'Severe bucket peaks'}
            dotColor={severeBuckets === 0 ? t.success : t.info}
            icon={severeBuckets === 0
              ? <CheckCircleIcon sx={{ fontSize: 10, color: theme.palette.success.contrastText || '#fff' }} />
              : null}
          />
        </Box>

        {resolutionInsights && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
              gap: 1.25,
              mb: 2,
            }}
          >
            <InsightCard
              t={t}
              title="Recovery Rate"
              value={`${resolutionInsights.recoveryRate.toFixed(0)}%`}
              subtitle={resolutionInsights.recoveryRate >= 100 ? 'All alerts resolved' : 'Stable / recovered share'}
              accent={t.success}
              footer={(
                <Box sx={{ mt: 1.25, height: 4, borderRadius: 999, bgcolor: alpha(t.success, 0.15), overflow: 'hidden' }}>
                  <Box
                    sx={{
                      width: `${Math.min(100, resolutionInsights.recoveryRate)}%`,
                      height: '100%',
                      bgcolor: t.text,
                      borderRadius: 999,
                    }}
                  />
                </Box>
              )}
            />
            <InsightCard
              t={t}
              title="Median Gap"
              value={resolutionInsights.medianGapMin != null
                ? `${resolutionInsights.medianGapMin.toFixed(0)} min`
                : '—'}
              subtitle="Between incidents"
              accent={t.info}
              footer={(
                <Box
                  sx={{
                    mt: 1.25,
                    height: 0,
                    borderTop: '2px dashed',
                    borderColor: alpha(t.info, 0.45),
                  }}
                />
              )}
            />
            <InsightCard
              t={t}
              title="No-Alert Streak"
              value={resolutionInsights.noAlertStreakMin >= 60
                ? `${(resolutionInsights.noAlertStreakMin / 60).toFixed(1)} h`
                : `${resolutionInsights.noAlertStreakMin.toFixed(0)} min`}
              subtitle="Currently quiet"
              accent={t.primary}
              footer={(
                <Chip
                  size="small"
                  label="LIVE"
                  icon={(
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: t.primary,
                        ml: '8px !important',
                        animation: 'pulse 1.6s ease-in-out infinite',
                        '@keyframes pulse': {
                          '0%, 100%': { opacity: 1 },
                          '50%': { opacity: 0.35 },
                        },
                      }}
                    />
                  )}
                  sx={{
                    mt: 1,
                    alignSelf: 'flex-start',
                    height: 22,
                    fontWeight: 800,
                    fontSize: '0.62rem',
                    letterSpacing: '0.08em',
                    bgcolor: alpha(t.primary, 0.1),
                    color: t.primary,
                    border: `1px solid ${alpha(t.primary, 0.3)}`,
                  }}
                />
              )}
            />
            <InsightCard
              t={t}
              title="Incident Trend"
              value={(
                <Box sx={{ height: 42, width: '100%', mt: 0.25 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={incidentSparkData} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke={t.accent}
                        strokeWidth={2.25}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              )}
              subtitle={`LAST ${Math.min(2, timelineData.length)} BUCKETS`}
              accent={t.accent}
              footer={incidentTrendPct != null ? (
                <Chip
                  size="small"
                  label={`${incidentTrendPct >= 0 ? '+' : ''}${incidentTrendPct.toFixed(0)}%`}
                  sx={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    height: 22,
                    fontWeight: 800,
                    fontSize: '0.65rem',
                    bgcolor: alpha(incidentTrendPct >= 0 ? t.error : t.success, 0.12),
                    color: incidentTrendPct >= 0 ? t.error : t.success,
                  }}
                />
              ) : null}
            />
          </Box>
        )}

        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 2,
            bgcolor: t.card,
            border: `1px solid ${t.border}`,
            boxShadow: t.cardShadow,
            overflow: 'hidden',
            minHeight: 340,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              px: 2,
              py: 1.35,
              borderBottom: `1px solid ${t.border}`,
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: t.text }}>
                {volumeTitle}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: chartBar }} />
                <Typography sx={{ fontSize: '0.72rem', color: t.muted, fontWeight: 600 }}>
                  Alerts
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', color: t.muted, fontWeight: 700, letterSpacing: '0.06em' }}>
                LOCAL
              </Typography>
              <Chip
                size="small"
                label={`${timelineData.length} bucket${timelineData.length === 1 ? '' : 's'}`}
                sx={{
                  height: 22,
                  fontWeight: 700,
                  fontSize: '0.68rem',
                  bgcolor: alpha(t.primary, 0.1),
                  color: t.text,
                }}
              />
            </Box>
          </Box>

          <Box sx={{ flexGrow: 1, px: 1, py: 1.5, height: 300, minHeight: 280 }}>
            {timelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelineData} margin={{ ...CHART_MARGIN, top: 8, bottom: 28 }}>
                  <CartesianGrid {...getCartesianGridProps(theme)} vertical={false} />
                  <XAxis
                    dataKey="hour"
                    stroke={theme.palette.divider}
                    tick={getAxisTickStyle(theme)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={theme.palette.divider}
                    tick={getAxisTickStyle(theme)}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: alpha(t.primary, 0.06) }} />
                  <Bar
                    dataKey="alertCount"
                    fill={chartBar}
                    radius={[8, 8, 0, 0]}
                    maxBarSize={56}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: t.muted,
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 44, mb: 1.25, opacity: 0.45, color: t.success }} />
                <Typography sx={{ fontWeight: 700, color: t.text }}>No alerts in this period</Typography>
                <Typography sx={{ fontSize: '0.8rem', mt: 0.35, color: t.muted }}>
                  All parameters within normal range
                </Typography>
              </Box>
            )}
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              px: 2,
              py: 1.1,
              borderTop: `1px solid ${t.border}`,
              flexWrap: 'wrap',
            }}
          >
            <Typography sx={{ fontSize: '0.72rem', color: t.muted, fontWeight: 500 }}>
              Showing {timelineData.length} {bucket === 'hour' ? 'hourly' : bucket === 'day' ? 'daily' : '15-min'} bucket
              {timelineData.length === 1 ? '' : 's'} · {stats.totalAlerts} alert{stats.totalAlerts === 1 ? '' : 's'} total
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: t.success,
                  animation: 'pulse 1.6s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.35 },
                  },
                }}
              />
              <Typography sx={{ fontSize: '0.72rem', color: t.muted, fontWeight: 600 }}>
                Live bucket updates
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            mt: 1.75,
            px: 1.75,
            py: 1.25,
            borderRadius: 2,
            bgcolor: t.card,
            border: `1px solid ${t.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85 }}>
            <ShieldOutlinedIcon sx={{ fontSize: 18, color: t.muted }} />
            <Typography
              sx={{
                fontSize: '0.7rem',
                fontWeight: 800,
                letterSpacing: '0.1em',
                color: t.muted,
              }}
            >
              ALERT SEVERITY LEVELS
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 2 }, flexWrap: 'wrap' }}>
            {Object.entries(t.severity).map(([key, meta]) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: meta.color }} />
                <Typography
                  sx={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    color: t.text,
                  }}
                >
                  {meta.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default QuickViewAlertChart;
