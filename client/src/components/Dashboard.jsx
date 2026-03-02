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
import DashboardMap from './DashboardMap';
import KPICards from './KPICards';
import DynamicParameterCards from './DynamicParameterCards';
import FullWidthParameterCards from './FullWidthParameterCards';
import SingleRowParameterCards from './SingleRowParameterCards';
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

  // Comprehensive color palette for any parameters
  const colorPalette = [
    '#007BA7', // Purple
    '#0099CC', // Light Purple
    '#F59E0B', // Orange
    '#10B981', // Green
    '#EF4444', // Red
    '#3B82F6', // Blue
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange Red
    '#84CC16', // Lime
    '#8B5A2B', // Brown
    '#6366F1', // Indigo
    '#DC2626', // Dark Red
    '#059669', // Dark Green
    '#006B9A', // Violet
    '#0EA5E9', // Sky Blue
    '#D97706', // Amber
    '#BE185D', // Rose
    '#0891B2', // Cyan
    '#65A30D'  // Olive
  ];

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
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      {/* Statistics Cards - Only visible to admin/super_admin */}
      {isAdmin && (
        <Grid container spacing={{ xs: 2, sm: 2.5 }} sx={{ mb: { xs: 2, sm: 3 } }}>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card sx={{ height: '100%', borderRadius: '4px' }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <DevicesIcon color="primary" sx={{ mr: { xs: 1, sm: 2 }, fontSize: { xs: 30, sm: 40 } }} />
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
          <Card sx={{ height: '100%', borderRadius: '4px' }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <WifiIcon color="success" sx={{ mr: { xs: 1, sm: 2 }, fontSize: { xs: 30, sm: 40 } }} />
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
          <Card sx={{ height: '100%', borderRadius: '4px' }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <PeopleIcon color="info" sx={{ mr: { xs: 1, sm: 2 }, fontSize: { xs: 30, sm: 40 } }} />
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
          <Card sx={{ height: '100%', borderRadius: '4px' }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box display="flex" alignItems="center">
                <DataIcon color="secondary" sx={{ mr: { xs: 1, sm: 2 }, fontSize: { xs: 30, sm: 40 } }} />
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
        <SingleRowParameterCards 
          data={realtimeLatest} 
          parameterColors={parameterColors}
          realtimeParams={realtimeParams}
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

      {/* Realtime Data View Section */}
      <Card sx={{ 
        mt: 4, 
        mb: 4,
        borderRadius: '4px',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid rgba(107, 70, 193, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
        overflow: 'hidden'
      }}>
        <CardContent sx={{ p: 0 }}>
          {/* Modern Header - Compact */}
          <Box sx={{ 
            background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
            px: 2,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <DataIcon sx={{ color: '#ffffff', mr: 1.5, fontSize: 16 }} />
              <Typography variant="h6" sx={{ 
                fontWeight: 600, 
                color: '#ffffff',
                textTransform: 'none',
                fontSize: '1rem'
              }}>
                Realtime Data View
              </Typography>
            </Box>
            <FormControl size="medium" sx={{ minWidth: 280 }}>
              <Select
                value={realtimeDevice}
                onChange={e => setRealtimeDevice(e.target.value)}
                sx={{
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '4px',
                  '& .MuiSelect-select': {
                    color: theme.palette.text.primary,
                    fontWeight: 500
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255, 255, 255, 0.3)'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255, 255, 255, 0.5)'
                  }
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
          
          <Box sx={{ p: 3 }}>
          {realtimeError ? (
              <Alert severity="error" sx={{ borderRadius: '4px', mb: 3 }}>
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
                          background: `linear-gradient(135deg, ${['#007BA7', '#0099CC', '#F59E0B', '#10B981', '#EF4444', '#3B82F6'][idx % 6]}15 0%, ${['#007BA7', '#0099CC', '#F59E0B', '#10B981', '#EF4444', '#3B82F6'][idx % 6]}08 100%)`,
                          border: `2px solid ${['#007BA7', '#0099CC', '#F59E0B', '#10B981', '#EF4444', '#3B82F6'][idx % 6]}20`,
                          borderRadius: '4px',
                          transition: 'all 0.3s ease-in-out',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: `0 8px 25px ${['#007BA7', '#0099CC', '#F59E0B', '#10B981', '#EF4444', '#3B82F6'][idx % 6]}30`
                          }
                        }}>
                          <Typography variant="subtitle2" sx={{ 
                            color: theme.palette.text.secondary,
                            fontWeight: 500,
                            mb: 1,
                            textTransform: 'capitalize',
                            fontSize: '0.8rem'
                          }}>
                            {formattedLabel}
                          </Typography>
                          <Typography variant="h5" sx={{ 
                            fontWeight: 800, 
                            color: ['#007BA7', '#0099CC', '#F59E0B', '#10B981', '#EF4444', '#3B82F6'][idx % 6],
                            fontSize: '1.4rem'
                          }}>
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
                  <Box sx={{ 
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: 1,
                    p: 2,
                    backgroundColor: 'rgba(107, 70, 193, 0.05)',
                    borderRadius: '4px',
                    border: '1px solid rgba(107, 70, 193, 0.1)'
                  }}>
                    {realtimeParams.filter(p => p !== 'datetime' && p !== 'timestamp').map((param, idx) => (
                  <Chip
                    key={param}
                        label={formatDisplayName(param, { withUnit: true })}
                    color={visibleParams.includes(param) ? 'primary' : 'default'}
                    variant={visibleParams.includes(param) ? 'filled' : 'outlined'}
                    clickable
                    onClick={() => setVisibleParams(v => v.includes(param) ? v.filter(p => p !== param) : [...v, param])}
                        sx={{ 
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          height: '32px',
                          borderRadius: '4px',
                          '& .MuiChip-label': {
                            px: 2
                          }
                        }}
                  />
                ))}
              </Box>
                </Box>

                {/* Modern Chart */}
                <Box sx={{ 
                  height: 400,
                  borderRadius: '4px',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  border: '1px solid rgba(107, 70, 193, 0.1)',
                  p: 2
                }}>
                  <ResponsiveContainer 
                    key={`responsive-${visibleParams.join('-')}-${realtimeDevice}`}
                    width="100%" 
                    height="100%"
                  >
                    <LineChart 
                      key={`chart-${visibleParams.join('-')}-${realtimeDevice}`}
                      data={memoizedChartData} 
                      margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(107, 70, 193, 0.1)" />
                      <XAxis 
                        dataKey="timestamp" 
                        minTickGap={20}
                        tick={{ fontSize: 12, fontFamily: 'Inter, sans-serif' }}
                        tickFormatter={(value) => {
                          if (typeof value === 'string' && !value.includes('T')) {
                            return value;
                          }
                          return formatInUserTimezone(value);
                        }}
                      />
                    <YAxis
                      type="number"
                        tick={{ fontSize: 12, fontFamily: 'Inter, sans-serif' }}
                      domain={([dataMin, dataMax]) => {
                        if (dataMin === 0) return [0, dataMax];
                        return [dataMin, dataMax];
                      }}
                      allowDataOverflow={true}
                    />
                    <Tooltip
                        contentStyle={{ 
                          fontFamily: 'Inter, sans-serif', 
                          fontSize: 13,
                          borderRadius: '4px',
                          border: '1px solid rgba(107, 70, 193, 0.2)',
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)'
                        }}
                      formatter={(value, name, props) => {
                        const dataKey = props?.dataKey || name;
                        if (dataKey === 'datetime' || dataKey === 'timestamp') {
                          return [formatInUserTimezone(value), dataKey];
                        }
                        return [
                          formatParameterValue(dataKey, value, 3),
                          formatDisplayName(dataKey, { withUnit: true })
                        ];
                      }}
                        labelFormatter={(label) => formatInUserTimezone(label)}
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: 13, fontFamily: 'Inter, sans-serif' }}
                        formatter={(value, entry) => formatDisplayName(entry?.dataKey || value, { withUnit: true })}
                      />
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
          <Card sx={{ height: '100%', borderRadius: '4px' }}>
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
          <Card sx={{ height: '100%', borderRadius: '4px' }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography 
                variant="h6" 
                gutterBottom 
                sx={{ 
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                  color: theme.palette.text.primary + ' !important' // Theme-aware text color
                }}
              >
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