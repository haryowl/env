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
  CheckCircle as CheckCircleIcon,
  Speed as SpeedIcon
} from '@mui/icons-material';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { useFieldMetadata } from '../hooks/useFieldMetadata';

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

  // Comprehensive color palette for any parameters
  const colorPalette = [
    { line: '#007BA7', area: '#007BA720', bg: '#007BA708' }, // Purple
    { line: '#0099CC', area: '#0099CC20', bg: '#0099CC08' }, // Light Purple
    { line: '#F59E0B', area: '#F59E0B20', bg: '#F59E0B08' }, // Orange
    { line: '#10B981', area: '#10B98120', bg: '#10B98108' }, // Green
    { line: '#EF4444', area: '#EF444420', bg: '#EF444408' }, // Red
    { line: '#3B82F6', area: '#3B82F620', bg: '#3B82F608' }, // Blue
    { line: '#EC4899', area: '#EC489920', bg: '#EC489908' }, // Pink
    { line: '#14B8A6', area: '#14B8A620', bg: '#14B8A608' }, // Teal
    { line: '#F97316', area: '#F9731620', bg: '#F9731608' }, // Orange Red
    { line: '#84CC16', area: '#84CC1620', bg: '#84CC1608' }, // Lime
    { line: '#8B5A2B', area: '#8B5A2B20', bg: '#8B5A2B08' }, // Brown
    { line: '#6366F1', area: '#6366F120', bg: '#6366F108' }, // Indigo
    { line: '#DC2626', area: '#DC262620', bg: '#DC262608' }, // Dark Red
    { line: '#059669', area: '#05966920', bg: '#05966908' }, // Dark Green
    { line: '#006B9A', area: '#006B9A20', bg: '#006B9A08' }, // Violet
    { line: '#0EA5E9', area: '#0EA5E920', bg: '#0EA5E908' }, // Sky Blue
    { line: '#D97706', area: '#D9770620', bg: '#D9770608' }, // Amber
    { line: '#BE185D', area: '#BE185D20', bg: '#BE185D08' }, // Rose
    { line: '#0891B2', area: '#0891B220', bg: '#0891B208' }, // Cyan
    { line: '#65A30D', area: '#65A30D20', bg: '#65A30D08' }  // Olive
  ];

  // Function to get color scheme based on parameter name hash
  const getColorScheme = (param) => {
    // Create a simple hash from parameter name
    let hash = 0;
    for (let i = 0; i < param.length; i++) {
      const char = param.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Use absolute value and modulo to get index
    const index = Math.abs(hash) % colorPalette.length;
    return colorPalette[index];
  };

  const colorScheme = getColorScheme(parameter);

  // Modern custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isOutOfRange = (thresholds.min && data.value < thresholds.min) || 
                           (thresholds.max && data.value > thresholds.max);
      
      return (
        <Box
          sx={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: `2px solid ${isOutOfRange ? '#EF4444' : colorScheme.line}`,
            borderRadius: '4px',
            p: 2,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            backdropFilter: 'blur(10px)',
            fontFamily: 'Inter, sans-serif'
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

  return (
    <Card sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      minHeight: 400, 
      width: '100%',
      borderRadius: '4px',
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      border: '1px solid rgba(107, 70, 193, 0.1)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
      transition: 'all 0.3s ease-in-out',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: '0 12px 40px rgba(107, 70, 193, 0.15)',
        border: '1px solid rgba(107, 70, 193, 0.2)'
      }
    }}>
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', p: 3 }}>
        {/* Modern Header - Very Compact */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 1.5,
          p: 1,
          borderRadius: '4px',
          background: `linear-gradient(135deg, ${colorScheme.line} 0%, ${colorScheme.line}CC 100%)`,
          color: 'white'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SpeedIcon sx={{ fontSize: 16 }} />
            <Box>
              <Typography variant="body1" component="h3" sx={{ 
                fontWeight: 600,
                fontSize: '0.9rem',
                color: 'white',
                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}>
                {parameterDisplayName}
              </Typography>
              <Typography variant="caption" sx={{ 
                color: 'rgba(255, 255, 255, 0.9)',
                fontWeight: 500,
                fontSize: '0.7rem'
              }}>
                {deviceName}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {isLatestOutOfRange && (
              <Chip 
                label="ALERT" 
                size="small"
                sx={{ 
                  fontWeight: 600,
                  fontSize: '0.6rem',
                  height: 20,
                  backgroundColor: 'rgba(239, 68, 68, 0.9)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}
                icon={<WarningIcon sx={{ color: 'white', fontSize: 12 }} />}
              />
            )}
            {parameterAlerts.length > 0 && (
              <Chip 
                label={`${parameterAlerts.length} Alert${parameterAlerts.length > 1 ? 's' : ''}`}
                size="small"
                sx={{ 
                  fontWeight: 500,
                  fontSize: '0.6rem',
                  height: 20,
                  backgroundColor: 'rgba(245, 158, 11, 0.9)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}
              />
            )}
          </Box>
        </Box>

        {/* Modern Statistics */}
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)', 
          gap: 2, 
          mb: 2 
        }}>
          <Box sx={{ 
            textAlign: 'center',
            p: 2,
            borderRadius: '4px',
            background: isLatestOutOfRange 
              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)'
              : `linear-gradient(135deg, ${colorScheme.bg} 0%, rgba(255, 255, 255, 0.5) 100%)`,
            border: `2px solid ${isLatestOutOfRange ? 'rgba(239, 68, 68, 0.3)' : colorScheme.line + '30'}`,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: `0 4px 12px ${colorScheme.line}20`
            }
          }}>
            <Typography variant="h6" sx={{ 
              color: isLatestOutOfRange ? '#EF4444' : colorScheme.line,
              fontWeight: 800,
              fontSize: '1.1rem',
              mb: 0.5
            }}>
              {formatValue(stats.latest)}
            </Typography>
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.secondary,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Latest
            </Typography>
          </Box>
          <Box sx={{ 
            textAlign: 'center',
            p: 2,
            borderRadius: '4px',
            background: `linear-gradient(135deg, ${colorScheme.bg} 0%, rgba(255, 255, 255, 0.5) 100%)`,
            border: `2px solid ${colorScheme.line}30`,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: `0 4px 12px ${colorScheme.line}20`
            }
          }}>
            <Typography variant="body1" sx={{ 
              color: colorScheme.line,
              fontWeight: 700,
              fontSize: '1rem',
              mb: 0.5
            }}>
              {formatValue(stats.avg)}
            </Typography>
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.secondary,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Average
            </Typography>
          </Box>
          <Box sx={{ 
            textAlign: 'center',
            p: 2,
            borderRadius: '4px',
            background: `linear-gradient(135deg, ${colorScheme.bg} 0%, rgba(255, 255, 255, 0.5) 100%)`,
            border: `2px solid ${colorScheme.line}30`,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: `0 4px 12px ${colorScheme.line}20`
            }
          }}>
            <Typography variant="body1" sx={{ 
              color: colorScheme.line,
              fontWeight: 700,
              fontSize: '1rem',
              mb: 0.5
            }}>
              {formatValue(stats.min)}
            </Typography>
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.secondary,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Min
            </Typography>
          </Box>
          <Box sx={{ 
            textAlign: 'center',
            p: 2,
            borderRadius: '4px',
            background: `linear-gradient(135deg, ${colorScheme.bg} 0%, rgba(255, 255, 255, 0.5) 100%)`,
            border: `2px solid ${colorScheme.line}30`,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: `0 4px 12px ${colorScheme.line}20`
            }
          }}>
            <Typography variant="body1" sx={{ 
              color: colorScheme.line,
              fontWeight: 700,
              fontSize: '1rem',
              mb: 0.5
            }}>
              {formatValue(stats.max)}
            </Typography>
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.secondary,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Max
            </Typography>
          </Box>
        </Box>

        {/* Modern Chart */}
        <Box 
          ref={chartRef}
          sx={{ 
            flexGrow: 1, 
            minHeight: 250, 
            height: '100%', 
            width: '100%',
            borderRadius: '4px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid rgba(107, 70, 193, 0.1)',
            p: 2,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107, 70, 193, 0.1)" />
                <XAxis 
                  dataKey="datetime" 
                  stroke="rgba(107, 70, 193, 0.6)"
                  fontSize={12}
                  tick={{ 
                    fontSize: 11, 
                    fontFamily: 'Inter, sans-serif',
                    fill: theme.palette.text.secondary
                  }}
                />
                <YAxis 
                  stroke="rgba(107, 70, 193, 0.6)"
                  fontSize={12}
                  tick={{ 
                    fontSize: 11, 
                    fontFamily: 'Inter, sans-serif',
                    fill: theme.palette.text.secondary
                  }}
                  domain={yAxisDomain}
                />
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