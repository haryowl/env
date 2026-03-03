import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Alert,
  CircularProgress,
  useTheme,
  Stack,
  Grid,
  Divider,
  FormControlLabel,
  Switch,
  Autocomplete,
  Paper
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Email as EmailIcon,
  Schedule as ScheduleIcon,
  Devices as DevicesIcon,
  Science as ScienceIcon,
  CalendarToday as CalendarIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const ScheduledExportForm = ({ exportData, onSubmit, onCancel, title }) => {
  const theme = useTheme();
  
  // Debug log to see what props are received
  console.log('🎯 ScheduledExportForm component rendered with props:', {
    exportData,
    title,
    hasExportData: !!exportData
  });
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    frequency: 'daily',
    is_active: true,
    device_ids: [],
    parameters: [],
    format: 'excel',
    recipients: [{ email: '', name: '' }],
    timezone: 'UTC',
    // Time settings based on frequency
    daily_time: '08:00',
    weekly_day: 'monday',
    weekly_time: '08:00',
    monthly_date: 1,
    monthly_time: '08:00'
  });
  const [devices, setDevices] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load devices and parameters
  useEffect(() => {
    loadDevices();
    loadParameters();
  }, []);

  // Handle exportData changes separately
  useEffect(() => {
    if (exportData && devices.length > 0) {
      console.log('🔄 ScheduledExportForm - exportData received:', exportData);
      console.log('📱 Available devices:', devices);
      
      // Ensure recipients is an array and has at least one empty entry if empty
      let recipients = exportData.recipients || [];
      if (recipients.length === 0) {
        recipients = [{ email: '', name: '' }];
      }
      
      const newFormData = {
        name: exportData.name || '',
        description: exportData.description || '',
        frequency: exportData.frequency || 'daily',
        is_active: exportData.is_active !== false,
        device_ids: exportData.device_ids || [],
        parameters: exportData.parameters || [],
        format: exportData.format || 'excel',
        recipients: recipients,
        timezone: exportData.time_zone || exportData.timezone || 'UTC',
        daily_time: exportData.daily_time || '08:00',
        weekly_day: exportData.weekly_day || 'monday',
        weekly_time: exportData.weekly_time || '08:00',
        monthly_date: exportData.monthly_date || 1,
        monthly_time: exportData.monthly_time || '08:00'
      };
      
      console.log('📝 ScheduledExportForm - setting form data:', newFormData);
      setFormData(newFormData);
    } else if (exportData) {
      console.log('⏳ ScheduledExportForm - exportData received but devices not loaded yet');
    } else {
      console.log('⚠️ ScheduledExportForm - no exportData provided');
    }
  }, [exportData, devices]);

  // Load parameters when device selection changes (following QuickView pattern)
  useEffect(() => {
    if (formData.device_ids.length > 0) {
      loadParametersForDevices();
    } else {
      setParameters([]);
    }
  }, [formData.device_ids]);

  const loadDevices = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  };

  const loadParameters = async () => {
    // Parameters will be loaded when devices are selected
    // This follows the same pattern as QuickView and DataDash
    setParameters([]);
  };

  const loadParametersForDevices = async () => {
    if (formData.device_ids.length === 0) {
      setParameters([]);
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const allParameters = new Set();

      // Load parameters for each selected device (following QuickView pattern)
      for (const deviceId of formData.device_ids) {
        try {
          const response = await fetch(`${API_BASE_URL}/device-mapper-assignments/${deviceId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.ok) {
            const data = await response.json();
            
            // Extract parameters from mapper template mappings, excluding datetime
            if (data.assignment && data.assignment.mappings) {
              const deviceParams = data.assignment.mappings
                .map(mapping => mapping.target_field)
                .filter(param => 
                  param.toLowerCase() !== 'datetime' && 
                  param.toLowerCase() !== 'timestamp' &&
                  param.toLowerCase() !== 'device_id' &&
                  param.toLowerCase() !== 'device_name'
                );
              
              deviceParams.forEach(param => allParameters.add(param));
            }
          }
        } catch (error) {
          console.error(`Error loading parameters for device ${deviceId}:`, error);
        }
      }

      setParameters(Array.from(allParameters).sort());
    } catch (error) {
      console.error('Error loading parameters for devices:', error);
      setParameters([]);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleRecipientChange = (index, field, value) => {
    const newRecipients = [...formData.recipients];
    newRecipients[index][field] = value;
    setFormData(prev => ({ ...prev, recipients: newRecipients }));
  };

  const addRecipient = () => {
    setFormData(prev => ({
      ...prev,
      recipients: [...prev.recipients, { email: '', name: '' }]
    }));
  };

  const removeRecipient = (index) => {
    if (formData.recipients.length > 1) {
      const newRecipients = formData.recipients.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, recipients: newRecipients }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Export name is required');
      setSubmitting(false);
      return;
    }

    if (formData.device_ids.length === 0) {
      setError('At least one device must be selected');
      setSubmitting(false);
      return;
    }

    if (formData.parameters.length === 0) {
      setError('At least one parameter must be selected');
      setSubmitting(false);
      return;
    }

    // Validate recipients
    const validRecipients = formData.recipients.filter(r => r.email.trim());
    if (validRecipients.length === 0) {
      setError('At least one recipient email is required');
      setSubmitting(false);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const recipient of validRecipients) {
      if (!emailRegex.test(recipient.email)) {
        setError(`Invalid email format: ${recipient.email}`);
        setSubmitting(false);
        return;
      }
    }

    try {
      // Calculate date range based on frequency
      let date_range_days;
      switch (formData.frequency) {
        case 'daily':
          date_range_days = 1;
          break;
        case 'weekly':
          date_range_days = 7;
          break;
        case 'monthly':
          date_range_days = 30;
          break;
        default:
          date_range_days = 1;
      }

      const submitData = {
        ...formData,
        recipients: validRecipients,
        recipient_count: validRecipients.length,
        date_range_days: date_range_days
      };

      const result = await onSubmit(submitData);
      
      if (!result.success) {
        setError(result.error || 'Failed to save scheduled export');
      }
    } catch (error) {
      setError(error.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const frequencyOptions = [
    { 
      value: 'daily', 
      label: 'Daily', 
      description: 'Every day at specified time - exports previous 24 hours of data',
      dataRange: 'Previous 24 hours'
    },
    { 
      value: 'weekly', 
      label: 'Weekly', 
      description: 'Every week on specified day - exports previous 7 days of data',
      dataRange: 'Previous 7 days'
    },
    { 
      value: 'monthly', 
      label: 'Monthly', 
      description: 'Every month on specified date - exports previous 30 days of data',
      dataRange: 'Previous 30 days'
    }
  ];

  const formatOptions = [
    { value: 'excel', label: 'Excel (.xlsx)', description: 'Spreadsheet format with multiple sheets' },
    { value: 'pdf', label: 'PDF', description: 'Portable document format' }
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ 
        p: 3,
        background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
        color: 'white',
        borderRadius: '4px 4px 0 0'
      }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScheduleIcon sx={{ fontSize: '1.5rem' }} />
            {title}
          </Typography>
          <IconButton onClick={onCancel} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          {/* Error Display */}
          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: '4px' }}>
              {error}
            </Alert>
          )}

          {/* Basic Information */}
          <Card sx={{ mb: 3, borderRadius: '4px', border: '1px solid rgba(107, 70, 193, 0.1)' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ 
                fontWeight: 600, 
                mb: 2,
                color: '#007BA7',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <ScheduleIcon sx={{ fontSize: '1.2rem' }} />
                Basic Information
              </Typography>
              
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Export Name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    required
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '4px'
                      }
                    }}
                  />
                </Grid>
                
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth sx={{ borderRadius: '4px' }}>
                    <InputLabel>Frequency</InputLabel>
                    <Select
                      value={formData.frequency}
                      label="Frequency"
                      onChange={(e) => handleInputChange('frequency', e.target.value)}
                      sx={{ borderRadius: '4px' }}
                    >
                      {frequencyOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          <Box>
                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                              {option.label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                              {option.description}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Description (Optional)"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    multiline
                    rows={2}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '4px'
                      }
                    }}
                  />
                </Grid>
              </Grid>

              {/* Schedule Settings based on frequency */}
              <Box sx={{ mt: 3, p: 2, backgroundColor: 'rgba(107, 70, 193, 0.05)', borderRadius: '4px', border: '1px solid rgba(107, 70, 193, 0.1)' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#007BA7', mb: 2 }}>
                  Schedule Settings
                </Typography>
                
                {formData.frequency === 'daily' && (
                  <Grid container spacing={2} alignItems="center">
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        label="Run Time"
                        type="time"
                        value={formData.daily_time}
                        onChange={(e) => handleInputChange('daily_time', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '4px'
                          }
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" sx={{ color: theme.palette.text.secondary, pt: 1 }}>
                        <strong>Data Range:</strong> Previous 24 hours of data will be exported
                      </Typography>
                    </Grid>
                  </Grid>
                )}

                {formData.frequency === 'weekly' && (
                  <Grid container spacing={2} alignItems="center">
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <FormControl fullWidth sx={{ borderRadius: '4px' }}>
                        <InputLabel>Day of Week</InputLabel>
                        <Select
                          value={formData.weekly_day}
                          label="Day of Week"
                          onChange={(e) => handleInputChange('weekly_day', e.target.value)}
                          sx={{ borderRadius: '4px' }}
                        >
                          <MenuItem value="monday">Monday</MenuItem>
                          <MenuItem value="tuesday">Tuesday</MenuItem>
                          <MenuItem value="wednesday">Wednesday</MenuItem>
                          <MenuItem value="thursday">Thursday</MenuItem>
                          <MenuItem value="friday">Friday</MenuItem>
                          <MenuItem value="saturday">Saturday</MenuItem>
                          <MenuItem value="sunday">Sunday</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <TextField
                        fullWidth
                        label="Run Time"
                        type="time"
                        value={formData.weekly_time}
                        onChange={(e) => handleInputChange('weekly_time', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '4px'
                          }
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="body2" sx={{ color: theme.palette.text.secondary, pt: 1 }}>
                        <strong>Data Range:</strong> Previous 7 days of data will be exported
                      </Typography>
                    </Grid>
                  </Grid>
                )}

                {formData.frequency === 'monthly' && (
                  <Grid container spacing={2} alignItems="center">
                    <Grid size={{ xs: 12, sm: 3 }}>
                      <TextField
                        fullWidth
                        label="Day of Month"
                        type="number"
                        value={formData.monthly_date}
                        onChange={(e) => handleInputChange('monthly_date', parseInt(e.target.value) || 1)}
                        inputProps={{ min: 1, max: 31 }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '4px'
                          }
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 3 }}>
                      <TextField
                        fullWidth
                        label="Run Time"
                        type="time"
                        value={formData.monthly_time}
                        onChange={(e) => handleInputChange('monthly_time', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '4px'
                          }
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" sx={{ color: theme.palette.text.secondary, pt: 1 }}>
                        <strong>Data Range:</strong> Previous 30 days of data will be exported
                      </Typography>
                    </Grid>
                  </Grid>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* Device Selection */}
          <Card sx={{ mb: 3, borderRadius: '4px', border: '1px solid rgba(107, 70, 193, 0.1)' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ 
                fontWeight: 600, 
                mb: 2,
                color: '#007BA7',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <DevicesIcon sx={{ fontSize: '1.2rem' }} />
                Device Selection
              </Typography>
              
              <Autocomplete
                multiple
                options={devices}
                getOptionLabel={(option) => `${option.name} (${option.device_id})`}
                value={devices.filter(device => formData.device_ids.includes(device.device_id))}
                onChange={(_, selectedDevices) => {
                  const deviceIds = selectedDevices.map(device => device.device_id);
                  handleInputChange('device_ids', deviceIds);
                }}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      {...getTagProps({ index })}
                      key={option.device_id}
                      label={option.name}
                      sx={{ borderRadius: '4px' }}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select Devices"
                    placeholder="Choose devices to include in export"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '4px'
                      }
                    }}
                  />
                )}
              />
            </CardContent>
          </Card>

          {/* Parameter Selection */}
          <Card sx={{ mb: 3, borderRadius: '4px', border: '1px solid rgba(107, 70, 193, 0.1)' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ 
                fontWeight: 600, 
                mb: 2,
                color: '#007BA7',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <ScienceIcon sx={{ fontSize: '1.2rem' }} />
                Parameter Selection
              </Typography>
              
              {formData.device_ids.length === 0 ? (
                <TextField
                  fullWidth
                  disabled
                  label="Select Parameters"
                  placeholder="Select devices first to see available parameters"
                  helperText="Choose devices above to load their available parameters"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '4px'
                    }
                  }}
                />
              ) : (
                <Autocomplete
                  multiple
                  options={parameters}
                  getOptionLabel={(option) => option}
                  value={formData.parameters}
                  onChange={(_, selectedParams) => {
                    handleInputChange('parameters', selectedParams);
                  }}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        {...getTagProps({ index })}
                        key={option}
                        label={option}
                        sx={{ borderRadius: '4px' }}
                      />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Parameters"
                      placeholder={parameters.length === 0 ? "No parameters available for selected devices" : "Choose parameters to include in export"}
                      helperText={parameters.length === 0 ? "Selected devices don't have mapped parameters" : `${parameters.length} parameters available`}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '4px'
                        }
                      }}
                    />
                  )}
                />
              )}
            </CardContent>
          </Card>

          {/* Export Settings */}
          <Card sx={{ mb: 3, borderRadius: '4px', border: '1px solid rgba(107, 70, 193, 0.1)' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ 
                fontWeight: 600, 
                mb: 2,
                color: '#007BA7',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <CalendarIcon sx={{ fontSize: '1.2rem' }} />
                Export Settings
              </Typography>
              
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth sx={{ borderRadius: '4px' }}>
                    <InputLabel>Export Format</InputLabel>
                    <Select
                      value={formData.format}
                      label="Export Format"
                      onChange={(e) => handleInputChange('format', e.target.value)}
                      sx={{ borderRadius: '4px' }}
                    >
                      {formatOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          <Box>
                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                              {option.label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                              {option.description}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid size={{ xs: 12 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.is_active}
                        onChange={(e) => handleInputChange('is_active', e.target.checked)}
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': {
                            color: '#007BA7'
                          },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                            backgroundColor: '#007BA7'
                          }
                        }}
                      />
                    }
                    label="Active (Enable this scheduled export)"
                    sx={{ fontWeight: 600 }}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Email Recipients */}
          <Card sx={{ mb: 3, borderRadius: '4px', border: '1px solid rgba(107, 70, 193, 0.1)' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ 
                fontWeight: 600, 
                mb: 2,
                color: '#007BA7',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <EmailIcon sx={{ fontSize: '1.2rem' }} />
                Email Recipients
              </Typography>
              
              {formData.recipients.map((recipient, index) => (
                <Paper
                  key={index}
                  sx={{
                    p: 2,
                    mb: 2,
                    borderRadius: '4px',
                    border: '1px solid rgba(107, 70, 193, 0.1)',
                    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
                  }}
                >
                  <Grid container spacing={2} alignItems="center">
                    <Grid size={{ xs: 12, sm: 5 }}>
                      <TextField
                        fullWidth
                        label="Email Address"
                        type="email"
                        value={recipient.email}
                        onChange={(e) => handleRecipientChange(index, 'email', e.target.value)}
                        required
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '4px'
                          }
                        }}
                      />
                    </Grid>
                    
                    <Grid size={{ xs: 12, sm: 5 }}>
                      <TextField
                        fullWidth
                        label="Recipient Name"
                        value={recipient.name}
                        onChange={(e) => handleRecipientChange(index, 'name', e.target.value)}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '4px'
                          }
                        }}
                      />
                    </Grid>
                    
                    <Grid size={{ xs: 12, sm: 2 }}>
                      <Stack direction="row" spacing={1}>
                        {formData.recipients.length > 1 && (
                          <IconButton
                            onClick={() => removeRecipient(index)}
                            sx={{
                              color: '#EF4444',
                              '&:hover': {
                                backgroundColor: 'rgba(239, 68, 68, 0.1)'
                              }
                            }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        )}
                        
                        {index === formData.recipients.length - 1 && (
                          <IconButton
                            onClick={addRecipient}
                            sx={{
                              color: '#007BA7',
                              '&:hover': {
                                backgroundColor: 'rgba(107, 70, 193, 0.1)'
                              }
                            }}
                          >
                            <AddIcon />
                          </IconButton>
                        )}
                      </Stack>
                    </Grid>
                  </Grid>
                </Paper>
              ))}
            </CardContent>
          </Card>

          {/* Actions */}
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button
              variant="outlined"
              onClick={onCancel}
              sx={{
                borderRadius: '4px',
                px: 4,
                py: 1.5,
                fontWeight: 600,
                borderColor: '#007BA7',
                color: '#007BA7',
                '&:hover': {
                  borderColor: '#005577',
                  backgroundColor: 'rgba(107, 70, 193, 0.05)'
                }
              }}
            >
              Cancel
            </Button>
            
            <Button
              type="submit"
              variant="contained"
              disabled={submitting}
              sx={{
                background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
                borderRadius: '4px',
                px: 4,
                py: 1.5,
                fontWeight: 600,
                '&:hover': {
                  background: 'linear-gradient(135deg, #005577 0%, #006B9A 100%)'
                },
                '&:disabled': {
                  background: 'rgba(107, 70, 193, 0.3)'
                }
              }}
            >
              {submitting ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={20} sx={{ color: 'white' }} />
                  <Typography>Saving...</Typography>
                </Stack>
              ) : (
                exportData ? 'Update Export' : 'Create Export'
              )}
            </Button>
          </Stack>
        </form>
      </Box>
    </Box>
  );
};

export default ScheduledExportForm;