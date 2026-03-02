import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
} from '@mui/icons-material';

import { API_BASE_URL } from '../config/api';
import moment from 'moment-timezone';
import { TIMEZONE_OPTIONS } from '../utils/timezoneUtils';
import DeviceCoordinateManager from './DeviceCoordinateManager';

const DeviceManager = () => {
  const [devices, setDevices] = useState([]);
  const [mapperTemplates, setMapperTemplates] = useState([]);
  const [deviceAssignments, setDeviceAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    device_id: '',
    protocol: '',
    device_type: '',
    description: '',
    location: '',
    template_id: '',
    timezone: 'UTC',
    time_format: 'ISO8601',
  });

  useEffect(() => {
    loadDevices();
    loadMapperTemplates();
    loadDeviceAssignments();
  }, []);

  const loadDevices = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const activeDevices = (data.devices || []).filter(device => device.status !== 'offline' && device.status !== 'deleted');
        setDevices(activeDevices);
      } else {
        setError('Failed to load devices');
      }
    } catch (error) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const loadMapperTemplates = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/device-mapper`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMapperTemplates(data.mappers || []);
      }
    } catch (error) {
      console.error('Failed to load mapper templates:', error);
    }
  };

  const loadDeviceAssignments = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/device-mapper-assignments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const assignmentsMap = {};
        data.assignments.forEach(assignment => {
          assignmentsMap[assignment.device_id] = assignment;
        });
        setDeviceAssignments(assignmentsMap);
      }
    } catch (error) {
      console.error('Failed to load device assignments:', error);
    }
  };

  const handleOpenDialog = (device = null) => {
    if (device) {
      setEditingDevice(device);
      setFormData({
        name: device.name,
        device_id: device.device_id,
        protocol: device.protocol,
        device_type: device.device_type,
        description: device.description || '',
        location: device.location || '',
        template_id: deviceAssignments[device.device_id]?.template_id || '',
        timezone: deviceAssignments[device.device_id]?.timezone || 'UTC',
        time_format: deviceAssignments[device.device_id]?.time_format || 'ISO8601',
      });
    } else {
      setEditingDevice(null);
      setFormData({
        name: '',
        device_id: '',
        protocol: '',
        device_type: '',
        description: '',
        location: '',
        template_id: '',
        timezone: 'UTC',
        time_format: 'ISO8601',
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingDevice(null);
    setFormData({
      name: '',
      device_id: '',
      protocol: '',
      device_type: '',
      description: '',
      location: '',
      template_id: '',
      timezone: 'UTC',
      time_format: 'ISO8601',
    });
  };

  const handleInputChange = (field) => (event) => {
    console.log('DeviceManager: handleInputChange called for field:', field, 'value:', event.target.value);
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const url = editingDevice 
        ? `${API_BASE_URL}/devices/${editingDevice.device_id || editingDevice.id}`
        : `${API_BASE_URL}/devices`;
      
      const method = editingDevice ? 'PUT' : 'POST';

      // For updates, only send allowed fields
      const requestData = editingDevice ? {
        name: formData.name,
        description: formData.description,
        location: formData.location,
        timezone: formData.timezone,
      } : formData;

      // Filter out empty strings to avoid validation errors
      const filteredRequestData = {};
      Object.keys(requestData).forEach(key => {
        if (requestData[key] !== '' && requestData[key] !== null && requestData[key] !== undefined) {
          filteredRequestData[key] = requestData[key];
        }
      });

      console.log('DeviceManager: Sending request:', {
        method,
        url,
        requestData: filteredRequestData,
        editingDevice
      });

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(filteredRequestData),
      });

      if (response.ok) {
        // Handle mapper template assignment/removal
        try {
          const assignmentUrl = `${API_BASE_URL}/device-mapper-assignments/${formData.device_id}`;
          
          if (formData.template_id) {
            // Check if assignment already exists
            const checkResponse = await fetch(assignmentUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });

            // Use PUT if assignment exists, POST if it doesn't
            const assignmentMethod = checkResponse.ok ? 'PUT' : 'POST';
            const finalUrl = checkResponse.ok ? assignmentUrl : `${API_BASE_URL}/device-mapper-assignments`;

            const assignmentResponse = await fetch(finalUrl, {
              method: assignmentMethod,
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                device_id: formData.device_id,
                template_id: formData.template_id,
                timezone: formData.timezone,
                time_format: formData.time_format,
              }),
            });

            if (!assignmentResponse.ok) {
              const errorData = await assignmentResponse.json();
              console.warn('Failed to assign mapper template to device:', {
                status: assignmentResponse.status,
                statusText: assignmentResponse.statusText,
                error: errorData
              });
            } else {
              console.log('Mapper template assigned successfully');
            }
          } else if (editingDevice) {
            // Remove mapper template assignment if template_id is empty
            const deleteResponse = await fetch(assignmentUrl, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });

            if (!deleteResponse.ok) {
              const errorData = await deleteResponse.json();
              console.warn('Failed to remove mapper template assignment:', {
                status: deleteResponse.status,
                statusText: deleteResponse.statusText,
                error: errorData
              });
            } else {
              console.log('Mapper template assignment removed successfully');
            }
          }
        } catch (error) {
          console.warn('Error handling mapper template assignment:', error);
        }

        handleCloseDialog();
        loadDevices();
        loadDeviceAssignments();
        setError('');
      } else {
        const data = await response.json();
        console.log('DeviceManager: Error response:', data);
        console.log('DeviceManager: Validation details:', data.details);
        setError(data.error || 'Failed to save device');
      }
    } catch (error) {
      console.log('DeviceManager: Network error:', error);
      setError('Network error');
    }
  };

  const handleDelete = async (deviceId) => {
    if (!window.confirm('Are you sure you want to delete this device?')) {
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        loadDevices();
        setError('');
      } else {
        setError('Failed to delete device');
      }
    } catch (error) {
      setError('Network error');
    }
  };

  const filteredDevices = devices.filter(device =>
    device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.device_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.protocol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status) => {
    return status === 'online' ? 'success' : 'error';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>
      <Box 
        display="flex" 
        justifyContent="space-between" 
        alignItems="center" 
        mb={3}
        sx={{ 
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 2, sm: 0 }
        }}
      >
        <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
          Device Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{ minWidth: { xs: '100%', sm: 'auto' } }}
        >
          Add Device
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3, flexShrink: 0 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <TextField
            fullWidth
            placeholder="Search devices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />
        </CardContent>
      </Card>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <TableContainer component={Paper} sx={{ flex: 1, overflow: 'auto' }}>
          <Table stickyHeader sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 120 }}>Name</TableCell>
                <TableCell sx={{ minWidth: 100 }}>Device ID</TableCell>
                <TableCell sx={{ minWidth: 80 }}>Protocol</TableCell>
                <TableCell sx={{ minWidth: 80 }}>Type</TableCell>
                <TableCell sx={{ minWidth: 80 }}>Status</TableCell>
                <TableCell sx={{ minWidth: 100 }}>Location</TableCell>
                <TableCell sx={{ minWidth: 120 }}>Mapper Template</TableCell>
                <TableCell sx={{ minWidth: 100 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
          <TableBody>
            {filteredDevices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  {searchTerm ? 'No devices match your search' : 'No devices found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredDevices.map((device) => (
                <TableRow key={device.device_id}>
                  <TableCell>
                    <Box>
                      <Typography variant="subtitle2">{device.name}</Typography>
                      {device.description && (
                        <Typography variant="body2" color="text.secondary">
                          {device.description}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={device.device_id} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={device.protocol.toUpperCase()} 
                      color="primary" 
                      size="small" 
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={device.device_type} 
                      color="secondary" 
                      size="small" 
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={device.status}
                      color={getStatusColor(device.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{device.location || '-'}</TableCell>
                  <TableCell>
                    {deviceAssignments[device.device_id] ? (
                      <Chip
                        label={deviceAssignments[device.device_id].template_name}
                        color="success"
                        size="small"
                        variant="outlined"
                      />
                    ) : (
                      <Chip
                        label="No Template"
                        color="default"
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(device)}
                      color="primary"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(device.device_id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </TableContainer>
      </Box>

      {/* Add/Edit Device Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingDevice ? 'Edit Device' : 'Add New Device'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Device Name"
                value={formData.name}
                onChange={handleInputChange('name')}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Device ID"
                value={formData.device_id}
                onChange={handleInputChange('device_id')}
                required
                disabled={editingDevice !== null}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Protocol</InputLabel>
                <Select
                  value={formData.protocol}
                  onChange={handleInputChange('protocol')}
                  label="Protocol"
                  disabled={editingDevice !== null}
                >
                  <MenuItem value="mqtt">MQTT</MenuItem>
                  <MenuItem value="http">HTTP</MenuItem>
                  <MenuItem value="tcp">TCP</MenuItem>
                  <MenuItem value="udp">UDP</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Device Type</InputLabel>
                <Select
                  value={formData.device_type}
                  onChange={handleInputChange('device_type')}
                  label="Device Type"
                  disabled={editingDevice !== null}
                >
                  <MenuItem value="sensor">Sensor</MenuItem>
                  <MenuItem value="gps">GPS</MenuItem>
                  <MenuItem value="controller">Controller</MenuItem>
                  <MenuItem value="hybrid">Hybrid</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Description"
                value={formData.description}
                onChange={handleInputChange('description')}
                multiline
                rows={3}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Location"
                value={formData.location}
                onChange={handleInputChange('location')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Mapper Template</InputLabel>
                <Select
                  value={formData.template_id}
                  onChange={handleInputChange('template_id')}
                  label="Mapper Template"
                >
                  <MenuItem value="">None</MenuItem>
                  {mapperTemplates.map(template => (
                    <MenuItem key={template.id} value={template.id}>
                      {template.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Timezone</InputLabel>
                <Select
                  value={formData.timezone}
                  onChange={handleInputChange('timezone')}
                  label="Timezone"
                  MenuProps={{ style: { maxHeight: 400 } }}
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Time Format</InputLabel>
                <Select
                  value={formData.time_format}
                  onChange={handleInputChange('time_format')}
                  label="Time Format"
                >
                  <MenuItem value="ISO8601">ISO8601</MenuItem>
                  <MenuItem value="Epoch">Epoch</MenuItem>
                  <MenuItem value="Unix">Unix</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            {/* Device Coordinate Manager */}
            {editingDevice && (
              <Grid size={{ xs: 12 }}>
                <DeviceCoordinateManager 
                  device={editingDevice} 
                  onUpdate={() => {
                    // Refresh device data after coordinate update
                    loadDevices();
                  }}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingDevice ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeviceManager; 