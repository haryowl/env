import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Divider,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  useTheme,
  Stack
} from '@mui/material';
import {
  Timeline as TimelineIcon,
  History as HistoryIcon,
  Download as DownloadIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Speed as SpeedIcon,
  Science as ScienceIcon,
  DeviceHub as DeviceHubIcon
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { API_BASE_URL } from '../config/api';
import QuickViewChart from './QuickViewChart';
import QuickViewAlertChart from './QuickViewAlertChart';
import QuickViewTable from './QuickViewTable';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';
import { formatInUserTimezone, getUserTimezone } from '../utils/timezoneUtils';
import moment from 'moment-timezone';
import { CHART_CARD_SX } from '../utils/chartStyles';

const QuickView = () => {
  const theme = useTheme();
  
  // State management
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('1h');
  const [viewMode, setViewMode] = useState('realtime');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartData, setChartData] = useState({});
  const [alertData, setAlertData] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [deviceMapper, setDeviceMapper] = useState(null);
  // Custom date conversion functions for timezone consistency
  const convertToUserTimezone = (date) => {
    if (!date) return new Date();
    const userTz = getUserTimezone();
    const utcMoment = moment.utc(date);
    const converted = utcMoment.tz(userTz).toDate();
    console.log('convertToUserTimezone:', {
      original: date,
      userTz,
      converted,
      originalISO: date.toISOString(),
      convertedISO: converted.toISOString()
    });
    return converted;
  };

  const convertFromUserTimezone = (date) => {
    if (!date) return new Date();
    const userTz = getUserTimezone();
    const localMoment = moment.tz(date, userTz);
    const converted = localMoment.utc().toDate();
    console.log('convertFromUserTimezone:', {
      original: date,
      userTz,
      converted,
      originalISO: date.toISOString(),
      convertedISO: converted.toISOString()
    });
    return converted;
  };

  // Initialize custom dates
  const [customStartDate, setCustomStartDate] = useState(() => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return oneHourAgo;
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date();
  });
  const [chartRefs, setChartRefs] = useState({});

  // Custom handlers for date pickers with timezone conversion
  const handleStartDateChange = (newDate) => {
    if (newDate) {
      // Store the date as is, we'll convert to UTC when sending to API
      setCustomStartDate(newDate);
    }
  };

  const handleEndDateChange = (newDate) => {
    if (newDate) {
      // Store the date as is, we'll convert to UTC when sending to API
      setCustomEndDate(newDate);
    }
  };

  // Add refs for chart elements
  const addChartRef = useCallback((param, ref) => {
    setChartRefs(prev => ({
      ...prev,
      [param]: ref
    }));
  }, []);

  // Period options
  const periodOptions = [
    { value: '1h', label: 'Last 1 Hour' },
    { value: '2h', label: 'Last 2 Hours' },
    { value: '3h', label: 'Last 3 Hours' },
    { value: 'custom', label: 'Custom Range' }
  ];

  // Load devices on component mount
  useEffect(() => {
    loadDevices();
    loadAlerts();
  }, []);

  // Load device mapper and parameters when device changes
  useEffect(() => {
    if (selectedDevice) {
      loadDeviceMapper();
    }
  }, [selectedDevice]);

  // Load data when filters change
  useEffect(() => {
    if (selectedDevice && parameters.length > 0) {
      loadData();
    }
  }, [selectedDevice, selectedPeriod, viewMode, parameters]);

  // Reload data when custom dates change
  useEffect(() => {
    if (selectedDevice && parameters.length > 0 && selectedPeriod === 'custom') {
      loadData();
    }
  }, [customStartDate, customEndDate]);

  const loadDevices = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const activeDevices = (data.devices || []).filter(device => device.status !== 'offline' && device.status !== 'deleted');
        setDevices(activeDevices);
        if (activeDevices.length > 0) {
          setSelectedDevice(activeDevices[0].device_id);
        } else {
          setSelectedDevice('');
        }
      }
    } catch (error) {
      console.error('Error loading devices:', error);
      setError('Failed to load devices');
    }
  };

  const loadDeviceMapper = async () => {
    if (!selectedDevice) return;
    
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/device-mapper-assignments/${selectedDevice}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDeviceMapper(data.assignment);
        
        // Extract parameters from mapper template mappings, excluding datetime
        if (data.assignment && data.assignment.mappings) {
          const params = data.assignment.mappings
            .map(mapping => mapping.target_field)
            .filter(param => 
              param.toLowerCase() !== 'datetime' && 
              param.toLowerCase() !== 'timestamp' &&
              param.toLowerCase() !== 'device_id' &&
              param.toLowerCase() !== 'device_name'
            );
          setParameters(params);
        } else {
          setParameters([]);
        }
      } else {
        setDeviceMapper(null);
        setParameters([]);
      }
    } catch (error) {
      console.error('Error loading device mapper:', error);
      setDeviceMapper(null);
      setParameters([]);
    }
  };

  const loadAlerts = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.logs || []);
      }
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  };

  const loadData = async () => {
    if (!selectedDevice || parameters.length === 0) return;
    
    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('iot_token');
      const endDate = getEndDate(selectedPeriod);
      const startDate = getStartDate(selectedPeriod);
      
      // Debug time range calculation
      console.log('QuickView - Time range calculation:', {
        selectedPeriod,
        userTimezone: getUserTimezone(),
        startDate,
        endDate,
        startDateLocal: formatInUserTimezone(startDate, 'YYYY-MM-DD HH:mm:ss'),
        endDateLocal: formatInUserTimezone(endDate, 'YYYY-MM-DD HH:mm:ss'),
        customStartDate: customStartDate ? customStartDate.toISOString() : null,
        customEndDate: customEndDate ? customEndDate.toISOString() : null,
        currentTimeUTC: moment().utc().toISOString(),
        currentTimeLocal: moment().tz(getUserTimezone()).format('YYYY-MM-DD HH:mm:ss'),
        timeRangeHours: moment(endDate).diff(moment(startDate), 'hours', true)
      });
      
      // Load chart data with specific parameters from device mapper
      const chartResponse = await fetch(`${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (chartResponse.ok) {
        const chartData = await chartResponse.json();
        setChartData(chartData.data || []);
      }
      
      // Load alert data
      const alertResponse = await fetch(`${API_BASE_URL}/alert-logs?deviceId=${selectedDevice}&startDate=${startDate}&endDate=${endDate}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (alertResponse.ok) {
        const alertData = await alertResponse.json();
        console.log('Alert data loaded:', alertData);
        setAlertData(alertData.logs || []);
      } else {
        console.error('Failed to load alert data:', alertResponse.status, alertResponse.statusText);
      }
      
      // Load table data
      const tableResponse = await fetch(`${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (tableResponse.ok) {
        const tableData = await tableResponse.json();
        setTableData(tableData.data || []);
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const getStartDate = (period) => {
    const userTz = getUserTimezone();
    
    let result;
    switch (period) {
      case '1h':
        result = moment().subtract(1, 'hour').utc().toISOString();
        break;
      case '2h':
        result = moment().subtract(2, 'hours').utc().toISOString();
        break;
      case '3h':
        result = moment().subtract(3, 'hours').utc().toISOString();
        break;
      case 'custom':
        // For custom dates, we need to convert from user timezone to UTC
        if (customStartDate) {
          result = moment.tz(customStartDate, userTz).utc().toISOString();
        } else {
          result = moment().subtract(1, 'hour').utc().toISOString();
        }
        break;
      default:
        result = moment().subtract(1, 'hour').utc().toISOString();
    }
    
    console.log(`getStartDate(${period}):`, {
      period,
      userTz,
      result,
      resultLocal: formatInUserTimezone(result, 'YYYY-MM-DD HH:mm:ss')
    });
    
    return result;
  };

  const getEndDate = (period) => {
    const userTz = getUserTimezone();
    
    let result;
    switch (period) {
      case '1h':
      case '2h':
      case '3h':
        result = moment().utc().toISOString();
        break;
      case 'custom':
        // For custom dates, we need to convert from user timezone to UTC
        if (customEndDate) {
          result = moment.tz(customEndDate, userTz).utc().toISOString();
        } else {
          result = moment().utc().toISOString();
        }
        break;
      default:
        result = moment().utc().toISOString();
    }
    
    console.log(`getEndDate(${period}):`, {
      period,
      userTz,
      result,
      resultLocal: formatInUserTimezone(result, 'YYYY-MM-DD HH:mm:ss')
    });
    
    return result;
  };

  const handleExportPDF = async () => {
    const deviceName = devices.find(d => d.device_id === selectedDevice)?.name || selectedDevice;
    try {
      // For custom range, fetch all data without limit for PDF export
      let fullTableData = tableData;
      if (selectedPeriod === 'custom') {
        const token = localStorage.getItem('iot_token');
        const endDate = getEndDate(selectedPeriod);
        const startDate = getStartDate(selectedPeriod);
        
        console.log('Fetching full dataset for PDF export:', {
          startDate,
          endDate,
          selectedDevice,
          parameters: parameters.join(',')
        });
        
        // Fetch all data without limit for PDF export
        const fullTableResponse = await fetch(`${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (fullTableResponse.ok) {
          const fullData = await fullTableResponse.json();
          fullTableData = fullData.data || [];
          console.log('Full dataset for PDF export:', fullTableData.length, 'records');
        }
      }
      
      await exportToPDF({
        deviceName,
        period: periodOptions.find(p => p.value === selectedPeriod)?.label,
        chartData,
        alertData,
        tableData: fullTableData,
        parameters,
        chartRefs
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      // You could show a user-friendly error message here
    }
  };

  const handleExportExcel = async () => {
    const deviceName = devices.find(d => d.device_id === selectedDevice)?.name || selectedDevice;
    try {
      // For custom range, fetch all data without limit for Excel export
      let fullTableData = tableData;
      if (selectedPeriod === 'custom') {
        const token = localStorage.getItem('iot_token');
        const endDate = getEndDate(selectedPeriod);
        const startDate = getStartDate(selectedPeriod);
        
        console.log('Fetching full dataset for Excel export:', {
          startDate,
          endDate,
          selectedDevice,
          parameters: parameters.join(',')
        });
        
        // Fetch all data without limit for Excel export
        const fullTableResponse = await fetch(`${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (fullTableResponse.ok) {
          const fullData = await fullTableResponse.json();
          fullTableData = fullData.data || [];
          console.log('Full dataset for Excel export:', fullTableData.length, 'records');
        }
      }
      
      exportToExcel({
        deviceName,
        period: periodOptions.find(p => p.value === selectedPeriod)?.label,
        chartData,
        alertData,
        tableData: fullTableData,
        parameters,
        chartRefs
      });
    } catch (error) {
      console.error('Error exporting Excel:', error);
      // Fallback to current tableData if fetch fails
      exportToExcel({
        deviceName,
        period: periodOptions.find(p => p.value === selectedPeriod)?.label,
        chartData,
        alertData,
        tableData,
        parameters,
        chartRefs
      });
    }
  };

  const handleRefresh = () => {
    loadData();
  };

  return (
    <Box sx={{ 
      fontFamily: 'Inter, sans-serif', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)', 
      minHeight: '100vh', 
      p: { xs: 2, md: 4 }
    }}>
      {/* Page Header - Site Location style */}
      <Box sx={{ 
        mb: 4, 
        bgcolor: 'background.paper', 
        borderRadius: 1, 
        border: '1px solid',
        borderColor: 'primary.light',
        overflow: 'hidden'
      }}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'primary.light'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <SpeedIcon sx={{ mr: 1.25, fontSize: 28, color: 'primary.main' }} />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '1.25rem' }}>
                Quick View
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem', mt: 0.25 }}>
                Real-time IoT Data Analytics & Monitoring Dashboard
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh Data">
              <IconButton onClick={handleRefresh} disabled={loading} sx={{ color: 'primary.main', '&:hover': { bgcolor: 'action.hover' }, '&:disabled': { color: 'action.disabled' } }}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Export to PDF">
              <IconButton onClick={handleExportPDF} sx={{ color: 'error.main', '&:hover': { bgcolor: 'action.hover' } }}>
                <PdfIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Export to Excel">
              <IconButton onClick={handleExportExcel} sx={{ color: 'success.main', '&:hover': { bgcolor: 'action.hover' } }}>
                <ExcelIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Box>

      {/* Data Filters - Site Location style header */}
      <Card sx={{ mb: 4, borderRadius: 1, ...CHART_CARD_SX, p: 0 }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            px: 2,
            py: 1.5,
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'primary.light'
          }}>
            <FilterIcon sx={{ mr: 1.25, fontSize: 22, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '1.1rem' }}>
              Data Filters
            </Typography>
          </Box>
          
          <Grid container spacing={2} sx={{ p: 1.5 }}>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel sx={{ 
                  fontWeight: 600,
                  '&.Mui-focused': { color: '#007BA7' }
                }}>
                  Device
                </InputLabel>
                <Select
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  label="Device"
                  sx={{
                    borderRadius: 1.5,
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(107, 70, 193, 0.3)',
                      borderWidth: 2
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#007BA7'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#007BA7',
                      borderWidth: 2
                    }
                  }}
                >
                  {devices.map((device) => (
                    <MenuItem key={device.device_id} value={device.device_id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DeviceHubIcon sx={{ fontSize: 20, color: '#007BA7' }} />
                        {device.name} ({device.device_id})
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel sx={{ 
                  fontWeight: 600,
                  '&.Mui-focused': { color: '#007BA7' }
                }}>
                  Time Period
                </InputLabel>
                <Select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  label="Time Period"
                  sx={{
                    borderRadius: 1.5,
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(107, 70, 193, 0.3)',
                      borderWidth: 2
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#007BA7'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#007BA7',
                      borderWidth: 2
                    }
                  }}
                >
                  {periodOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {selectedPeriod === 'custom' && (
              <>
                <Grid item xs={12} md={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DateTimePicker
                      label="Start Date"
                      value={customStartDate}
                      onChange={handleStartDateChange}
                      renderInput={(params) => 
                        <TextField 
                          {...params} 
                          fullWidth 
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: 1.5,
                              '& fieldset': {
                                borderColor: 'rgba(107, 70, 193, 0.3)',
                                borderWidth: 2
                              },
                              '&:hover fieldset': {
                                borderColor: '#007BA7'
                              },
                              '&.Mui-focused fieldset': {
                                borderColor: '#007BA7',
                                borderWidth: 2
                              }
                            }
                          }}
                        />
                      }
                      ampm={false}
                      format="yyyy-MM-dd HH:mm"
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12} md={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DateTimePicker
                      label="End Date"
                      value={customEndDate}
                      onChange={handleEndDateChange}
                      renderInput={(params) => 
                        <TextField 
                          {...params} 
                          fullWidth 
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: 1.5,
                              '& fieldset': {
                                borderColor: 'rgba(107, 70, 193, 0.3)',
                                borderWidth: 2
                              },
                              '&:hover fieldset': {
                                borderColor: '#007BA7'
                              },
                              '&.Mui-focused fieldset': {
                                borderColor: '#007BA7',
                                borderWidth: 2
                              }
                            }
                          }}
                        />
                      }
                      ampm={false}
                      format="yyyy-MM-dd HH:mm"
                    />
                  </LocalizationProvider>
                </Grid>
              </>
            )}
            <Grid item xs={12} md={selectedPeriod === 'custom' ? 12 : 6}>
              <Box sx={{ 
                p: 2,
                borderRadius: 1.5,
                background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
                border: '2px solid rgba(107, 70, 193, 0.1)'
              }}>
                <Typography variant="subtitle2" sx={{ 
                  mb: 2, 
                  fontWeight: 600, 
                  color: theme.palette.text.primary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}>
                  <ScienceIcon sx={{ fontSize: 20, color: '#007BA7' }} />
                  View Mode
                </Typography>
                <ToggleButtonGroup
                  value={viewMode}
                  exclusive
                  onChange={(e, newMode) => newMode && setViewMode(newMode)}
                  fullWidth
                  sx={{
                    '& .MuiToggleButton-root': {
                      borderRadius: '4px !important',
                      border: '2px solid rgba(107, 70, 193, 0.2)',
                      color: theme.palette.text.secondary,
                      fontWeight: 500,
                      textTransform: 'none',
                      px: 3,
                      py: 1.5,
                      '&:hover': {
                        backgroundColor: 'rgba(107, 70, 193, 0.05)',
                        borderColor: '#007BA7'
                      },
                      '&.Mui-selected': {
                        backgroundColor: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
                        color: 'white',
                        borderColor: '#007BA7',
                        '&:hover': {
                          backgroundColor: 'linear-gradient(135deg, #005577 0%, #006B9A 100%)'
                        }
                      }
                    }
                  }}
                >
                  <ToggleButton value="realtime" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TimelineIcon />
                    Real-time Data
                  </ToggleButton>
                  <ToggleButton value="history" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <HistoryIcon />
                    Historical Data
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ 
                p: 2,
                borderRadius: 1.5,
                background: 'rgba(107, 70, 193, 0.05)',
                border: '1px solid rgba(107, 70, 193, 0.1)'
              }}>
                <Typography variant="body2" sx={{ 
                  color: theme.palette.text.secondary,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}>
                  <SpeedIcon sx={{ fontSize: 16, color: '#007BA7' }} />
                  Current Timezone: {getUserTimezone()} | Local Time: {formatInUserTimezone(new Date().toISOString(), 'YYYY-MM-DD HH:mm:ss')}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Modern Error Display */}
      {error && (
        <Alert 
          severity="error" 
          sx={{ 
            mb: 4,
            borderRadius: 1.5,
            border: '2px solid rgba(239, 68, 68, 0.2)',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(239, 68, 68, 0.02) 100%)',
            '& .MuiAlert-icon': {
              fontSize: '1.5rem'
            },
            '& .MuiAlert-message': {
              fontSize: '1rem',
              fontWeight: 500
            }
          }}
        >
          {error}
        </Alert>
      )}

      {/* Modern Loading Indicator */}
      {loading && (
        <Card sx={{ 
          mb: 4,
          borderRadius: 1.5,
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid rgba(107, 70, 193, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)'
        }}>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <CircularProgress 
              size={60} 
              sx={{ 
                color: '#007BA7', 
                mb: 2 
              }} 
            />
            <Typography variant="h6" sx={{ 
              color: theme.palette.text.primary,
              fontWeight: 600,
              mb: 1
            }}>
              Loading IoT Data
            </Typography>
            <Typography variant="body2" sx={{ 
              color: theme.palette.text.secondary,
              fontWeight: 500
            }}>
              Fetching real-time sensor data and analytics...
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Modern Content */}
      {selectedDevice && !loading && (
        <Box>
          {/* Parameter Charts Section */}
          {parameters.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                px: 2,
                py: 1.5,
                mb: 2,
                bgcolor: 'background.paper',
                borderBottom: '1px solid',
                borderBottomColor: 'primary.light'
              }}>
                <ScienceIcon sx={{ mr: 1.25, fontSize: 22, color: 'primary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '1.1rem' }}>
                  Parameter Analytics
                </Typography>
              </Box>
              
              <Box 
                sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr',
                  gap: 3,
                  '@media (max-width: 1200px)': {
                    gridTemplateColumns: '1fr'
                  }
                }}
              >
                {parameters.map((parameter, index) => {
                  return (
                    <Box key={parameter} sx={{ display: 'flex', minWidth: 0, width: '100%' }}>
                      <QuickViewChart
                        parameter={parameter}
                        data={chartData}
                        alerts={alerts}
                        deviceName={devices.find(d => d.device_id === selectedDevice)?.name}
                        addChartRef={addChartRef}
                      />
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
          
          {/* Alert Chart Section */}
          <Box sx={{ mb: 4 }}>
            {console.log('Passing alertData to QuickViewAlertChart:', alertData)}
            <QuickViewAlertChart
              alertData={alertData}
              deviceName={devices.find(d => d.device_id === selectedDevice)?.name}
            />
          </Box>
          
          {/* Data Table Section */}
          <Box>
            <QuickViewTable
              data={tableData}
              parameters={parameters}
              deviceName={devices.find(d => d.device_id === selectedDevice)?.name}
            />
          </Box>
        </Box>
      )}

      {/* Modern Empty States */}
      {!selectedDevice && !loading && (
        <Card sx={{ 
          borderRadius: 1.5,
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid rgba(107, 70, 193, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)'
        }}>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <DeviceHubIcon sx={{ 
              fontSize: 80, 
              mb: 3, 
              color: 'rgba(107, 70, 193, 0.3)' 
            }} />
            <Typography variant="h5" sx={{ 
              color: theme.palette.text.primary,
              fontWeight: 600,
              mb: 2
            }}>
              Select a Device to Begin
            </Typography>
            <Typography variant="body1" sx={{ 
              color: theme.palette.text.secondary,
              fontWeight: 500
            }}>
              Choose a device from the dropdown above to view real-time IoT data and analytics
            </Typography>
          </CardContent>
        </Card>
      )}

      {selectedDevice && parameters.length === 0 && !loading && (
        <Card sx={{ 
          borderRadius: 1.5,
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid rgba(107, 70, 193, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)'
        }}>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <ScienceIcon sx={{ 
              fontSize: 80, 
              mb: 3, 
              color: 'rgba(239, 68, 68, 0.3)' 
            }} />
            <Typography variant="h5" sx={{ 
              color: theme.palette.text.primary,
              fontWeight: 600,
              mb: 2
            }}>
              No Parameters Available
            </Typography>
            <Typography variant="body1" sx={{ 
              color: theme.palette.text.secondary,
              fontWeight: 500
            }}>
              This device has no mapped parameters. Please check device mapper assignments in the admin panel.
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default QuickView;