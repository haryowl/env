import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
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
  Alert,
  CircularProgress,
  Chip,
  Grid
} from '@mui/material';
import {
  DataGrid,
  GridActionsCellItem
} from '@mui/x-data-grid';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Build as MaintenanceIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import axios from 'axios';

const Maintenance = () => {
  const [maintenanceSchedules, setMaintenanceSchedules] = useState([]);
  const [sensorSites, setSensorSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('add');
  const [editingItem, setEditingItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    sensor_site_id: '',
    maintenance_type: '',
    planned_date: '',
    actual_date: '',
    assigned_person: '',
    status: 'scheduled',
    description: '',
    maintenance_notes: '',
    reminder_days_before: 1,
    reminder_email_time: '09:00',
    reminder_recipients: []
  });
  const [sensorSiteUsers, setSensorSiteUsers] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  useEffect(() => {
    loadData();
    loadTechnicians();
  }, []);

  // Reload sensor site users when technicians are loaded or when form data changes
  useEffect(() => {
    if (technicians.length > 0 && formData.sensor_site_id) {
      loadSensorSiteUsers(formData.sensor_site_id);
    }
  }, [technicians, formData.sensor_site_id]);

  // Load technicians (hardcoded list for now due to API auth issues)
  const loadTechnicians = async () => {
    try {
      // Try the new API endpoint first
      const response = await axios.get('/api/users/by-role/technician');
      setTechnicians(response.data || []);
      console.log('Loaded technicians from API:', response.data);
    } catch (error) {
      console.error('Error loading technicians from API, using hardcoded list:', error);
      
      // Fallback: use hardcoded technician list
      const hardcodedTechnicians = [
        { user_id: 14, username: 'tech111', email: 'tech@techh.com', status: 'active' }
      ];
      
      setTechnicians(hardcodedTechnicians);
      console.log('Loaded technicians from hardcoded list:', hardcodedTechnicians);
    }
  };

  // Load users assigned to selected sensor site (filtered to only technicians)
  const loadSensorSiteUsers = (sensorSiteId) => {
    if (!sensorSiteId) {
      setSensorSiteUsers([]);
      return;
    }

    const selectedSite = sensorSites.find(site => site.sensor_site_id == sensorSiteId);
    console.log('Selected sensor site:', selectedSite); // Debug log
    
    if (selectedSite) {
      let allUsers = [];
      // Check both usernames (from backend) and assigned_users (legacy)
      if (selectedSite.usernames && Array.isArray(selectedSite.usernames)) {
        allUsers = selectedSite.usernames;
      } else if (selectedSite.assigned_users) {
        if (typeof selectedSite.assigned_users === 'string') {
          allUsers = selectedSite.assigned_users.split(',').map(u => u.trim());
        } else if (Array.isArray(selectedSite.assigned_users)) {
          allUsers = selectedSite.assigned_users;
        }
      }
      
      // Filter to only include users who are technicians
      const technicianUsernames = technicians.map(t => t.username);
      const filteredUsers = allUsers.filter(username => technicianUsernames.includes(username));
      
      console.log('All users for sensor site:', allUsers); // Debug log
      console.log('Available technicians:', technicianUsernames); // Debug log
      console.log('Filtered technician users:', filteredUsers); // Debug log
      
      setSensorSiteUsers(filteredUsers);
    } else {
      console.log('No sensor site found with ID:', sensorSiteId); // Debug log
      setSensorSiteUsers([]);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Get auth token from localStorage
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const [maintenanceRes, sensorSitesRes] = await Promise.all([
        axios.get('/api/maintenance', { headers }),
        axios.get('/api/sensor-sites', { headers })
      ]);

      console.log('Maintenance Schedules:', maintenanceRes.data);
      console.log('Sensor Sites:', sensorSitesRes.data);

      setMaintenanceSchedules(Array.isArray(maintenanceRes.data) ? maintenanceRes.data : []);
      setSensorSites(Array.isArray(sensorSitesRes.data) ? sensorSitesRes.data : []);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load maintenance schedules');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setDialogMode('add');
    setEditingItem(null);
    setFormData({
      sensor_site_id: '',
      maintenance_type: '',
      planned_date: '',
      actual_date: '',
      assigned_person: '',
      status: 'scheduled',
      description: '',
      maintenance_notes: '',
      reminder_days_before: 1,
      reminder_email_time: '09:00',
      reminder_recipients: []
    });
    setError(null);
    setDialogOpen(true);
  };

  const handleEdit = (item) => {
    setDialogMode('edit');
    setEditingItem(item);
    setFormData({
      sensor_site_id: item.sensor_site_id || '',
      maintenance_type: item.maintenance_type || '',
      planned_date: item.planned_date || '',
      actual_date: item.actual_date || '',
      assigned_person: item.assigned_person || '',
      status: item.status || 'scheduled',
      description: item.description || '',
      maintenance_notes: item.maintenance_notes || '',
      reminder_days_before: item.reminder_days_before || 1,
      reminder_email_time: item.reminder_email_time || '09:00',
      reminder_recipients: item.reminder_recipients || []
    });
    // Load users for the selected sensor site
    loadSensorSiteUsers(item.sensor_site_id);
    setError(null);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this maintenance schedule?')) {
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      await axios.delete(`/api/maintenance/${id}`, { headers });
      loadData();
    } catch (error) {
      console.error('Error deleting maintenance schedule:', error);
      setError('Failed to delete maintenance schedule');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      // Prepare form data with proper formatting
      let submitData = { ...formData };
      
      // Format reminder email time to include seconds if needed
      if (submitData.reminder_email_time && submitData.reminder_email_time.split(':').length === 2) {
        submitData.reminder_email_time += ':00';
      }
      
      const endpoint = dialogMode === 'add' ? '/api/maintenance' : `/api/maintenance/${editingItem.maintenance_id}`;
      const method = dialogMode === 'add' ? 'post' : 'put';
      
      await axios[method](endpoint, submitData, { headers });
      setDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Error submitting form:', error);
      setError(error.response?.data?.error || `Failed to ${dialogMode} maintenance schedule`);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'overdue': return 'error';
      case 'due_soon': return 'warning';
      case 'scheduled': return 'info';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircleIcon />;
      case 'overdue': return <ErrorIcon />;
      case 'due_soon': return <WarningIcon />;
      case 'scheduled': return <ScheduleIcon />;
      default: return <ScheduleIcon />;
    }
  };

  // Maintenance schedules columns
  const maintenanceColumns = [
    { field: 'maintenance_id', headerName: 'ID', width: 80 },
    { field: 'sensor_site_name', headerName: 'Sensor Site', width: 150 },
    { field: 'brand_name', headerName: 'Brand', width: 120 },
    { field: 'sensor_type', headerName: 'Type', width: 120 },
    { field: 'site_name', headerName: 'Site', width: 120 },
    { field: 'maintenance_type', headerName: 'Maintenance Type', width: 150 },
    { field: 'planned_date', headerName: 'Planned Date', width: 130 },
    { field: 'actual_date', headerName: 'Actual Date', width: 130 },
    { field: 'assigned_person', headerName: 'Assigned Person', width: 150 },
    { 
      field: 'assigned_users', 
      headerName: 'Site Users', 
      width: 150,
      renderCell: (params) => {
        if (!params.value || params.value.length === 0) return 'No users';
        if (typeof params.value === 'string') {
          return params.value;
        }
        if (Array.isArray(params.value)) {
          return params.value.join(', ');
        }
        return 'No users';
      }
    },
    {
      field: 'status_color',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip
          icon={getStatusIcon(params.value)}
          label={params.value?.replace('_', ' ') || 'Unknown'}
          color={getStatusColor(params.value)}
          size="small"
        />
      )
    },
    { field: 'description', headerName: 'Description', width: 200, flex: 1 },
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
          onClick={() => handleDelete(params.row.maintenance_id)}
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
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 3 
      }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          <MaintenanceIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Maintenance Schedules
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
          Add Maintenance Schedule
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ height: 600, width: '100%' }}>
            <DataGrid
              rows={maintenanceSchedules}
              columns={maintenanceColumns}
              getRowId={(row) => row.maintenance_id}
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } }
              }}
              disableRowSelectionOnClick
            />
          </Box>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {dialogMode === 'add' ? 'Add Maintenance Schedule' : 'Edit Maintenance Schedule'}
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Sensor Site</InputLabel>
                  <Select
                    value={formData.sensor_site_id || ''}
                    onChange={(e) => {
                      const sensorSiteId = e.target.value;
                      setFormData({...formData, sensor_site_id: sensorSiteId, assigned_person: ''});
                      loadSensorSiteUsers(sensorSiteId);
                    }}
                    label="Sensor Site"
                  >
                    {sensorSites.map((site) => (
                      <MenuItem key={site.sensor_site_id} value={site.sensor_site_id}>
                        {site.name} - {site.brand_name} ({site.site_name})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Maintenance Type</InputLabel>
                  <Select
                    value={formData.maintenance_type || ''}
                    onChange={(e) => setFormData({...formData, maintenance_type: e.target.value})}
                    label="Maintenance Type"
                  >
                    <MenuItem value="routine">Routine Maintenance</MenuItem>
                    <MenuItem value="repair">Repair</MenuItem>
                    <MenuItem value="calibration">Calibration</MenuItem>
                    <MenuItem value="inspection">Inspection</MenuItem>
                    <MenuItem value="replacement">Replacement</MenuItem>
                    <MenuItem value="upgrade">Upgrade</MenuItem>
                    <MenuItem value="emergency">Emergency</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Planned Date"
                  type="date"
                  value={formData.planned_date || ''}
                  onChange={(e) => setFormData({...formData, planned_date: e.target.value})}
                  InputLabelProps={{ shrink: true }}
                  required
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Actual Date"
                  type="date"
                  value={formData.actual_date || ''}
                  onChange={(e) => setFormData({...formData, actual_date: e.target.value})}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Assigned Person</InputLabel>
                  <Select
                    value={formData.assigned_person || ''}
                    onChange={(e) => setFormData({...formData, assigned_person: e.target.value})}
                    label="Assigned Person"
                  >
                    <MenuItem value="">
                      <em>Select a technician</em>
                    </MenuItem>
                    {sensorSiteUsers.map((user) => (
                      <MenuItem key={user} value={user}>
                        {user}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={formData.status || ''}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    label="Status"
                  >
                    <MenuItem value="scheduled">Scheduled</MenuItem>
                    <MenuItem value="in_progress">In Progress</MenuItem>
                    <MenuItem value="completed">Completed</MenuItem>
                    <MenuItem value="cancelled">Cancelled</MenuItem>
                    <MenuItem value="overdue">Overdue</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  multiline
                  rows={3}
                  value={formData.description || ''}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Maintenance Notes"
                  multiline
                  rows={3}
                  value={formData.maintenance_notes || ''}
                  onChange={(e) => setFormData({...formData, maintenance_notes: e.target.value})}
                />
              </Grid>
              
              {/* Email Reminder Settings */}
              <Grid item xs={12}>
                <Typography variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 600, color: '#007BA7' }}>
                  📧 Email Reminder Settings
                </Typography>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Days Before Reminder"
                  type="number"
                  inputProps={{ min: 0, max: 30 }}
                  value={formData.reminder_days_before || 1}
                  onChange={(e) => setFormData({...formData, reminder_days_before: parseInt(e.target.value) || 1})}
                  helperText="How many days before planned date to send reminder"
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Reminder Time"
                  type="time"
                  value={formData.reminder_email_time || '09:00'}
                  onChange={(e) => setFormData({...formData, reminder_email_time: e.target.value})}
                  InputLabelProps={{ shrink: true }}
                  helperText="Time to send reminder email"
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Additional Email Recipients"
                  value={Array.isArray(formData.reminder_recipients) ? formData.reminder_recipients.join(', ') : ''}
                  onChange={(e) => {
                    const emails = e.target.value.split(',').map(email => email.trim()).filter(email => email);
                    setFormData({...formData, reminder_recipients: emails});
                  }}
                  helperText="Comma-separated email addresses (site users will be automatically included)"
                  placeholder="user1@example.com, user2@example.com"
                />
              </Grid>
            </Grid>
          </DialogContent>
          
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={submitting}
              sx={{ 
                backgroundColor: '#007BA7',
                '&:hover': {
                  backgroundColor: '#005f87',
                }
              }}
            >
              {submitting ? <CircularProgress size={20} /> : (dialogMode === 'add' ? 'Add' : 'Update')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default Maintenance;
