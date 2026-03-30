import React, { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Tooltip,
  useTheme,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Paper
} from '@mui/material';
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
  Cell
} from 'recharts';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  Timeline as TimelineIcon
} from '@mui/icons-material';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { getChartCardSx, CHART_MARGIN, getCartesianGridProps, getAxisTickStyle, getTooltipContentStyle } from '../utils/chartStyles';
import SectionHeader from './SectionHeader';

const QuickViewAlertChart = ({ alertData, deviceName }) => {
  const theme = useTheme();
  const { formatDisplayName } = useFieldMetadata();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [parameterFilter, setParameterFilter] = useState('all');
  const [bucket, setBucket] = useState('hour');

  const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };

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

  const parameterOptions = useMemo(() => {
    return [...new Set(normalizedAlerts.map((a) => a.parameter))];
  }, [normalizedAlerts]);

  const filteredAlerts = useMemo(() => {
    return normalizedAlerts.filter((a) => {
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (parameterFilter !== 'all' && a.parameter !== parameterFilter) return false;
      return true;
    });
  }, [normalizedAlerts, severityFilter, parameterFilter]);

  // Group filtered alerts by selected bucket for timeline chart
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

  // Modern color scheme for severity levels
  const getSeverityColor = (severity) => {
    const colors = {
      low: '#10B981',
      medium: '#F59E0B',
      high: '#EF4444',
      critical: '#0099CC'
    };
    return colors[severity] || colors.low;
  };

  // Modern color scheme with background colors
  const getSeverityColors = (severity) => {
    const schemes = {
      low: { bg: '#10B98108', border: '#10B98130', text: '#10B981' },
      medium: { bg: '#F59E0B08', border: '#F59E0B30', text: '#F59E0B' },
      high: { bg: '#EF444408', border: '#EF444430', text: '#EF4444' },
      critical: { bg: '#0099CC08', border: '#0099CC30', text: '#0099CC' }
    };
    return schemes[severity] || schemes.low;
  };

  // Modern custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const severityColors = getSeverityColors(data.severity);
      
      return (
        <Box sx={{ ...getTooltipContentStyle(theme), border: `1px solid ${severityColors.border}`, p: 2 }}>
          <Typography variant="body2" sx={{ 
            fontWeight: 600, 
            color: theme.palette.text.primary,
            mb: 1
          }}>
            {label}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Box sx={{ 
              width: 12, 
              height: 12, 
              backgroundColor: getSeverityColor(data.severity), 
              borderRadius: '50%' 
            }} />
            <Typography variant="body2" sx={{ 
              color: theme.palette.text.primary,
              fontWeight: 500
            }}>
              Alerts: {data.alertCount}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ 
            color: theme.palette.text.secondary,
            fontWeight: 500,
            display: 'block'
          }}>
            Parameters: {data.parameters}
          </Typography>
          <Typography variant="caption" sx={{ 
            color: severityColors.text,
            fontWeight: 600,
            textTransform: 'capitalize'
          }}>
            Severity: {data.severity}
          </Typography>
        </Box>
      );
    }
    return null;
  };

  // Calculate statistics
  const stats = useMemo(() => {
    if (!timelineData.length) return {};
    
    const totalAlerts = timelineData.reduce((sum, item) => sum + item.alertCount, 0);
    const maxAlerts = Math.max(...timelineData.map(item => item.alertCount));
    const avgAlerts = totalAlerts / timelineData.length;
    const criticalHours = timelineData.filter(item => item.severity === 'critical').length;
    const highHours = timelineData.filter(item => item.severity === 'high').length;
    
    return { totalAlerts, maxAlerts, avgAlerts, criticalHours, highHours };
  }, [timelineData]);

  const insights = useMemo(() => {
    if (!filteredAlerts.length) return null;
    const last = filteredAlerts[filteredAlerts.length - 1];
    const byParam = {};
    filteredAlerts.forEach((a) => { byParam[a.parameterLabel] = (byParam[a.parameterLabel] || 0) + 1; });
    const topParam = Object.entries(byParam).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    // Trend vs previous half
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

  const topIncidents = useMemo(() => {
    return [...filteredAlerts]
      .sort((a, b) => {
        const s = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
        if (s !== 0) return s;
        return b.timestamp - a.timestamp;
      })
      .slice(0, 5);
  }, [filteredAlerts]);

  const incidentSparkData = useMemo(() => {
    if (!timelineData.length) return [];
    const recent = timelineData.slice(-18);
    return recent.map((t, idx) => ({
      idx,
      count: t.alertCount,
    }));
  }, [timelineData]);

  const resolutionInsights = useMemo(() => {
    if (!normalizedAlerts.length) return null;

    const sorted = [...normalizedAlerts].sort((a, b) => a.timestamp - b.timestamp);
    const total = sorted.length;

    // Approximation: low/medium represent stable/recovered states
    const recovered = sorted.filter((a) => a.severity === 'low' || a.severity === 'medium').length;
    const recoveryRate = total > 0 ? (recovered / total) * 100 : 0;

    // Median gap in minutes between consecutive alerts
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

    return {
      recoveryRate,
      medianGapMin,
      noAlertStreakMin,
    };
  }, [normalizedAlerts]);

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 500, ...getChartCardSx(theme), transition: 'all 0.2s ease', '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.08)' } }}>
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', p: 3 }}>
        <Box sx={{ mb: 2 }}>
          <SectionHeader
            icon={<TimelineIcon sx={{ fontSize: 18 }} />}
            title="Alert Timeline"
            subtitle={deviceName ? `${deviceName} · threshold violations` : 'Threshold violations'}
            right={(
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {stats.totalAlerts > 0 && (
                  <Chip
                    label={`${stats.totalAlerts} total`}
                    size="small"
                    sx={{ fontWeight: 800 }}
                    icon={<WarningIcon sx={{ color: '#EF4444' }} />}
                  />
                )}
                {stats.criticalHours > 0 && (
                  <Chip
                    label={`${stats.criticalHours} critical`}
                    size="small"
                    color="error"
                    variant="outlined"
                    sx={{ fontWeight: 800 }}
                    icon={<ErrorIcon color="error" />}
                  />
                )}
              </Box>
            )}
          />
        </Box>

        {/* Intelligence row + filters */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
          {insights && (
            <>
              <Chip size="small" label={`Last alert: ${insights.lastAlertAt}`} />
              <Chip size="small" label={`Top parameter: ${insights.topParam}`} variant="outlined" />
              {insights.trendPct != null && (
                <Chip
                  size="small"
                  label={`Trend: ${insights.trendPct >= 0 ? '+' : ''}${insights.trendPct.toFixed(0)}%`}
                  color={insights.trendPct >= 0 ? 'warning' : 'success'}
                  variant="outlined"
                />
              )}
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Severity</InputLabel>
            <Select value={severityFilter} label="Severity" onChange={(e) => setSeverityFilter(e.target.value)}>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Parameter</InputLabel>
            <Select value={parameterFilter} label="Parameter" onChange={(e) => setParameterFilter(e.target.value)}>
              <MenuItem value="all">All</MenuItem>
              {parameterOptions.map((p) => (
                <MenuItem key={p} value={p}>{formatDisplayName(p, { withUnit: true })}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Bucket</InputLabel>
            <Select value={bucket} label="Bucket" onChange={(e) => setBucket(e.target.value)}>
              <MenuItem value="15m">15 min</MenuItem>
              <MenuItem value="hour">Hour</MenuItem>
              <MenuItem value="day">Day</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Modern Statistics */}
        {stats.totalAlerts > 0 && (
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: 2, 
            mb: 3 
          }}>
            <Box sx={{ textAlign: 'center', p: 2, borderRadius: 1.5, background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', transition: 'all 0.2s ease' }}>
              <Typography variant="h6" sx={{ 
                color: '#EF4444',
                fontWeight: 800,
                fontSize: '1.1rem',
                mb: 0.5
              }}>
                {stats.totalAlerts}
              </Typography>
              <Typography variant="caption" sx={{ 
                color: theme.palette.text.secondary,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Total Alerts
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, borderRadius: 1.5, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', transition: 'all 0.2s ease' }}>
              <Typography variant="body1" sx={{ 
                color: '#F59E0B',
                fontWeight: 700,
                fontSize: '1rem',
                mb: 0.5
              }}>
                {stats.maxAlerts}
              </Typography>
              <Typography variant="caption" sx={{ 
                color: theme.palette.text.secondary,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Max/Hour
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, borderRadius: 1.5, background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', transition: 'all 0.2s ease' }}>
              <Typography variant="body1" sx={{ 
                color: '#2563EB',
                fontWeight: 700,
                fontSize: '1rem',
                mb: 0.5
              }}>
                {stats.avgAlerts?.toFixed(1) || '0'}
              </Typography>
              <Typography variant="caption" sx={{ 
                color: theme.palette.text.secondary,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Avg/Hour
              </Typography>
            </Box>
            <Box sx={{ 
              textAlign: 'center',
              p: 2,
              borderRadius: 1.5,
              background: 'rgba(124, 58, 237, 0.08)',
              border: '1px solid rgba(124, 58, 237, 0.25)',
              transition: 'all 0.2s ease'
            }}>
              <Typography variant="body1" sx={{ 
                color: '#0099CC',
                fontWeight: 700,
                fontSize: '1rem',
                mb: 0.5
              }}>
                {stats.criticalHours + stats.highHours}
              </Typography>
              <Typography variant="caption" sx={{ 
                color: theme.palette.text.secondary,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Critical/High Hours
              </Typography>
            </Box>
          </Box>
        )}

        {/* Resolution insights */}
        {resolutionInsights && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' },
              gap: 1.25,
              mb: 2,
            }}
          >
            <Box sx={{ p: 1.25, borderRadius: 1.25, border: '1px solid rgba(16,185,129,0.25)', bgcolor: 'rgba(16,185,129,0.06)' }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                Recovery Rate
              </Typography>
              <Typography sx={{ mt: 0.25, fontWeight: 800, color: '#10B981' }}>
                {resolutionInsights.recoveryRate.toFixed(0)}%
              </Typography>
            </Box>
            <Box sx={{ p: 1.25, borderRadius: 1.25, border: '1px solid rgba(37,99,235,0.25)', bgcolor: 'rgba(37,99,235,0.06)' }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                Median Gap
              </Typography>
              <Typography sx={{ mt: 0.25, fontWeight: 800, color: '#2563EB' }}>
                {resolutionInsights.medianGapMin != null ? `${resolutionInsights.medianGapMin.toFixed(0)} min` : '-'}
              </Typography>
            </Box>
            <Box sx={{ p: 1.25, borderRadius: 1.25, border: '1px solid rgba(124,58,237,0.25)', bgcolor: 'rgba(124,58,237,0.06)' }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                No-Alert Streak
              </Typography>
              <Typography sx={{ mt: 0.25, fontWeight: 800, color: '#7C3AED' }}>
                {resolutionInsights.noAlertStreakMin >= 60
                  ? `${(resolutionInsights.noAlertStreakMin / 60).toFixed(1)} h`
                  : `${resolutionInsights.noAlertStreakMin.toFixed(0)} min`}
              </Typography>
            </Box>
            <Box sx={{ p: 1.25, borderRadius: 1.25, border: '1px solid rgba(245,158,11,0.25)', bgcolor: 'rgba(245,158,11,0.06)' }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', mb: 0.5 }}>
                Incident Trend
              </Typography>
              <Box sx={{ height: 46, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={incidentSparkData} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
              <Typography sx={{ mt: 0.25, fontSize: '0.72rem', color: 'text.secondary' }}>
                Last {incidentSparkData.length} buckets
              </Typography>
            </Box>
          </Box>
        )}

        {/* Modern Chart */}
        <Box sx={{ 
          flexGrow: 1, 
          minHeight: 300, height: '400px', width: '100%', p: 2, position: 'relative', overflow: 'hidden', ...getChartCardSx(theme)
        }}>
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} margin={{ ...CHART_MARGIN, bottom: 56 }}>
                <CartesianGrid {...getCartesianGridProps(theme)} />
                <XAxis dataKey="hour" stroke={theme.palette.divider} tick={getAxisTickStyle(theme)} angle={-45} textAnchor="end" height={56} />
                <YAxis stroke={theme.palette.divider} tick={getAxisTickStyle(theme)} />
                <RechartsTooltip content={<CustomTooltip />} />
                
                <Bar
                  dataKey="alertCount"
                  radius={[8, 8, 0, 0]}
                  isAnimationActive={false}
                >
                  {timelineData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={getSeverityColor(entry.severity)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              color: theme.palette.text.secondary
            }}>
              <CheckCircleIcon sx={{ fontSize: 48, mb: 2, opacity: 0.3 }} />
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                No alerts in this period
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                All parameters within normal range
              </Typography>
            </Box>
          )}
        </Box>

        {/* Modern Legend */}
        {timelineData.length > 0 && (
          <Box sx={{ 
            mt: 3, p: 2, borderRadius: 1.5, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)'
          }}>
            <Typography variant="subtitle2" sx={{ 
              fontWeight: 600, 
              color: theme.palette.text.primary,
              mb: 2,
              textAlign: 'center'
            }}>
              Alert Severity Levels
            </Typography>
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
              gap: 2 
            }}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                p: 1, borderRadius: 1, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <Box sx={{ 
                  width: 12, 
                  height: 12, 
                  backgroundColor: '#10B981', 
                  borderRadius: '50%' 
                }} />
                <Typography variant="caption" sx={{ 
                  fontWeight: 600,
                  color: '#10B981',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Low
                </Typography>
              </Box>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                p: 1, borderRadius: 1, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)'
              }}>
                <Box sx={{ 
                  width: 12, 
                  height: 12, 
                  backgroundColor: '#F59E0B', 
                  borderRadius: '50%' 
                }} />
                <Typography variant="caption" sx={{ 
                  fontWeight: 600,
                  color: '#F59E0B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Medium
                </Typography>
              </Box>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                p: 1, borderRadius: 1, background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)'
              }}>
                <Box sx={{ 
                  width: 12, 
                  height: 12, 
                  backgroundColor: '#EF4444', 
                  borderRadius: '50%' 
                }} />
                <Typography variant="caption" sx={{ 
                  fontWeight: 600,
                  color: '#EF4444',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  High
                </Typography>
              </Box>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                p: 1, borderRadius: 1, background: 'rgba(0, 153, 204, 0.08)', border: '1px solid rgba(0, 153, 204, 0.2)'
              }}>
                <Box sx={{ 
                  width: 12, 
                  height: 12, 
                  backgroundColor: '#0099CC', 
                  borderRadius: '50%' 
                }} />
                <Typography variant="caption" sx={{ 
                  fontWeight: 600,
                  color: '#0099CC',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Critical
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

        {/* Top incidents mini table */}
        {topIncidents.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <SectionHeader
              icon={<InfoIcon sx={{ fontSize: 18 }} />}
              title="Top Incidents"
              subtitle="Most severe and recent events"
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
            />
            <TableContainer component={Paper} sx={{ border: '1px solid rgba(0,0,0,0.06)', borderTop: 'none' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Parameter</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topIncidents.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatInUserTimezone(r.detectedAt)}</TableCell>
                      <TableCell>{r.parameterLabel}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getSeverityColor(r.severity) }} />
                          {r.severity}
                        </Box>
                      </TableCell>
                      <TableCell>{r.value ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default QuickViewAlertChart;