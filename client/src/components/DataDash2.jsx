import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Tabs, Tab, Card, CardContent, Grid, Select, MenuItem, InputLabel, FormControl, Button, CircularProgress, TextField, Checkbox, ListItemText, Divider, Chip
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DataGrid } from '@mui/x-data-grid';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import axios from 'axios';
import { API_BASE_URL } from "../config/api";
import { min as d3min, max as d3max } from 'd3-array';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, ChartTooltip, ChartLegend, TimeScale);

const aggregationOptions = [
  { label: 'Hourly', value: 'hour' },
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
];

export default function DataDash2() {
  const [tab, setTab] = useState(0); // 0: Table, 1: Graph, 2: Summary Table
  const [devices, setDevices] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [selectedParameters, setSelectedParameters] = useState([]);
  const [dateRange, setDateRange] = useState([null, null]);
  const [aggregation, setAggregation] = useState('day');
  const [data, setData] = useState([]);
  const [summaryTableData, setSummaryTableData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [visibleParams, setVisibleParams] = useState([]);

  // Load devices and parameters (mock for now)
  useEffect(() => {
    // Fetch devices
    const fetchDevices = async () => {
      try {
        const token = localStorage.getItem('iot_token');
        const res = await axios.get(`${API_BASE_URL}/devices`, { headers: { 'Authorization': `Bearer ${token}` } });
        setDevices(res.data.devices || []);
      } catch (e) { setDevices([]); }
    };
    // Fetch parameters (target fields)
    const fetchParameters = async () => {
      try {
        const token = localStorage.getItem('iot_token');
        const res = await axios.get(`${API_BASE_URL}/field-definitions`, { headers: { 'Authorization': `Bearer ${token}` } });
        setParameters((res.data.fields || []).map(f => f.field_name));
      } catch (e) { setParameters([]); }
    };
    fetchDevices();
    fetchParameters();
  }, []);

  // When selectedParameters change, reset visibleParams to all selectedParameters
  useEffect(() => {
    setVisibleParams(selectedParameters);
  }, [selectedParameters]);

  // Filter chips for active filters
  const filterChips = (
    <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {selectedDevices.length > 0 && selectedDevices.map(id => (
        <Chip key={id} label={devices.find(d => d.device_id === id)?.name || id} color="primary" size="small" />
      ))}
      {selectedParameters.length > 0 && selectedParameters.map(param => (
        <Chip key={param} label={param} color="secondary" size="small" />
      ))}
      {dateRange[0] && <Chip label={`From: ${dateRange[0].toLocaleDateString()}`} color="info" size="small" />}
      {dateRange[1] && <Chip label={`To: ${dateRange[1].toLocaleDateString()}`} color="info" size="small" />}
    </Box>
  );

  // Filter UI
  const filterControls = (
    <Box sx={{ mb: 2, fontFamily: 'Roboto Mono, monospace', fontSize: 13 }}>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Device(s)</InputLabel>
            <Select
              multiple
              value={selectedDevices}
              onChange={e => setSelectedDevices(e.target.value)}
              renderValue={selected => selected.map(id => devices.find(d => d.device_id === id)?.name).join(', ')}
            >
              {devices.map(device => (
                <MenuItem key={device.device_id} value={device.device_id}>
                  <Checkbox checked={selectedDevices.indexOf(device.device_id) > -1} />
                  <ListItemText primary={device.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Parameter(s)</InputLabel>
            <Select
              multiple
              value={selectedParameters}
              onChange={e => setSelectedParameters(e.target.value)}
              renderValue={selected => selected.join(', ')}
            >
              {parameters.map(param => (
                <MenuItem key={param} value={param}>
                  <Checkbox checked={selectedParameters.indexOf(param) > -1} />
                  <ListItemText primary={param} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="Start Date"
              value={dateRange[0]}
              onChange={date => setDateRange([date, dateRange[1]])}
              renderInput={params => <TextField {...params} fullWidth size="small" />}
            />
            <DatePicker
              label="End Date"
              value={dateRange[1]}
              onChange={date => setDateRange([dateRange[0], date])}
              renderInput={params => <TextField {...params} fullWidth size="small" sx={{ mt: 1 }} />}
            />
          </LocalizationProvider>
        </Grid>
      </Grid>
      <Box sx={{ mt: 2 }}>
        <Button variant="contained" size="small">Apply Filter</Button>
      </Box>
      {filterChips}
    </Box>
  );

  // Table columns
  const columns = [
    { field: 'timestamp', headerName: 'Timestamp', width: 160 },
    { field: 'device_name', headerName: 'Device', width: 120 },
    ...parameters.map(param => ({ field: param, headerName: param, width: 100 }))
  ];

  // Chart.js data for line chart
  const chartData = {
    labels: data.map(row => row.timestamp),
    datasets: parameters.map((param, idx) => ({
      label: param,
      data: data.map(row => row[param]),
      borderColor: `hsl(${(idx * 60) % 360}, 70%, 50%)`,
      backgroundColor: `hsla(${(idx * 60) % 360}, 70%, 50%, 0.2)`,
      tension: 0.4,
      pointRadius: 2,
      fill: false,
    })),
  };

  const baseChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top', labels: { font: { family: 'Roboto Mono, monospace', size: 13 } } },
      title: { display: true, text: 'Parameter Trends', font: { size: 16, family: 'Roboto Mono, monospace' } },
      tooltip: { mode: 'index', intersect: false, bodyFont: { family: 'Roboto Mono, monospace', size: 13 } },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    scales: {
      x: { type: 'category', title: { display: true, text: 'Timestamp', font: { family: 'Roboto Mono, monospace', size: 13 } }, ticks: { font: { family: 'Roboto Mono, monospace', size: 12 } } },
      y: { title: { display: true, text: 'Value', font: { family: 'Roboto Mono, monospace', size: 13 } }, ticks: { font: { family: 'Roboto Mono, monospace', size: 12 } } },
    },
  };

  // Calculate Y axis min/max for visible parameters
  const getYDomain = () => {
    if (!data.length || !visibleParams.length) return [undefined, undefined];
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
    if (minVal === Infinity || maxVal === -Infinity) return [undefined, undefined];
    if (minVal === maxVal) return [minVal - 1, maxVal + 1];
    return [minVal, maxVal];
  };

  // Chart.js options (update y-axis min/max for visible params)
  const [yMin, yMax] = getYDomain();
  const chartOptions = {
    ...baseChartOptions,
    scales: {
      ...baseChartOptions.scales,
      y: {
        ...baseChartOptions.scales?.y,
        min: yMin,
        max: yMax,
      },
    },
  };

  // Summary Table columns
  const summaryTableColumns = [
    { field: 'period', headerName: aggregation.charAt(0).toUpperCase() + aggregation.slice(1), width: 120, headerAlign: 'center', align: 'center' },
    ...parameters.flatMap(param => [
      { field: `${param}_max`, headerName: `${param} Max`, width: 100, headerAlign: 'center', align: 'center' },
      { field: `${param}_min`, headerName: `${param} Min`, width: 100, headerAlign: 'center', align: 'center' },
      { field: `${param}_avg`, headerName: `${param} Avg`, width: 100, headerAlign: 'center', align: 'center',
        renderCell: (params) => <span>{params.value?.toFixed ? params.value.toFixed(2) : params.value}</span> },
    ])
  ];

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
      setData(response.data.data || []);
    } catch (error) {
      setData([]);
    }
    setLoading(false);
  };

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
      setSummaryTableData(response.data.summaryTable || []);
    } catch (error) {
      setSummaryTableData([]);
    }
    setLoadingSummary(false);
  };

  useEffect(() => {
    fetchData();
    fetchSummaryTableData();
  }, [selectedDevices, selectedParameters, dateRange, aggregation]);

  return (
    <Box sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: 13, background: '#f7fafd', minHeight: '100vh', p: { xs: 1, md: 3 } }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, letterSpacing: 1 }}>Data Dash 2 (Chart.js)</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Table" />
        <Tab label="Graph" />
        <Tab label="Summary Table" />
      </Tabs>
      {filterControls}
      <Divider sx={{ my: 2 }} />
      {tab === 0 && (
        <Card sx={{ boxShadow: 2, borderRadius: 1 }}>
          <CardContent>
            {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}><CircularProgress /></Box> : (
              <DataGrid
                autoHeight
                rows={data.map((row, i) => ({ id: i, ...row }))}
                columns={columns}
                pageSize={10}
                rowsPerPageOptions={[10, 25, 50]}
                sx={{
                  fontFamily: 'Roboto Mono, monospace',
                  fontSize: 13,
                  '& .MuiDataGrid-row:nth-of-type(even)': { backgroundColor: '#f0f4fa' },
                  '& .MuiDataGrid-columnHeaders': { backgroundColor: '#e3eafc', fontWeight: 700 },
                  '& .MuiDataGrid-cell': { py: 0.5 },
                  '& .MuiDataGrid-footerContainer': { backgroundColor: '#e3eafc' },
                }}
              />
            )}
          </CardContent>
        </Card>
      )}
      {tab === 1 && (
        <Card sx={{ boxShadow: 2, borderRadius: 1 }}>
          <CardContent>
            {/* Parameter show/hide controls */}
            <Box mb={1} display="flex" flexWrap="wrap" gap={1}>
              {selectedParameters.map(param => (
                <Chip
                  key={param}
                  label={param}
                  color={visibleParams.includes(param) ? 'primary' : 'default'}
                  variant={visibleParams.includes(param) ? 'filled' : 'outlined'}
                  clickable
                  onClick={() => setVisibleParams(v => v.includes(param) ? v.filter(p => p !== param) : [...v, param])}
                  sx={{ fontSize: 13 }}
                />
              ))}
            </Box>
            {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}><CircularProgress /></Box> : (
              <Box sx={{ width: '100%', height: 400 }}>
                <Line data={{
                  ...chartData,
                  datasets: chartData.datasets.filter(ds => visibleParams.includes(ds.label)),
                }} options={chartOptions} height={400} />
              </Box>
            )}
          </CardContent>
        </Card>
      )}
      {tab === 2 && (
        <Card sx={{ boxShadow: 2, borderRadius: 1 }}>
          <CardContent>
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Aggregation:</Typography>
              <FormControl size="small">
                <Select value={aggregation} onChange={e => setAggregation(e.target.value)}>
                  {aggregationOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            {loadingSummary ? <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}><CircularProgress /></Box> : (
              <DataGrid
                autoHeight
                rows={summaryTableData.map((row, i) => ({ id: i, ...row }))}
                columns={summaryTableColumns}
                pageSize={10}
                rowsPerPageOptions={[10, 25, 50]}
                sx={{
                  fontFamily: 'Roboto Mono, monospace',
                  fontSize: 13,
                  '& .MuiDataGrid-row:nth-of-type(even)': { backgroundColor: '#f0f4fa' },
                  '& .MuiDataGrid-columnHeaders': { backgroundColor: '#e3eafc', fontWeight: 700 },
                  '& .MuiDataGrid-cell': { py: 0.5 },
                  '& .MuiDataGrid-footerContainer': { backgroundColor: '#e3eafc' },
                }}
              />
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
} 