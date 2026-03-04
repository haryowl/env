import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Tabs, Tab, Card, CardContent, Grid, Select, MenuItem, InputLabel, FormControl, Button, CircularProgress, TextField, Checkbox, ListItemText, Divider, Chip, Tooltip, useTheme, Stack, Collapse, IconButton
} from '@mui/material';
import { DatePicker, LocalizationProvider, DateTimePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DataGrid } from '@mui/x-data-grid';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { CHART_CARD_SX, CHART_MARGIN, CARTESIAN_GRID_PROPS, AXIS_TICK_STYLE, TOOLTIP_CONTENT_STYLE, LEGEND_WRAPPER_STYLE, getParameterColor as getChartParamColor } from '../utils/chartStyles';
import SpeedIcon from '@mui/icons-material/Speed';
import OpacityIcon from '@mui/icons-material/Opacity';
import ScienceIcon from '@mui/icons-material/Science';
import WaterIcon from '@mui/icons-material/Water';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import * as XLSX from 'xlsx';
import { min as d3min, max as d3max } from 'd3-array';
import moment from 'moment-timezone';

// Utility: Format datetime in user's selected timezone
const getUserTimezone = () => localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';
const formatInUserTimezone = (dt, fmt = 'YYYY-MM-DD HH:mm:ss') => {
  if (!dt) return '-';
  return moment.utc(dt).tz(getUserTimezone()).format(fmt);
};

// Parameter icon mapping
const paramIcons = {
  TSS: <OpacityIcon fontSize="large" color="primary" />, // Suspended solids
  COD: <ScienceIcon fontSize="large" color="secondary" />, // Chemical oxygen demand
  PH: <WaterIcon fontSize="large" color="info" />, // pH
  Debit: <SpeedIcon fontSize="large" color="success" />, // Flow rate
};

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
const getParameterColor = (param) => getChartParamColor(param);

// Legacy paramColors for backward compatibility (can be removed if not needed)
const paramColors = {
  TSS: getParameterColor('TSS'),
  COD: getParameterColor('COD'),
  PH: getParameterColor('PH'),
  Debit: getParameterColor('Debit'),
};

const aggregationOptions = [
  { label: 'Hourly', value: 'hour' },
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
];

