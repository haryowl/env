import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Tooltip,
  useTheme
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import {
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { getChartCardSx, getCartesianGridProps, getAxisTickStyle, getParameterColorIndex, CHART_COLORS } from '../utils/chartStyles';

/** Bottom margin reserves space for X ticks inside the SVG (card stays overflow:hidden so grid rows do not overlap). */
const QUICK_VIEW_LINE_MARGIN = { top: 12, right: 16, left: 8, bottom: 56 };

/** Extra space above the plotted max: 2% of the Y span (max − min), or 2% of |value| when the series is flat. */
const Y_AXIS_HEADROOM_RATIO = 0.02;

/** Match alert log/config parameter names to chart field keys (mapper ids). */
function matchesChartParameter(alertParameter, chartParameter) {
  if (alertParameter == null || chartParameter == null) return false;
  const a = String(alertParameter).trim();
  const p = String(chartParameter).trim();
  if (!a || !p) return false;
  return (
    a === p ||
    a === p.replace(/_/g, ' ') ||
    a === p.replace(/_/g, '.') ||
    a.replace(/_/g, ' ') === p.replace(/_/g, ' ')
  );
}

const QuickViewChart = ({ parameter, data, alertLogs = [], alertConfigs = [], deviceName, addChartRef }) => {
  const theme = useTheme();
  const chartRef = useRef(null);
  const { formatDisplayName, getUnit } = useFieldMetadata();
  const parameterUnit = getUnit(parameter);
  const parameterDisplayName = formatDisplayName(parameter, { withUnit: true });

  const formatValue = useCallback(
    (value, precision = 3, includeUnit = true) => {
      if (value === null || value === undefined || value === '') {
        return '-';
      }
      if (typeof value === 'number') {
        const formatted = Number.isFinite(value) ? value.toFixed(precision) : value;
        return includeUnit && parameterUnit ? `${formatted} ${parameterUnit}` : `${formatted}`;
      }
      if (typeof value === 'string') {
        const numeric = parseFloat(value);
        if (!Number.isNaN(numeric)) {
          const formatted = Number.isFinite(numeric) ? numeric.toFixed(precision) : numeric;
          return includeUnit && parameterUnit ? `${formatted} ${parameterUnit}` : `${formatted}`;
        }
        return includeUnit && parameterUnit ? `${value} ${parameterUnit}` : value;
      }
      return includeUnit && parameterUnit ? `${value} ${parameterUnit}` : value;
    },
    [parameterUnit]
  );

  const formatYAxisTick = useCallback((value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(3) : '';
  }, []);

  // Register chart ref with parent component
  useEffect(() => {
    if (addChartRef) {
      addChartRef(parameter, chartRef);
    }
  }, [parameter, addChartRef]);

  // Alert log rows for this chart parameter (scoped by device + time in parent fetch)
  const parameterAlertLogs = useMemo(() => {
    if (!Array.isArray(alertLogs)) return [];
    return alertLogs.filter((log) => matchesChartParameter(log.parameter, parameter));
  }, [alertLogs, parameter]);

  // Threshold lines from alert rules (/api/alerts), not alert_logs rows
  const thresholds = useMemo(() => {
    const configs = (alertConfigs || []).filter(
      (a) => a.type === 'threshold' && matchesChartParameter(a.parameter, parameter)
    );
    let minT = null;
    let maxT = null;
    for (const a of configs) {
      if (a.min != null) {
        const n = Number(a.min);
        if (Number.isFinite(n)) minT = minT == null ? n : Math.min(minT, n);
      }
      if (a.max != null) {
        const n = Number(a.max);
        if (Number.isFinite(n)) maxT = maxT == null ? n : Math.max(maxT, n);
      }
    }
    return { min: minT, max: maxT };
  }, [alertConfigs, parameter]);

  // Process data for chart (use timestamp when datetime missing — matches /data-dash rows)
  const chartData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];

    return data
      .filter((item) => item[parameter] !== undefined && item[parameter] !== null)
      .map((item) => {
        const timeRaw = item.datetime ?? item.timestamp;
        if (timeRaw == null || timeRaw === '') return null;
        const ts = new Date(timeRaw).getTime();
        if (!Number.isFinite(ts)) return null;
        const rawVal = item[parameter];
        const n = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
        if (!Number.isFinite(n)) return null;
        return {
          datetime: formatInUserTimezone(timeRaw, 'MM/DD HH:mm'),
          timestamp: ts,
          value: n,
          original: item,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data, parameter]);

  const colorIndex = getParameterColorIndex(parameter);
  const lineColor = CHART_COLORS[colorIndex];
  const colorScheme = { line: lineColor, area: `${lineColor}20`, bg: `${lineColor}08` };

  // Modern custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isOutOfRange =
        (thresholds.min != null && data.value < thresholds.min) ||
        (thresholds.max != null && data.value > thresholds.max);
      
      return (
        <Box
          sx={{
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: isOutOfRange ? '#EF4444' : 'divider',
            borderRadius: 1,
            p: 2,
            boxShadow: theme.palette.mode === 'dark' ? '0 4px 20px rgba(0, 0, 0, 0.35)' : '0 4px 20px rgba(0, 0, 0, 0.1)',
            fontFamily: '"Inter", "Roboto", sans-serif'
          }}
        >
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
              backgroundColor: colorScheme.line, 
              borderRadius: '50%' 
            }} />
            <Typography variant="body2" sx={{ 
              color: isOutOfRange ? '#EF4444' : theme.palette.text.primary,
              fontWeight: isOutOfRange ? 700 : 500
            }}>
              {parameterDisplayName}: {formatValue(data.value, 3)}
            </Typography>
            {isOutOfRange && <WarningIcon sx={{ fontSize: 16, color: '#EF4444' }} />}
          </Box>
          {(thresholds.min != null || thresholds.max != null) && (
            <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
              {thresholds.min != null && (
                <Typography variant="caption" sx={{ 
                  color: theme.palette.text.secondary,
                  fontWeight: 500
                }}>
                  Min: {formatValue(thresholds.min)}
                </Typography>
              )}
              {thresholds.max != null && (
                <Typography variant="caption" sx={{ 
                  color: theme.palette.text.secondary,
                  fontWeight: 500
                }}>
                  Max: {formatValue(thresholds.max)}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      );
    }
    return null;
  };

  // Calculate statistics
  const stats = useMemo(() => {
    if (!chartData.length) return {};
    
    const values = chartData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const latest = chartData[chartData.length - 1]?.value;
    
    return { min, max, avg, latest };
  }, [chartData]);

  // Y-axis domain: include threshold lines, then add 2% headroom above the top of that range
  const yAxisDomain = useMemo(() => {
    if (!Number.isFinite(stats.min) || !Number.isFinite(stats.max)) return [0, 100];

    let minV = stats.min;
    let maxV = stats.max;
    const tMin = thresholds.min != null ? Number(thresholds.min) : NaN;
    const tMax = thresholds.max != null ? Number(thresholds.max) : NaN;
    if (Number.isFinite(tMin)) minV = Math.min(minV, tMin);
    if (Number.isFinite(tMax)) maxV = Math.max(maxV, tMax);

    const span = maxV - minV;
    const headroom =
      span > 0 && Number.isFinite(span)
        ? span * Y_AXIS_HEADROOM_RATIO
        : Math.max(Math.abs(maxV), Math.abs(minV), 1e-12) * Y_AXIS_HEADROOM_RATIO;

    let minDomain = minV - headroom;
    let maxDomain = maxV + headroom;
    if (!Number.isFinite(minDomain) || !Number.isFinite(maxDomain) || minDomain >= maxDomain) {
      const pad = Math.max(Math.abs(minV), Math.abs(maxV), 1e-9) * Y_AXIS_HEADROOM_RATIO;
      minDomain = minV - pad;
      maxDomain = maxV + pad;
    }

    return [minDomain, maxDomain];
  }, [stats.min, stats.max, thresholds.min, thresholds.max]);

  // Check if latest value is out of range
  const isLatestOutOfRange = useMemo(() => {
    if (!Number.isFinite(stats.latest)) return false;
    return (
      (thresholds.min != null && stats.latest < thresholds.min) ||
      (thresholds.max != null && stats.latest > thresholds.max)
    );
  }, [stats.latest, thresholds]);

  // "Become" look: minimal header, neutral metric cards, clean chart
  const metricCardSx = {
    textAlign: 'center',
    p: 2,
    borderRadius: 1.5,
    background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#FAFAF9',
    border: '1px solid',
    borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    transition: 'all 0.2s ease',
    '&:hover': {
      borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
    }
  };
  const metricValueSx = (isAccent) => ({
    fontWeight: 700,
    fontSize: '1rem',
    mb: 0.5,
    color: isAccent ? (isLatestOutOfRange ? '#EF4444' : colorScheme.line) : theme.palette.text.primary
  });
  const metricLabelSx = {
    color: theme.palette.text.secondary,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontSize: '0.7rem'
  };

  return (
    <Card sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      minHeight: 400, 
      width: '100%',
      borderRadius: 1.5,
      border: '1px solid',
      borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'all 0.2s ease',
      overflow: 'hidden',
      '&:hover': { boxShadow: theme.palette.mode === 'dark' ? '0 0 0 1px rgba(255,255,255,0.1)' : '0 4px 12px rgba(0,0,0,0.08)' }
    }}>
      <CardContent
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          p: 2.5,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Become look: minimal header – title + subtitle, thin left accent, alerts on right */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start', 
          mb: 2,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: theme.palette.divider
        }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'stretch', 
            gap: 0,
            borderLeft: '4px solid',
            borderColor: colorScheme.line,
            pl: 1.5
          }}>
            <Box>
              <Typography variant="body1" component="h3" sx={{ 
                fontWeight: 600,
                fontSize: '1rem',
                color: theme.palette.text.primary,
                lineHeight: 1.3
              }}>
                {parameterDisplayName}
              </Typography>
              <Typography variant="caption" sx={{ 
                color: theme.palette.text.secondary,
                fontWeight: 500,
                fontSize: '0.75rem',
                display: 'block',
                mt: 0.25
              }}>
                {deviceName}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
            {isLatestOutOfRange && (
              <Chip 
                label="ALERT" 
                size="small"
                sx={{ 
                  fontWeight: 600,
                  fontSize: '0.65rem',
                  height: 22,
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: '#DC2626',
                  border: '1px solid rgba(239, 68, 68, 0.4)'
                }}
                icon={<WarningIcon sx={{ color: '#DC2626', fontSize: 14 }} />}
              />
            )}
            {parameterAlertLogs.length > 0 && (
              <Chip 
                label={`${parameterAlertLogs.length} Alert${parameterAlertLogs.length > 1 ? 's' : ''}`}
                size="small"
                sx={{ 
                  fontWeight: 500,
                  fontSize: '0.65rem',
                  height: 22,
                  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.14)',
                  color: theme.palette.mode === 'dark' ? '#FBBF24' : '#B45309',
                  border: '1px solid rgba(245, 158, 11, 0.35)'
                }}
              />
            )}
          </Box>
        </Box>

        {/* Become look: neutral metric cards – light beige/off-white, dark text */}
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)', 
          gap: 1.5, 
          mb: 2 
        }}>
          <Box sx={metricCardSx}>
            <Typography variant="body1" sx={metricValueSx(true)}>
              {formatValue(stats.latest)}
            </Typography>
            <Typography variant="caption" sx={metricLabelSx}>Latest</Typography>
          </Box>
          <Box sx={metricCardSx}>
            <Typography variant="body1" sx={metricValueSx(false)}>
              {formatValue(stats.avg)}
            </Typography>
            <Typography variant="caption" sx={metricLabelSx}>Average</Typography>
          </Box>
          <Box sx={metricCardSx}>
            <Typography variant="body1" sx={metricValueSx(false)}>
              {formatValue(stats.min)}
            </Typography>
            <Typography variant="caption" sx={metricLabelSx}>Min</Typography>
          </Box>
          <Box sx={metricCardSx}>
            <Typography variant="body1" sx={metricValueSx(false)}>
              {formatValue(stats.max)}
            </Typography>
            <Typography variant="caption" sx={metricLabelSx}>Max</Typography>
          </Box>
        </Box>

        {/* Modern Chart — explicit height so ResponsiveContainer works inside flex/mobile (height:100% often resolves to 0) */}
        <Box
          ref={chartRef}
          sx={{
            flex: '1 1 0',
            width: '100%',
            minWidth: 0,
            minHeight: { xs: 260, sm: 280 },
            ...getChartCardSx(theme),
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {chartData.length > 0 ? (
            <Box sx={{ flex: 1, minHeight: 200, width: '100%', minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={QUICK_VIEW_LINE_MARGIN}>
                <CartesianGrid {...getCartesianGridProps(theme)} />
                <XAxis
                  dataKey="datetime"
                  stroke={theme.palette.divider}
                  tick={getAxisTickStyle(theme)}
                  tickMargin={8}
                  minTickGap={16}
                  interval="preserveStartEnd"
                  height={32}
                />
                <YAxis
                  stroke={theme.palette.divider}
                  tick={getAxisTickStyle(theme)}
                  domain={yAxisDomain}
                  tickFormatter={formatYAxisTick}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                
                {/* Modern threshold lines */}
                {thresholds.min != null && (
                  <ReferenceLine 
                    y={thresholds.min} 
                    stroke="#EF4444" 
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    label={{ 
                      value: `Min: ${formatValue(thresholds.min)}`, 
                      position: 'insideBottomLeft',
                      style: { 
                        fill: '#EF4444', 
                        fontSize: '11px', 
                        fontWeight: '600',
                        fontFamily: 'Inter, sans-serif'
                      }
                    }}
                  />
                )}
                {thresholds.max != null && (
                  <ReferenceLine 
                    y={thresholds.max} 
                    stroke="#EF4444" 
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    label={{ 
                      value: `Max: ${formatValue(thresholds.max)}`, 
                      position: 'insideTopLeft',
                      style: { 
                        fill: '#EF4444', 
                        fontSize: '11px', 
                        fontWeight: '600',
                        fontFamily: 'Inter, sans-serif'
                      }
                    }}
                  />
                )}
                
                {/* Modern data line */}
                <Line
                  type="monotone"
                  dataKey="value"
                  name={parameterDisplayName}
                  stroke={colorScheme.line}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ 
                    r: 6, 
                    stroke: colorScheme.line,
                    strokeWidth: 2,
                    fill: theme.palette.background.paper,
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
                  }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              color: theme.palette.text.secondary
            }}>
              <TrendingUpIcon sx={{ fontSize: 48, mb: 2, opacity: 0.3 }} />
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                No data available
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                Select a time period to view data
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default QuickViewChart;