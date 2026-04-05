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
import { getChartCardSx, CHART_MARGIN, CARTESIAN_GRID_PROPS, getTooltipContentStyle, LEGEND_WRAPPER_STYLE, getParameterColor as getChartParamColor } from '../utils/chartStyles';
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
import PageHeader from './PageHeader';
import SectionHeader from './SectionHeader';

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
        // Keep offline devices visible; only exclude soft-deleted.
        const visibleDevices = (res.data.devices || []).filter((device) => device?.status !== 'deleted' && device?.is_deleted !== true);
        setDevices(visibleDevices);
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
        limit: 10000,
      };
      const token = localStorage.getItem('iot_token');
      const response = await axios.get(`${API_BASE_URL}/data-dash`, {
        params,
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      // Table: localized strings. Chart: numeric UTC ms + sort so X-axis is true time order (not API order).
      const rawRows = response.data.data || [];
      const formattedData = rawRows
        .map((row) => {
          const rawInstant = row.datetime ?? row.timestamp;
          const t = rawInstant != null && rawInstant !== '' ? new Date(rawInstant).getTime() : NaN;
          return {
            ...row,
            _chartTime: Number.isFinite(t) ? t : 0,
            datetime: formatInUserTimezone(row.datetime ?? row.timestamp),
            timestamp: formatInUserTimezone(row.timestamp),
          };
        })
        .sort((a, b) => a._chartTime - b._chartTime);
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
        limit: 100000,
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

  // Fetch up to ~1 month of data for export (high limit), then export CSV/XLSX
  const fetchDataForExport = async () => {
    const params = {
      deviceIds: selectedDevices.join(','),
      parameters: selectedParameters.join(','),
      startDate: dateRange[0] ? dateRange[0].toISOString() : undefined,
      endDate: dateRange[1] ? dateRange[1].toISOString() : undefined,
      limit: 100000,
    };
    const token = localStorage.getItem('iot_token');
    const response = await axios.get(`${API_BASE_URL}/data-dash`, {
      params,
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const raw = response.data.data || [];
    return raw.map(row => ({
      ...row,
      datetime: formatInUserTimezone(row.datetime),
      timestamp: formatInUserTimezone(row.timestamp),
    }));
  };

  const handleExportCSV = async () => {
    try {
      const exportData = await fetchDataForExport();
      exportToCSV(exportData, columns);
    } catch (e) {
      console.error('Export CSV failed:', e);
    }
  };

  const handleExportXLSX = async () => {
    try {
      const exportData = await fetchDataForExport();
      exportToXLSX(exportData, columns);
    } catch (e) {
      console.error('Export XLSX failed:', e);
    }
  };

  /** Match Devices/Parameters Select row height (34px) — DateTimePicker adornment often stretches default TextField */
  const dataDashDateTimeFieldSx = {
    '& .MuiInputBase-root': {
      height: 34,
      minHeight: 34,
      maxHeight: 34,
      boxSizing: 'border-box',
      alignItems: 'center',
      borderRadius: 1.5,
    },
    '& .MuiInputBase-input, & .MuiOutlinedInput-input': {
      py: '5px',
      px: '10px',
      pr: '4px',
      fontSize: '0.75rem',
      color: theme.palette.text.primary,
      boxSizing: 'border-box',
      lineHeight: 1.2,
    },
    '& .MuiInputAdornment-root': {
      marginLeft: 0,
      height: 30,
      maxHeight: 30,
    },
    '& .MuiInputAdornment-root .MuiIconButton-root': {
      p: 0.35,
    },
    '& .MuiInputAdornment-root .MuiIconButton-root .MuiSvgIcon-root': {
      fontSize: '1.1rem',
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: 'rgba(0,0,0,0.14)',
      borderWidth: '1px',
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.main,
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.main,
      borderWidth: '1.5px',
    },
  };

  const filterControls = (
    <Card sx={{ mb: 2, borderRadius: 1, ...getChartCardSx(theme), overflow: 'visible', p: 0 }}>
      <SectionHeader
        compact
        icon={<DeviceHubIcon sx={{ fontSize: 16 }} />}
        title="Data Filters"
        subtitle="Select devices, parameters, and time range"
      />
      <CardContent sx={{ p: 1, pt: 1.25, pb: 1.25 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr)) auto' },
            gap: { xs: 0.75, md: 0.75 },
            rowGap: 0.75,
            width: '100%',
            minWidth: 0,
            '& > *': { minWidth: 0 },
          }}
        >
          <Box sx={{ position: 'relative', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
            <Typography variant="subtitle2" sx={{ mb: 0.35, fontWeight: 700, fontSize: '0.72rem', color: theme.palette.text.secondary, lineHeight: 1.2 }}>
              Devices
            </Typography>
              <FormControl fullWidth variant="outlined" size="small" sx={{ width: '100%', maxWidth: '100%', minWidth: 0, '& .MuiInputBase-root': { minHeight: 34 } }}>
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
                    maxWidth: '100%',
                    '& .MuiInputBase-root': { maxWidth: '100%' },
                    borderRadius: 1.5,
                    '& .MuiSelect-select': { 
                      color: theme.palette.text.primary,
                      padding: '6px 10px',
                      fontSize: '0.75rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%'
                    },
                    '& .MuiOutlinedInput-notchedOutline': { 
                      borderColor: 'rgba(0,0,0,0.14)',
                      borderWidth: '1px'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': { 
                      borderColor: theme.palette.primary.main 
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: theme.palette.primary.main,
                      borderWidth: '1.5px'
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

          <Box sx={{ position: 'relative', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
            <Typography variant="subtitle2" sx={{ mb: 0.35, fontWeight: 700, fontSize: '0.72rem', color: theme.palette.text.secondary, lineHeight: 1.2 }}>
              Parameters
            </Typography>
              <FormControl fullWidth variant="outlined" size="small" sx={{ width: '100%', maxWidth: '100%', minWidth: 0, '& .MuiInputBase-root': { minHeight: 34 } }}>
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
                    maxWidth: '100%',
                    '& .MuiInputBase-root': { maxWidth: '100%' },
                    borderRadius: 1.5,
                    '& .MuiSelect-select': { 
                      color: theme.palette.text.primary,
                      padding: '6px 10px',
                      fontSize: '0.75rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%'
                    },
                    '& .MuiOutlinedInput-notchedOutline': { 
                      borderColor: 'rgba(0,0,0,0.14)',
                      borderWidth: '1px'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': { 
                      borderColor: theme.palette.primary.main 
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: theme.palette.primary.main,
                      borderWidth: '1.5px'
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

          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box sx={{ position: 'relative', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <Typography variant="subtitle2" sx={{ mb: 0.35, fontWeight: 700, fontSize: '0.72rem', color: theme.palette.text.secondary, lineHeight: 1.2 }}>
                Start Date & Time
              </Typography>
              <DateTimePicker
                value={dateRange[0]}
                onChange={date => setDateRange([date, dateRange[1]])}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    size="small"
                    label={null}
                    InputLabelProps={{ shrink: false }}
                    sx={dataDashDateTimeFieldSx}
                  />
                )}
              />
            </Box>
            <Box sx={{ position: 'relative', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <Typography variant="subtitle2" sx={{ mb: 0.35, fontWeight: 700, fontSize: '0.72rem', color: theme.palette.text.secondary, lineHeight: 1.2 }}>
                End Date & Time
              </Typography>
              <DateTimePicker
                value={dateRange[1]}
                onChange={date => setDateRange([dateRange[0], date])}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    size="small"
                    label={null}
                    InputLabelProps={{ shrink: false }}
                    sx={dataDashDateTimeFieldSx}
                  />
                )}
              />
            </Box>
          </LocalizationProvider>

          <Box
            sx={{
              gridColumn: { xs: '1 / -1', md: '5 / 6' },
              gridRow: { xs: 'auto', md: '1 / 2' },
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: { xs: 'stretch', md: 'flex-start' },
              pb: { md: '1px' },
            }}
          >
            <Button
              variant="contained"
              onClick={fetchData}
              size="small"
              fullWidth
              sx={{
                borderRadius: 1,
                px: 2,
                py: 0.65,
                minHeight: 34,
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'none',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.18)',
                width: { xs: '100%', md: 'auto' },
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.22)',
                },
              }}
            >
              Apply Filters
            </Button>
          </Box>
        </Box>

        {((selectedDevices.length > 0) || (selectedParameters.length > 0) || (dateRange[0] || dateRange[1])) && (
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="subtitle2"
              sx={{
                mb: 0.5,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                fontSize: '0.72rem',
              }}
            >
              Active Filters:
            </Typography>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.5,
                p: 1,
                pt: 0.85,
                pb: 0.85,
                backgroundColor: 'rgba(107, 70, 193, 0.05)',
                borderRadius: 1,
                border: '1px solid rgba(107, 70, 193, 0.1)',
              }}
            >
          {selectedDevices.length > 0 && selectedDevices.map(id => (
                <Chip 
                  key={id} 
                  label={devices.find(d => d.device_id === id)?.name || id} 
                  color="primary" 
                  size="small"
                  sx={{ 
                    borderRadius: 1,
                    fontWeight: 600,
                    fontSize: '0.68rem',
                    height: 22,
                    '& .MuiChip-label': {
                      px: 0.85,
                    },
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
                    borderRadius: 1,
                    fontWeight: 600,
                    fontSize: '0.68rem',
                    height: 22,
                    '& .MuiChip-label': {
                      px: 0.85,
                    },
                  }}
                />
              ))}
              {dateRange[0] && <Chip 
                label={`From: ${dateRange[0].toLocaleDateString()} ${dateRange[0].toLocaleTimeString()}`} 
                color="info" 
                size="small"
                sx={{ 
                  borderRadius: 1,
                  fontWeight: 600,
                  fontSize: '0.68rem',
                  height: 22,
                  '& .MuiChip-label': {
                    px: 0.85,
                  },
                }}
              />}
              {dateRange[1] && <Chip 
                label={`To: ${dateRange[1].toLocaleDateString()} ${dateRange[1].toLocaleTimeString()}`} 
                color="info" 
                size="small"
                sx={{ 
                  borderRadius: 1,
                  fontWeight: 600,
                  fontSize: '0.68rem',
                  height: 22,
                  '& .MuiChip-label': {
                    px: 0.85,
                  },
                }}
              />}
            </Box>
    </Box>
        )}
      </CardContent>
    </Card>
  );

  const formatParameterValue = useCallback(
    (param, value, precision = 3, includeUnit = true) => {
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
        if (!Number.isNaN(numeric) && String(value).trim() !== '' && /^-?\d/.test(String(value).trim())) {
          const formatted = Number.isFinite(numeric) ? numeric.toFixed(precision) : value;
          return includeUnit && unit ? `${formatted} ${unit}` : `${formatted}`;
        }
        return includeUnit && unit ? `${value} ${unit}` : value;
      }
      return includeUnit && unit ? `${value} ${unit}` : value;
    },
    [getUnit]
  );

  const compactDataGridSx = {
    borderRadius: 1,
    border: 'none',
    fontFamily: 'Inter, sans-serif',
    '& .MuiDataGrid-main': { borderRadius: 1 },
    '& .MuiDataGrid-row': {
      margin: 0,
      '&:nth-of-type(even)': {
        backgroundColor: 'rgba(107, 70, 193, 0.03)',
        '&:hover': { backgroundColor: 'rgba(107, 70, 193, 0.08)' },
      },
      '&:hover': { backgroundColor: 'rgba(107, 70, 193, 0.05)' },
    },
    '& .MuiDataGrid-columnHeaders': {
      bgcolor: 'background.paper',
      borderBottom: '1px solid',
      borderColor: 'divider',
      minHeight: '34px !important',
    },
    '& .MuiDataGrid-columnHeader': {
      py: 0.25,
      px: 0.75,
      display: 'flex',
      alignItems: 'center',
    },
    '& .MuiDataGrid-columnHeaderTitle': {
      fontWeight: 700,
      fontSize: '0.7rem',
      lineHeight: 1.25,
      whiteSpace: 'normal',
      overflow: 'visible',
      textOverflow: 'clip',
    },
    '& .MuiDataGrid-cell': {
      py: 0.25,
      px: 0.75,
      fontSize: '0.72rem',
      lineHeight: 1.35,
      borderBottom: '1px solid',
      borderColor: 'divider',
      color: 'text.primary',
      display: 'flex',
      alignItems: 'center',
    },
    '& .MuiDataGrid-footerContainer': {
      bgcolor: 'background.paper',
      borderTop: '1px solid',
      borderColor: 'divider',
      minHeight: 44,
    },
    '& .MuiTablePagination-root': { color: 'text.primary' },
    '& .MuiTablePagination-toolbar': { minHeight: 40, pl: 1, pr: 0.5 },
    '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
      fontSize: '0.7rem',
      m: 0,
    },
    '& .MuiTablePagination-select': { fontSize: '0.72rem' },
  };

  // Build table columns dynamically, using 'datetime' as the main time column
  const columns = [
    { field: 'datetime', headerName: 'Data Time', minWidth: 148, flex: 0.9 },
    { field: 'device_name', headerName: 'Device', minWidth: 88, flex: 0.45 },
    ...selectedParameters
      .filter(param => !['datetime', 'device_name'].includes(param))
      .map(param => ({
        field: param,
        headerName: formatDisplayName(param, { withUnit: true }),
        minWidth: 175,
        flex: 1,
        valueFormatter: (value) => formatParameterValue(param, value?.value),
        renderCell: (params) => (
          <Typography component="span" sx={{ fontWeight: 500, fontSize: '0.72rem', lineHeight: 1.35 }}>
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
      minWidth: 112, 
      flex: 0.5,
      headerAlign: 'center', 
      align: 'center',
      renderCell: (params) => (
        <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.72rem', color: '#007BA7' }}>
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'parameter', 
      headerName: 'Parameter', 
      minWidth: 200, 
      flex: 1.2,
      headerAlign: 'left', 
      align: 'left',
      renderCell: (params) => (
        <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.72rem', lineHeight: 1.35 }}>
          {formatDisplayName(params.value, { withUnit: true })}
        </Typography>
      )
    },
    { 
      field: 'max', 
      headerName: 'Max', 
      minWidth: 96, 
      flex: 0.55,
      headerAlign: 'center', 
      align: 'center',
      renderCell: (params) => (
        <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.72rem', color: '#10B981' }}>
          {formatParameterValue(params.row.parameter, params.value)}
        </Typography>
      )
    },
    { 
      field: 'min', 
      headerName: 'Min', 
      minWidth: 96, 
      flex: 0.55,
      headerAlign: 'center', 
      align: 'center',
      renderCell: (params) => (
        <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.72rem', color: '#EF4444' }}>
          {formatParameterValue(params.row.parameter, params.value)}
        </Typography>
      )
    },
    { 
      field: 'avg', 
      headerName: 'Avg', 
      minWidth: 96, 
      flex: 0.55,
      headerAlign: 'center', 
      align: 'center',
      renderCell: (params) => (
        <Typography component="span" sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#007BA7' }}>
          {formatParameterValue(params.row.parameter, params.value)}
        </Typography>
      )
    }
  ];

  // Data Summary cards — compact typography (match Data Filters / grids)
  const statLineRowSx = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 1,
    py: 0.15,
  };
  const summaryCards = (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1 }}>
      {parameters.map(param => summary[param] && (
        <Card
          key={param}
          sx={{
            p: 1.1,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            transition: 'box-shadow 0.2s ease',
            '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.07)' },
          }}
        >
          <Typography
            sx={{
              fontWeight: 700,
              color: 'text.primary',
              fontSize: '0.72rem',
              lineHeight: 1.25,
              mb: 0.65,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {formatDisplayName(param, { withUnit: true })}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.1 }}>
            <Box sx={statLineRowSx}>
              <Typography component="span" sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 600 }}>
                Max
              </Typography>
              <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.primary', textAlign: 'right' }}>
                {formatParameterValue(param, summary[param].max)}
              </Typography>
            </Box>
            <Box sx={statLineRowSx}>
              <Typography component="span" sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 600 }}>
                Min
              </Typography>
              <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.primary', textAlign: 'right' }}>
                {formatParameterValue(param, summary[param].min)}
              </Typography>
            </Box>
            <Box sx={statLineRowSx}>
              <Typography component="span" sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 600 }}>
                Avg
              </Typography>
              <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.primary', textAlign: 'right' }}>
                {formatParameterValue(param, summary[param].avg)}
              </Typography>
            </Box>
          </Box>
        </Card>
      ))}
    </Box>
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
      bgcolor: 'background.default',
      backgroundImage: theme.palette.mode === 'light'
        ? 'linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)'
        : 'none',
      minHeight: '100vh',
      p: { xs: 0, sm: 0.5, md: 0.75 }
    }}>
      <Box sx={{ mb: 1 }}>
        <PageHeader
          icon={<DeviceHubIcon sx={{ fontSize: 18 }} />}
          title="Data Dash"
          subtitle="Advanced IoT data analytics and visualization"
        />
      </Box>
      
      {filterControls}
      
      {!loading && data.length > 0 && (
        <Card sx={{ mt: 2, borderRadius: 1, ...getChartCardSx(theme) }}>
          <CardContent sx={{ p: 0 }}>
            <Box onClick={() => setSummaryExpanded(!summaryExpanded)} sx={{ cursor: 'pointer' }}>
              <SectionHeader
                compact
                icon={<ScienceIcon sx={{ fontSize: 16 }} />}
                title="Data Summary"
                subtitle="Max, min, and average for selected parameters"
                right={(
                  <IconButton
                    size="small"
                    sx={{
                      color: theme.palette.primary.main,
                      transition: 'transform 0.2s ease-in-out',
                      transform: summaryExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <ExpandMoreIcon fontSize="small" />
                  </IconButton>
                )}
              />
            </Box>
            
            <Collapse in={summaryExpanded} timeout="auto" unmountOnExit>
              <Box sx={{ px: 0.75, pt: 0.5, pb: 1 }}>
                {summaryCards}
              </Box>
            </Collapse>
          </CardContent>
        </Card>
      )}
      
      <Card sx={{ borderRadius: 1, ...getChartCardSx(theme), overflow: 'hidden', mt: 2 }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 0.75, py: 0, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
            <Tabs 
              value={summaryTab} 
              onChange={(_, v) => setSummaryTab(v)}
              sx={{
                minHeight: 40,
                '& .MuiTab-root': {
                  color: 'text.secondary',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  minHeight: 40,
                  py: 0.75,
                  gap: 0.5,
                  '&.Mui-selected': {
                    color: 'text.primary',
                    fontWeight: 800
                  }
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: 'primary.main',
                  height: 2,
                  borderRadius: '2px'
                }
              }}
            >
              <Tab label="Data Table" icon={<DeviceHubIcon sx={{ fontSize: 17 }} />} iconPosition="start" />
              <Tab label="Analytics Chart" icon={<OpacityIcon sx={{ fontSize: 17 }} />} iconPosition="start" />
              <Tab label="Summary Report" icon={<ScienceIcon sx={{ fontSize: 17 }} />} iconPosition="start" />
            </Tabs>
          </Box>
          
          <Box sx={{ p: 1, pt: 1.15 }}>
      {summaryTab === 0 && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>
                    Data Records
                  </Typography>
                  <Stack direction="row" spacing={0.75}>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={handleExportCSV}
                      sx={{
                        borderRadius: 1,
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.72rem',
                        py: 0.4,
                        px: 1.25,
                        minHeight: 30,
                        borderColor: theme.palette.primary.main,
                        color: theme.palette.primary.main,
                        '&:hover': {
                          backgroundColor: theme.palette.primary.main,
                          color: theme.palette.primary.contrastText,
                        }
                      }}
                    >
                      Export CSV
                    </Button>
                    <Button 
                      variant="contained" 
                      size="small" 
                      onClick={handleExportXLSX}
                      sx={{
                        borderRadius: 1,
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.72rem',
                        py: 0.4,
                        px: 1.25,
                        minHeight: 30,
                        background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #005577 0%, #006B9A 100%)',
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
                    bgcolor: 'background.paper',
                    backgroundImage: theme.palette.mode === 'light'
                      ? 'linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)'
                      : 'none',
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
                density="compact"
                rows={data.map((row, i) => ({ id: i, ...row }))}
                columns={columns}
                pageSize={10}
                rowsPerPageOptions={[10, 25, 50, 100]}
                disableRowSelectionOnClick
                sx={compactDataGridSx}
              />
            )}
              </Box>
      )}
            
      {summaryTab === 1 && (
              <Box>
                {loading ? (
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    minHeight: 320,
                    bgcolor: 'background.paper',
                    backgroundImage: theme.palette.mode === 'light'
                      ? 'linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)'
                      : 'none',
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
                  <Card sx={{ ...getChartCardSx(theme), p: 0 }}>
                    <CardContent sx={{ p: 1, pt: 1.25, '&:last-child': { pb: 1 } }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={data}
                  margin={{ ...CHART_MARGIN, bottom: 36, left: 4, right: 8, top: 8 }}
                >
                          <CartesianGrid {...CARTESIAN_GRID_PROPS} />
                          <XAxis
                            dataKey="_chartTime"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            tick={{ fontSize: 9, fill: theme.palette.text.secondary }}
                            tickMargin={6}
                            minTickGap={28}
                            angle={-32}
                            textAnchor="end"
                            height={48}
                            interval="preserveStartEnd"
                            tickFormatter={(ms) => {
                              if (ms == null || !Number.isFinite(ms)) return '';
                              return formatInUserTimezone(new Date(ms).toISOString(), 'MM/DD HH:mm');
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                            width={44}
                            domain={getYDomain()}
                          />
                          <ReTooltip
                            contentStyle={getTooltipContentStyle(theme)}
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
                            labelFormatter={(label) => {
                              if (typeof label === 'number' && Number.isFinite(label)) {
                                return formatInUserTimezone(new Date(label).toISOString());
                              }
                              if (label == null || label === '') return '';
                              /* Already-local display string from table pipeline — do not parse as UTC again */
                              if (typeof label === 'string' && !label.includes('T')) {
                                return label;
                              }
                              return formatInUserTimezone(label);
                            }}
                          />
                          <Legend
                            wrapperStyle={{ ...LEGEND_WRAPPER_STYLE, fontSize: 11, paddingTop: 4 }}
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
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 1 }}
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
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>
                    Summary Report
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
                    <FormControl size="small" sx={{ minWidth: 108 }}>
                      <InputLabel sx={{ fontSize: '0.75rem' }}>Aggregation</InputLabel>
                      <Select
                        value={aggregation}
                        label="Aggregation"
                        onChange={e => setAggregation(e.target.value)}
                        sx={{ fontSize: '0.75rem', minHeight: 32, '& .MuiSelect-select': { py: 0.65 } }}
                      >
                        {aggregationOptions.map(opt => (
                          <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.8rem' }}>{opt.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Button
                      variant="contained"
                      onClick={fetchSummaryTableData}
                      size="small"
                      sx={{ fontSize: '0.72rem', py: 0.4, px: 1.25, minHeight: 30, textTransform: 'none', fontWeight: 700 }}
                    >
                      Generate
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => exportToCSV(summaryTableData, summaryTableColumns, `summary-report_${aggregation}_${new Date().toISOString().slice(0, 10)}.csv`)}
                      disabled={!summaryTableData.length}
                      sx={{
                        fontSize: '0.72rem',
                        py: 0.4,
                        px: 1,
                        minHeight: 30,
                        textTransform: 'none',
                        fontWeight: 600,
                        borderColor: theme.palette.primary.main,
                        color: theme.palette.primary.main,
                      }}
                    >
                      Export CSV
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => exportToXLSX(summaryTableData, summaryTableColumns, `summary-report_${aggregation}_${new Date().toISOString().slice(0, 10)}.xlsx`)}
                      disabled={!summaryTableData.length}
                      sx={{
                        fontSize: '0.72rem',
                        py: 0.4,
                        px: 1,
                        minHeight: 30,
                        textTransform: 'none',
                        fontWeight: 600,
                        borderColor: theme.palette.primary.main,
                        color: theme.palette.primary.main,
                      }}
                    >
                      Export Excel
                    </Button>
                  </Box>
                </Box>
                {loadingSummary ? (
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    minHeight: 300,
                    bgcolor: 'background.paper',
                    backgroundImage: theme.palette.mode === 'light'
                      ? 'linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)'
                      : 'none',
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
                density="compact"
                rows={summaryTableData}
                columns={summaryTableColumns}
                pageSize={10}
                rowsPerPageOptions={[10, 25, 50]}
                disableRowSelectionOnClick
                sx={compactDataGridSx}
              />
                )}
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
      
      
      {!loading && data.length === 0 && (
        <Card sx={{ mt: 4, borderRadius: 1, ...getChartCardSx(theme) }}>
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