// Export CSV utility
function exportToCSV(data, columns, filename = 'data.csv') {
  const header = columns.map(col => col.headerName).join(',');
  const rows = data.map(row => columns.map(col => JSON.stringify(row[col.field] ?? '')).join(','));
  const csvContent = [header, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
// Export XLSX utility
function exportToXLSX(data, columns, filename = 'data.xlsx') {
  const wsData = [columns.map(col => col.headerName), ...data.map(row => columns.map(col => row[col.field]))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
}

export default function DataDash() {
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [devices, setDevices] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [selectedParameters, setSelectedParameters] = useState([]);
  const [dateRange, setDateRange] = useState([null, null]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({});
  const [summaryTab, setSummaryTab] = useState(0); // 0: Table, 1: Graph, 2: Summary Table
  const [aggregation, setAggregation] = useState('day');
  const [summaryTableData, setSummaryTableData] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [deviceMapper, setDeviceMapper] = useState(null);
  const [visibleParams, setVisibleParams] = useState([]);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const { metadata: fieldMetadata, formatDisplayName, getUnit } = useFieldMetadata();

  // Load devices (parameters loaded via field metadata hook)
  useEffect(() => {
    // Fetch devices
    const fetchDevices = async () => {
      try {
        const token = localStorage.getItem('iot_token');
        const res = await axios.get(`${API_BASE_URL}/devices`, { headers: { 'Authorization': `Bearer ${token}` } });
        const activeDevices = (res.data.devices || []).filter(device => device.status !== 'offline' && device.status !== 'deleted');
        setDevices(activeDevices);
      } catch (e) { setDevices([]); }
    };
    fetchDevices();
  }, []);

  // Populate available parameters when metadata is loaded and no specific device mapping is active
  useEffect(() => {
    if (selectedDevices.length > 0) {
      return;
    }
    if (!fieldMetadata || Object.keys(fieldMetadata).length === 0) {
      return;
    }
    setParameters(Object.keys(fieldMetadata));
  }, [fieldMetadata, selectedDevices]);

  // Fetch device mapper when device changes
  useEffect(() => {
    if (selectedDevices.length === 1) {
      const fetchMapper = async () => {
        try {
          const token = localStorage.getItem('iot_token');
          const res = await axios.get(`${API_BASE_URL}/device-mapper-assignments/${selectedDevices[0]}`, { headers: { 'Authorization': `Bearer ${token}` } });
          setDeviceMapper(res.data.assignment);
          setParameters(res.data.assignment.mappings.map(m => m.target_field));
        } catch (e) {
          setDeviceMapper(null);
          setParameters([]);
        }
      };
      fetchMapper();
    } else {
      setDeviceMapper(null);
      setParameters([]);
    }
  }, [selectedDevices]);

  // When parameters or selectedParameters change, reset visibleParams to all selectedParameters
  useEffect(() => {
    setVisibleParams(selectedParameters);
  }, [selectedParameters]);

  // Fetch real data from backend
  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {
        deviceIds: selectedDevices.join(','),
        parameters: selectedParameters.join(','),
        startDate: dateRange[0] ? dateRange[0].toISOString() : undefined,
        endDate: dateRange[1] ? dateRange[1].toISOString() : undefined,
      };
      const token = localStorage.getItem('iot_token');
      const response = await axios.get(`${API_BASE_URL}/data-dash`, {
        params,
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      // Format datetime values in the data
      const formattedData = (response.data.data || []).map(row => ({
        ...row,
        datetime: formatInUserTimezone(row.datetime),
        timestamp: formatInUserTimezone(row.timestamp),
      }));
      setData(formattedData);
      setSummary(response.data.summary || {});
    } catch (error) {
      setData([]);
      setSummary({});
    }
    setLoading(false);
  };

  // Replace mock data loading with fetchData
  useEffect(() => {
    // Optionally, fetch devices/parameters from backend here
    fetchData();
    // eslint-disable-next-line
  }, []);

  // Fetch summary table data and transform to time-period + parameter format
  const fetchSummaryTableData = async () => {
    setLoadingSummary(true);
    try {
      const params = {
        deviceIds: selectedDevices.join(','),
        parameters: selectedParameters.join(','),
        startDate: dateRange[0] ? dateRange[0].toISOString() : undefined,
        endDate: dateRange[1] ? dateRange[1].toISOString() : undefined,
        groupBy: aggregation,
      };
      const token = localStorage.getItem('iot_token');
      const response = await axios.get(`${API_BASE_URL}/data-dash`, {
        params,
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      // Transform data to time-period + parameter format
      const rawData = response.data.summaryTable || [];
      const transformedData = [];
      
      // Get unique parameters from the data
      const allParameters = [...new Set(selectedParameters.filter(p => !['datetime', 'device_name'].includes(p)))];
      
      rawData.forEach((row, rowIndex) => {
        const period = row.period || row.datetime || `Period ${rowIndex + 1}`;
        
        allParameters.forEach(param => {
          const maxValue = parseFloat(row[`${param}_max`]) || parseFloat(row[param]);
          const minValue = parseFloat(row[`${param}_min`]) || parseFloat(row[param]);
          const avgValue = parseFloat(row[`${param}_avg`]) || parseFloat(row[param]);
          
          // Only add row if we have valid data
          if (!isNaN(maxValue) || !isNaN(minValue) || !isNaN(avgValue)) {
            transformedData.push({
              id: `${period}_${param}`,
              period: period,
              parameter: param,
              max: !isNaN(maxValue) ? maxValue : null,
              min: !isNaN(minValue) ? minValue : null,
              avg: !isNaN(avgValue) ? avgValue : null
            });
          }
        });
      });
      
      setSummaryTableData(transformedData);
    } catch (error) {
      console.error('Error fetching summary data:', error);
      setSummaryTableData([]);
    }
    setLoadingSummary(false);
  };

  // Fetch summary table data when aggregation or filters change
  useEffect(() => {
    if (summaryTab === 2) fetchSummaryTableData();
    // eslint-disable-next-line
  }, [aggregation, selectedDevices, selectedParameters, dateRange, summaryTab]);

  // Improved filter area layout
  const filterChips = (
    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2 }}>
      {selectedDevices.length > 0 && selectedDevices.map(id => (
        <Chip key={id} label={devices.find(d => d.device_id === id)?.name || id} color="primary" size="small" />
      ))}
      {selectedParameters.length > 0 && selectedParameters.map(param => (
        <Chip key={param} label={param} color="secondary" size="small" />
      ))}
      {dateRange[0] && <Chip label={`From: ${dateRange[0].toLocaleString()}`} color="info" size="small" />}
      {dateRange[1] && <Chip label={`To: ${dateRange[1].toLocaleString()}`} color="info" size="small" />}
    </Stack>
  );

  const filterControls = (
    <Card sx={{ mb: 2, borderRadius: 1, ...CHART_CARD_SX, overflow: 'visible', p: 0 }}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        px: 2,
        py: 1.5,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderBottomColor: 'primary.light'
      }}>
        <DeviceHubIcon sx={{ mr: 1.25, fontSize: 22, color: 'primary.main' }} />
        <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '1.1rem' }}>
          Data Filters
        </Typography>
      </Box>
      <CardContent sx={{ p: 1.5 }}>
        <Grid container spacing={2} sx={{ minWidth: 0 }}>
          <Grid item xs={12} md={4} sx={{ minWidth: 0 }}>
            <Box sx={{ position: 'relative', minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500, color: theme.palette.text.secondary }}>
                Devices
              </Typography>
              <FormControl fullWidth variant="outlined" size="medium" sx={{ minWidth: 0 }}>
            <Select
              multiple
              value={selectedDevices}
              onChange={e => setSelectedDevices(e.target.value)}
              renderValue={selected => selected.map(id => devices.find(d => d.device_id === id)?.name).join(', ')}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        backgroundColor: theme.palette.background.paper + ' !important',
                        borderRadius: 1.5,
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
                        '& .MuiMenuItem-root': {
                          color: theme.palette.text.primary + ' !important',
                          borderRadius: 1.5,
                          margin: '4px 8px',
                          '&:hover': {
                            backgroundColor: theme.palette.action.hover + ' !important',
                          },
                          '& .MuiListItemText-root': {
                            '& .MuiListItemText-primary': {
                              color: theme.palette.text.primary + ' !important',
                            },
                          },
                          '& .MuiCheckbox-root': {
                            color: theme.palette.text.primary + ' !important',
                          },
                        },
                      },
                    },
                  }}
                  sx={{ 
                    borderRadius: 1.5,
                    '& .MuiSelect-select': { 
                      color: theme.palette.text.primary,
                      padding: '12px 16px',
                      fontSize: '0.9rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    },
                    '& .MuiOutlinedInput-notchedOutline': { 
                      borderColor: 'rgba(107, 70, 193, 0.2)',
                      borderWidth: '2px'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': { 
                      borderColor: theme.palette.primary.main 
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: theme.palette.primary.main,
                      borderWidth: '2px'
                    }
                  }}
            >
              {devices.map(device => (
                    <MenuItem key={device.device_id} value={device.device_id} sx={{ color: theme.palette.text.primary + ' !important' }}>
                      <Checkbox checked={selectedDevices.indexOf(device.device_id) > -1} sx={{ color: theme.palette.text.primary + ' !important' }} />
                      <ListItemText primary={device.name} sx={{ color: theme.palette.text.primary + ' !important' }} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
            </Box>
        </Grid>
          
          <Grid item xs={12} md={4} sx={{ minWidth: 0 }}>
            <Box sx={{ position: 'relative', minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500, color: theme.palette.text.secondary }}>
                Parameters
              </Typography>
              <FormControl fullWidth variant="outlined" size="medium" sx={{ minWidth: 0 }}>
            <Select
              multiple
              value={selectedParameters}
              onChange={e => setSelectedParameters(e.target.value)}
              renderValue={selected => selected.map(param => formatDisplayName(param, { withUnit: true })).join(', ')}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        backgroundColor: theme.palette.background.paper + ' !important',
                        borderRadius: 1.5,
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
                        '& .MuiMenuItem-root': {
                          color: theme.palette.text.primary + ' !important',
                          borderRadius: 1.5,
                          margin: '4px 8px',
                          '&:hover': {
                            backgroundColor: theme.palette.action.hover + ' !important',
                          },
                          '& .MuiListItemText-root': {
                            '& .MuiListItemText-primary': {
                              color: theme.palette.text.primary + ' !important',
                            },
                          },
                          '& .MuiCheckbox-root': {
                            color: theme.palette.text.primary + ' !important',
                          },
                        },
                      },
                    },
                  }}
                  sx={{ 
                    borderRadius: 1.5,
                    '& .MuiSelect-select': { 
                      color: theme.palette.text.primary,
                      padding: '12px 16px',
                      fontSize: '0.9rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    },
                    '& .MuiOutlinedInput-notchedOutline': { 
                      borderColor: 'rgba(107, 70, 193, 0.2)',
                      borderWidth: '2px'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': { 
                      borderColor: theme.palette.primary.main 
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: theme.palette.primary.main,
                      borderWidth: '2px'
                    }
                  }}
            >
              {parameters.map(param => {
                const label = formatDisplayName(param, { withUnit: true });
                return (
                    <MenuItem key={param} value={param} sx={{ color: theme.palette.text.primary + ' !important' }}>
                      <Checkbox checked={selectedParameters.indexOf(param) > -1} sx={{ color: theme.palette.text.primary + ' !important' }} />
                      <ListItemText primary={label} sx={{ color: theme.palette.text.primary + ' !important' }} />
                </MenuItem>
              );
            })}
            </Select>
          </FormControl>
            </Box>
        </Grid>
          
          <Grid item xs={12} md={4} sx={{ minWidth: 0 }}>
            <Box sx={{ position: 'relative', minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500, color: theme.palette.text.secondary }}>
                Date Range
              </Typography>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DateTimePicker
              label="Start Date & Time"
              value={dateRange[0]}
              onChange={date => setDateRange([date, dateRange[1]])}
                  renderInput={params => <TextField {...params} fullWidth size="medium" sx={{ 
                    '& .MuiInputBase-input': { 
                      color: theme.palette.text.primary,
                      padding: '12px 16px',
                      fontSize: '0.9rem'
                    },
                    '& .MuiInputLabel-root': { 
                      color: theme.palette.text.secondary,
                      fontSize: '0.9rem'
                    },
                    '& .MuiOutlinedInput-notchedOutline': { 
                      borderColor: 'rgba(107, 70, 193, 0.2)',
                      borderWidth: '2px'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: theme.palette.primary.main
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: theme.palette.primary.main,
                      borderWidth: '2px'
                    },
                    borderRadius: '4px'
                  }} />}
            />
            <DateTimePicker
              label="End Date & Time"
              value={dateRange[1]}
              onChange={date => setDateRange([dateRange[0], date])}
                  renderInput={params => <TextField {...params} fullWidth size="medium" sx={{ 
                    mt: 1,
                    '& .MuiInputBase-input': { 
                      color: theme.palette.text.primary,
                      padding: '12px 16px',
                      fontSize: '0.9rem'
                    },
                    '& .MuiInputLabel-root': { 
                      color: theme.palette.text.secondary,
                      fontSize: '0.9rem'
                    },
                    '& .MuiOutlinedInput-notchedOutline': { 
                      borderColor: 'rgba(107, 70, 193, 0.2)',
                      borderWidth: '2px'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: theme.palette.primary.main
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: theme.palette.primary.main,
                      borderWidth: '2px'
                    },
                    borderRadius: '4px'
                  }} />}
            />
          </LocalizationProvider>
            </Box>
          </Grid>
        </Grid>
        
        <Box sx={{ mt: 3 }}>
          <Button 
            variant="contained" 
            onClick={fetchData} 
            size="large"
            sx={{
              background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
              borderRadius: 1.5,
              px: 4,
              py: 1.5,
              fontSize: '0.95rem',
              fontWeight: 600,
              textTransform: 'none',
              boxShadow: '0 4px 16px rgba(107, 70, 193, 0.3)',
              mb: 2,
              '&:hover': {
                background: 'linear-gradient(135deg, #005577 0%, #006B9A 100%)',
                boxShadow: '0 6px 20px rgba(107, 70, 193, 0.4)',
                transform: 'translateY(-2px)',
                transition: 'all 0.2s ease-in-out'
              }
            }}
          >
            Apply Filters
          </Button>
        </Box>
        
        {((selectedDevices.length > 0) || (selectedParameters.length > 0) || (dateRange[0] || dateRange[1])) && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ 
              mb: 1.5, 
              fontWeight: 600, 
              color: theme.palette.text.secondary,
              fontSize: '0.9rem'
            }}>
              Active Filters:
            </Typography>
            <Box sx={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: 1,
              p: 2,
              backgroundColor: 'rgba(107, 70, 193, 0.05)',
              borderRadius: 1.5,
              border: '1px solid rgba(107, 70, 193, 0.1)'
            }}>
          {selectedDevices.length > 0 && selectedDevices.map(id => (
                <Chip 
                  key={id} 
                  label={devices.find(d => d.device_id === id)?.name || id} 
                  color="primary" 
                  size="small"
                  sx={{ 
                    borderRadius: 1.5,
                    fontWeight: 500,
                    fontSize: '0.8rem',
                    height: '28px',
                    '& .MuiChip-label': {
                      px: 2
                    }
                  }}
                />
          ))}
          {selectedParameters.length > 0 && selectedParameters.map(param => (
                <Chip 
                  key={param} 
                  label={formatDisplayName(param, { withUnit: true })}
                  color="secondary" 
                  size="small"
                  sx={{ 
                    borderRadius: 1.5,
                    fontWeight: 500,
                    fontSize: '0.8rem',
                    height: '28px',
                    '& .MuiChip-label': {
                      px: 2
                    }
                  }}
                />
              ))}
              {dateRange[0] && <Chip 
                label={`From: ${dateRange[0].toLocaleDateString()} ${dateRange[0].toLocaleTimeString()}`} 
                color="info" 
                size="small"
                sx={{ 
                  borderRadius: 1.5,
                  fontWeight: 500,
                  fontSize: '0.8rem',
                  height: '28px',
                  '& .MuiChip-label': {
                    px: 2
                  }
                }}
              />}
              {dateRange[1] && <Chip 
                label={`To: ${dateRange[1].toLocaleDateString()} ${dateRange[1].toLocaleTimeString()}`} 
                color="info" 
                size="small"
                sx={{ 
                  borderRadius: 1.5,
                  fontWeight: 500,
                  fontSize: '0.8rem',
                  height: '28px',
                  '& .MuiChip-label': {
                    px: 2
                  }
                }}
              />}
            </Box>
    </Box>
        )}
      </CardContent>
    </Card>
  );

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
        return includeUnit && unit ? `${value} ${unit}` : value;
      }
      return includeUnit && unit ? `${value} ${unit}` : value;
    },
    [getUnit]
  );

  // Build table columns dynamically, using 'datetime' as the main time column
  const columns = [
    { field: 'datetime', headerName: 'Data Time', width: 180 },
    { field: 'device_name', headerName: 'Device', width: 120 },
    ...selectedParameters
      .filter(param => !['datetime', 'device_name'].includes(param))
      .map(param => ({
        field: param,
        headerName: formatDisplayName(param, { withUnit: true }),
        width: 140,
        valueFormatter: (value) => formatParameterValue(param, value?.value),
        renderCell: (params) => (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {formatParameterValue(param, params.value)}
          </Typography>
        ),
      }))
    // Optionally, add server receive time as a secondary column:
    // , { field: 'timestamp', headerName: 'Server Time', width: 140 }
  ];

  // Summary table columns - Time period + Parameter + Max/Min/Avg
  const summaryTableColumns = [
    { 
      field: 'period', 
      headerName: aggregation.charAt(0).toUpperCase() + aggregation.slice(1), 
      width: 150, 
      headerAlign: 'center', 
      align: 'center',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#007BA7' }}>
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'parameter', 
      headerName: 'Parameter', 
      width: 180, 
      headerAlign: 'center', 
      align: 'left',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
          {formatDisplayName(params.value, { withUnit: true })}
        </Typography>
      )
    },
    { 
      field: 'max', 
      headerName: 'Max', 
      width: 100, 
      headerAlign: 'center', 
      align: 'center',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#10B981' }}>
          {formatParameterValue(params.row.parameter, params.value)}
        </Typography>
      )
    },
    { 
      field: 'min', 
      headerName: 'Min', 
      width: 100, 
      headerAlign: 'center', 
      align: 'center',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#EF4444' }}>
          {formatParameterValue(params.row.parameter, params.value)}
        </Typography>
      )
    },
    { 
      field: 'avg', 
      headerName: 'Avg', 
      width: 100, 
      headerAlign: 'center', 
      align: 'center',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#007BA7' }}>
          {formatParameterValue(params.row.parameter, params.value)}
        </Typography>
      )
    }
  ];

  // Modern card grid for summary stats
  const summaryCards = (
    <Grid container spacing={2}>
      {parameters.map(param => summary[param] && (
        <Grid item xs={12} sm={6} lg={2.4} key={param}>
          <Card sx={{
            p: 2,
            height: '100%',
            borderRadius: 1,
            border: '1px solid rgba(0,0,0,0.06)',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            fontFamily: 'Inter, sans-serif',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            transition: 'all 0.2s ease',
            '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }
          }}>
            {/* Parameter name */}
            <Typography variant="h6" sx={{ 
              fontWeight: 600, 
              color: '#374151',
              mb: 2,
              fontSize: '1rem',
              textTransform: 'capitalize',
              letterSpacing: '0.025em'
            }}>
              {formatDisplayName(param, { withUnit: true })}
            </Typography>
            
            {/* Stats container */}
            <Box sx={{ width: '100%', mt: 'auto' }}>
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                mb: 1,
                p: 1.5,
                borderRadius: 1.5,
                background: '#f8fafc',
                border: '1px solid #e2e8f0'
              }}>
                <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 500, fontSize: '0.75rem' }}>Max</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>
                  {formatParameterValue(param, summary[param].max)}
                </Typography>
              </Box>
              
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                mb: 1,
                p: 1.5,
                borderRadius: 1.5,
                background: '#f8fafc',
                border: '1px solid #e2e8f0'
              }}>
                <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 500, fontSize: '0.75rem' }}>Min</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>
                  {formatParameterValue(param, summary[param].min)}
                </Typography>
              </Box>
              
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                p: 2,
                borderRadius: 1.5,
                background: '#f1f5f9',
                border: '1px solid #cbd5e1'
              }}>
                <Typography variant="caption" sx={{ color: '#374151', fontWeight: 600, fontSize: '0.75rem' }}>Avg</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', fontSize: '1.125rem' }}>
                  {formatParameterValue(param, summary[param].avg)}
                </Typography>
              </Box>
            </Box>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  // Calculate Y axis min/max for visible parameters
  const getYDomain = () => {
    if (!data.length || !visibleParams.length) return [0, 'auto'];
    let minVal = Infinity, maxVal = -Infinity;
    for (const param of visibleParams) {
      for (const row of data) {
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

  return (
    <Box sx={{ 
      fontFamily: 'Inter, sans-serif', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)', 
      minHeight: '100vh', 
      p: { xs: 2, md: 4 }
    }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h3" sx={{ 
          fontWeight: 800, 
          background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          mb: 0.5
        }}>
          Data Dash
        </Typography>
        <Typography variant="subtitle1" sx={{ color: theme.palette.text.secondary, fontSize: '1.1rem' }}>
          Advanced IoT Data Analytics & Visualization
        </Typography>
      </Box>
      
      {filterControls}
      
      {!loading && data.length > 0 && (
        <Card sx={{ mt: 2, borderRadius: 1, ...CHART_CARD_SX }}>
          <CardContent sx={{ p: 0 }}>
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                px: 1,
                py: 1,
                pb: summaryExpanded ? 0.75 : 1,
                cursor: 'pointer',
                '&:hover': {
                  backgroundColor: 'rgba(107, 70, 193, 0.02)'
                }
              }}
              onClick={() => setSummaryExpanded(!summaryExpanded)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <ScienceIcon sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 20 }} />
                <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary, fontSize: '1.1rem' }}>
                  Data Summary
                </Typography>
              </Box>
              <IconButton 
                sx={{ 
                  color: theme.palette.primary.main,
                  transition: 'transform 0.2s ease-in-out',
                  transform: summaryExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                }}
              >
                <ExpandMoreIcon />
              </IconButton>
            </Box>
            
            <Collapse in={summaryExpanded} timeout="auto" unmountOnExit>
              <Box sx={{ px: 1, pb: 1.5 }}>
                {summaryCards}
              </Box>
            </Collapse>
          </CardContent>
        </Card>
      )}
      
      <Card sx={{ borderRadius: 1, ...CHART_CARD_SX, overflow: 'hidden', mt: 4 }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ 
            background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
            px: 1,
            py: 1
          }}>
            <Tabs 
              value={summaryTab} 
              onChange={(_, v) => setSummaryTab(v)}
              sx={{
                '& .MuiTab-root': {
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '1rem',
                  fontWeight: 500,
                  textTransform: 'none',
                  minHeight: 48,
                  '&.Mui-selected': {
                    color: '#ffffff',
                    fontWeight: 600
                  }
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: '#ffffff',
                  height: 3,
                  borderRadius: '2px'
                }
              }}
            >
              <Tab label="Data Table" icon={<DeviceHubIcon />} iconPosition="start" />
              <Tab label="Analytics Chart" icon={<OpacityIcon />} iconPosition="start" />
              <Tab label="Summary Report" icon={<ScienceIcon />} iconPosition="start" />
            </Tabs>
          </Box>
          
          <Box sx={{ p: 1.5 }}>
      {summaryTab === 0 && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                    Data Records
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button 
                      variant="outlined" 
                      size="medium" 
                      onClick={() => exportToCSV(data, columns)}
                      sx={{
                        borderRadius: 1.5,
                        textTransform: 'none',
                        fontWeight: 500,
                        borderColor: theme.palette.primary.main,
                        color: theme.palette.primary.main,
                        '&:hover': {
                          backgroundColor: theme.palette.primary.main,
                          color: '#ffffff',
                          transform: 'translateY(-1px)',
                          transition: 'all 0.2s ease-in-out'
                        }
                      }}
                    >
                      Export CSV
                    </Button>
                    <Button 
                      variant="contained" 
                      size="medium" 
                      onClick={() => exportToXLSX(data, columns)}
                      sx={{
                        borderRadius: 1.5,
                        textTransform: 'none',
                        fontWeight: 500,
                        background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #005577 0%, #006B9A 100%)',
                          transform: 'translateY(-1px)',
                          transition: 'all 0.2s ease-in-out'
                        }
                      }}
                    >
                      Export XLSX
                    </Button>
                  </Stack>
                </Box>
                
                {loading ? (
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    minHeight: 300,
                    background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
                    borderRadius: 1.5,
                    border: '2px dashed rgba(107, 70, 193, 0.2)'
                  }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <CircularProgress size={60} sx={{ color: theme.palette.primary.main, mb: 2 }} />
                      <Typography variant="body1" sx={{ color: theme.palette.text.secondary }}>
                        Loading data...
                      </Typography>
                    </Box>
              </Box>
                ) : (
              <DataGrid
                autoHeight
                rows={data.map((row, i) => ({ id: i, ...row }))}
                columns={columns}
                pageSize={10}
                    rowsPerPageOptions={[10, 25, 50, 100]}
                sx={{
                      borderRadius: 1.5,
                      border: 'none',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '0.9rem',
                      '& .MuiDataGrid-main': {
                        borderRadius: '4px'
                      },
                      '& .MuiDataGrid-row': {
                        borderRadius: 1.5,
                        margin: '2px 8px',
                        '&:nth-of-type(even)': { 
                          backgroundColor: 'rgba(107, 70, 193, 0.02)',
                          '&:hover': {
                            backgroundColor: 'rgba(107, 70, 193, 0.08)'
                          }
                        },
                        '&:hover': {
                          backgroundColor: 'rgba(107, 70, 193, 0.05)'
                        }
                      },
                      '& .MuiDataGrid-columnHeaders': { 
                        backgroundColor: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
                        fontWeight: 700, 
                        fontSize: '0.9rem',
                        borderBottom: '2px solid rgba(107, 70, 193, 0.1)',
                        '& .MuiDataGrid-columnHeaderTitle': {
                          fontWeight: 700,
                          color: theme.palette.text.primary
                        }
                      },
                      '& .MuiDataGrid-cell': { 
                        py: 1.5, 
                        fontSize: '0.85rem',
                        borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
                        color: theme.palette.text.primary
                      },
                      '& .MuiDataGrid-footerContainer': { 
                        backgroundColor: 'rgba(248, 250, 252, 0.8)',
                        borderTop: '2px solid rgba(107, 70, 193, 0.1)'
                      },
                      '& .MuiTablePagination-root': {
                        color: theme.palette.text.primary
                      }
                }}
              />
            )}
              </Box>
      )}
            
      {summaryTab === 1 && (
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 3 }}>
                  Analytics Chart
                </Typography>
                {loading ? (
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    minHeight: 400,
                    background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
                    borderRadius: 1.5,
                    border: '2px dashed rgba(107, 70, 193, 0.2)'
                  }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <CircularProgress size={60} sx={{ color: theme.palette.primary.main, mb: 2 }} />
                      <Typography variant="body1" sx={{ color: theme.palette.text.secondary }}>
                        Loading chart...
                      </Typography>
                    </Box>
            </Box>
                ) : (
                  <Card sx={{ ...CHART_CARD_SX }}>
                    <CardContent sx={{ p: 3 }}>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={data} margin={CHART_MARGIN}>
                          <CartesianGrid {...CARTESIAN_GRID_PROPS} />
                          <XAxis 
                            dataKey="datetime" 
                            tick={AXIS_TICK_STYLE}
                            tickFormatter={(value) => {
                              if (typeof value === 'string' && !value.includes('T')) {
                                return value;
                              }
                              return formatInUserTimezone(value);
                            }}
                          />
                          <YAxis tick={AXIS_TICK_STYLE} domain={getYDomain()} />
                          <ReTooltip
                            contentStyle={TOOLTIP_CONTENT_STYLE}
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
                          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE}
                            formatter={(value, entry) =>
                              formatDisplayName(entry?.dataKey || value, { withUnit: true })
                            }
                          />
                          {visibleParams.map((param) => {
                            const color = getParameterColor(param);
                            return (
                              <Line
                                key={param}
                                type="monotone"
                                dataKey={param}
                                name={formatDisplayName(param, { withUnit: true })}
                                stroke={color}
                                strokeWidth={3}
                                dot={{ fill: color, strokeWidth: 2, r: 4 }}
                                activeDot={{ r: 6, strokeWidth: 2 }}
                              />
                            );
                          })}
                </LineChart>
              </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
              </Box>
            )}
            
      {summaryTab === 2 && (
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 3 }}>
                  Summary Report
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Aggregation</InputLabel>
                    <Select value={aggregation} label="Aggregation" onChange={e => setAggregation(e.target.value)}>
                  {aggregationOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
                  <Button variant="contained" onClick={fetchSummaryTableData} size="small" sx={{ ml: 2 }}>
                    Generate
                  </Button>
                </Box>
                {loadingSummary ? (
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    minHeight: 300,
                    background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
                    borderRadius: 1.5,
                    border: '2px dashed rgba(107, 70, 193, 0.2)'
                  }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <CircularProgress size={60} sx={{ color: theme.palette.primary.main, mb: 2 }} />
                      <Typography variant="body1" sx={{ color: theme.palette.text.secondary }}>
                        Generating summary...
                      </Typography>
                    </Box>
            </Box>
                ) : (
              <DataGrid
                autoHeight
                rows={summaryTableData}
                columns={summaryTableColumns}
                pageSize={10}
                rowsPerPageOptions={[10, 25, 50]}
                sx={{
                      borderRadius: 1.5,
                      border: 'none',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '0.9rem',
                      '& .MuiDataGrid-main': {
                        borderRadius: '4px'
                      },
                      '& .MuiDataGrid-row': {
                        borderRadius: 1.5,
                        margin: '2px 8px',
                        '&:nth-of-type(even)': { 
                          backgroundColor: 'rgba(107, 70, 193, 0.02)',
                          '&:hover': {
                            backgroundColor: 'rgba(107, 70, 193, 0.08)'
                          }
                        },
                        '&:hover': {
                          backgroundColor: 'rgba(107, 70, 193, 0.05)'
                        }
                      },
                      '& .MuiDataGrid-columnHeaders': { 
                        backgroundColor: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
                        fontWeight: 700, 
                        fontSize: '0.9rem',
                        borderBottom: '2px solid rgba(107, 70, 193, 0.1)',
                        '& .MuiDataGrid-columnHeaderTitle': {
                          fontWeight: 700,
                          color: theme.palette.text.primary
                        }
                      },
                      '& .MuiDataGrid-cell': { 
                        py: 1.5, 
                        fontSize: '0.85rem',
                        borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
                        color: theme.palette.text.primary
                      },
                      '& .MuiDataGrid-footerContainer': { 
                        backgroundColor: 'rgba(248, 250, 252, 0.8)',
                        borderTop: '2px solid rgba(107, 70, 193, 0.1)'
                      },
                      '& .MuiTablePagination-root': {
                        color: theme.palette.text.primary
                      }
                    }}
                  />
                )}
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
      
      
      {!loading && data.length === 0 && (
        <Card sx={{ mt: 4, borderRadius: 1, ...CHART_CARD_SX }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <DeviceHubIcon sx={{ fontSize: 80, mb: 2, color: 'rgba(107, 70, 193, 0.3)' }} />
            <Typography variant="h6" sx={{ color: theme.palette.text.secondary, mb: 1 }}>
              No Data Available
            </Typography>
            <Typography variant="body1" sx={{ color: theme.palette.text.secondary }}>
              No data found for the selected filters. Try adjusting your criteria.
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
} 