import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Devices as DevicesIcon,
  Wifi as WifiIcon,
  People as PeopleIcon,
  DataUsage as DataIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FormControl, InputLabel, Select, MenuItem, CardActions } from '@mui/material';
import axios from 'axios';
import { subHours } from 'date-fns';
import moment from 'moment-timezone';
import { min as d3min, max as d3max } from 'd3-array';

import { API_BASE_URL } from '../config/api';
import { CHART_COLORS, CARTESIAN_GRID_PROPS, AXIS_TICK_STYLE, CHART_MARGIN, TOOLTIP_CONTENT_STYLE, LEGEND_WRAPPER_STYLE, CHART_CARD_SX } from '../utils/chartStyles';
import DashboardMap from './DashboardMap';
import KPICards from './KPICards';
import DynamicParameterCards from './DynamicParameterCards';
import FullWidthParameterCards from './FullWidthParameterCards';
import SingleRowParameterCards from './SingleRowParameterCards';
import NewParameterCards from './NewParameterCards';
import { useFont } from '../contexts/FontContext';
import { getOptimalTextColor } from '../utils/colorUtils';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { usePermissions } from '../hooks/usePermissions';

// Utility: Format datetime in user's selected timezone
const getUserTimezone = () => localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';
const formatInUserTimezone = (dt, fmt = 'YYYY-MM-DD HH:mm:ss') => {
  if (!dt) return '-';
  return moment.utc(dt).tz(getUserTimezone()).format(fmt);
};

