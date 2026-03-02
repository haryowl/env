import React, { useMemo } from 'react';
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
  BarChart,
  Bar,
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
import { CHART_CARD_SX, CHART_MARGIN, CARTESIAN_GRID_PROPS, AXIS_TICK_STYLE, TOOLTIP_CONTENT_STYLE } from '../utils/chartStyles';

const QuickViewAlertChart = ({ alertData, deviceName }) => {
  const theme = useTheme();
  const { formatDisplayName } = useFieldMetadata();
  console.log('QuickViewAlertChart received alertData:', alertData);
  
  // Process alert data for timeline chart
  const timelineData = useMemo(() => {
    if (!alertData || !Array.isArray(alertData)) {
      console.log('No alert data or not an array:', alertData);
      return [];
    }
    
    console.log('Processing alert data:', alertData);
    
    // Group alerts by hour
    const hourlyAlerts = {};
    
    alertData.forEach(alert => {
      console.log('Processing alert:', alert);
      console.log('Alert timestamp fields:', {
        timestamp: alert.timestamp,
        detected_at: alert.detected_at,
        created_at: alert.created_at,
        log_id: alert.log_id
      });
      
      // Handle different possible timestamp fields
      const timestamp = alert.timestamp || alert.detected_at || alert.created_at;
      if (!timestamp) {
        console.log('No timestamp found for alert:', alert);
        return;
      }
      
      const alertTime = new Date(timestamp);
      const hourKey = formatInUserTimezone(alertTime, 'MM/DD HH:00');
      
      console.log('Processed timestamp:', {
        original: timestamp,
        parsed: alertTime,
        hourKey: hourKey
      });
      
      if (!hourlyAlerts[hourKey]) {
        hourlyAlerts[hourKey] = {
          hour: hourKey,
          timestamp: alertTime.getTime(),
          alertCount: 0,
          parameters: new Set(),
          severity: 'low'
        };
      }
      
      hourlyAlerts[hourKey].alertCount++;
      
      // Handle different possible parameter fields
      const parameter = alert.parameter || alert.alert_name || 'Unknown';
      hourlyAlerts[hourKey].parameters.add(formatDisplayName(parameter, { withUnit: true }));
      
      // Determine severity
      const severity = alert.severity || alert.status || 'low';
      if (severity === 'critical') {
        hourlyAlerts[hourKey].severity = 'critical';
      } else if (severity === 'high' && hourlyAlerts[hourKey].severity !== 'critical') {
        hourlyAlerts[hourKey].severity = 'high';
      } else if (severity === 'medium' && hourlyAlerts[hourKey].severity === 'low') {
        hourlyAlerts[hourKey].severity = 'medium';
      }
    });
    
    // Convert to array and sort by timestamp
    const result = Object.values(hourlyAlerts)
      .map(item => ({
        ...item,
        parameters: Array.from(item.parameters).join(', '),
        severity: item.severity
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    console.log('Processed timeline data:', result);
    return result;
  }, [alertData, formatDisplayName]);

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
        <Box sx={{ ...TOOLTIP_CONTENT_STYLE, border: `1px solid ${severityColors.border}`, p: 2 }}>
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

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 500, ...CHART_CARD_SX, transition: 'all 0.2s ease', '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.08)' } }}>
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', p: 3 }}>
        {/* Modern Header */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 3,
          p: 2,
          borderRadius: 1.5,
          background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
          color: 'white'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TimelineIcon sx={{ fontSize: 28 }} />
            <Box>
              <Typography variant="h6" component="h3" sx={{ 
                fontWeight: 700,
                color: 'white',
                textShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}>
                Alert Timeline
              </Typography>
              <Typography variant="body2" sx={{ 
                color: 'rgba(255, 255, 255, 0.9)',
                fontWeight: 500
              }}>
                {deviceName} - Parameter Threshold Violations
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {stats.totalAlerts > 0 && (
              <Chip 
                label={`${stats.totalAlerts} Total Alerts`}
                sx={{ 
                  fontWeight: 700,
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  color: '#EF4444',
                  border: '2px solid rgba(255, 255, 255, 0.3)'
                }}
                icon={<WarningIcon sx={{ color: '#EF4444' }} />}
              />
            )}
            {stats.criticalHours > 0 && (
              <Chip 
                label={`${stats.criticalHours} Critical Hours`}
                sx={{ 
                  fontWeight: 600,
                  backgroundColor: 'rgba(139, 92, 246, 0.9)',
                  color: 'white',
                  border: '2px solid rgba(255, 255, 255, 0.3)'
                }}
                icon={<ErrorIcon sx={{ color: 'white' }} />}
              />
            )}
          </Box>
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

        {/* Modern Chart */}
        <Box sx={{ 
          flexGrow: 1, 
          minHeight: 300, height: '400px', width: '100%', p: 2, position: 'relative', overflow: 'hidden', ...CHART_CARD_SX
        }}>
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} margin={{ ...CHART_MARGIN, bottom: 56 }}>
                <CartesianGrid {...CARTESIAN_GRID_PROPS} />
                <XAxis dataKey="hour" stroke="rgba(0,0,0,0.2)" tick={AXIS_TICK_STYLE} angle={-45} textAnchor="end" height={56} />
                <YAxis stroke="rgba(0,0,0,0.2)" tick={AXIS_TICK_STYLE} />
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
      </CardContent>
    </Card>
  );
};

export default QuickViewAlertChart;