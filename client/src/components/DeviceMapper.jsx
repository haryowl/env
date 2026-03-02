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
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  AddCircle as AddCircleIcon,
  RemoveCircle as RemoveCircleIcon,
} from '@mui/icons-material';

import { API_BASE_URL } from '../config/api';

const DeviceMapper = () => {
  const [mappers, setMappers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState('error'); // 'error' or 'info'
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMapper, setEditingMapper] = useState(null);
  const [selectedDeviceFields, setSelectedDeviceFields] = useState([]);
  const [formulaHelp, setFormulaHelp] = useState(null);
  const [formulaValidation, setFormulaValidation] = useState({});
  const [formulaHelpOpen, setFormulaHelpOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    device_id: '',
    description: '',
    mappings: [{ source_field: '', target_field: '', data_type: '', formula: '' }],
  });

  useEffect(() => {
    loadMappers();
    loadDevices();
    loadFieldDefinitions();
  }, []);

  const loadMappers = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/device-mapper`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Mappers response:', data);
        if (data.success) {
          setMappers(data.mappers || []);
          console.log('Loaded mappers:', data.mappers);
        } else {
          console.error('Failed to load device mappings:', data.error);
          setError(data.error || 'Failed to load device mappings');
        }
      } else if (response.status === 404) {
        // Backend endpoint not implemented yet - use mock data
        setMappers([
          {
            id: 1,
            name: 'Temperature Sensor Mapper',
            device_id: 1,
            device_name: 'Temp Sensor 001',
            description: 'Maps temperature sensor data to standardized format',
            mappings: [
              { source_field: 'temp', target_field: 'temperature', data_type: 'float' },
              { source_field: 'humidity', target_field: 'humidity', data_type: 'float' }
            ]
          },
          {
            id: 2,
            name: 'Motion Detector Mapper',
            device_id: 2,
            device_name: 'Motion Sensor 001',
            description: 'Maps motion sensor data to standardized format',
            mappings: [
              { source_field: 'motion', target_field: 'motion_detected', data_type: 'boolean' },
              { source_field: 'timestamp', target_field: 'event_time', data_type: 'datetime' }
            ]
          }
        ]);
        setError('Backend endpoint not implemented yet - showing mock data');
        setErrorType('info');
      } else {
        setError('Failed to load mappers');
      }
    } catch (error) {
      // Network error - use mock data
      setMappers([
        {
          id: 1,
          name: 'Temperature Sensor Mapper',
          device_id: 1,
          device_name: 'Temp Sensor 001',
          description: 'Maps temperature sensor data to standardized format',
          mappings: [
            { source_field: 'temp', target_field: 'temperature', data_type: 'float' },
            { source_field: 'humidity', target_field: 'humidity', data_type: 'float' }
          ]
        },
        {
          id: 2,
          name: 'Motion Detector Mapper',
          device_id: 2,
          device_name: 'Motion Sensor 001',
          description: 'Maps motion sensor data to standardized format',
          mappings: [
            { source_field: 'motion', target_field: 'motion_detected', data_type: 'boolean' },
            { source_field: 'timestamp', target_field: 'event_time', data_type: 'datetime' }
          ]
        }
      ]);
      setError('Network error - showing mock data');
      setErrorType('info');
    } finally {
      setLoading(false);
    }
  };

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

  const loadFieldDefinitions = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/field-definitions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Field definitions response:', data);
        if (data.success) {
          setFieldDefinitions(data.fields || []);
          console.log('Loaded field definitions:', data.fields);
        } else {
          console.error('Failed to load field definitions:', data.error);
          setError(data.error || 'Failed to load field definitions');
        }
      } else {
        setError('Failed to load field definitions');
      }
    } catch (error) {
      console.error('Network error - showing mock field definitions');
      setFieldDefinitions([
        { field_name: 'tss_mg_l', display_name: 'Total Suspended Solids (mg/L)', data_type: 'number' },
        { field_name: 'cod_mg_l', display_name: 'Chemical Oxygen Demand (mg/L)', data_type: 'number' },
        { field_name: 'ph_value', display_name: 'pH Value', data_type: 'number' },
        { field_name: 'flow_rate', display_name: 'Flow Rate', data_type: 'number' },
        { field_name: 'temperature_celsius', display_name: 'Temperature (°C)', data_type: 'number' },
        { field_name: 'humidity_percent', display_name: 'Humidity (%)', data_type: 'number' },
        { field_name: 'pressure_pa', display_name: 'Pressure (Pa)', data_type: 'number' },
        { field_name: 'voltage_v', display_name: 'Voltage (V)', data_type: 'number' },
        { field_name: 'current_a', display_name: 'Current (A)', data_type: 'number' },
        { field_name: 'power_w', display_name: 'Power (W)', data_type: 'number' },
        { field_name: 'latitude', display_name: 'Latitude', data_type: 'number' },
        { field_name: 'longitude', display_name: 'Longitude', data_type: 'number' },
        { field_name: 'altitude_m', display_name: 'Altitude (m)', data_type: 'number' },
        { field_name: 'terminal_time', display_name: 'Terminal Time', data_type: 'timestamp' },
        { field_name: 'group_name', display_name: 'Group Name', data_type: 'string' },
      ]);
    }
  };

  const handleOpenDialog = (mapper = null) => {
    if (mapper) {
      setEditingMapper(mapper);
      setFormData({
        name: mapper.name || mapper.mapping_name || '',
        device_id: mapper.device_id || '',
        description: mapper.description || '',
        mappings: (mapper.mappings && mapper.mappings.length > 0) ? mapper.mappings.map(m => ({
          source_field: m.source_field || '',
          target_field: m.target_field || '',
          data_type: m.data_type || '',
          formula: m.formula || ''
        })) : [{ source_field: '', target_field: '', data_type: '', formula: '' }],
      });
    } else {
      setEditingMapper(null);
      setFormData({
        name: '',
        device_id: '',
        description: '',
        mappings: [{ source_field: '', target_field: '', data_type: '', formula: '' }],
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingMapper(null);
    setFormData({
      name: '',
      device_id: '',
      description: '',
      mappings: [{ source_field: '', target_field: '', data_type: '', formula: '' }],
    });
  };

  const handleInputChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));

    // If device_id is being changed, load the device's field data
    if (field === 'device_id') {
      loadDeviceFields(event.target.value);
    }
  };

  // Load device fields from the device's actual data
  const loadDeviceFields = async (deviceId) => {
    if (!deviceId) {
      setSelectedDeviceFields([]);
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      
      // Get the actual MQTT payload fields for this device
      const response = await fetch(`${API_BASE_URL}/data/fields/${deviceId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.fields && data.fields.length > 0) {
          setSelectedDeviceFields(data.fields);
        } else {
          // Fallback to common IoT field names
          setSelectedDeviceFields([
            '_terminalTime', '_groupName', 'TSS', 'COD', 'PH', 'Debit',
            'temperature', 'humidity', 'pressure', 'light', 'motion',
            'voltage', 'current', 'power', 'energy', 'status', 'error',
            'latitude', 'longitude', 'altitude', 'speed', 'heading'
          ]);
        }
      } else {
        // Fallback to common IoT field names
        setSelectedDeviceFields([
          '_terminalTime', '_groupName', 'TSS', 'COD', 'PH', 'Debit',
          'temperature', 'humidity', 'pressure', 'light', 'motion',
          'voltage', 'current', 'power', 'energy', 'status', 'error',
          'latitude', 'longitude', 'altitude', 'speed', 'heading'
        ]);
      }
    } catch (error) {
      console.error('Failed to load device fields:', error);
      // Fallback to common IoT field names
      setSelectedDeviceFields([
        '_terminalTime', '_groupName', 'TSS', 'COD', 'PH', 'Debit',
        'temperature', 'humidity', 'pressure', 'light', 'motion',
        'voltage', 'current', 'power', 'energy', 'status', 'error',
        'latitude', 'longitude', 'altitude', 'speed', 'heading'
      ]);
    }
  };

  const handleMappingChange = (index, field) => (event) => {
    const newMappings = [...formData.mappings];
    newMappings[index] = {
      ...newMappings[index],
      [field]: event.target.value,
    };
    setFormData(prev => ({
      ...prev,
      mappings: newMappings,
    }));
  };

  const addMapping = () => {
    setFormData(prev => ({
      ...prev,
      mappings: [...prev.mappings, { source_field: '', target_field: '', data_type: '', formula: '' }],
    }));
  };

  const removeMapping = (index) => {
    if (formData.mappings.length > 1) {
      const newMappings = formData.mappings.filter((_, i) => i !== index);
      setFormData(prev => ({
        ...prev,
        mappings: newMappings,
      }));
    }
  };

  const validateFormula = async (formula, index) => {
    if (!formula || !formula.trim()) {
      setFormulaValidation(prev => ({ ...prev, [index]: { valid: true, message: 'No formula provided' } }));
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/device-mapper/validate-formula`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ formula, testValue: 10 })
      });

      if (response.ok) {
        const data = await response.json();
        setFormulaValidation(prev => ({ 
          ...prev, 
          [index]: { 
            valid: data.valid, 
            message: data.message,
            result: data.result
          } 
        }));
      } else {
        setFormulaValidation(prev => ({ 
          ...prev, 
          [index]: { 
            valid: false, 
            message: 'Validation failed' 
          } 
        }));
      }
    } catch (error) {
      console.error('Formula validation error:', error);
      setFormulaValidation(prev => ({ 
        ...prev, 
        [index]: { 
          valid: false, 
          message: 'Validation error' 
        } 
      }));
    }
  };

  const loadFormulaHelp = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/device-mapper/formula-help`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setFormulaHelp(data.help);
          setFormulaHelpOpen(true);
        }
      }
    } catch (error) {
      console.error('Failed to load formula help:', error);
    }
  };

  const handleSubmit = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      
      // Validate required fields
      if (!formData.device_id) {
        setError('Please select a device');
        return;
      }

      if (!formData.name.trim()) {
        setError('Please enter a mapper name');
        return;
      }

      // Filter out empty mappings
      const validMappings = formData.mappings.filter(m => 
        m.source_field.trim() && m.target_field.trim() && m.data_type
      );

      if (validMappings.length === 0) {
        setError('Please add at least one field mapping');
        return;
      }

      const url = editingMapper 
        ? `${API_BASE_URL}/device-mapper/${editingMapper.id}`
        : `${API_BASE_URL}/device-mapper`;
      
      const method = editingMapper ? 'PUT' : 'POST';

      const requestData = {
        name: formData.name.trim(),
        device_id: formData.device_id,
        description: formData.description.trim(),
        mappings: validMappings
      };

      console.log('Submitting mapper:', { url, method, requestData });
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestData),
      });

      console.log('Submit response status:', response.status);
      
      if (response.ok) {
        const responseData = await response.json();
        console.log('Submit success response:', responseData);
        handleCloseDialog();
        loadMappers();
        setError('');
        setErrorType('error');
      } else {
        const data = await response.json();
        console.log('Submit error response:', data);
        setError(data.error || 'Failed to save mapper');
        setErrorType('error');
      }
    } catch (error) {
      console.error('Submit error:', error);
      setError('Network error - changes not saved');
      setErrorType('error');
    }
  };

  const handleDelete = async (mapperId) => {
    if (!window.confirm('Are you sure you want to delete this mapper?')) {
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/device-mapper/${mapperId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        loadMappers();
        setError('');
        setErrorType('error');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete mapper');
        setErrorType('error');
      }
    } catch (error) {
      console.error('Delete error:', error);
      setError('Network error - delete not performed');
      setErrorType('error');
    }
  };

  const filteredMappers = mappers.filter(mapper =>
    (mapper.name && mapper.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (mapper.mapping_name && mapper.mapping_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (mapper.device_name && mapper.device_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (mapper.description && mapper.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Device Mapper</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Mapper
        </Button>
      </Box>

      {error && (
        <Alert severity={errorType} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Search mappers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />
        </CardContent>
      </Card>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Device</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Field Mappings</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredMappers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  {searchTerm ? 'No mappers match your search' : 'No mappers found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredMappers.map((mapper) => (
                <TableRow key={mapper.id}>
                  <TableCell>
                    <Typography variant="subtitle2">{mapper.name || mapper.mapping_name}</Typography>
                  </TableCell>
                  <TableCell>{mapper.device_name}</TableCell>
                  <TableCell>{mapper.description || '-'}</TableCell>
                  <TableCell>
                    <Box display="flex" flexWrap="wrap" gap={0.5}>
                      {(mapper.mappings || []).map((mapping, index) => (
                        <Chip
                          key={index}
                          label={`${mapping.source_field} → ${mapping.target_field}`}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(mapper)}
                      color="primary"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(mapper.id)}
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

      {/* Add/Edit Mapper Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleCloseDialog} 
        maxWidth="lg" 
        fullWidth
        disableRestoreFocus
        keepMounted={false}
      >
        <DialogTitle>
          {editingMapper ? 'Edit Field Mapper' : 'Add New Field Mapper'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Mapper Name"
                value={formData.name}
                onChange={handleInputChange('name')}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Device</InputLabel>
                <Select
                  value={formData.device_id || ''}
                  onChange={handleInputChange('device_id')}
                  label="Device"
                >
                  {devices.map((device) => (
                    <MenuItem key={device.device_id} value={device.device_id}>
                      {device.name} ({device.device_id})
                    </MenuItem>
                  ))}
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
                rows={2}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          {formData.device_id && selectedDeviceFields.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Loading available fields from device data...
            </Alert>
          )}

          {formData.device_id && selectedDeviceFields.length > 0 && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Found {selectedDeviceFields.length} available fields from device data
            </Alert>
          )}

          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Field Mappings</Typography>
              <Button
                startIcon={<AddCircleIcon />}
                onClick={addMapping}
                size="small"
              >
                Add Field
              </Button>
            </Box>

            {formData.mappings.map((mapping, index) => (
              <Box key={index} sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <FormControl fullWidth required>
                      <InputLabel>Source Field</InputLabel>
                      <Select
                        value={mapping.source_field || ''}
                        onChange={handleMappingChange(index, 'source_field')}
                        label="Source Field"
                        disabled={!formData.device_id}
                      >
                        {selectedDeviceFields.length > 0 ? (
                          selectedDeviceFields.map((field) => (
                            <MenuItem key={field} value={field}>
                              {field}
                            </MenuItem>
                          ))
                        ) : (
                          <MenuItem value="" disabled>
                            {formData.device_id ? 'Loading fields...' : 'Select a device first'}
                          </MenuItem>
                        )}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <FormControl fullWidth required>
                      <InputLabel>Target Field</InputLabel>
                      <Select
                        value={mapping.target_field || ''}
                        onChange={handleMappingChange(index, 'target_field')}
                        label="Target Field"
                      >
                        {fieldDefinitions.map((field) => (
                          <MenuItem key={field.field_name} value={field.field_name}>
                            {field.display_name} ({field.field_name})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <FormControl fullWidth required>
                      <InputLabel>Data Type</InputLabel>
                      <Select
                        value={mapping.data_type || ''}
                        onChange={handleMappingChange(index, 'data_type')}
                        label="Data Type"
                      >
                        <MenuItem value="number">Number</MenuItem>
                        <MenuItem value="string">String</MenuItem>
                        <MenuItem value="boolean">Boolean</MenuItem>
                        <MenuItem value="timestamp">Timestamp</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Formula"
                      value={mapping.formula || ''}
                      onChange={(e) => {
                        handleMappingChange(index, 'formula')(e);
                        // Validate formula on change
                        validateFormula(e.target.value, index);
                      }}
                      multiline
                      rows={2}
                      placeholder="e.g., (value * 1000) / 1000"
                      helperText={
                        formulaValidation[index] 
                          ? `${formulaValidation[index].message}${formulaValidation[index].result ? ` (Result: ${formulaValidation[index].result})` : ''}`
                          : "Use 'value' to reference source field. Examples: value * 2, value / 1000, Math.round(value)"
                      }
                      error={formulaValidation[index] && !formulaValidation[index].valid}
                      InputProps={{
                        endAdornment: (
                          <IconButton
                            size="small"
                            onClick={() => loadFormulaHelp()}
                            title="Formula Help"
                          >
                            <SearchIcon />
                          </IconButton>
                        ),
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <IconButton
                      onClick={() => removeMapping(index)}
                      color="error"
                      disabled={formData.mappings.length === 1}
                    >
                      <RemoveCircleIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingMapper ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Formula Help Dialog */}
      <Dialog
        open={formulaHelpOpen}
        onClose={() => setFormulaHelpOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Math Formula Help
          <IconButton
            aria-label="close"
            onClick={() => setFormulaHelpOpen(false)}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
            }}
          >
            <DeleteIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {formulaHelp && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Available Functions
              </Typography>
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Math Functions: Math.abs, Math.ceil, Math.floor, Math.round, Math.max, Math.min, Math.pow, Math.sqrt, Math.log, Math.exp, Math.sin, Math.cos, Math.tan
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Constants: Math.PI, Math.E
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Utility: parseFloat, parseInt, Number, String, Boolean, isNaN, isFinite
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  String: toUpperCase, toLowerCase, trim, replace, split, substring
                </Typography>
              </Box>

              <Typography variant="h6" gutterBottom>
                Examples
              </Typography>
              <Box>
                {formulaHelp.examples && formulaHelp.examples.map((example, index) => (
                  <Chip
                    key={index}
                    label={example}
                    variant="outlined"
                    sx={{ m: 0.5 }}
                    onClick={() => {
                      // Copy example to clipboard
                      navigator.clipboard.writeText(example);
                    }}
                  />
                ))}
              </Box>

              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                Usage
              </Typography>
              <Typography variant="body2" color="text.secondary">
                • Use 'value' to reference the source field value
              </Typography>
              <Typography variant="body2" color="text.secondary">
                • Examples: value * 2, value / 1000, Math.round(value)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                • Click on examples to copy them to clipboard
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormulaHelpOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeviceMapper; 