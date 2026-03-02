import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Grid,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Badge,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Avatar
} from '@mui/material';
import {
  Assignment,
  CheckCircle,
  Schedule,
  LocationOn,
  PhotoCamera,
  Edit,
  PlayArrow,
  Stop,
  Visibility,
  CloudUpload,
  Person,
  Business,
  DeviceHub,
  Today,
  Upcoming
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import axios from 'axios';

const TechnicianDashboard = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [schedules, setSchedules] = useState([]);
  const [todaySchedules, setTodaySchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMaintenance, setSelectedMaintenance] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('view'); // 'view', 'start', 'complete'
  const [formData, setFormData] = useState({
    technician_notes: '',
    maintenance_notes: '',
    technician_signature: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const [schedulesRes, todayRes] = await Promise.all([
        axios.get('/api/technician/schedule', { headers }),
        axios.get('/api/technician/schedule/today', { headers })
      ]);

      console.log('All Schedules:', schedulesRes.data);
      console.log('Today Schedules:', todayRes.data);

      setSchedules(Array.isArray(schedulesRes.data) ? schedulesRes.data : []);
      setTodaySchedules(Array.isArray(todayRes.data) ? todayRes.data : []);
    } catch (error) {
      console.error('Error loading technician data:', error);
      setError('Failed to load maintenance schedule: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleStartMaintenance = async (maintenanceId) => {
    try {
      setSubmitting(true);
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      await axios.put(`/api/technician/maintenance/${maintenanceId}/start`, {
        gps_location: null // Will be implemented with geolocation API
      }, { headers });

      setDialogOpen(false);
      loadData(); // Refresh data
    } catch (error) {
      console.error('Error starting maintenance:', error);
      setError('Failed to start maintenance: ' + (error.response?.data?.error || error.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteMaintenance = async () => {
    if (!selectedMaintenance) return;

    try {
      setSubmitting(true);
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      await axios.put(`/api/technician/maintenance/${selectedMaintenance.maintenance_id}/complete`, formData, { headers });

      setDialogOpen(false);
      setSelectedMaintenance(null);
      setFormData({ technician_notes: '', maintenance_notes: '', technician_signature: '' });
      loadData(); // Refresh data
    } catch (error) {
      console.error('Error completing maintenance:', error);
      setError('Failed to complete maintenance: ' + (error.response?.data?.error || error.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadPhotos = async (maintenanceId, files) => {
    if (!files || files.length === 0) return;

    try {
      setUploadingPhotos(true);
      const token = localStorage.getItem('iot_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('photos', file);
      });

      await axios.post(`/api/technician/maintenance/${maintenanceId}/photos`, formData, {
        headers: {
          ...headers,
          'Content-Type': 'multipart/form-data'
        }
      });

      loadData(); // Refresh data
    } catch (error) {
      console.error('Error uploading photos:', error);
      setError('Failed to upload photos: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploadingPhotos(false);
    }
  };

  const openDialog = (maintenance, mode) => {
    setSelectedMaintenance(maintenance);
    setDialogMode(mode);
    
    if (mode === 'complete') {
      setFormData({
        technician_notes: maintenance.technician_notes || '',
        maintenance_notes: maintenance.maintenance_notes || '',
        technician_signature: ''
      });
    }
    
    setDialogOpen(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'warning';
      case 'scheduled': return 'info';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle />;
      case 'in_progress': return <PlayArrow />;
      case 'scheduled': return <Schedule />;
      case 'cancelled': return <Stop />;
      default: return <Assignment />;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const MaintenanceCard = ({ maintenance }) => (
    <Card sx={{ mb: 2, border: '1px solid #e0e0e0' }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Box>
            <Typography variant="h6" color="primary" fontWeight={600}>
              {maintenance.sensor_site_name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {maintenance.site_name} • {maintenance.company_name}
            </Typography>
          </Box>
          <Chip
            icon={getStatusIcon(maintenance.status)}
            label={maintenance.status.replace('_', ' ').toUpperCase()}
            color={getStatusColor(maintenance.status)}
            size="small"
          />
        </Box>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6}>
            <Box display="flex" alignItems="center" mb={1}>
              <Schedule sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2">
                <strong>Planned:</strong> {formatDate(maintenance.planned_date)}
              </Typography>
            </Box>
            {maintenance.actual_date && (
              <Box display="flex" alignItems="center">
                <CheckCircle sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2">
                  <strong>Completed:</strong> {formatDate(maintenance.actual_date)}
                </Typography>
              </Box>
            )}
          </Grid>
          <Grid item xs={6}>
            <Box display="flex" alignItems="center" mb={1}>
              <Person sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2">
                <strong>Type:</strong> {maintenance.maintenance_type}
              </Typography>
            </Box>
            {maintenance.assigned_person && (
              <Box display="flex" alignItems="center">
                <Assignment sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2">
                  <strong>Assigned:</strong> {maintenance.assigned_person}
                </Typography>
              </Box>
            )}
          </Grid>
        </Grid>

        {maintenance.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {maintenance.description}
          </Typography>
        )}

        <Box display="flex" gap={1} flexWrap="wrap">
          {maintenance.status === 'scheduled' && (
            <Button
              variant="contained"
              size="small"
              startIcon={<PlayArrow />}
              onClick={() => openDialog(maintenance, 'start')}
            >
              Start Work
            </Button>
          )}
          
          {maintenance.status === 'in_progress' && (
            <>
              <Button
                variant="contained"
                color="success"
                size="small"
                startIcon={<CheckCircle />}
                onClick={() => openDialog(maintenance, 'complete')}
              >
                Complete
              </Button>
              <input
                accept="image/*"
                style={{ display: 'none' }}
                id={`photo-upload-${maintenance.maintenance_id}`}
                type="file"
                multiple
                onChange={(e) => handleUploadPhotos(maintenance.maintenance_id, e.target.files)}
              />
              <label htmlFor={`photo-upload-${maintenance.maintenance_id}`}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PhotoCamera />}
                  component="span"
                  disabled={uploadingPhotos}
                >
                  Add Photos
                </Button>
              </label>
            </>
          )}
          
          <Button
            variant="outlined"
            size="small"
            startIcon={<Visibility />}
            onClick={() => openDialog(maintenance, 'view')}
          >
            View Details
          </Button>
        </Box>

        {maintenance.photos && maintenance.photos.length > 0 && (
          <Box mt={2}>
            <Typography variant="body2" color="text.secondary" mb={1}>
              Photos ({maintenance.photos.length})
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              {maintenance.photos.map((photo, index) => (
                <Chip
                  key={index}
                  icon={<PhotoCamera />}
                  label={`Photo ${index + 1}`}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const TabPanel = ({ children, value, index }) => (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom color="primary" fontWeight={600}>
        🔧 Technician Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Manage your maintenance tasks and field operations
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Quick Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="primary">
              {todaySchedules.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Today's Tasks
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="warning.main">
              {schedules.filter(s => s.status === 'in_progress').length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              In Progress
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="success.main">
              {schedules.filter(s => s.status === 'completed').length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Completed
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab 
            label={
              <Box display="flex" alignItems="center">
                <Today sx={{ mr: 1 }} />
                Today's Tasks
                <Badge badgeContent={todaySchedules.length} color="primary" sx={{ ml: 1 }} />
              </Box>
            } 
          />
          <Tab 
            label={
              <Box display="flex" alignItems="center">
                <Schedule sx={{ mr: 1 }} />
                All Tasks
                <Badge badgeContent={schedules.length} color="primary" sx={{ ml: 1 }} />
              </Box>
            } 
          />
        </Tabs>
      </Box>

      {/* Today's Tasks */}
      <TabPanel value={activeTab} index={0}>
        {todaySchedules.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              🎉 No tasks scheduled for today!
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Check back tomorrow or contact your supervisor for new assignments.
            </Typography>
          </Paper>
        ) : (
          <Box>
            {todaySchedules.map((maintenance) => (
              <MaintenanceCard key={maintenance.maintenance_id} maintenance={maintenance} />
            ))}
          </Box>
        )}
      </TabPanel>

      {/* All Tasks */}
      <TabPanel value={activeTab} index={1}>
        {schedules.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              📋 No maintenance tasks assigned
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Contact your supervisor to get assigned to maintenance tasks.
            </Typography>
          </Paper>
        ) : (
          <Box>
            {schedules.map((maintenance) => (
              <MaintenanceCard key={maintenance.maintenance_id} maintenance={maintenance} />
            ))}
          </Box>
        )}
      </TabPanel>

      {/* Maintenance Details Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {dialogMode === 'view' && 'Maintenance Details'}
          {dialogMode === 'start' && 'Start Maintenance Work'}
          {dialogMode === 'complete' && 'Complete Maintenance'}
        </DialogTitle>
        <DialogContent>
          {selectedMaintenance && (
            <Box>
              {dialogMode === 'view' && (
                <Box>
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="primary">Site Information</Typography>
                      <Typography variant="body2">{selectedMaintenance.sensor_site_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selectedMaintenance.site_name} • {selectedMaintenance.company_name}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="primary">Device Details</Typography>
                      <Typography variant="body2">{selectedMaintenance.device_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selectedMaintenance.sensor_parameter} • {selectedMaintenance.brand_name}
                      </Typography>
                    </Grid>
                  </Grid>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="primary">Schedule</Typography>
                      <Typography variant="body2">Planned: {formatDate(selectedMaintenance.planned_date)}</Typography>
                      {selectedMaintenance.actual_date && (
                        <Typography variant="body2">Completed: {formatDate(selectedMaintenance.actual_date)}</Typography>
                      )}
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="primary">Status</Typography>
                      <Chip
                        icon={getStatusIcon(selectedMaintenance.status)}
                        label={selectedMaintenance.status.replace('_', ' ').toUpperCase()}
                        color={getStatusColor(selectedMaintenance.status)}
                        size="small"
                      />
                    </Grid>
                  </Grid>

                  {selectedMaintenance.description && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" color="primary" gutterBottom>
                        Description
                      </Typography>
                      <Typography variant="body2">{selectedMaintenance.description}</Typography>
                    </>
                  )}

                  {selectedMaintenance.technician_notes && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" color="primary" gutterBottom>
                        Technician Notes
                      </Typography>
                      <Typography variant="body2">{selectedMaintenance.technician_notes}</Typography>
                    </>
                  )}
                </Box>
              )}

              {dialogMode === 'start' && (
                <Box>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Starting maintenance work for {selectedMaintenance.sensor_site_name}
                  </Alert>
                  <Typography variant="body2">
                    This will mark the maintenance as "in progress" and record the start time.
                    Make sure you have all necessary tools and equipment before starting.
                  </Typography>
                </Box>
              )}

              {dialogMode === 'complete' && (
                <Box>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Technician Notes"
                    value={formData.technician_notes}
                    onChange={(e) => setFormData({...formData, technician_notes: e.target.value})}
                    placeholder="Describe what was done, any issues found, parts replaced, etc."
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Maintenance Notes"
                    value={formData.maintenance_notes}
                    onChange={(e) => setFormData({...formData, maintenance_notes: e.target.value})}
                    placeholder="Additional maintenance notes, recommendations, etc."
                    sx={{ mb: 2 }}
                  />
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Make sure to upload photos of your work before completing this maintenance.
                  </Alert>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          {dialogMode === 'start' && (
            <Button
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={() => handleStartMaintenance(selectedMaintenance?.maintenance_id)}
              disabled={submitting}
            >
              Start Work
            </Button>
          )}
          {dialogMode === 'complete' && (
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircle />}
              onClick={handleCompleteMaintenance}
              disabled={submitting}
            >
              Complete Maintenance
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TechnicianDashboard;


