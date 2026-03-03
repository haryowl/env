import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Grid,
  Alert,
  CircularProgress,
  TextField,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ShowChart as ShowChartIcon,
  TableChart as TableChartIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import { API_BASE_URL } from '../config/api';
import moment from 'moment-timezone';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { CHART_CARD_SX, CHART_MARGIN, CARTESIAN_GRID_PROPS, AXIS_TICK_STYLE, CHART_COLORS } from '../utils/chartStyles';

const DataViewer = () => {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [timeRange, setTimeRange] = useState('24h');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState(0); // 0: Charts, 1: Table
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      loadData();
    }
  }, [selectedDevice, timeRange, customStartDate, customEndDate]);

  const loadDevices = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadData = async () => {
    if (!selectedDevice) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('iot_token');
      const params = new URLSearchParams({
        device_id: selectedDevice,
        time_range: timeRange,
      });

      if (timeRange === 'custom' && customStartDate && customEndDate) {
        params.append('start_date', customStartDate);
        params.append('end_date', customEndDate);
      }

      const response = await fetch(`${API_BASE_URL}/data?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setData(data.data || []);
        setError('');
      } else {
        setError('Failed to load data');
      }
    } catch (error) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadData();
  };

  const processChartData = () => {
    const sensorData = data.filter(d => d.data_type === 'sensor');
    const gpsData = data.filter(d => d.data_type === 'gps');

    // Process sensor data for charts
    const chartData = sensorData.map(record => {
      const chartPoint = {
        timestamp: new Date(record.timestamp).toLocaleString(),
        time: new Date(record.timestamp).getTime(),
      };

      // Add all sensor fields to the chart point
      Object.keys(record.data).forEach(key => {
        const value = record.data[key];
        if (typeof value === 'number') {
          chartPoint[key] = value;
        }
      });

      return chartPoint;
    });

    return { chartData, sensorData, gpsData };
  };

  const { chartData, sensorData, gpsData } = processChartData();

  const getFieldNames = () => {
    if (sensorData.length === 0) return [];
    
    const fields = new Set();
    sensorData.forEach(record => {
      Object.keys(record.data).forEach(key => {
        if (typeof record.data[key] === 'number') {
          fields.add(key);
        }
      });
    });
    
    return Array.from(fields);
  };

  const fieldNames = getFieldNames();
  const colors = CHART_COLORS;

  const renderSensorCharts = () => {
    if (sensorData.length === 0) {
      return (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">No sensor data available</Typography>
        </Box>
      );
    }

    return (
      <Grid container spacing={3}>
        <Grid size={{ xs: 12 }}>
          <Card sx={CHART_CARD_SX}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Sensor Data Over Time
              </Typography>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid {...CARTESIAN_GRID_PROPS} />
                  <XAxis dataKey="timestamp" tick={AXIS_TICK_STYLE} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={AXIS_TICK_STYLE} />
                  <Tooltip />
                  <Legend />
                  {fieldNames.map((field, index) => (
                    <Line
                      key={field}
                      type="monotone"
                      dataKey={field}
                      stroke={colors[index % colors.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={CHART_CARD_SX}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Latest Values
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.slice(-5)} margin={CHART_MARGIN}>
                  <CartesianGrid {...CARTESIAN_GRID_PROPS} />
                  <XAxis dataKey="timestamp" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} />
                  <Tooltip />
                  <Legend />
                  {fieldNames.slice(0, 3).map((field, index) => (
                    <Bar
                      key={field}
                      dataKey={field}
                      fill={colors[index % colors.length]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={CHART_CARD_SX}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Data Distribution
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={fieldNames.map((field, index) => ({
                      name: field,
                      value: sensorData.length,
                    }))}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name }) => name}
                  >
                    {fieldNames.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  const renderDataTable = () => {
    return (
      <Card sx={CHART_CARD_SX}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Raw Data
          </Typography>
          <TableContainer component={Paper} sx={{ borderRadius: 1.5, overflow: 'hidden' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Device</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Data</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      No data available
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((record, index) => (
                    <TableRow key={`${record.device_id}-${record.timestamp}-${index}`}>
                      <TableCell>
                        {formatInUserTimezone(record.timestamp)}
                      </TableCell>
                      <TableCell>{record.device_name}</TableCell>
                      <TableCell>
                        <Chip 
                          label={record.data_type} 
                          color={record.data_type === 'sensor' ? 'primary' : 'secondary'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box component="pre" sx={{ fontSize: '0.75rem', m: 0 }}>
                          {JSON.stringify(record.data, null, 2)}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Data Visualization</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3, borderRadius: 1, ...CHART_CARD_SX }}>
        <CardContent sx={{ p: 1.5 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControl fullWidth>
                <InputLabel>Select Device</InputLabel>
                <Select
                  value={selectedDevice || ''}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  label="Select Device"
                >
                  {devices.map((device) => (
                    <MenuItem key={device.device_id} value={device.device_id}>
                      {device.name} ({device.device_id})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <FormControl fullWidth>
                <InputLabel>Time Range</InputLabel>
                <Select
                  value={timeRange || ''}
                  onChange={(e) => setTimeRange(e.target.value)}
                  label="Time Range"
                >
                  <MenuItem value="1h">Last Hour</MenuItem>
                  <MenuItem value="24h">Last 24 Hours</MenuItem>
                  <MenuItem value="7d">Last 7 Days</MenuItem>
                  <MenuItem value="30d">Last 30 Days</MenuItem>
                  <MenuItem value="custom">Custom Range</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {timeRange === 'custom' && (
              <>
                <Grid size={{ xs: 12, sm: 2 }}>
                  <TextField
                    fullWidth
                    type="datetime-local"
                    label="Start Date"
                    value={customStartDate || ''}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 2 }}>
                  <TextField
                    fullWidth
                    type="datetime-local"
                    label="End Date"
                    value={customEndDate || ''}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </>
            )}
            <Grid size={{ xs: 12, sm: 1 }}>
              <Button
                variant="contained"
                onClick={handleRefresh}
                disabled={loading || !selectedDevice}
                fullWidth
              >
                {loading ? <CircularProgress size={20} /> : 'Load'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {selectedDevice && (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={viewMode} onChange={(e, newValue) => setViewMode(newValue)}>
              <Tab 
                icon={<ShowChartIcon />} 
                label="Charts" 
                iconPosition="start"
              />
              <Tab 
                icon={<TableChartIcon />} 
                label="Table" 
                iconPosition="start"
              />
            </Tabs>
          </Box>

          {viewMode === 0 ? renderSensorCharts() : renderDataTable()}
        </>
      )}

      {!selectedDevice && (
        <Card sx={CHART_CARD_SX}>
          <CardContent>
            <Box textAlign="center" py={4}>
              <ShowChartIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Select a device to view data
              </Typography>
              <Typography color="text.secondary">
                Choose a device from the dropdown above to start visualizing data
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default DataViewer; 