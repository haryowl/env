import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  useTheme,
  Stack,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  Avatar,
  Divider
} from '@mui/material';
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  Email as EmailIcon,
  Download as DownloadIcon,
  AccessTime as AccessTimeIcon,
  History as HistoryIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import { format } from 'date-fns';

const ScheduledExportLogs = ({ exportData, onClose }) => {
  const theme = useTheme();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    total_executions: 0,
    successful_executions: 0,
    failed_executions: 0,
    last_execution: null
  });

  // Load execution logs
  const loadLogs = async () => {
    if (!exportData?.export_id) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/scheduled-exports/${exportData.export_id}/logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('📊 Execution logs received:', data.logs);
        setLogs(data.logs || []);
        
        // Calculate stats
        const total = data.logs?.length || 0;
        const successful = data.logs?.filter(log => log.status === 'success').length || 0;
        const failed = data.logs?.filter(log => log.status === 'failed').length || 0;
        const lastExecution = data.logs?.[0] || null;

        setStats({
          total_executions: total,
          successful_executions: successful,
          failed_executions: failed,
          last_execution: lastExecution
        });
        
        setError('');
      } else {
        throw new Error('Failed to load execution logs');
      }
    } catch (error) {
      console.error('Error loading logs:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load logs on component mount
  useEffect(() => {
    loadLogs();
  }, [exportData?.export_id]);

  // Get status display
  const getStatusDisplay = (status) => {
    switch (status) {
      case 'success':
        return {
          icon: <CheckCircleIcon sx={{ fontSize: 16 }} />,
          color: 'success',
          text: 'Success',
          bgColor: 'rgba(16, 185, 129, 0.1)',
          textColor: '#10B981'
        };
      case 'error':
        return {
          icon: <ErrorIcon sx={{ fontSize: 16 }} />,
          color: 'error',
          text: 'Failed',
          bgColor: 'rgba(239, 68, 68, 0.1)',
          textColor: '#EF4444'
        };
      case 'running':
        return {
          icon: <ScheduleIcon sx={{ fontSize: 16 }} />,
          color: 'info',
          text: 'Running',
          bgColor: 'rgba(59, 130, 246, 0.1)',
          textColor: '#3B82F6'
        };
      default:
        return {
          icon: <WarningIcon sx={{ fontSize: 16 }} />,
          color: 'warning',
          text: 'Unknown',
          bgColor: 'rgba(245, 158, 11, 0.1)',
          textColor: '#F59E0B'
        };
    }
  };

  // Format duration
  const formatDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return 'N/A';
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = end - start;
    
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    if (i === 0) return `${bytes} ${sizes[i]}`;
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress size={60} sx={{ color: '#007BA7', mb: 2 }} />
        <Typography variant="h6" sx={{ color: theme.palette.text.secondary }}>
          Loading execution logs...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ 
        p: 3,
        background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
        color: 'white',
        borderRadius: '20px 20px 0 0'
      }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <HistoryIcon sx={{ fontSize: '1.5rem' }} />
              Execution Logs
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, mt: 0.5 }}>
              {exportData?.name || 'Scheduled Export'}
            </Typography>
          </Box>
          
          <Stack direction="row" spacing={1}>
            <IconButton onClick={loadLogs} sx={{ color: 'white' }}>
              <RefreshIcon />
            </IconButton>
            <IconButton onClick={onClose} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ p: 3 }}>
        {/* Error Display */}
        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: '4px' }}>
            {error}
          </Alert>
        )}

        {/* Statistics Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ 
              borderRadius: '4px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid rgba(107, 70, 193, 0.1)'
            }}>
              <CardContent sx={{ textAlign: 'center', p: 2 }}>
                <Avatar sx={{ 
                  backgroundColor: 'rgba(107, 70, 193, 0.1)', 
                  color: '#007BA7',
                  width: 48,
                  height: 48,
                  mx: 'auto',
                  mb: 1
                }}>
                  <HistoryIcon />
                </Avatar>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#007BA7' }}>
                  {stats.total_executions}
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  Total Executions
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ 
              borderRadius: '4px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid rgba(16, 185, 129, 0.1)'
            }}>
              <CardContent sx={{ textAlign: 'center', p: 2 }}>
                <Avatar sx={{ 
                  backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                  color: '#10B981',
                  width: 48,
                  height: 48,
                  mx: 'auto',
                  mb: 1
                }}>
                  <CheckCircleIcon />
                </Avatar>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#10B981' }}>
                  {stats.successful_executions}
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  Successful
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ 
              borderRadius: '4px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid rgba(239, 68, 68, 0.1)'
            }}>
              <CardContent sx={{ textAlign: 'center', p: 2 }}>
                <Avatar sx={{ 
                  backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                  color: '#EF4444',
                  width: 48,
                  height: 48,
                  mx: 'auto',
                  mb: 1
                }}>
                  <ErrorIcon />
                </Avatar>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#EF4444' }}>
                  {stats.failed_executions}
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  Failed
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ 
              borderRadius: '4px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid rgba(59, 130, 246, 0.1)'
            }}>
              <CardContent sx={{ textAlign: 'center', p: 2 }}>
                <Avatar sx={{ 
                  backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                  color: '#3B82F6',
                  width: 48,
                  height: 48,
                  mx: 'auto',
                  mb: 1
                }}>
                  <AccessTimeIcon />
                </Avatar>
                <Typography variant="body1" sx={{ fontWeight: 600, color: '#3B82F6' }}>
                  {stats.last_execution && stats.last_execution.started_at ? 
                    format(new Date(stats.last_execution.started_at), 'MMM dd, yyyy') : 
                    'Never'
                  }
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  Last Execution
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Execution Logs Table */}
        {logs.length === 0 ? (
          <Card sx={{ 
            borderRadius: '4px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid rgba(107, 70, 193, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)'
          }}>
            <CardContent sx={{ p: 6, textAlign: 'center' }}>
              <HistoryIcon sx={{ 
                fontSize: 80, 
                mb: 3, 
                color: 'rgba(107, 70, 193, 0.3)' 
              }} />
              <Typography variant="h5" sx={{ 
                color: theme.palette.text.primary,
                fontWeight: 600,
                mb: 2
              }}>
                No Execution Logs
              </Typography>
              <Typography variant="body1" sx={{ 
                color: theme.palette.text.secondary,
                fontWeight: 500
              }}>
                This scheduled export hasn't been executed yet
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Card sx={{ 
            borderRadius: '4px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid rgba(107, 70, 193, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)'
          }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ 
                p: 3,
                background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
                borderRadius: '4px 4px 0 0',
                color: 'white'
              }}>
                <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HistoryIcon sx={{ fontSize: '1.2rem' }} />
                  Execution History
                </Typography>
              </Box>
              
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ 
                        fontWeight: 700,
                        backgroundColor: '#007BA7',
                        color: '#FFFFFF !important',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                      }}>
                        Status
                      </TableCell>
                      <TableCell sx={{ 
                        fontWeight: 700,
                        backgroundColor: '#007BA7',
                        color: '#FFFFFF !important',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                      }}>
                        Executed At
                      </TableCell>
                      <TableCell sx={{ 
                        fontWeight: 700,
                        backgroundColor: '#007BA7',
                        color: '#FFFFFF !important',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                      }}>
                        Duration
                      </TableCell>
                      <TableCell sx={{ 
                        fontWeight: 700,
                        backgroundColor: '#007BA7',
                        color: '#FFFFFF !important',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                      }}>
                        File Size
                      </TableCell>
                      <TableCell sx={{ 
                        fontWeight: 700,
                        backgroundColor: '#007BA7',
                        color: '#FFFFFF !important',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                      }}>
                        Files Generated
                      </TableCell>
                      <TableCell sx={{ 
                        fontWeight: 700,
                        backgroundColor: '#007BA7',
                        color: '#FFFFFF !important',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                      }}>
                        Emails Sent
                      </TableCell>
                      <TableCell sx={{ 
                        fontWeight: 700,
                        backgroundColor: '#007BA7',
                        color: '#FFFFFF !important',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                      }}>
                        Status Message
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logs.map((log, index) => {
                      const status = getStatusDisplay(log.status);
                      
                      return (
                        <TableRow 
                          key={log.log_id} 
                          sx={{ 
                            '&:nth-of-type(odd)': { 
                              backgroundColor: 'rgba(107, 70, 193, 0.02)' 
                            },
                            '&:hover': {
                              backgroundColor: 'rgba(107, 70, 193, 0.05)'
                            }
                          }}
                        >
                          <TableCell>
                            <Chip
                              icon={status.icon}
                              label={status.text}
                              size="small"
                              sx={{
                                backgroundColor: status.bgColor,
                                color: status.textColor,
                                fontWeight: 600,
                                border: `1px solid ${status.textColor}20`
                              }}
                            />
                          </TableCell>
                          
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {log.started_at ? format(new Date(log.started_at), 'MMM dd, yyyy') : 'N/A'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                              {log.started_at ? format(new Date(log.started_at), 'HH:mm:ss') : 'N/A'}
                            </Typography>
                          </TableCell>
                          
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {formatDuration(log.started_at, log.completed_at)}
                            </Typography>
                          </TableCell>
                          
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {log.file_size ? Math.round(log.file_size / 1024) + ' KB' : 'N/A'}
                            </Typography>
                          </TableCell>
                          
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {log.file_size ? '1' : '0'}
                            </Typography>
                          </TableCell>
                          
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <EmailIcon sx={{ fontSize: 16, color: theme.palette.text.secondary }} />
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {log.recipients_count || 0}
                              </Typography>
                            </Box>
                          </TableCell>
                          
                          <TableCell>
                            <Tooltip title={log.error_message || 'Export completed successfully'} arrow>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontWeight: 500,
                                  maxWidth: '200px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  color: log.error_message ? theme.palette.error.main : theme.palette.success.main
                                }}
                              >
                                {log.error_message || 'Export completed successfully'}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
};

export default ScheduledExportLogs;
