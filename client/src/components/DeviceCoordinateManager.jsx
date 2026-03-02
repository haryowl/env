import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  LocationOn as LocationIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const DeviceCoordinateManager = ({ device, onUpdate }) => {
  const [coordinateSource, setCoordinateSource] = useState('device'); // 'device' or 'manual'
  const [manualLatitude, setManualLatitude] = useState('');
  const [manualLongitude, setManualLongitude] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    if (device) {
      // Load current coordinates only when device changes
      loadDeviceCoordinates();
    }
  }, [device?.device_id]); // Only depend on device_id, not the entire device object

  const loadDeviceCoordinates = async () => {
    if (!device) return;
    
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices/${device.device_id}/coordinates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setManualLatitude(data.latitude?.toString() || '');
        setManualLongitude(data.longitude?.toString() || '');
        // Only set the source if it's not already set to manual
        if (coordinateSource === 'device') {
          setCoordinateSource(data.source || 'device');
        }
      } else {
        console.log('No coordinates found for device, using defaults');
        setManualLatitude('');
        setManualLongitude('');
        if (coordinateSource === 'device') {
          setCoordinateSource('device');
        }
      }
    } catch (error) {
      console.error('Error loading coordinates:', error);
      // Set defaults on error
      setManualLatitude('');
      setManualLongitude('');
      if (coordinateSource === 'device') {
        setCoordinateSource('device');
      }
    }
  };

  const handleSaveCoordinates = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices/${device.device_id}/coordinates`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          latitude: parseFloat(manualLatitude),
          longitude: parseFloat(manualLongitude),
          source: coordinateSource
        })
      });
      
      if (response.ok) {
        setSuccess('Coordinates updated successfully');
        setEditDialogOpen(false);
        if (onUpdate) {
          onUpdate();
        }
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update coordinates');
      }
    } catch (error) {
      console.error('Error saving coordinates:', error);
      setError('Failed to save coordinates');
    } finally {
      setLoading(false);
    }
  };

  const validateCoordinates = () => {
    const lat = parseFloat(manualLatitude);
    const lng = parseFloat(manualLongitude);
    
    if (isNaN(lat) || isNaN(lng)) {
      return 'Please enter valid numeric coordinates';
    }
    
    if (lat < -90 || lat > 90) {
      return 'Latitude must be between -90 and 90';
    }
    
    if (lng < -180 || lng > 180) {
      return 'Longitude must be between -180 and 180';
    }
    
    return null;
  };

  const handleSave = () => {
    const validationError = validateCoordinates();
    if (validationError) {
      setError(validationError);
      return;
    }
    
    handleSaveCoordinates();
  };

  const handleCoordinateSourceChange = (newSource) => {
    console.log('Coordinate source changing from', coordinateSource, 'to', newSource);
    setCoordinateSource(newSource);
    if (newSource === 'manual') {
      // When switching to manual, don't reload coordinates from server
      // Keep the current manual values
      console.log('Switching to manual - keeping current values');
    } else {
      // When switching back to device, reload from server
      console.log('Switching to device - reloading from server');
      loadDeviceCoordinates();
    }
  };

  if (!device) return null;

  return (
    <>
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" alignItems="center">
              <LocationIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Device Coordinates</Typography>
            </Box>
            <Tooltip title="Edit Coordinates">
              <IconButton onClick={() => setEditDialogOpen(true)} size="small">
                <EditIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="textSecondary">
                Current Coordinates
              </Typography>
              <Typography variant="body2">
                {device.latitude && device.longitude 
                  ? `${device.latitude.toFixed(6)}, ${device.longitude.toFixed(6)}`
                  : coordinateSource === 'manual' && manualLatitude && manualLongitude
                  ? `${parseFloat(manualLatitude).toFixed(6)}, ${parseFloat(manualLongitude).toFixed(6)}`
                  : 'No coordinates available'
                }
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="textSecondary">
                Source
              </Typography>
              <Chip 
                label={coordinateSource === 'device' ? 'Device Data' : 'Manual Input'}
                color={coordinateSource === 'device' ? 'success' : 'warning'}
                size="small"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Edit Coordinates Dialog */}
      <Dialog 
        open={editDialogOpen} 
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <LocationIcon sx={{ mr: 1 }} />
            Edit Device Coordinates
          </Box>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Coordinate Source</InputLabel>
                <Select
                  value={coordinateSource}
                  label="Coordinate Source"
                  onChange={(e) => handleCoordinateSourceChange(e.target.value)}
                >
                  <MenuItem value="device">From Device Data</MenuItem>
                  <MenuItem value="manual">Manual Input</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            {coordinateSource === 'manual' && (
              <>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Latitude"
                    value={manualLatitude}
                    onChange={(e) => setManualLatitude(e.target.value)}
                    placeholder="e.g., 37.7749"
                    size="small"
                    helperText="Range: -90 to 90"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Longitude"
                    value={manualLongitude}
                    onChange={(e) => setManualLongitude(e.target.value)}
                    placeholder="e.g., -122.4194"
                    size="small"
                    helperText="Range: -180 to 180"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="info.main" sx={{ fontStyle: 'italic' }}>
                    💡 Manual coordinates will be stored separately and won't affect device data mapping.
                  </Typography>
                </Grid>
              </>
            )}
            
            {error && (
              <Grid item xs={12}>
                <Alert severity="error">{error}</Alert>
              </Grid>
            )}
            
            {success && (
              <Grid item xs={12}>
                <Alert severity="success">{success}</Alert>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DeviceCoordinateManager;