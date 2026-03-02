import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Tabs,
  Tab,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
  OutlinedInput
} from '@mui/material';
import {
  DataGrid,
  GridActionsCellItem
} from '@mui/x-data-grid';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Sensors as SensorIcon,
  LocationOn as LocationIcon,
  Person as PersonIcon,
  DeviceHub as DeviceIcon,
  Science as ScienceIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import axios from 'axios';

const SensorManagement = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sensorDatabase, setSensorDatabase] = useState([]);
  const [sensorSites, setSensorSites] = useState([]);
  const [sites, setSites] = useState([]);
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceParameters, setDeviceParameters] = useState([]);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('add'); // 'add' or 'edit'
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Get auth token from localStorage
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const [sensorDbRes, sensorSitesRes, sitesRes, usersRes, devicesRes] = await Promise.all([
        axios.get('/api/sensor-database', { headers }),
        axios.get('/api/sensor-sites', { headers }),
        axios.get('/api/sites', { headers }),
        axios.get('/api/users/dropdown', { headers }),
        axios.get('/api/devices/dropdown', { headers })
      ]);

      console.log('Sensor Database:', sensorDbRes.data);
      console.log('Sensor Sites:', sensorSitesRes.data);
      console.log('Sites:', sitesRes.data);
      console.log('Users:', usersRes.data);
      console.log('Devices:', devicesRes.data);
      
      // Debug: Check if data is being set correctly
      console.log('Setting users:', Array.isArray(usersRes.data) ? usersRes.data : []);
      console.log('Setting devices:', Array.isArray(devicesRes.data) ? devicesRes.data : []);

      setSensorDatabase(Array.isArray(sensorDbRes.data) ? sensorDbRes.data : []);
      setSensorSites(Array.isArray(sensorSitesRes.data) ? sensorSitesRes.data : []);
      setSites(Array.isArray(sitesRes.data) ? sitesRes.data : []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setDevices(Array.isArray(devicesRes.data) ? devicesRes.data : []);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load sensor management data: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const loadDeviceParameters = async (deviceId) => {
    if (!deviceId) {
      setDeviceParameters([]);
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const response = await axios.get(`/api/devices/${deviceId}`, { headers });
      const device = response.data;
      
      // Extract parameters from field_mappings or config
      let parameters = [];
      if (device.field_mappings) {
        if (typeof device.field_mappings === 'string') {
          const mappings = JSON.parse(device.field_mappings);
          parameters = Object.keys(mappings);
        } else if (typeof device.field_mappings === 'object') {
          parameters = Object.keys(device.field_mappings);
        }
      }
      
      // If no field_mappings, try to get from config
      if (parameters.length === 0 && device.config) {
        if (typeof device.config === 'string') {
          const config = JSON.parse(device.config);
          if (config.parameters) {
            parameters = config.parameters;
          }
        } else if (typeof device.config === 'object' && device.config.parameters) {
          parameters = device.config.parameters;
        }
      }
      
      // If still no parameters, use common sensor parameters
      if (parameters.length === 0) {
        parameters = ['temperature', 'humidity', 'pressure', 'voltage', 'current', 'power', 'status'];
      }
      
      setDeviceParameters(parameters);
    } catch (error) {
      console.error('Error loading device parameters:', error);
      // Fallback to common parameters
      setDeviceParameters(['temperature', 'humidity', 'pressure', 'voltage', 'current', 'power', 'status']);
    }
  };

  const handleAdd = () => {
    setDialogMode('add');
    setEditingItem(null);
    setFormData({});
    setError(null);
    setDialogOpen(true);
  };

  const handleEdit = (item) => {
    setDialogMode('edit');
    setEditingItem(item);
    
    // Handle both sensor database and sensor sites data structures
    if (activeTab === 0) {
      // Sensor Database editing
      setFormData({
        brand_name: item.brand_name || '',
        sensor_type: item.sensor_type || '',
        sensor_parameter: item.sensor_parameter || '',
        description: item.description || '',
        specifications: item.specifications || ''
      });
    } else {
      // Sensor Sites editing
      setFormData({
        name: item.name || '',
        sensor_db_id: item.sensor_db_id || '',
        site_id: item.site_id || '',
        user_ids: item.user_ids ? (Array.isArray(item.user_ids) ? item.user_ids : [item.user_ids]) : [],
        device_id: item.device_id || '',
        parameter: item.parameter || '',
        status: item.status || 'active'
      });
      
      // Load device parameters if device is selected
      if (item.device_id) {
        loadDeviceParameters(item.device_id);
      }
    }
    
    setError(null);
    setDialogOpen(true);
  };

  const handleDelete = async (id, type) => {
    if (!window.confirm(`Are you sure you want to delete this ${type}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const endpoint = type === 'sensor' ? `/api/sensor-database/${id}` : `/api/sensor-sites/${id}`;
      await axios.delete(endpoint, { headers });
      loadData();
    } catch (error) {
      console.error(`Error deleting ${type}:`, error);
      setError(`Failed to delete ${type}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      // Prepare form data - handle both single sensor and sensor site modes
      let submitData = { ...formData };
      
      // For sensor sites, ensure user_ids is an array
      if (activeTab === 1 && formData.user_ids) {
        submitData.user_ids = Array.isArray(formData.user_ids) ? formData.user_ids : [formData.user_ids];
      }
      
      const endpoint = activeTab === 0 
        ? (dialogMode === 'add' ? '/api/sensor-database' : `/api/sensor-database/${editingItem.sensor_db_id}`)
        : (dialogMode === 'add' ? '/api/sensor-sites' : `/api/sensor-sites/${editingItem.sensor_site_id}`);

      const method = dialogMode === 'add' ? 'post' : 'put';
      
      await axios[method](endpoint, submitData, { headers });
      setDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Error submitting form:', error);
      setError(error.response?.data?.error || `Failed to ${dialogMode} ${activeTab === 0 ? 'sensor' : 'sensor site'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'green': return 'success';
      case 'yellow': return 'warning';
      case 'red': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'green': return <CheckCircleIcon />;
      case 'yellow': return <WarningIcon />;
      case 'red': return <ErrorIcon />;
      default: return <WarningIcon />;
    }
  };

  // Sensor Database columns
  const sensorColumns = [
    { field: 'sensor_db_id', headerName: 'ID', width: 80 },
    { field: 'brand_name', headerName: 'Brand', width: 120 },
    { field: 'sensor_type', headerName: 'Type', width: 150 },
    { field: 'sensor_parameter', headerName: 'Parameter', width: 150 },
    { field: 'description', headerName: 'Description', width: 200, flex: 1 },
    { 
      field: 'specifications', 
      headerName: 'Specifications', 
      width: 200, 
      flex: 1,
      renderCell: (params) => {
        if (!params.value) return 'N/A';
        try {
          const specs = typeof params.value === 'string' ? JSON.parse(params.value) : params.value;
          return specs.specs || JSON.stringify(specs);
        } catch (e) {
          return String(params.value);
        }
      }
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 100,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<EditIcon />}
          label="Edit"
          onClick={() => handleEdit(params.row)}
        />,
        <GridActionsCellItem
          icon={<DeleteIcon />}
          label="Delete"
          onClick={() => handleDelete(params.row.sensor_db_id, 'sensor')}
        />
      ]
    }
  ];

  // Sensor Sites columns
  const sensorSitesColumns = [
    { field: 'sensor_site_id', headerName: 'ID', width: 80 },
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'brand_name', headerName: 'Brand', width: 120 },
    { field: 'sensor_type', headerName: 'Type', width: 120 },
    { field: 'sensor_parameter', headerName: 'Parameter', width: 130 },
    { field: 'site_name', headerName: 'Site', width: 120 },
    { 
      field: 'usernames', 
      headerName: 'Users', 
      width: 150,
      renderCell: (params) => {
        if (!params.value || params.value.length === 0) return 'No users';
        if (typeof params.value === 'string') {
          return params.value; // Single user case
        }
        if (Array.isArray(params.value)) {
          return params.value.join(', '); // Multiple users case
        }
        return 'No users';
      }
    },
    { field: 'device_name', headerName: 'Device', width: 120 },
    { field: 'parameter', headerName: 'Device Param', width: 120 },
    {
      field: 'status_color',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Chip
          icon={getStatusIcon(params.value)}
          label={params.value}
          color={getStatusColor(params.value)}
          size="small"
        />
      )
    },
    { 
      field: 'last_maintenance_date', 
      headerName: 'Last Maintenance', 
      width: 130,
      renderCell: (params) => {
        if (!params.value) return 'No maintenance';
        const date = new Date(params.value);
        return date.toLocaleDateString();
      }
    },
    { 
      field: 'next_maintenance_date', 
      headerName: 'Next Maintenance', 
      width: 130,
      renderCell: (params) => {
        if (!params.value) return 'No schedule';
        const date = new Date(params.value);
        const today = new Date();
        const isOverdue = date < today;
        return (
          <span style={{ color: isOverdue ? 'red' : 'inherit' }}>
            {date.toLocaleDateString()}
          </span>
        );
      }
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 100,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<EditIcon />}
          label="Edit"
          onClick={() => handleEdit(params.row)}
        />,
        <GridActionsCellItem
          icon={<DeleteIcon />}
          label="Delete"
          onClick={() => handleDelete(params.row.sensor_site_id, 'sensor site')}
        />
      ]
    }
  ];


  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <ScienceIcon sx={{ mr: 1, color: '#007BA7' }} />
          <Typography variant="h4" sx={{ fontWeight: 600, color: '#007BA7' }}>
            Sensor Management
          </Typography>
        </Box>
        <Typography variant="subtitle1" color="text.secondary">
          Manage sensor database and site installations
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Card sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab 
              label="Sensor Database" 
              icon={<SensorIcon />}
              iconPosition="start"
            />
            <Tab 
              label="Sensor Sites" 
              icon={<LocationIcon />}
              iconPosition="start"
            />
          </Tabs>
        </Box>

        <CardContent sx={{ p: 0 }}>
          {/* Header with Add Button */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            p: 2, 
            borderBottom: 1, 
            borderColor: 'divider' 
          }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {activeTab === 0 ? 'Sensor Database' : 'Sensor Sites'}
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAdd}
              sx={{ 
                fontSize: '0.875rem',
                fontWeight: 600,
                px: 2,
                backgroundColor: '#007BA7',
                '&:hover': {
                  backgroundColor: '#005f87',
                }
              }}
            >
              Add {activeTab === 0 ? 'Sensor' : 'Sensor Site'}
            </Button>
          </Box>

          {activeTab === 0 && (
            <Box sx={{ height: 600, width: '100%' }}>
              <DataGrid
                rows={sensorDatabase}
                columns={sensorColumns}
                getRowId={(row) => row.sensor_db_id}
                pageSizeOptions={[10, 25, 50]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } }
                }}
                disableRowSelectionOnClick
              />
            </Box>
          )}

          {activeTab === 1 && (
            <Box sx={{ height: 600, width: '100%' }}>
              <DataGrid
                rows={sensorSites}
                columns={sensorSitesColumns}
                getRowId={(row) => row.sensor_site_id}
                pageSizeOptions={[10, 25, 50]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } }
                }}
                disableRowSelectionOnClick
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {dialogMode === 'add' ? 'Add' : 'Edit'} {activeTab === 0 ? 'Sensor' : 'Sensor Site'}
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            {activeTab === 0 ? (
              // Sensor Database Form
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Brand Name"
                    value={formData.brand_name || ''}
                    onChange={(e) => setFormData({...formData, brand_name: e.target.value})}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Sensor Type"
                    value={formData.sensor_type || ''}
                    onChange={(e) => setFormData({...formData, sensor_type: e.target.value})}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Sensor Parameter"
                    value={formData.sensor_parameter || ''}
                    onChange={(e) => setFormData({...formData, sensor_parameter: e.target.value})}
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    multiline
                    rows={3}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Specifications"
                    value={formData.specifications || ''}
                    onChange={(e) => setFormData({...formData, specifications: e.target.value})}
                    multiline
                    rows={3}
                  />
                </Grid>
              </Grid>
            ) : (
              // Sensor Sites Form
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Sensor Site Name"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth required>
                    <InputLabel>Sensor</InputLabel>
                    <Select
                      value={formData.sensor_db_id || ''}
                      onChange={(e) => setFormData({...formData, sensor_db_id: e.target.value})}
                      label="Sensor"
                    >
                      {sensorDatabase.map((sensor) => (
                        <MenuItem key={sensor.sensor_db_id} value={sensor.sensor_db_id}>
                          {sensor.brand_name} - {sensor.sensor_type} ({sensor.sensor_parameter})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth required>
                    <InputLabel>Site</InputLabel>
                    <Select
                      value={formData.site_id || ''}
                      onChange={(e) => setFormData({...formData, site_id: e.target.value})}
                      label="Site"
                    >
                      {sites.map((site) => (
                        <MenuItem key={site.site_id} value={site.site_id}>
                          {site.site_name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Users</InputLabel>
                    <Select
                      multiple
                      value={formData.user_ids || []}
                      onChange={(e) => setFormData({...formData, user_ids: e.target.value})}
                      input={<OutlinedInput label="Users" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value) => {
                            const user = users.find(u => u.user_id === value);
                            return (
                              <Chip 
                                key={value} 
                                label={user ? user.username : value} 
                                size="small"
                              />
                            );
                          })}
                        </Box>
                      )}
                    >
                      {users.map((user) => (
                        <MenuItem key={user.user_id} value={user.user_id}>
                          {user.username}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Device</InputLabel>
                    <Select
                      value={formData.device_id || ''}
                      onChange={(e) => {
                        const deviceId = e.target.value;
                        setFormData({...formData, device_id: deviceId, parameter: ''}); // Clear parameter when device changes
                        loadDeviceParameters(deviceId);
                      }}
                      label="Device"
                    >
                      <MenuItem value="">No device assigned</MenuItem>
                      {devices.map((device) => (
                        <MenuItem key={device.device_id} value={device.device_id}>
                          {device.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth required>
                    <InputLabel>Parameter</InputLabel>
                    <Select
                      value={formData.parameter || ''}
                      onChange={(e) => setFormData({...formData, parameter: e.target.value})}
                      label="Parameter"
                      disabled={!formData.device_id}
                    >
                      {deviceParameters.length > 0 ? (
                        deviceParameters.map((param) => (
                          <MenuItem key={param} value={param}>
                            {param}
                          </MenuItem>
                        ))
                      ) : (
                        <MenuItem disabled>
                          {formData.device_id ? 'Loading parameters...' : 'Select a device first'}
                        </MenuItem>
                      )}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={formData.status || 'active'}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      label="Status"
                    >
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="inactive">Inactive</MenuItem>
                      <MenuItem value="maintenance">Maintenance</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={submitting}
              sx={{ backgroundColor: '#007BA7', '&:hover': { backgroundColor: '#006B9A' } }}
            >
              {submitting ? <CircularProgress size={20} /> : (dialogMode === 'add' ? 'Add' : 'Update')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default SensorManagement;
