import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  useTheme,
  Stack,
  Grid,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  Add as AddIcon,
  Schedule as ScheduleIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  History as HistoryIcon,
  Email as EmailIcon,
  GetApp as DownloadIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  ScheduleSend as ScheduleSendIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import ScheduledExportForm from './ScheduledExportForm';
import ScheduledExportLogs from './ScheduledExportLogs';

const ScheduledExports = () => {
  const theme = useTheme();
  const [exports, setExports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [selectedExport, setSelectedExport] = useState(null);
  const [editExportData, setEditExportData] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Load scheduled exports
  const loadExports = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/scheduled-exports`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setExports(data.exports || []);
        setError('');
      } else {
        throw new Error('Failed to load scheduled exports');
      }
    } catch (error) {
      console.error('Error loading scheduled exports:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load exports on component mount
  useEffect(() => {
    loadExports();
  }, []);

  // Handle create export
  const handleCreateExport = async (exportData) => {
    try {
      setSubmitting(true);
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/scheduled-exports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(exportData)
      });

      if (response.ok) {
        setCreateDialogOpen(false);
        await loadExports();
        setError('');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create scheduled export');
      }
    } catch (error) {
      console.error('Error creating scheduled export:', error);
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle update export
  const handleUpdateExport = async (exportId, exportData) => {
    try {
      setSubmitting(true);
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/scheduled-exports/${exportId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(exportData)
      });

      if (response.ok) {
        setEditDialogOpen(false);
        setEditExportData(null);
        await loadExports();
        setError('');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update scheduled export');
      }
    } catch (error) {
      console.error('Error updating scheduled export:', error);
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete export
  const handleDeleteExport = async (exportId) => {
    try {
      setActionLoading(prev => ({ ...prev, [exportId]: true }));
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/scheduled-exports/${exportId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        await loadExports();
        setError('');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete scheduled export');
      }
    } catch (error) {
      console.error('Error deleting scheduled export:', error);
      setError(error.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [exportId]: false }));
    }
  };

  // Handle manual trigger
  const handleTriggerExport = async (exportId) => {
    try {
      console.log('🚀 Triggering export for ID:', exportId);
      setActionLoading(prev => ({ ...prev, [`trigger_${exportId}`]: true }));
      const token = localStorage.getItem('iot_token');
      
      const response = await fetch(`${API_BASE_URL}/scheduled-exports/${exportId}/trigger`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        console.log('✅ Export triggered successfully');
        // Show success message
        setError('');
        // Refresh exports to get updated logs
        await loadExports();
      } else {
        const errorData = await response.json();
        console.error('❌ Export trigger failed:', errorData);
        throw new Error(errorData.error || 'Failed to trigger export');
      }
    } catch (error) {
      console.error('❌ Error triggering export:', error);
      setError(error.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [`trigger_${exportId}`]: false }));
    }
  };

  // Handle menu actions
  const handleMenuOpen = (event, exportItem) => {
    setAnchorEl(event.currentTarget);
    setSelectedExport(exportItem);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedExport(null);
  };

  const handleEdit = async () => {
    if (!selectedExport) return;
    
    try {
      setLoading(true);
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/scheduled-exports/${selectedExport.export_id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Edit export - API response received:', data.export);
        setEditExportData(data.export); // Store edit data separately
        console.log('🚀 Opening edit dialog with data:', data.export);
        setEditDialogOpen(true);
      } else {
        console.error('❌ Failed to fetch export data:', response.status, response.statusText);
        setError('Failed to load export data for editing');
      }
    } catch (error) {
      console.error('Error fetching export data:', error);
      setError('Failed to load export data for editing');
    } finally {
      setLoading(false);
      handleMenuClose();
    }
  };

  const handleDelete = () => {
    if (selectedExport && window.confirm(`Are you sure you want to delete "${selectedExport.name}"?`)) {
      handleDeleteExport(selectedExport.export_id);
    }
    handleMenuClose();
  };

  const handleViewLogs = () => {
    setLogsDialogOpen(true);
    handleMenuClose();
  };

  // Get status color and icon
  const getStatusDisplay = (exportItem) => {
    if (exportItem.is_active) {
      return {
        color: '#10B981',
        icon: <CheckCircleIcon />,
        text: 'Active'
      };
    } else {
      return {
        color: '#EF4444',
        icon: <ErrorIcon />,
        text: 'Inactive'
      };
    }
  };

  // Get frequency display
  const getFrequencyDisplay = (frequency) => {
    const frequencyMap = {
      daily: { color: '#3B82F6', text: 'Daily' },
      weekly: { color: '#0099CC', text: 'Weekly' },
      monthly: { color: '#F59E0B', text: 'Monthly' }
    };
    return frequencyMap[frequency] || { color: '#6B7280', text: frequency };
  };

  if (loading && exports.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography 
          variant="h4" 
          sx={{ 
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 1
          }}
        >
          Scheduled Exports
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage automated report generation and email delivery
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Action Buttons */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
          sx={{
            background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
            borderRadius: '4px',
            px: 3,
            py: 1.5,
            textTransform: 'none',
            fontSize: '1rem',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(107, 70, 193, 0.3)',
            '&:hover': {
              boxShadow: '0 6px 16px rgba(107, 70, 193, 0.4)',
              transform: 'translateY(-2px)'
            }
          }}
        >
          Create Export
        </Button>
        
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadExports}
          sx={{
            borderRadius: '4px',
            px: 3,
            py: 1.5,
            textTransform: 'none',
            fontSize: '1rem',
            fontWeight: 600,
            borderColor: '#007BA7',
            color: '#007BA7',
            '&:hover': {
              borderColor: '#0099CC',
              backgroundColor: 'rgba(107, 70, 193, 0.04)'
            }
          }}
        >
          Refresh
        </Button>
      </Box>

      {/* Exports Grid */}
      {exports.length === 0 ? (
        <Card sx={{ textAlign: 'center', py: 6 }}>
          <CardContent>
            <ScheduleSendIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Scheduled Exports
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create your first scheduled export to automate report generation
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
              sx={{
                background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
                borderRadius: '4px',
                px: 3,
                py: 1.5,
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 600
              }}
            >
              Create Export
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {exports.map((exportItem) => {
            const statusDisplay = getStatusDisplay(exportItem);
            const frequencyDisplay = getFrequencyDisplay(exportItem.frequency);
            
            return (
              <Grid item xs={12} md={6} lg={4} key={exportItem.export_id}>
                <Card 
                  sx={{ 
                    height: '100%',
                    borderRadius: '4px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
                    }
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    {/* Header */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ScheduleIcon sx={{ color: '#007BA7' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {exportItem.name}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, exportItem)}
                        sx={{ color: 'text.secondary' }}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </Box>

                    {/* Description */}
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {exportItem.description || 'No description provided.'}
                    </Typography>

                    {/* Status and Frequency */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <Chip
                        icon={statusDisplay.icon}
                        label={statusDisplay.text}
                        size="small"
                        sx={{
                          backgroundColor: statusDisplay.color,
                          color: 'white',
                          fontWeight: 500
                        }}
                      />
                      <Chip
                        label={frequencyDisplay.text}
                        size="small"
                        sx={{
                          backgroundColor: frequencyDisplay.color,
                          color: 'white',
                          fontWeight: 500
                        }}
                      />
                    </Box>

                    {/* Details */}
                    <Box sx={{ mb: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {exportItem.recipient_count || 0} recipients
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <DownloadIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {exportItem.format?.toUpperCase()} format
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SettingsIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {exportItem.date_range_days || 1} day range
                        </Typography>
                      </Box>
                    </Box>

                    {/* Actions */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="Trigger Export">
                        <IconButton
                          size="small"
                          onClick={() => handleTriggerExport(exportItem.export_id)}
                          disabled={actionLoading[`trigger_${exportItem.export_id}`]}
                          sx={{
                            backgroundColor: '#10B981',
                            color: 'white',
                            '&:hover': { backgroundColor: '#059669' },
                            '&:disabled': { backgroundColor: '#D1D5DB' }
                          }}
                        >
                          {actionLoading[`trigger_${exportItem.export_id}`] ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <PlayIcon />
                          )}
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="View Logs">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedExport(exportItem);
                            setLogsDialogOpen(true);
                          }}
                          sx={{
                            backgroundColor: '#3B82F6',
                            color: 'white',
                            '&:hover': { backgroundColor: '#2563EB' }
                          }}
                        >
                          <HistoryIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            borderRadius: '4px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(0, 0, 0, 0.1)'
          }
        }}
      >
        <MenuItem onClick={handleEdit}>
          <ListItemIcon>
            <EditIcon sx={{ color: '#007BA7' }} />
          </ListItemIcon>
          <ListItemText>Edit Export</ListItemText>
        </MenuItem>
        
        <MenuItem onClick={handleViewLogs}>
          <ListItemIcon>
            <HistoryIcon sx={{ color: '#3B82F6' }} />
          </ListItemIcon>
          <ListItemText>View Logs</ListItemText>
        </MenuItem>
        
        <MenuItem onClick={handleDelete} sx={{ color: '#EF4444' }}>
          <ListItemIcon>
            <DeleteIcon sx={{ color: '#EF4444' }} />
          </ListItemIcon>
          <ListItemText>Delete Export</ListItemText>
        </MenuItem>
      </Menu>

      {/* Create Export Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '4px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
          }
        }}
      >
        <ScheduledExportForm
          onSubmit={handleCreateExport}
          onCancel={() => setCreateDialogOpen(false)}
          title="Create Scheduled Export"
        />
      </Dialog>

      {/* Edit Export Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setEditExportData(null);
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '4px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
          }
        }}
      >
        <ScheduledExportForm
          key={editExportData?.export_id || 'new'}
          exportData={editExportData}
          onSubmit={(data) => handleUpdateExport(editExportData?.export_id, data)}
          onCancel={() => {
            setEditDialogOpen(false);
            setEditExportData(null);
          }}
          title="Edit Scheduled Export"
        />
      </Dialog>

      {/* Logs Dialog */}
      <Dialog
        open={logsDialogOpen}
        onClose={() => setLogsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '4px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
          }
        }}
      >
        <ScheduledExportLogs
          exportData={selectedExport}
          onClose={() => setLogsDialogOpen(false)}
        />
      </Dialog>
    </Box>
  );
};

export default ScheduledExports;