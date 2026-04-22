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
import { alpha } from '@mui/material/styles';
import {
  Timeline as TimelineIcon,
  History as HistoryIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Science as ScienceIcon,
  DeviceHub as DeviceHubIcon,
  AccessTime as AccessTimeIcon
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
import { getChartCardSx } from '../utils/chartStyles';
import SectionHeader from './SectionHeader';

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
  const [alertConfigs, setAlertConfigs] = useState([]); // threshold alert rules for table highlighting
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
  }, []);

  // Load device mapper and parameters when device changes
  useEffect(() => {
    if (selectedDevice) {
      loadDeviceMapper();
      loadAlertConfigs();
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
        // Keep offline devices visible; only exclude soft-deleted.
        const visibleDevices = (data.devices || []).filter((device) => device?.status !== 'deleted' && device?.is_deleted !== true);
        setDevices(visibleDevices);
        if (visibleDevices.length > 0) {
          const preferred = visibleDevices.find((d) => d.status === 'online') || visibleDevices[0];
          setSelectedDevice(preferred.device_id);
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

  // Load alert configurations (threshold rules) for the selected device - used by QuickViewTable for highlighting
  const loadAlertConfigs = async () => {
    if (!selectedDevice) {
      setAlertConfigs([]);
      return;
    }
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alerts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const list = data.alerts || [];
        const forDevice = list.filter(
          (a) => a.device_id === selectedDevice && a.type === 'threshold' && (a.min != null || a.max != null)
        );
        setAlertConfigs(forDevice);
      } else {
        setAlertConfigs([]);
      }
    } catch (error) {
      console.error('Error loading alert configs:', error);
      setAlertConfigs([]);
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
      
      // Load chart data (display limit 500 for performance)
      const chartResponse = await fetch(`${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=500`, {
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
      
      // Load table data (display limit 500 for performance)
      const tableResponse = await fetch(`${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=500`, {
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

  // Fetch table data with high limit for CSV/export (up to ~1 month)
  const getExportDataForTable = useCallback(async () => {
    if (!selectedDevice || parameters.length === 0) return [];
    const token = localStorage.getItem('iot_token');
    const endDate = getEndDate(selectedPeriod);
    const startDate = getStartDate(selectedPeriod);
    const res = await fetch(`${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=100000`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  }, [selectedDevice, selectedPeriod, parameters, customStartDate, customEndDate]);

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
      // Always fetch with high limit for export (up to ~1 month at 2–5 min interval)
      const token = localStorage.getItem('iot_token');
      const endDate = getEndDate(selectedPeriod);
      const startDate = getStartDate(selectedPeriod);
      let fullTableData = tableData;
      const fullTableResponse = await fetch(`${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=100000`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (fullTableResponse.ok) {
        const fullData = await fullTableResponse.json();
        fullTableData = fullData.data || [];
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
      // Always fetch with high limit for export (up to ~1 month at 2–5 min interval)
      const token = localStorage.getItem('iot_token');
      const endDate = getEndDate(selectedPeriod);
      const startDate = getStartDate(selectedPeriod);
      let fullTableData = tableData;
      const fullTableResponse = await fetch(`${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=100000`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (fullTableResponse.ok) {
        const fullData = await fullTableResponse.json();
        fullTableData = fullData.data || [];
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
      bgcolor: 'background.default',
      backgroundImage: theme.palette.mode === 'light'
        ? 'linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)'
        : 'none',
      minHeight: '100vh',
      p: { xs: 0, sm: 0.5, md: 0.75 },
    }}>
      {/* Data Filters — sticky below app bar scroll area; actions merged from former Quick View header */}
      <Card
        sx={{
          mb: 4,
          borderRadius: 1,
          ...getChartCardSx(theme),
          p: 0,
          background: alpha(theme.palette.background.paper, 0.5),
          position: 'sticky',
          top: 0,
          zIndex: 10,
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 4px 18px rgba(0,0,0,0.35)'
              : '0 4px 18px rgba(15, 23, 42, 0.08)',
        }}
      >
        <CardContent sx={{ p: 0 }}>
          <SectionHeader
            icon={<FilterIcon sx={{ fontSize: 18 }} />}
            title="Data Filters"
            subtitle="Select device, time window, and view mode"
            sx={{ bgcolor: alpha(theme.palette.background.paper, 0.5) }}
            right={(
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
                <Stack direction="row" spacing={0.25} alignItems="center">
                  <Tooltip title="Refresh Data">
                    <IconButton
                      size="small"
                      onClick={handleRefresh}
                      disabled={loading}
                      sx={{
                        color: 'primary.main',
                        '&:hover': { bgcolor: 'action.hover' },
                        '&:disabled': { color: 'action.disabled' },
                      }}
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export to PDF">
                    <IconButton
                      size="small"
                      onClick={handleExportPDF}
                      sx={{ color: 'error.main', '&:hover': { bgcolor: 'action.hover' } }}
                    >
                      <PdfIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export to Excel">
                    <IconButton
                      size="small"
                      onClick={handleExportExcel}
                      sx={{ color: 'success.main', '&:hover': { bgcolor: 'action.hover' } }}
                    >
                      <ExcelIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.25,
                    py: 0.75,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <AccessTimeIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    {getUserTimezone()} ·{' '}
                    {formatInUserTimezone(new Date().toISOString(), 'YYYY-MM-DD HH:mm:ss')}
                  </Typography>
                </Box>
              </Stack>
            )}
          />
          
          <Grid container spacing={1.25} sx={{ p: 1.25 }}>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ 
                  fontWeight: 700,
                  fontSize: '0.82rem',
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
                    minHeight: 40,
                    fontSize: '0.84rem',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(0,0,0,0.14)',
                      borderWidth: 1
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'primary.main'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'primary.main',
                      borderWidth: 1.5
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
              <FormControl fullWidth size="small">
                <InputLabel sx={{ 
                  fontWeight: 700,
                  fontSize: '0.82rem',
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
                    minHeight: 40,
                    fontSize: '0.84rem',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(0,0,0,0.14)',
                      borderWidth: 1
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'primary.main'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'primary.main',
                      borderWidth: 1.5
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
                          size="small"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: 1.5,
                              minHeight: 40,
                              '& fieldset': {
                                borderColor: 'rgba(0,0,0,0.14)',
                                borderWidth: 1
                              },
                              '&:hover fieldset': {
                                borderColor: 'primary.main'
                              },
                              '&.Mui-focused fieldset': {
                                borderColor: 'primary.main',
                                borderWidth: 1.5
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
                          size="small"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: 1.5,
                              minHeight: 40,
                              '& fieldset': {
                                borderColor: 'rgba(0,0,0,0.14)',
                                borderWidth: 1
                              },
                              '&:hover fieldset': {
                                borderColor: 'primary.main'
                              },
                              '&.Mui-focused fieldset': {
                                borderColor: 'primary.main',
                                borderWidth: 1.5
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
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                minHeight: 44,
                px: 1,
                py: 0,
                borderRadius: 1.5,
                bgcolor: 'action.hover',
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <Typography variant="subtitle2" sx={{ 
                  fontWeight: 700, 
                  fontSize: '0.8rem',
                  color: theme.palette.text.primary,
                  flexShrink: 0
                }}>
                  View Mode
                </Typography>
                <ToggleButtonGroup
                  value={viewMode}
                  exclusive
                  onChange={(e, newMode) => newMode && setViewMode(newMode)}
                  size="small"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    '& .MuiToggleButton-root': {
                      borderRadius: '6px !important',
                      border: '1px solid',
                      borderColor: 'divider',
                      color: 'text.secondary',
                      fontWeight: 700,
                      textTransform: 'none',
                      py: 0.5,
                      px: 1.25,
                      minHeight: 30,
                      fontSize: '0.78rem',
                      '&:hover': {
                        bgcolor: 'action.selected',
                        borderColor: 'primary.main'
                      },
                      '&.Mui-selected': {
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        borderColor: 'primary.main',
                        '&:hover': {
                          bgcolor: 'primary.dark'
                        }
                      }
                    }
                  }}
                >
                  <ToggleButton value="realtime" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <TimelineIcon sx={{ fontSize: 16 }} />
                    Real-time
                  </ToggleButton>
                  <ToggleButton value="history" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <RefreshIcon sx={{ fontSize: 16 }} />
                    Historical Data
                  </ToggleButton>
                </ToggleButtonGroup>
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
          bgcolor: 'background.paper',
          backgroundImage: theme.palette.mode === 'light'
            ? 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
            : 'none',
          border: '1px solid',
          borderColor: 'divider',
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
              <Box sx={{ mb: 2 }}>
                <SectionHeader
                  icon={<ScienceIcon sx={{ fontSize: 18 }} />}
                  title="Parameter Analytics"
                  subtitle="Trends, thresholds, and comparisons"
                />
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
                {parameters
                  .filter((p) => {
                    const k = String(p || '').toLowerCase();
                    return k !== 'latitude' && k !== 'longitude';
                  })
                  .map((parameter, index) => {
                  return (
                    <Box key={parameter} sx={{ display: 'flex', minWidth: 0, width: '100%' }}>
                      <QuickViewChart
                        parameter={parameter}
                        data={chartData}
                        alertLogs={alertData}
                        alertConfigs={alertConfigs}
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
              alertConfigs={alertConfigs}
              getExportData={getExportDataForTable}
            />
          </Box>
        </Box>
      )}

      {/* Modern Empty States */}
      {!selectedDevice && !loading && (
        <Card sx={{ 
          borderRadius: 1.5,
          bgcolor: 'background.paper',
          backgroundImage: theme.palette.mode === 'light'
            ? 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
            : 'none',
          border: '1px solid',
          borderColor: 'divider',
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
          bgcolor: 'background.paper',
          backgroundImage: theme.palette.mode === 'light'
            ? 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
            : 'none',
          border: '1px solid',
          borderColor: 'divider',
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