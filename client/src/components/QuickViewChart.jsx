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
import { CHART_CARD_SX, CHART_MARGIN, CARTESIAN_GRID_PROPS, AXIS_TICK_STYLE, getParameterColorIndex, CHART_COLORS } from '../utils/chartStyles';

const QuickViewChart = ({ parameter, data, alerts, deviceName, addChartRef }) => {
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

  // Register chart ref with parent component
  useEffect(() => {
    if (addChartRef) {
      addChartRef(parameter, chartRef);
    }
  }, [parameter, addChartRef]);

  // Find alert thresholds for this parameter
  const parameterAlerts = useMemo(() => {
    return alerts.filter(alert => 
      alert.parameter === parameter || 
      alert.parameter === parameter.replace('_', ' ') ||
      alert.parameter === parameter.replace('_', '.')
    );
  }, [alerts, parameter]);

  // Process data for chart
  const chartData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    
    return data
      .filter(item => item[parameter] !== undefined && item[parameter] !== null)
      .map(item => ({
        datetime: formatInUserTimezone(item.datetime, 'MM/DD HH:mm'),
        timestamp: new Date(item.datetime).getTime(),
        value: parseFloat(item[parameter]) || 0,
        original: item
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data, parameter]);

  // Get threshold values
  const thresholds = useMemo(() => {
    const minThreshold = parameterAlerts.find(alert => alert.type === 'min')?.threshold;
    const maxThreshold = parameterAlerts.find(alert => alert.type === 'max')?.threshold;
    return { min: minThreshold, max: maxThreshold };
  }, [parameterAlerts]);

  const colorIndex = getParameterColorIndex(parameter);
  const lineColor = CHART_COLORS[colorIndex];
  const colorScheme = { line: lineColor, area: `${lineColor}20`, bg: `${lineColor}08` };

  // Modern custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isOutOfRange = (thresholds.min && data.value < thresholds.min) || 
                           (thresholds.max && data.value > thresholds.max);
      
      return (
        <Box
          sx={{
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            border: `1px solid ${isOutOfRange ? '#EF4444' : 'rgba(0,0,0,0.08)'}`,
            borderRadius: 1,
            p: 2,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
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
          {(thresholds.min || thresholds.max) && (
            <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
              {thresholds.min && (
                <Typography variant="caption" sx={{ 
                  color: theme.palette.text.secondary,
                  fontWeight: 500
                }}>
                  Min: {formatValue(thresholds.min)}
                </Typography>
              )}
              {thresholds.max && (
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

  // Calculate Y-axis domain with buffer
  const yAxisDomain = useMemo(() => {
    if (!stats.min || !stats.max) return [0, 100];
    
    const buffer = 2;
    const minDomain = Math.max(0, stats.min - buffer);
    const maxDomain = stats.max + buffer;
    
    console.log(`Y-axis domain for ${parameter}:`, { min: stats.min, max: stats.max, minDomain, maxDomain });
    
    return [minDomain, maxDomain];
  }, [stats.min, stats.max, parameter]);

  // Check if latest value is out of range
  const isLatestOutOfRange = useMemo(() => {
    if (!stats.latest) return false;
    return (thresholds.min && stats.latest < thresholds.min) || 
           (thresholds.max && stats.latest > thresholds.max);
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
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', p: 2.5 }}>
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
            {parameterAlerts.length > 0 && (
              <Chip 
                label={`${parameterAlerts.length} Alert${parameterAlerts.length > 1 ? 's' : ''}`}
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

        {/* Modern Chart */}
        <Box ref={chartRef} sx={{ flexGrow: 1, minHeight: 250, height: '100%', width: '100%', ...CHART_CARD_SX, position: 'relative', overflow: 'hidden' }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid {...CARTESIAN_GRID_PROPS} />
                <XAxis dataKey="datetime" stroke="rgba(0,0,0,0.2)" tick={AXIS_TICK_STYLE} />
                <YAxis stroke="rgba(0,0,0,0.2)" tick={AXIS_TICK_STYLE} domain={yAxisDomain} />
                <RechartsTooltip content={<CustomTooltip />} />
                
                {/* Modern threshold lines */}
                {thresholds.min && (
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
                {thresholds.max && (
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
                    fill: '#ffffff',
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
                  }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
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