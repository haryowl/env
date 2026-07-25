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
import { getDeviceDisplayName } from '../utils/deviceLabel';
import moment from 'moment-timezone';
import { getChartCardSx } from '../utils/chartStyles';
import SectionHeader from './SectionHeader';
import { compactSelectSx, compactMenuItemSx, compactTextFieldSx } from '../utils/compactUi';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { filterDataViewParams } from '../utils/fieldCategory';
import { alertAppliesToDevice } from '../utils/alertDevices';

const isGpsParam = (p) => {
  const k = String(p || '').toLowerCase();
  return k === 'latitude' || k === 'longitude' || k === 'lat' || k === 'lon' || k === 'lng';
};

const QuickView = () => {
  const theme = useTheme();
  const { metadata: fieldMetadata, formatDisplayName } = useFieldMetadata();
  const [exporting, setExporting] = useState(false);

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
          const params = filterDataViewParams(
            data.assignment.mappings
              .map((mapping) => mapping.target_field)
              .filter(
                (param) =>
                  param.toLowerCase() !== 'datetime' &&
                  param.toLowerCase() !== 'timestamp' &&
                  param.toLowerCase() !== 'device_id' &&
                  param.toLowerCase() !== 'device_name'
              ),
            fieldMetadata
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
          (a) => alertAppliesToDevice(a, selectedDevice) && a.type === 'threshold' && (a.min != null || a.max != null)
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
      
      const dataDashUrl = `${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=500&excludeCategories=Status`;

      const [dataDashResponse, alertResponse] = await Promise.all([
        fetch(dataDashUrl, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/alert-logs?deviceId=${selectedDevice}&startDate=${startDate}&endDate=${endDate}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (dataDashResponse.ok) {
        const payload = await dataDashResponse.json();
        const rows = payload.data || [];
        setChartData(rows);
        setTableData(rows);
      }

      if (alertResponse.ok) {
        const alertData = await alertResponse.json();
        setAlertData(alertData.logs || []);
      } else {
        console.error('Failed to load alert data:', alertResponse.status, alertResponse.statusText);
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
    const res = await fetch(`${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=100000&export=true&excludeCategories=Status`, {
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

  const buildExportPayload = async () => {
    const deviceName = devices.find((d) => d.device_id === selectedDevice)?.name || selectedDevice;
    const periodLabel = periodOptions.find((p) => p.value === selectedPeriod)?.label || selectedPeriod;
    const startISO = getStartDate(selectedPeriod);
    const endISO = getEndDate(selectedPeriod);
    const token = localStorage.getItem('iot_token');
    const exportParams = parameters
      .filter((p) => !isGpsParam(p))
      .map((fieldKey) => ({
        fieldKey,
        label: formatDisplayName(fieldKey, { withUnit: true }) || fieldKey,
      }));

    let rows = tableData || [];
    let alerts = alertData || [];

    try {
      const [dataRes, alertRes] = await Promise.all([
        fetch(
          `${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startISO}&endDate=${endISO}&limit=100000&export=true&excludeCategories=Status`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
        fetch(
          `${API_BASE_URL}/alert-logs?deviceId=${selectedDevice}&startDate=${startISO}&endDate=${endISO}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ]);
      if (dataRes.ok) {
        const fullData = await dataRes.json();
        rows = fullData.data || [];
      }
      if (alertRes.ok) {
        const alertPayload = await alertRes.json();
        alerts = alertPayload.logs || [];
      }
    } catch (e) {
      console.error('Export fetch failed, using on-screen data:', e);
    }

    return {
      deviceName,
      periodLabel,
      startISO,
      endISO,
      timezone: getUserTimezone(),
      generatedAt: new Date().toISOString(),
      parameters: exportParams,
      rows,
      alerts,
      chartRefs,
    };
  };

  const handleExportPDF = async () => {
    if (!selectedDevice || parameters.length === 0 || exporting) return;
    setExporting(true);
    try {
      const payload = await buildExportPayload();
      await exportToPDF(payload);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!selectedDevice || parameters.length === 0 || exporting) return;
    setExporting(true);
    try {
      const payload = await buildExportPayload();
      exportToExcel(payload);
    } catch (error) {
      console.error('Error exporting Excel:', error);
    } finally {
      setExporting(false);
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
                  <Tooltip title={exporting ? 'Preparing export…' : 'Export to PDF'}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={handleExportPDF}
                        disabled={loading || exporting || !selectedDevice || parameters.length === 0}
                        sx={{ color: 'error.main', '&:hover': { bgcolor: 'action.hover' } }}
                      >
                        <PdfIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={exporting ? 'Preparing export…' : 'Export to Excel'}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={handleExportExcel}
                        disabled={loading || exporting || !selectedDevice || parameters.length === 0}
                        sx={{ color: 'success.main', '&:hover': { bgcolor: 'action.hover' } }}
                      >
                        <ExcelIcon fontSize="small" />
                      </IconButton>
                    </span>
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
                <InputLabel sx={{ fontSize: '0.78rem', '&.Mui-focused': { color: '#007BA7' } }}>
                  Device
                </InputLabel>
                <Select
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  label="Device"
                  sx={compactSelectSx}
                >
                  {devices.map((device) => (
                    <MenuItem key={device.device_id} value={device.device_id} sx={compactMenuItemSx}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DeviceHubIcon sx={{ fontSize: 16, color: '#007BA7' }} />
                        {getDeviceDisplayName(device)}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.78rem', '&.Mui-focused': { color: '#007BA7' } }}>
                  Time Period
                </InputLabel>
                <Select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  label="Time Period"
                  sx={compactSelectSx}
                >
                  {periodOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value} sx={compactMenuItemSx}>
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
                      slotProps={{ textField: { fullWidth: true, size: 'small', sx: compactTextFieldSx } }}
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
                      slotProps={{ textField: { fullWidth: true, size: 'small', sx: compactTextFieldSx } }}
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
                  .filter((p) => !isGpsParam(p))
                  .map((parameter) => {
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