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

const SEVERITY = {
  low: { color: '#10B981', label: 'LOW' },
  medium: { color: '#F59E0B', label: 'MEDIUM' },
  high: { color: '#EF4444', label: 'HIGH' },
  critical: { color: '#0099CC', label: 'CRITICAL' },
};

const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
const CHART_BAR = '#1E293B';

const selectSx = {
  minWidth: { xs: '100%', sm: 128 },
  bgcolor: '#fff',
  borderRadius: 999,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(15,23,42,0.12)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(15,23,42,0.22)' },
  '& .MuiSelect-select': {
    py: 0.85,
    px: 1.5,
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#334155',
  },
};

function MetricCard({ title, value, subtitle, dotColor, icon }) {
  return (
    <Box
      sx={{
        position: 'relative',
        p: 1.75,
        borderRadius: 2,
        bgcolor: '#fff',
        border: '1px solid',
        borderColor: 'rgba(15,23,42,0.08)',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
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
          color: '#64748B',
          textTransform: 'uppercase',
          mb: 0.75,
          pr: 2,
        }}
      >
        {title}
      </Typography>
      <Typography sx={{ fontSize: '1.55rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography sx={{ mt: 0.6, fontSize: '0.72rem', color: '#94A3B8', fontWeight: 500 }}>
        {subtitle}
      </Typography>
    </Box>
  );
}

function InsightCard({ title, value, subtitle, accent, footer }) {
  return (
    <Box
      sx={{
        position: 'relative',
        p: 1.75,
        pl: 2,
        borderRadius: 2,
        bgcolor: '#fff',
        border: '1px solid',
        borderColor: 'rgba(15,23,42,0.08)',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
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
          color: '#64748B',
          textTransform: 'uppercase',
          mb: 0.75,
        }}
      >
        {title}
      </Typography>
      <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography sx={{ mt: 0.5, fontSize: '0.72rem', color: '#94A3B8', fontWeight: 500, flexGrow: 1 }}>
        {subtitle}
      </Typography>
      {footer}
    </Box>
  );
}

const QuickViewAlertChart = ({ alertData, deviceName }) => {
  const theme = useTheme();
  const { formatDisplayName } = useFieldMetadata();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [parameterFilter, setParameterFilter] = useState('all');
  const [bucket, setBucket] = useState('hour');

  const normalizedAlerts = useMemo(() => {
    if (!Array.isArray(alertData)) return [];
    return alertData
      .map((a) => {
        const ts = a.timestamp || a.detected_at || a.created_at;
        if (!ts) return null;
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return null;
        const sevRaw = String(a.severity || a.status || 'low').toLowerCase();
        const sev = ['low', 'medium', 'high', 'critical'].includes(sevRaw) ? sevRaw : 'low';
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
        };
      })
      .filter(Boolean)
      .sort((x, y) => x.timestamp - y.timestamp);
  }, [alertData, formatDisplayName]);

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
    return timelineData.slice(-18).map((t, idx) => ({ idx, count: t.alertCount }));
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
      <Box sx={{ ...getTooltipContentStyle(theme), border: '1px solid rgba(15,23,42,0.1)', p: 1.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', mb: 0.75 }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
          Alerts: <Box component="span" sx={{ fontWeight: 800, color: '#0F172A' }}>{data.alertCount}</Box>
        </Typography>
        {data.parameters && (
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.35 }}>
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
        borderColor: 'rgba(15,23,42,0.08)',
        bgcolor: '#F8FAFC',
        boxShadow: '0 8px 28px rgba(15,23,42,0.06)',
        overflow: 'hidden',
      }}
    >
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: { xs: 2, md: 2.5 } }}>
        {/* Header */}
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
                bgcolor: alpha('#1E3A5F', 0.08),
                color: '#1E3A5F',
                flexShrink: 0,
              }}
            >
              <TimelineIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: '#0F172A', letterSpacing: '-0.01em' }}>
                Alert Timeline
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 500 }}>
                {deviceName
                  ? `${deviceName} · ${totalLabel} threshold violation${totalLabel === 1 ? '' : 's'}`
                  : `${totalLabel} threshold violation${totalLabel === 1 ? '' : 's'}`}
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
                  bgcolor: totalLabel > 0 ? '#EF4444' : '#10B981',
                  ml: '8px !important',
                }}
              />
            )}
            sx={{
              height: 28,
              fontWeight: 800,
              fontSize: '0.72rem',
              bgcolor: '#fff',
              border: '1px solid rgba(15,23,42,0.1)',
              '& .MuiChip-label': { px: 1 },
            }}
          />
        </Box>

        {/* Meta + filters */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
            mb: 2,
          }}
        >
          {insights && (
            <>
              <MetaPill label="LAST ALERT" value={insights.lastAlertAt} />
              <MetaPill label="TOP PARAMETER" value={insights.topParam} />
              {insights.trendPct != null && (
                <MetaPill
                  label="TREND"
                  value={`${insights.trendPct >= 0 ? '+' : ''}${insights.trendPct.toFixed(0)}%`}
                  accent={insights.trendPct >= 0 ? '#F59E0B' : '#10B981'}
                  endAdornment={insights.trendPct >= 0
                    ? <TrendingUpIcon sx={{ fontSize: 14, color: '#F59E0B' }} />
                    : <TrendingDownIcon sx={{ fontSize: 14, color: '#10B981' }} />}
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

        {/* KPI row */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: 1.25,
            mb: 1.25,
          }}
        >
          <MetricCard
            title="Total Alerts"
            value={stats.totalAlerts}
            subtitle="All time in range"
            dotColor="#EF4444"
          />
          <MetricCard
            title={`Max / ${bucketLabel}`}
            value={stats.maxAlerts}
            subtitle="Peak intensity"
            dotColor="#F59E0B"
          />
          <MetricCard
            title={`Avg / ${bucketLabel}`}
            value={stats.avgAlerts ? stats.avgAlerts.toFixed(1) : '0'}
            subtitle="Steady state"
            dotColor="#94A3B8"
          />
          <MetricCard
            title="Critical / High Hours"
            value={severeBuckets}
            subtitle={severeBuckets === 0 ? 'No severe incidents' : 'Severe bucket peaks'}
            dotColor={severeBuckets === 0 ? '#10B981' : '#0099CC'}
            icon={severeBuckets === 0 ? <CheckCircleIcon sx={{ fontSize: 10, color: '#fff' }} /> : null}
          />
        </Box>

        {/* Insight row */}
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
              title="Recovery Rate"
              value={`${resolutionInsights.recoveryRate.toFixed(0)}%`}
              subtitle={resolutionInsights.recoveryRate >= 100 ? 'All alerts resolved' : 'Stable / recovered share'}
              accent="#10B981"
              footer={(
                <Box sx={{ mt: 1.25, height: 4, borderRadius: 999, bgcolor: alpha('#10B981', 0.15), overflow: 'hidden' }}>
                  <Box
                    sx={{
                      width: `${Math.min(100, resolutionInsights.recoveryRate)}%`,
                      height: '100%',
                      bgcolor: '#0F172A',
                      borderRadius: 999,
                    }}
                  />
                </Box>
              )}
            />
            <InsightCard
              title="Median Gap"
              value={resolutionInsights.medianGapMin != null
                ? `${resolutionInsights.medianGapMin.toFixed(0)} min`
                : '—'}
              subtitle="Between incidents"
              accent="#2563EB"
              footer={(
                <Box
                  sx={{
                    mt: 1.25,
                    height: 0,
                    borderTop: '2px dashed',
                    borderColor: alpha('#2563EB', 0.45),
                  }}
                />
              )}
            />
            <InsightCard
              title="No-Alert Streak"
              value={resolutionInsights.noAlertStreakMin >= 60
                ? `${(resolutionInsights.noAlertStreakMin / 60).toFixed(1)} h`
                : `${resolutionInsights.noAlertStreakMin.toFixed(0)} min`}
              subtitle="Currently quiet"
              accent="#7C3AED"
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
                        bgcolor: '#7C3AED',
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
                    bgcolor: alpha('#7C3AED', 0.08),
                    color: '#7C3AED',
                    border: `1px solid ${alpha('#7C3AED', 0.25)}`,
                  }}
                />
              )}
            />
            <InsightCard
              title="Incident Trend"
              value={(
                <Box sx={{ height: 42, width: '100%', mt: 0.25 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={incidentSparkData} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#F59E0B"
                        strokeWidth={2.25}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              )}
              subtitle={`LAST ${Math.min(2, timelineData.length)} BUCKETS`}
              accent="#F59E0B"
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
                    bgcolor: alpha(incidentTrendPct >= 0 ? '#EF4444' : '#10B981', 0.1),
                    color: incidentTrendPct >= 0 ? '#DC2626' : '#059669',
                  }}
                />
              ) : null}
            />
          </Box>
        )}

        {/* Chart panel */}
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 2,
            bgcolor: '#fff',
            border: '1px solid rgba(15,23,42,0.08)',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
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
              borderBottom: '1px solid rgba(15,23,42,0.06)',
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: '#0F172A' }}>
                {volumeTitle}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CHART_BAR }} />
                <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                  Alerts
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.06em' }}>
                LOCAL
              </Typography>
              <Chip
                size="small"
                label={`${timelineData.length} bucket${timelineData.length === 1 ? '' : 's'}`}
                sx={{
                  height: 22,
                  fontWeight: 700,
                  fontSize: '0.68rem',
                  bgcolor: alpha('#1E293B', 0.06),
                  color: '#334155',
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
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: alpha('#1E293B', 0.04) }} />
                  <Bar
                    dataKey="alertCount"
                    fill={CHART_BAR}
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
                  color: '#94A3B8',
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 44, mb: 1.25, opacity: 0.35, color: '#10B981' }} />
                <Typography sx={{ fontWeight: 700, color: '#334155' }}>No alerts in this period</Typography>
                <Typography sx={{ fontSize: '0.8rem', mt: 0.35 }}>
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
              borderTop: '1px solid rgba(15,23,42,0.06)',
              flexWrap: 'wrap',
            }}
          >
            <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
              Showing {timelineData.length} {bucket === 'hour' ? 'hourly' : bucket === 'day' ? 'daily' : '15-min'} bucket
              {timelineData.length === 1 ? '' : 's'} · {stats.totalAlerts} alert{stats.totalAlerts === 1 ? '' : 's'} total
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: '#10B981',
                  animation: 'pulse 1.6s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.35 },
                  },
                }}
              />
              <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                Live bucket updates
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Severity legend */}
        <Box
          sx={{
            mt: 1.75,
            px: 1.75,
            py: 1.25,
            borderRadius: 2,
            bgcolor: '#fff',
            border: '1px solid rgba(15,23,42,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85 }}>
            <ShieldOutlinedIcon sx={{ fontSize: 18, color: '#64748B' }} />
            <Typography
              sx={{
                fontSize: '0.7rem',
                fontWeight: 800,
                letterSpacing: '0.1em',
                color: '#64748B',
              }}
            >
              ALERT SEVERITY LEVELS
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 2 }, flexWrap: 'wrap' }}>
            {Object.entries(SEVERITY).map(([key, meta]) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: meta.color }} />
                <Typography
                  sx={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    color: '#475569',
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

function MetaPill({ label, value, accent, endAdornment }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.15,
        py: 0.55,
        borderRadius: 999,
        bgcolor: '#fff',
        border: '1px solid rgba(15,23,42,0.08)',
        maxWidth: '100%',
      }}
    >
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: accent || '#0F172A', flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', color: '#94A3B8' }}>
        {label}
      </Typography>
      <Typography
        noWrap
        sx={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: accent || '#0F172A',
          maxWidth: 220,
        }}
      >
        {value}
      </Typography>
      {endAdornment}
    </Box>
  );
}

export default QuickViewAlertChart;
