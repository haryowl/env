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
  TablePagination,
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
  Devices as DevicesIcon,
} from '@mui/icons-material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, parseISO, isValid } from 'date-fns';

import { API_BASE_URL } from '../config/api';
import moment from 'moment-timezone';
import { TIMEZONE_OPTIONS } from '../utils/timezoneUtils';
import DeviceCoordinateManager from './DeviceCoordinateManager';
import PageHeader from './PageHeader';
import {
  compactTextFieldSx,
  compactTableHeadCellSx,
  compactTableCellSx,
  compactChipSx,
} from '../utils/compactUi';

const DeviceManager = () => {
  const [devices, setDevices] = useState([]);
  const [mapperTemplates, setMapperTemplates] = useState([]);
  const [deviceAssignments, setDeviceAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
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
    valid_from: null,
    valid_to: null,
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
        // Keep offline devices visible; only exclude soft-deleted.
        const visibleDevices = (data.devices || []).filter((device) => device?.status !== 'deleted' && device?.is_deleted !== true);
        setDevices(visibleDevices);
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
    const parseDate = (d) => {
      if (!d) return null;
      if (d instanceof Date && isValid(d)) return d;
      const parsed = parseISO(d);
      return isValid(parsed) ? parsed : null;
    };
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
        timezone: deviceAssignments[device.device_id]?.timezone || device.timezone || 'UTC',
        time_format: deviceAssignments[device.device_id]?.time_format || 'ISO8601',
        valid_from: parseDate(device.valid_from),
        valid_to: parseDate(device.valid_to),
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
        valid_from: null,
        valid_to: null,
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
      valid_from: null,
      valid_to: null,
    });
  };

  const handleInputChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleDateChange = (field) => (value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const url = editingDevice 
        ? `${API_BASE_URL}/devices/${editingDevice.device_id || editingDevice.id}`
        : `${API_BASE_URL}/devices`;
      
      const method = editingDevice ? 'PUT' : 'POST';

      const formatDateForApi = (d) => (d && isValid(d) ? format(d, 'yyyy-MM-dd') : null);

      // For updates, only send allowed fields
      const requestData = editingDevice ? {
        name: formData.name,
        description: formData.description,
        location: formData.location,
        timezone: formData.timezone,
        valid_from: formatDateForApi(formData.valid_from),
        valid_to: formatDateForApi(formData.valid_to),
      } : {
        ...formData,
        valid_from: formatDateForApi(formData.valid_from),
        valid_to: formatDateForApi(formData.valid_to),
      };

      // Filter out empty strings (but allow null for valid_from/valid_to)
      const filteredRequestData = {};
      Object.keys(requestData).forEach(key => {
        const v = requestData[key];
        if (v !== '' && v !== undefined) {
          filteredRequestData[key] = v;
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
        const detailLines =
          Array.isArray(data.details) && data.details.length > 0
            ? data.details.map((d) => d.message || String(d)).join(' ')
            : '';
        setError([data.error || 'Failed to save device', detailLines].filter(Boolean).join(' — '));
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

  // Keep pagination stable when filters change
  useEffect(() => {
    setPage(0);
  }, [searchTerm, devices.length]);

  const pagedDevices = filteredDevices.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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
    <Box
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      <Box sx={{ mb: 1.5 }}>
        <PageHeader
          icon={<DevicesIcon sx={{ fontSize: 18 }} />}
          title="Device Management"
          subtitle="Manage devices, validity period, and mapping assignments"
          right={(
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
              sx={{ minWidth: { xs: '100%', sm: 'auto' }, fontSize: '0.75rem', textTransform: 'none', fontWeight: 700 }}
            >
              Add Device
            </Button>
          )}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 1.5, flexShrink: 0 }}>
        <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search devices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={compactTextFieldSx}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, fontSize: 18, color: 'text.secondary' }} />,
            }}
          />
        </CardContent>
      </Card>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table stickyHeader sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 120, ...compactTableHeadCellSx }}>Name</TableCell>
                <TableCell sx={{ minWidth: 100, ...compactTableHeadCellSx }}>Device ID</TableCell>
                <TableCell sx={{ minWidth: 80, ...compactTableHeadCellSx }}>Protocol</TableCell>
                <TableCell sx={{ minWidth: 80, ...compactTableHeadCellSx }}>Type</TableCell>
                <TableCell sx={{ minWidth: 80, ...compactTableHeadCellSx }}>Status</TableCell>
                <TableCell sx={{ minWidth: 100, ...compactTableHeadCellSx }}>Location</TableCell>
                <TableCell sx={{ minWidth: 120, ...compactTableHeadCellSx }}>Mapper Template</TableCell>
                <TableCell sx={{ minWidth: 100, ...compactTableHeadCellSx }}>Actions</TableCell>
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
              pagedDevices.map((device) => (
                <TableRow key={device.device_id}>
                  <TableCell sx={compactTableCellSx}>
                    <Box>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{device.name}</Typography>
                      {device.description && (
                        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                          {device.description}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell sx={compactTableCellSx}>
                    <Chip label={device.device_id} size="small" variant="outlined" sx={compactChipSx} />
                  </TableCell>
                  <TableCell sx={compactTableCellSx}>
                    <Chip 
                      label={device.protocol.toUpperCase()} 
                      color="primary" 
                      size="small" 
                      sx={compactChipSx}
                    />
                  </TableCell>
                  <TableCell sx={compactTableCellSx}>
                    <Chip 
                      label={device.device_type} 
                      color="secondary" 
                      size="small" 
                      sx={compactChipSx}
                    />
                  </TableCell>
                  <TableCell sx={compactTableCellSx}>
                    <Chip
                      label={device.status}
                      color={getStatusColor(device.status)}
                      size="small"
                      sx={compactChipSx}
                    />
                  </TableCell>
                  <TableCell sx={compactTableCellSx}>{device.location || '-'}</TableCell>
                  <TableCell sx={compactTableCellSx}>
                    {deviceAssignments[device.device_id] ? (
                      <Chip
                        label={deviceAssignments[device.device_id].template_name}
                        color="success"
                        size="small"
                        variant="outlined"
                        sx={compactChipSx}
                      />
                    ) : (
                      <Chip
                        label="No Template"
                        color="default"
                        size="small"
                        variant="outlined"
                        sx={compactChipSx}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={compactTableCellSx}>
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
        <TablePagination
          component={Paper}
          count={filteredDevices.length}
          page={page}
          onPageChange={(_, next) => setPage(next)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Box>

      {/* Add/Edit Device Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingDevice ? 'Edit Device' : 'Add New Device'}
        </DialogTitle>
        <DialogContent dividers sx={{ maxHeight: 'min(72vh, 680px)', overflowY: 'auto' }}>
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
                placeholder="Site / city / label (optional)"
                helperText="Shown in device lists and maps when coordinates are set separately."
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
            <Grid size={{ xs: 12, sm: 6 }}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Valid From"
                  value={formData.valid_from}
                  onChange={handleDateChange('valid_from')}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </LocalizationProvider>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Valid To"
                  value={formData.valid_to}
                  onChange={handleDateChange('valid_to')}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </LocalizationProvider>
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