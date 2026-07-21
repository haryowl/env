import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Tabs, Tab, Card, CardContent, Grid, Select, MenuItem, InputLabel, FormControl, Button, CircularProgress, Checkbox, ListItemText, Divider, Chip, Tooltip, useTheme, Stack, Collapse, IconButton, useMediaQuery
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { DatePicker, LocalizationProvider, DateTimePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DataGrid } from '@mui/x-data-grid';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { getChartCardSx, CHART_MARGIN, CARTESIAN_GRID_PROPS, getTooltipContentStyle, LEGEND_WRAPPER_STYLE, getParameterColor as getChartParamColor } from '../utils/chartStyles';
import { formatInUserTimezone } from '../utils/timezoneUtils';
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
import { alpha } from '@mui/material/styles';
import SectionHeader from './SectionHeader';
import { filterDataViewParams } from '../utils/fieldCategory';

/** Match Layout.jsx sidebar: section labels ~0.875rem/500, items ~0.8125rem */
// Aligned with N-Dashboard compact typography (see utils/compactUi.js)
const DATA_DASH_MENU_ITEM_FS = '0.75rem';
const DATA_DASH_SECTION_FS = '0.82rem';

// Use shared timezone formatter (handles values with/without explicit TZ info)

/** Grouped summary row: read `${param}_max` etc.; keeps 0 and negatives (no `||` fallback). */
function pickSummaryStatNumber(row, param, stat) {
  const tryKey = (key) => {
    const raw = row[key];
    if (raw === null || raw === undefined || raw === '') return NaN;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };
  const primary = tryKey(`${param}_${stat}`);
  if (Number.isFinite(primary)) return primary;
  return tryKey(param);
}

function toChartAxisNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

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
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const { metadata: fieldMetadata, formatDisplayName, getUnit } = useFieldMetadata();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

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
    setParameters(filterDataViewParams(Object.keys(fieldMetadata), fieldMetadata));
  }, [fieldMetadata, selectedDevices]);

  // Fetch device mapper when device changes
  useEffect(() => {
    if (selectedDevices.length === 1) {
      const fetchMapper = async () => {
        try {
          const token = localStorage.getItem('iot_token');
          const res = await axios.get(`${API_BASE_URL}/device-mapper-assignments/${selectedDevices[0]}`, { headers: { 'Authorization': `Bearer ${token}` } });
          setDeviceMapper(res.data.assignment);
          setParameters(
            filterDataViewParams(
              res.data.assignment.mappings.map((m) => m.target_field),
              fieldMetadata
            )
          );
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
  }, [selectedDevices, fieldMetadata]);

  // When parameters or selectedParameters change, reset visibleParams to all selectedParameters
  useEffect(() => {
    setVisibleParams(selectedParameters);
  }, [selectedParameters]);

  const hasActiveFilters =
    selectedDevices.length > 0 && selectedParameters.length > 0;

  // Fetch real data from backend (Apply Filters only — no mount fetch)
  const fetchData = async () => {
    if (!hasActiveFilters) {
      setData([]);
      setSummary({});
      return;
    }
    setLoading(true);
    try {
      const params = {
        deviceIds: selectedDevices.join(','),
        parameters: selectedParameters.join(','),
        startDate: dateRange[0] ? dateRange[0].toISOString() : undefined,
        endDate: dateRange[1] ? dateRange[1].toISOString() : undefined,
        limit: 10000,
        excludeCategories: 'Status',
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
            // Data Time should reflect device-provided datetime when available.
            // Do not silently fall back to server timestamp (can differ vs device time by ~1h+).
            datetime: row.datetime != null && row.datetime !== '' ? formatInUserTimezone(row.datetime) : '-',
            timestamp: formatInUserTimezone(row.timestamp),
          };
        })
        .sort((a, b) => a._chartTime - b._chartTime);
      setData(formattedData);
      setSummary(response.data.summary || {});
      setLastUpdated(new Date());
      // Collapse the filter panel on desktop after a successful apply to give the data more room.
      if (isDesktop && formattedData.length > 0) setFiltersExpanded(false);
    } catch (error) {
      setData([]);
      setSummary({});
    }
    setLoading(false);
  };

  const handleResetFilters = () => {
    setSelectedDevices([]);
    setSelectedParameters([]);
    setDateRange([null, null]);
    setData([]);
    setSummary({});
    setSummaryTableData([]);
    setLastUpdated(null);
    setFiltersExpanded(true);
  };

  // Fetch summary table data and transform to time-period + parameter format
  const fetchSummaryTableData = async () => {
    if (!hasActiveFilters) {
      setSummaryTableData([]);
      return;
    }
    setLoadingSummary(true);
    try {
      const params = {
        deviceIds: selectedDevices.join(','),
        parameters: selectedParameters.join(','),
        startDate: dateRange[0] ? dateRange[0].toISOString() : undefined,
        endDate: dateRange[1] ? dateRange[1].toISOString() : undefined,
        groupBy: aggregation,
        limit: 100000,
        export: true,
        excludeCategories: 'Status',
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
          const maxValue = pickSummaryStatNumber(row, param, 'max');
          const minValue = pickSummaryStatNumber(row, param, 'min');
          const avgValue = pickSummaryStatNumber(row, param, 'avg');
          
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

  // Fetch summary table data when aggregation or filters change (summary tab only)
  useEffect(() => {
    if (summaryTab === 2 && hasActiveFilters) fetchSummaryTableData();
    // eslint-disable-next-line
  }, [aggregation, selectedDevices, selectedParameters, dateRange, summaryTab, hasActiveFilters]);

  // Fetch up to ~1 month of data for export (high limit), then export CSV/XLSX
  const fetchDataForExport = async () => {
    if (!hasActiveFilters) return [];
    const params = {
      deviceIds: selectedDevices.join(','),
      parameters: selectedParameters.join(','),
      startDate: dateRange[0] ? dateRange[0].toISOString() : undefined,
      endDate: dateRange[1] ? dateRange[1].toISOString() : undefined,
      limit: 100000,
      export: true,
      excludeCategories: 'Status',
    };
    const token = localStorage.getItem('iot_token');
    const response = await axios.get(`${API_BASE_URL}/data-dash`, {
      params,
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const raw = response.data.data || [];
    return raw.map(row => ({
      ...row,
      datetime: row.datetime != null && row.datetime !== '' ? formatInUserTimezone(row.datetime) : '-',
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

  /** Match Devices/Parameters Select row height (32px) — DateTimePicker adornment often stretches default TextField */
  const dataDashDateTimeFieldSx = {
    '& .MuiInputLabel-root': {
      fontSize: '0.78rem',
    },
    '& .MuiInputLabel-root:not(.MuiInputLabel-shrink)': {
      transform: 'translate(12px, 7px) scale(1)',
    },
    '& .MuiInputBase-root': {
      height: 32,
      minHeight: 32,
      maxHeight: 32,
      boxSizing: 'border-box',
      alignItems: 'center',
      borderRadius: 1.5,
    },
    '& .MuiInputBase-input, & .MuiOutlinedInput-input': {
      py: '5px',
      px: '10px',
      pr: '4px',
      fontSize: DATA_DASH_MENU_ITEM_FS,
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
    <Card
      sx={{
        mb: 1.5,
        borderRadius: 1,
        ...getChartCardSx(theme),
        p: 0,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        overflow: 'hidden',
        background: alpha(theme.palette.background.paper, 0.5),
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 4px 18px rgba(0,0,0,0.35)'
            : '0 4px 18px rgba(15, 23, 42, 0.08)',
      }}
    >
      <Box onClick={() => setFiltersExpanded((v) => !v)} sx={{ cursor: 'pointer' }}>
        <SectionHeader
          compact
          icon={<DeviceHubIcon sx={{ fontSize: 16 }} />}
          title="Data Filters"
          subtitle={
            filtersExpanded
              ? 'Select devices, parameters, and time range'
              : `${selectedDevices.length} device(s) · ${selectedParameters.length} parameter(s)${dateRange[0] || dateRange[1] ? ' · custom range' : ''}`
          }
          right={(
            <IconButton
              size="small"
              sx={{
                color: theme.palette.primary.main,
                transition: 'transform 0.2s ease-in-out',
                transform: filtersExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
          )}
          sx={{ bgcolor: alpha(theme.palette.background.paper, 0.5) }}
          titleSx={{ fontSize: DATA_DASH_SECTION_FS, fontWeight: 700 }}
          subtitleSx={{ fontSize: '0.72rem', fontWeight: 400 }}
        />
      </Box>
      <Collapse in={filtersExpanded} timeout="auto">
      <CardContent sx={{ p: 1, pt: 1, pb: 1 }}>
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
              <FormControl fullWidth variant="outlined" size="small" sx={{ width: '100%', maxWidth: '100%', minWidth: 0, '& .MuiInputBase-root': { minHeight: 32 }, '& .MuiInputLabel-root': { fontSize: '0.78rem' } }}>
                <InputLabel id="dd-devices-label">Devices</InputLabel>
            <Select
              multiple
              labelId="dd-devices-label"
              label="Devices"
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
                      fontSize: DATA_DASH_MENU_ITEM_FS,
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
                      <ListItemText primary={device.name} primaryTypographyProps={{ sx: { fontSize: DATA_DASH_MENU_ITEM_FS } }} sx={{ color: theme.palette.text.primary + ' !important' }} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
            </Box>

          <Box sx={{ position: 'relative', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <FormControl fullWidth variant="outlined" size="small" sx={{ width: '100%', maxWidth: '100%', minWidth: 0, '& .MuiInputBase-root': { minHeight: 32 }, '& .MuiInputLabel-root': { fontSize: '0.78rem' } }}>
                <InputLabel id="dd-parameters-label">Parameters</InputLabel>
            <Select
              multiple
              labelId="dd-parameters-label"
              label="Parameters"
              value={selectedParameters}
              onChange={e => setSelectedParameters(e.target.value)}
              renderValue={selected => (
                <Box sx={{ display: 'flex', gap: 0.4, overflow: 'hidden', alignItems: 'center' }}>
                  {selected.map(param => (
                    <Chip
                      key={param}
                      label={formatDisplayName(param, { withUnit: true })}
                      size="small"
                      onMouseDown={(e) => e.stopPropagation()}
                      onDelete={() => setSelectedParameters(selectedParameters.filter(p => p !== param))}
                      sx={{
                        height: 20,
                        fontSize: '0.64rem',
                        fontWeight: 600,
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                        color: 'text.primary',
                        flexShrink: 0,
                        '& .MuiChip-label': { px: 0.75 },
                        '& .MuiChip-deleteIcon': { fontSize: 13, m: 0, mr: 0.25 },
                      }}
                    />
                  ))}
                </Box>
              )}
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
                      fontSize: DATA_DASH_MENU_ITEM_FS,
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
                      <ListItemText primary={label} primaryTypographyProps={{ sx: { fontSize: DATA_DASH_MENU_ITEM_FS } }} sx={{ color: theme.palette.text.primary + ' !important' }} />
                </MenuItem>
              );
            })}
            </Select>
          </FormControl>
            </Box>

          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box sx={{ position: 'relative', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <DateTimePicker
                label="Start Date & Time"
                value={dateRange[0]}
                onChange={date => setDateRange([date, dateRange[1]])}
                slotProps={{ textField: { fullWidth: true, size: 'small', sx: dataDashDateTimeFieldSx } }}
              />
            </Box>
            <Box sx={{ position: 'relative', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <DateTimePicker
                label="End Date & Time"
                value={dateRange[1]}
                onChange={date => setDateRange([dateRange[0], date])}
                slotProps={{ textField: { fullWidth: true, size: 'small', sx: dataDashDateTimeFieldSx } }}
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
              gap: 0.75,
              pb: { md: '1px' },
            }}
          >
            <Button
              variant="contained"
              onClick={fetchData}
              size="small"
              fullWidth
              disabled={!hasActiveFilters}
              sx={{
                borderRadius: 1,
                px: 2,
                py: 0.65,
                minHeight: 34,
                fontSize: DATA_DASH_MENU_ITEM_FS,
                fontWeight: 600,
                textTransform: 'none',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.18)',
                width: { xs: '100%', md: 'auto' },
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.22)',
                },
              }}
            >
              Apply
            </Button>
            <Tooltip title="Reset all filters">
              <span>
                <IconButton
                  size="small"
                  onClick={handleResetFilters}
                  sx={{
                    minHeight: 34,
                    width: 34,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    '&:hover': { color: theme.palette.error.main, borderColor: theme.palette.error.main },
                  }}
                >
                  <RestartAltIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
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
                fontSize: DATA_DASH_MENU_ITEM_FS,
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
                  onDelete={() => setSelectedDevices(selectedDevices.filter(d => d !== id))}
                  sx={{ 
                    borderRadius: 1,
                    fontWeight: 600,
                    fontSize: DATA_DASH_MENU_ITEM_FS,
                    height: 24,
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
                  onDelete={() => setSelectedParameters(selectedParameters.filter(p => p !== param))}
                  sx={{ 
                    borderRadius: 1,
                    fontWeight: 600,
                    fontSize: DATA_DASH_MENU_ITEM_FS,
                    height: 24,
                    '& .MuiChip-label': {
                      px: 0.85,
                    },
                  }}
                />
              ))}
              {dateRange[0] && <Chip 
                label={`From: ${formatInUserTimezone(dateRange[0].toISOString())}`} 
                color="info" 
                size="small"
                onDelete={() => setDateRange([null, dateRange[1]])}
                sx={{ 
                  borderRadius: 1,
                  fontWeight: 600,
                  fontSize: DATA_DASH_MENU_ITEM_FS,
                  height: 24,
                  '& .MuiChip-label': {
                    px: 0.85,
                  },
                }}
              />}
              {dateRange[1] && <Chip 
                label={`To: ${formatInUserTimezone(dateRange[1].toISOString())}`} 
                color="info" 
                size="small"
                onDelete={() => setDateRange([dateRange[0], null])}
                sx={{ 
                  borderRadius: 1,
                  fontWeight: 600,
                  fontSize: DATA_DASH_MENU_ITEM_FS,
                  height: 24,
                  '& .MuiChip-label': {
                    px: 0.85,
                  },
                }}
              />}
            </Box>
    </Box>
        )}
      </CardContent>
      </Collapse>
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
      bgcolor: theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.06)' : 'rgba(248,250,252,1)',
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
        headerAlign: 'right',
        align: 'right',
        valueFormatter: (value) => formatParameterValue(param, value?.value),
        renderCell: (params) => (
          <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.72rem', lineHeight: 1.35, fontVariantNumeric: 'tabular-nums' }}>
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

  // Data Summary — pastel KPI cards matching the reference design:
  // fully tinted card, uppercase title, large dark avg value + unit, min/max footer strip.
  const KPI_ACCENTS = ['#F97316', '#10B981', '#0D9488', '#D97706', '#3B82F6', '#8B5CF6'];
  const summaryParams = parameters.filter((param) => summary[param]);
  const summaryCards = (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1 }}>
      {summaryParams.map((param, idx) => {
        const accent = KPI_ACCENTS[idx % KPI_ACCENTS.length];
        const isDark = theme.palette.mode === 'dark';
        return (
        <Card
          key={param}
          sx={{
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: alpha(accent, 0.2),
            bgcolor: alpha(accent, isDark ? 0.16 : 0.09),
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'none',
            overflow: 'hidden',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 6px 16px ${alpha(accent, 0.2)}` },
          }}
        >
          <Box sx={{ p: 1.25, pb: 1 }}>
            <Typography
              sx={{
                fontWeight: 700,
                color: isDark ? 'text.secondary' : alpha('#1E293B', 0.75),
                fontSize: '0.66rem',
                lineHeight: 1.25,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                mb: 0.75,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {formatDisplayName(param, { withUnit: false })}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6 }}>
              <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 800, color: 'text.primary', lineHeight: 1.05 }}>
                {formatParameterValue(param, summary[param].avg, 2, false)}
              </Typography>
              <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary' }}>
                {[getUnit(param), 'avg'].filter(Boolean).join(' ')}
              </Typography>
            </Box>
          </Box>
          <Box
            sx={{
              mt: 'auto',
              px: 1.25,
              py: 0.6,
              bgcolor: alpha(accent, isDark ? 0.22 : 0.12),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, minWidth: 0 }}>
              <TrendingDownIcon sx={{ fontSize: 13, color: isDark ? '#F87171' : '#B91C1C', flexShrink: 0 }} />
              <Typography component="span" noWrap sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.primary' }}>
                Min: {formatParameterValue(param, summary[param].min, 2, false)}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ borderColor: alpha(accent, 0.35) }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, minWidth: 0 }}>
              <TrendingUpIcon sx={{ fontSize: 13, color: isDark ? '#4ADE80' : '#047857', flexShrink: 0 }} />
              <Typography component="span" noWrap sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.primary' }}>
                Max: {formatParameterValue(param, summary[param].max, 2, false)}
              </Typography>
            </Box>
          </Box>
        </Card>
        );
      })}
    </Box>
  );

  // Calculate Y axis min/max for visible parameters
  const getYDomain = () => {
    if (!data.length || !visibleParams.length) return [0, 'auto'];
    let minVal = Infinity, maxVal = -Infinity;
    for (const param of visibleParams) {
      for (const row of data) {
        const nv = toChartAxisNumber(row[param]);
        if (nv != null) {
          if (nv < minVal) minVal = nv;
          if (nv > maxVal) maxVal = nv;
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
      {filterControls}
      
      {!loading && data.length > 0 && (
        <Card sx={{ mt: 1.5, borderRadius: 1, ...getChartCardSx(theme) }}>
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
      
      <Card sx={{ borderRadius: 1, ...getChartCardSx(theme), overflow: 'hidden', mt: 1.5 }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 0.75, py: 0, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
            <Tabs 
              value={summaryTab} 
              onChange={(_, v) => setSummaryTab(v)}
              sx={{
                minHeight: 36,
                '& .MuiTab-root': {
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  minHeight: 36,
                  py: 0.75,
                  px: 1.5,
                  gap: 0.5,
                  transition: 'color 0.15s ease',
                  '&:hover': {
                    color: theme.palette.primary.main,
                  },
                  '&.Mui-selected': {
                    color: theme.palette.primary.main,
                    fontWeight: 700,
                  }
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: 'primary.main',
                  height: 2.5,
                  borderRadius: '2px 2px 0 0'
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>
                      Data Records
                    </Typography>
                    {data.length > 0 && (
                      <Chip
                        label={`${data.length.toLocaleString()} records`}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          bgcolor: alpha(theme.palette.primary.main, 0.1),
                          color: theme.palette.primary.main,
                          '& .MuiChip-label': { px: 0.85 },
                        }}
                      />
                    )}
                    {lastUpdated && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
                        <AccessTimeIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                        <Typography component="span" sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                          Updated {lastUpdated.toLocaleTimeString()}
                        </Typography>
                      </Box>
                    )}
                  </Box>
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
        <Card sx={{ mt: 2, borderRadius: 1, ...getChartCardSx(theme) }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <DeviceHubIcon sx={{ fontSize: 64, mb: 1.5, color: 'rgba(107, 70, 193, 0.3)' }} />
            <Typography variant="h6" sx={{ color: theme.palette.text.secondary, mb: 1, fontSize: '1rem', fontWeight: 700 }}>
              {hasActiveFilters ? 'No Data Available' : 'Start by choosing filters'}
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
              {hasActiveFilters
                ? 'No data found for the selected filters. Try adjusting your criteria.'
                : 'Select at least one device and one parameter above, then press Apply.'}
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
} 