const Dashboard = ({ socket }) => {
  const { getFontColor } = useFont();
  const theme = useMuiTheme();
  const { userPermissions } = usePermissions();
  const [overview, setOverview] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [realtimeDevice, setRealtimeDevice] = useState('');
  const [realtimeData, setRealtimeData] = useState([]);
  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [realtimeError, setRealtimeError] = useState('');
  const [realtimeDeviceMapper, setRealtimeDeviceMapper] = useState(null);
  const [parameterColors, setParameterColors] = useState({});
  const [realtimeParams, setRealtimeParams] = useState([]);
  const [realtimeLatest, setRealtimeLatest] = useState({});
  const [visibleParams, setVisibleParams] = useState([]);
  const { formatDisplayName, getUnit } = useFieldMetadata();

  // Check if user is admin or super_admin
  const isAdmin = useMemo(() => {
    if (!userPermissions) return false;
    const userRole = userPermissions.role;
    return userRole === 'admin' || userRole === 'super_admin';
  }, [userPermissions]);

  // Memoized chart data to prevent flickering
  const memoizedChartData = useMemo(() => {
    if (!realtimeData || realtimeData.length === 0) return [];
    
    return realtimeData
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) // Sort by timestamp (oldest to newest)
      .map(r => ({
        timestamp: formatInUserTimezone(r.timestamp),
        originalTimestamp: r.timestamp, // Keep original for sorting
        ...r
      }));
  }, [realtimeData]);

  const colorPalette = CHART_COLORS;

  // Function to get color for parameter based on name hash
  const getParameterColor = (param) => {
    let hash = 0;
    for (let i = 0; i < param.length; i++) {
      const char = param.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const index = Math.abs(hash) % colorPalette.length;
    return colorPalette[index];
  };

  // Memoized chart lines to prevent unnecessary re-renders
  const memoizedChartLines = useMemo(() => 
    visibleParams.map((param) => {
      const color = getParameterColor(param);
      return (
        <Line 
          key={param} 
          type="monotone" 
          dataKey={param} 
          name={formatDisplayName(param, { withUnit: true })}
          stroke={color}
          strokeWidth={3} 
          dot={false}
          activeDot={{ r: 6, strokeWidth: 2, fill: color }}
          isAnimationActive={false}
          connectNulls={false}
        />
      );
    }), [visibleParams, formatDisplayName]);

  const formatParameterValue = useCallback(
    (param, value, precision = 2, includeUnit = true) => {
      if (value === null || value === undefined || value === '') {
        return '-';
      }
      const unit = getUnit(param);
      if (typeof value === 'number') {
        const formatted = Number.isFinite(value) ? value.toFixed(precision) : value;
        return includeUnit && unit ? `${formatted} ${unit}` : `${formatted}`;
      }
      if (typeof value === 'string') {
        const numeric = parseFloat(value);
        if (!Number.isNaN(numeric)) {
          const formatted = Number.isFinite(numeric) ? numeric.toFixed(precision) : numeric;
          return includeUnit && unit ? `${formatted} ${unit}` : `${formatted}`;
        }
        return includeUnit && unit ? `${value} ${unit}` : value;
      }
      return includeUnit && unit ? `${value} ${unit}` : value;
    },
    [getUnit]
  );

  useEffect(() => {
    loadDashboardData();
    
    // Load parameter colors
    const loadParameterColors = () => {
      const savedColors = localStorage.getItem('kima_parameter_colors');
      if (savedColors) {
        setParameterColors(JSON.parse(savedColors));
      }
    };
    
    loadParameterColors();
    
    // Listen for parameter color changes
    const colorInterval = setInterval(loadParameterColors, 1000);
    
    // Set up real-time updates
    if (socket) {
      socket.on('device_status_update', handleDeviceUpdate);
      socket.on('data_update', handleDataUpdate);
    }

    // Refresh data every 30 seconds
    const dataInterval = setInterval(loadDashboardData, 30000);

    return () => {
      clearInterval(colorInterval);
      clearInterval(dataInterval);
      if (socket) {
        socket.off('device_status_update', handleDeviceUpdate);
        socket.off('data_update', handleDataUpdate);
      }
    };
  }, [socket]);

  // Set default device when devices are loaded
  useEffect(() => {
    if (devices.length > 0 && !realtimeDevice) {
      setRealtimeDevice(devices[0].device_id);
    }
  }, [devices, realtimeDevice]);

  // When realtimeParams change, reset visibleParams to all
  useEffect(() => {
    setVisibleParams(realtimeParams);
  }, [realtimeParams]);

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      
      // Load overview data
      const overviewResponse = await fetch(`${API_BASE_URL}/dashboard/overview`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (overviewResponse.ok) {
        const overviewData = await overviewResponse.json();
        setOverview(overviewData.overview);
      }

      // Load devices
      const devicesResponse = await fetch(`${API_BASE_URL}/devices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (devicesResponse.ok) {
        const devicesData = await devicesResponse.json();
        const activeDevices = (devicesData.devices || []).filter(device => device.status !== 'offline' && device.status !== 'deleted');
        setDevices(activeDevices);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceUpdate = (data) => {
    setDevices(prevDevices => 
      prevDevices.map(device => 
        device.id === data.device_id 
          ? { ...device, status: data.status }
          : device
      )
    );
  };

  const handleDataUpdate = (data) => {
    // Update overview statistics if needed
    if (overview) {
      setOverview(prev => ({
        ...prev,
        totalSensorData: prev.totalSensorData + (data.data_type === 'sensor' ? 1 : 0),
        totalGpsData: prev.totalGpsData + (data.data_type === 'gps' ? 1 : 0),
      }));
    }
  };

  // Fetch device mapper assignment and mapped fields for selected device
  useEffect(() => {
    if (!realtimeDevice) {
      setRealtimeDeviceMapper(null);
      setRealtimeParams([]);
      return;
    }
    const fetchMapper = async () => {
      try {
        const token = localStorage.getItem('iot_token');
        const res = await axios.get(`${API_BASE_URL}/device-mapper-assignments/${realtimeDevice}`, { headers: { 'Authorization': `Bearer ${token}` } });
        setRealtimeDeviceMapper(res.data.assignment);
        const mappedParams = res.data.assignment.mappings.map(m => m.target_field);
        // Add datetime if not already included
        if (!mappedParams.includes('datetime')) {
          mappedParams.unshift('datetime');
        }
        setRealtimeParams(mappedParams);
      } catch (e) {
        console.error('fetchMapper: Error', e);
        setRealtimeDeviceMapper(null);
        setRealtimeParams([]);
      }
    };
    fetchMapper();
  }, [realtimeDevice]);

  // Fetch mapped data from /data-dash for last 24 hours
  const fetchRealtimeData = async (deviceId, params) => {
    if (!deviceId || !params || params.length === 0) {
      return;
    }
    try {
      const token = localStorage.getItem('iot_token');
      const startDate = subHours(new Date(), 24).toISOString();
      const endDate = new Date().toISOString();
      const response = await axios.get(`${API_BASE_URL}/data-dash`, {
        params: {
          deviceIds: deviceId,
          parameters: params.join(','),
          startDate,
          endDate,
        },
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const mappedData = response.data.data || [];
      setRealtimeData(mappedData);
      
      // Set latest values for cards - find the actual latest data by timestamp
      if (mappedData.length > 0) {
        // Sort data by timestamp to find the actual latest
        const sortedData = mappedData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const latestRecord = sortedData[0]; // Get the newest record
        
        const latest = {};
        params.forEach(k => {
          if (latestRecord[k] !== undefined) {
            // Format datetime values properly
            if (k === 'datetime' || k === 'timestamp') {
              latest[k] = formatInUserTimezone(latestRecord[k]);
            } else {
              latest[k] = latestRecord[k];
            }
          }
        });
        setRealtimeLatest(latest);
      } else {
        setRealtimeLatest({});
      }
    } catch (e) {
      console.error('fetchRealtimeData: Error', e);
      setRealtimeError('Failed to load realtime data');
      setRealtimeData([]);
      setRealtimeLatest({});
    }
  };

  // Poll and socket for live updates
  useEffect(() => {
    if (!realtimeDevice || realtimeParams.length === 0) return;
    
    // Initial load
    fetchRealtimeData(realtimeDevice, realtimeParams);
    
    // Poll every 10 seconds
    const interval = setInterval(() => {
      fetchRealtimeData(realtimeDevice, realtimeParams);
    }, 10000);
    
    // WebSocket for real-time updates
    let deviceDataHandler;
    if (socket) {
      deviceDataHandler = (payload) => {
        if (payload.deviceId === realtimeDevice && payload.data) {
          // Update cards with real-time data using functional update
          setRealtimeLatest(prevLatest => {
            const newLatest = { ...prevLatest };
            let hasUpdates = false;
            
            realtimeParams.forEach(param => {
              if (payload.data[param] !== undefined && payload.data[param] !== null) {
                newLatest[param] = payload.data[param];
                hasUpdates = true;
              }
            });
            
            return hasUpdates ? newLatest : prevLatest;
          });
        }
      };
      socket.on('device_data', deviceDataHandler);
    }
    
    return () => {
      clearInterval(interval);
      if (socket && deviceDataHandler) {
        socket.off('device_data', deviceDataHandler);
      }
    };
  }, [realtimeDevice, realtimeParams, socket]);

  // Calculate Y axis min/max for visible parameters (exclude non-numeric like 'datetime')
  const getYDomain = () => {
    if (!realtimeData.length || !visibleParams.length) return [0, 'auto'];
    // Only consider numeric params (exclude 'datetime', 'timestamp', etc.)
    const numericParams = visibleParams.filter(
      p => p !== 'datetime' && p !== 'timestamp'
    );
    if (!numericParams.length) return [0, 'auto'];
    let minVal = Infinity, maxVal = -Infinity;
    for (const param of numericParams) {
      for (const row of realtimeData) {
        const v = row[param];
        if (typeof v === 'number' && !isNaN(v)) {
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
      }
    }
    if (minVal === Infinity || maxVal === -Infinity) return [0, 'auto'];
    if (minVal === maxVal) return [minVal - 1, maxVal + 1];
    return [minVal, maxVal];
  };

  const getStatusColor = (status) => {
    return status === 'online' ? 'success' : 'error';
  };

  const getStatusIcon = (status) => {
    return status === 'online' ? <CheckCircleIcon /> : <CancelIcon />;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, color: 'text.primary', mb: 3 }}>
        Dashboard
      </Typography>

      {/* Statistics Cards - Only visible to admin/super_admin */}
      {isAdmin && (
        <Grid container spacing={{ xs: 2, sm: 2.5 }} sx={{ mb: { xs: 2, sm: 3 } }}>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <Box sx={{ mr: { xs: 1.5, sm: 2 }, p: 1.25, borderRadius: 1, bgcolor: 'rgba(37, 99, 235, 0.12)', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DevicesIcon sx={{ fontSize: { xs: 28, sm: 36 } }} />
                </Box>
                <Box>
                  <Typography color="textSecondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                    Total Devices
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                    {overview?.totalDevices || 0}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <Box sx={{ mr: { xs: 1.5, sm: 2 }, p: 1.25, borderRadius: 1, bgcolor: 'rgba(34, 197, 94, 0.12)', color: 'success.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <WifiIcon sx={{ fontSize: { xs: 28, sm: 36 } }} />
                </Box>
                <Box>
                  <Typography color="textSecondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                    Online Devices
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                    {devices.filter(d => d.status === 'online').length}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <Box sx={{ mr: { xs: 1.5, sm: 2 }, p: 1.25, borderRadius: 1, bgcolor: 'rgba(59, 130, 246, 0.12)', color: 'info.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PeopleIcon sx={{ fontSize: { xs: 28, sm: 36 } }} />
                </Box>
                <Box>
                  <Typography color="textSecondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                    Total Users
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                    {overview?.totalUsers || 0}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <Box sx={{ mr: { xs: 1.5, sm: 2 }, p: 1.25, borderRadius: 1, bgcolor: 'rgba(100, 116, 139, 0.12)', color: 'secondary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DataIcon sx={{ fontSize: { xs: 28, sm: 36 } }} />
                </Box>
                <Box>
                  <Typography color="textSecondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                    Data Points
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                    {(overview?.totalSensorData || 0) + (overview?.totalGpsData || 0)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      )}

      {/* KPI Cards with Individual Parameter Colors - Only visible to admin/super_admin */}
      {isAdmin && (
        <>
          <Typography variant="h5" sx={{ mb: 2, mt: 3, fontWeight: 600 }}>
            Parameter Overview
          </Typography>
      {realtimeParams.length > 0 ? (
        <NewParameterCards
          data={realtimeLatest}
          parameterColors={parameterColors}
          realtimeParams={realtimeParams}
          realtimeData={realtimeData}
          formatDisplayName={formatDisplayName}
          getUnit={getUnit}
        />
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          No realtime parameters available. Please select a device with mapped parameters.
        </Alert>
      )}
        </>
      )}

      {/* Device Map Section */}
      <DashboardMap socket={socket} />

      {/* Realtime Data View Section - Site Location style header */}
      <Card sx={{ 
        mt: 4, 
        mb: 4,
        borderRadius: 1,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        overflow: 'hidden'
      }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'primary.light'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <DataIcon sx={{ mr: 1.25, fontSize: 22, color: 'primary.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '1.1rem' }}>
                Realtime Data View
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, mb: 0.25 }}>
                Device
              </Typography>
              <FormControl size="medium" sx={{ minWidth: 280 }}>
                <Select
                  value={realtimeDevice}
                  onChange={e => setRealtimeDevice(e.target.value)}
                  displayEmpty
                  sx={{
                    color: 'primary.main',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'divider',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'primary.main',
                      borderWidth: '1px',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'primary.main',
                      borderWidth: '1.5px',
                    },
                    '& .MuiSvgIcon-root': {
                      color: 'primary.main',
                    },
                  }}
                >
                  {devices.map(d => (
                    <MenuItem key={d.device_id} value={d.device_id}>
                      {d.name} ({d.device_id})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>
          
          <Box sx={{ p: 3 }}>
          {realtimeError ? (
              <Alert severity="error" sx={{ borderRadius: 1, mb: 3 }}>
                {realtimeError}
              </Alert>
          ) : (
            <>
                {/* Modern KPI Cards */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ 
                    fontWeight: 600, 
                    color: theme.palette.text.primary, 
                    mb: 2,
                    fontSize: '1.1rem'
                  }}>
                    Current Values
                  </Typography>
                  <Grid container spacing={2}>
                    {realtimeParams.filter(p => p !== 'datetime' && p !== 'timestamp').map((param, idx) => {
                      const formattedLabel = formatDisplayName(param, { withUnit: true });
                      const formattedValue = formatParameterValue(param, realtimeLatest[param]);
                      return (
                      <Grid size={{ xs: 6, sm: 4, md: 2 }} key={param}>
                        <Card sx={{
                          p: 2,
                          textAlign: 'center',
                          borderRadius: 1,
                          border: `1px solid ${colorPalette[idx % colorPalette.length]}20`,
                          bgcolor: `${colorPalette[idx % colorPalette.length]}08`,
                          transition: 'all 0.2s ease',
                          height: 100,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          '&:hover': { boxShadow: `0 4px 12px ${colorPalette[idx % colorPalette.length]}25` }
                        }}>
                          <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 500, mb: 1, fontSize: '0.8125rem', minHeight: '2.5em', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {formattedLabel}
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 700, color: colorPalette[idx % colorPalette.length], fontSize: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {formattedValue}
                          </Typography>
                    </Card>
                  </Grid>
                );})}
              </Grid>
                </Box>

                {/* Modern Parameter Controls */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ 
                    fontWeight: 600, 
                    color: theme.palette.text.primary, 
                    mb: 2,
                    fontSize: '1.1rem'
                  }}>
                    Chart Controls
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 2, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 1, border: '1px solid rgba(0,0,0,0.06)' }}>
                    {realtimeParams.filter(p => p !== 'datetime' && p !== 'timestamp').map((param) => (
                  <Chip
                    key={param}
                    label={formatDisplayName(param, { withUnit: true })}
                    color={visibleParams.includes(param) ? 'primary' : 'default'}
                    variant={visibleParams.includes(param) ? 'filled' : 'outlined'}
                    clickable
                    onClick={() => setVisibleParams(v => v.includes(param) ? v.filter(p => p !== param) : [...v, param])}
                    sx={{ fontSize: '0.8125rem', fontWeight: 500, height: 32, borderRadius: 1.5, '& .MuiChip-label': { px: 1.5 } }}
                  />
                ))}
              </Box>
                </Box>

                {/* Chart */}
                <Box sx={{ height: 400, ...CHART_CARD_SX }}>
                  <ResponsiveContainer key={`responsive-${visibleParams.join('-')}-${realtimeDevice}`} width="100%" height="100%">
                    <LineChart data={memoizedChartData} margin={CHART_MARGIN}>
                      <CartesianGrid {...CARTESIAN_GRID_PROPS} />
                      <XAxis
                        dataKey="timestamp"
                        minTickGap={24}
                        tick={AXIS_TICK_STYLE}
                        tickFormatter={(value) => {
                          if (typeof value === 'string' && !value.includes('T')) return value;
                          return formatInUserTimezone(value);
                        }}
                      />
                      <YAxis type="number" tick={AXIS_TICK_STYLE} domain={([dataMin, dataMax]) => (dataMin === 0 ? [0, dataMax] : [dataMin, dataMax])} allowDataOverflow />
                      <Tooltip
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        formatter={(value, name, props) => {
                          const dataKey = props?.dataKey || name;
                          if (dataKey === 'datetime' || dataKey === 'timestamp') return [formatInUserTimezone(value), dataKey];
                          return [formatParameterValue(dataKey, value, 3), formatDisplayName(dataKey, { withUnit: true })];
                        }}
                        labelFormatter={(label) => formatInUserTimezone(label)}
                      />
                      <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} formatter={(value, entry) => formatDisplayName(entry?.dataKey || value, { withUnit: true })} />
                      {memoizedChartLines}
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
            </>
          )}
          </Box>
        </CardContent>
      </Card>

      {/* Device Status and System Status - Only visible to admin/super_admin */}
      {isAdmin && (
        <Grid container spacing={{ xs: 2, sm: 2.5 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography 
                variant="h6" 
                gutterBottom 
                sx={{ 
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                  color: theme.palette.text.primary + ' !important' // Theme-aware text color
                }}
              >
                Device Status
              </Typography>
              {devices.length === 0 ? (
                <Typography 
                  sx={{ 
                    fontSize: { xs: '0.875rem', sm: '1rem' },
                    color: theme.palette.text.primary + ' !important' // Theme-aware text color
                  }}
                >
                  No devices found. Add your first device to get started!
                </Typography>
              ) : (
                <List sx={{ p: 0 }}>
                  {devices.map((device) => (
                    <ListItem key={device.device_id} divider sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        {getStatusIcon(device.status)}
                      </ListItemIcon>
                      <ListItemText
                        primary={device.name}
                        secondary={`${device.device_id} • ${device.protocol}`}
                        sx={{
                          '& .MuiListItemText-primary': { 
                            fontSize: { xs: '0.875rem', sm: '1rem' },
                            color: theme.palette.text.primary + ' !important' // Theme-aware text color
                          },
                          '& .MuiListItemText-secondary': { 
                            fontSize: { xs: '0.75rem', sm: '0.875rem' },
                            color: theme.palette.text.primary + ' !important' // Theme-aware text color
                          }
                        }}
                      />
                      <Chip
                        label={device.status}
                        color={getStatusColor(device.status)}
                        size="small"
                        sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%', borderRadius: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' }, fontWeight: 600 }}>
                System Status
              </Typography>
              <List sx={{ p: 0 }}>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <CheckCircleIcon color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Database Connection"
                    secondary="Connected"
                    sx={{
                      '& .MuiListItemText-primary': { 
                        fontSize: { xs: '0.875rem', sm: '1rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      },
                      '& .MuiListItemText-secondary': { 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      }
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <CheckCircleIcon color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="MQTT Broker"
                    secondary="Connected"
                    sx={{
                      '& .MuiListItemText-primary': { 
                        fontSize: { xs: '0.875rem', sm: '1rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      },
                      '& .MuiListItemText-secondary': { 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      }
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <CheckCircleIcon color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Real-time Updates"
                    secondary="Active"
                    sx={{
                      '& .MuiListItemText-primary': { 
                        fontSize: { xs: '0.875rem', sm: '1rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      },
                      '& .MuiListItemText-secondary': { 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        color: theme.palette.text.primary + ' !important' // Theme-aware text color
                      }
                    }}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      )}
    </Box>
  );
};

export default Dashboard; 