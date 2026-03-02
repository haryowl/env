import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Badge,
  Tooltip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon,
  Wifi as WifiIcon,
  Http as HttpIcon,
  Router as RouterIcon,
  Storage as StorageIcon,
  Timeline as TimelineIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';

import { API_BASE_URL } from '../config/api';

const Listeners = ({ socket }) => {
  const [listeners, setListeners] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProtocol, setSelectedProtocol] = useState('all');
  const [selectedTab, setSelectedTab] = useState(0);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedData, setSelectedData] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    mqtt: 0,
    http: 0,
    tcp: 0,
    udp: 0,
    lastUpdate: null
  });

  // Listen for real-time listener data from WebSocket
  useEffect(() => {
    if (socket) {
      console.log('Listeners: Socket available, setting up listener_data handler');
      console.log('Listeners: Socket object:', socket);
      
      const handleListenerData = (data) => {
        console.log('Listeners: Received listener_data from WebSocket:', data);
        setListeners(prev => {
          const newData = [data, ...prev];
          // Keep only last 1000 records
          return newData.slice(0, 1000);
        });
        // Update stats with the new data
        setStats(prevStats => ({
          ...prevStats,
          total: prevStats.total + 1,
          mqtt: prevStats.mqtt + (data.protocol === 'mqtt' ? 1 : 0),
          http: prevStats.http + (data.protocol === 'http' ? 1 : 0),
          tcp: prevStats.tcp + (data.protocol === 'tcp' ? 1 : 0),
          udp: prevStats.udp + (data.protocol === 'udp' ? 1 : 0),
          lastUpdate: new Date().toLocaleTimeString()
        }));
      };

      // Register the event listener
      socket.on('listener_data', handleListenerData);
      console.log('Listeners: Registered listener_data event handler');

      return () => {
        console.log('Listeners: Cleaning up listener_data handler');
        socket.off('listener_data', handleListenerData);
      };
    } else {
      console.log('Listeners: No socket available');
    }
  }, [socket]); // Remove listeners dependency to prevent infinite loop

  // Mock data for demonstration
  const mockListeners = [
    {
      id: 1,
      timestamp: new Date().toISOString(),
      protocol: 'mqtt',
      topic: 'sensors/temperature/001',
      client_id: 'device_001',
      payload: {
        temperature: 24.5,
        humidity: 65.2,
        timestamp: new Date().toISOString(),
        battery: 85
      },
      source_ip: '192.168.1.100',
      port: 1883,
      size: 128
    },
    {
      id: 2,
      timestamp: new Date(Date.now() - 5000).toISOString(),
      protocol: 'http',
      endpoint: '/api/sensor-data',
      method: 'POST',
      payload: {
        device_id: 'motion_001',
        motion_detected: true,
        location: 'room_1',
        confidence: 0.95
      },
      source_ip: '192.168.1.101',
      port: 80,
      size: 256
    },
    {
      id: 3,
      timestamp: new Date(Date.now() - 10000).toISOString(),
      protocol: 'tcp',
      connection_id: 'tcp_conn_001',
      payload: {
        command: 'STATUS',
        device_id: 'gateway_001',
        uptime: 86400,
        memory_usage: 45.2
      },
      source_ip: '192.168.1.102',
      port: 8080,
      size: 512
    },
    {
      id: 4,
      timestamp: new Date(Date.now() - 15000).toISOString(),
      protocol: 'udp',
      connection_id: 'udp_conn_001',
      payload: {
        sensor_type: 'pressure',
        value: 1013.25,
        unit: 'hPa',
        accuracy: 0.1
      },
      source_ip: '192.168.1.103',
      port: 5000,
      size: 64
    },
    {
      id: 5,
      timestamp: new Date(Date.now() - 20000).toISOString(),
      protocol: 'mqtt',
      topic: 'sensors/humidity/002',
      client_id: 'device_002',
      payload: {
        humidity: 72.8,
        temperature: 22.1,
        timestamp: new Date(Date.now() - 20000).toISOString()
      },
      source_ip: '192.168.1.104',
      port: 1883,
      size: 96
    }
  ];

  useEffect(() => {
    loadListeners();
    checkSimulationStatus();
    
    // Disable auto-refresh to prevent overriding WebSocket data
    // let interval;
    // if (autoRefresh) {
    //   interval = setInterval(() => {
    //     loadListeners();
    //   }, 5000);
    // }

    // return () => {
    //   if (interval) clearInterval(interval);
    // };
  }, [autoRefresh]);

  useEffect(() => {
    filterData();
  }, [listeners, searchTerm, selectedProtocol]);

  const loadListeners = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/listeners`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Only set listeners if we don't have any WebSocket data yet
          setListeners(prev => {
            if (prev.length === 0) {
              console.log('Listeners: Loading initial data from API');
              return data.data || [];
            } else {
              console.log('Listeners: Keeping WebSocket data, not overriding with API data');
              return prev;
            }
          });
          // Only update stats if we loaded new data
          if (data.data && data.data.length > 0) {
            updateStats(data.data);
          }
        } else {
          console.error('Failed to load listeners data:', data.error);
          setError(data.error || 'Failed to load listeners data');
        }
      } else if (response.status === 404) {
        // Backend endpoint not implemented yet - only use mock data if no WebSocket data
        setListeners(prev => {
          if (prev.length === 0) {
            console.log('Listeners: No WebSocket data, using mock data');
            return mockListeners;
          } else {
            console.log('Listeners: Keeping WebSocket data, not using mock data');
            return prev;
          }
        });
        setError('Backend endpoint not implemented yet - showing mock data');
      } else {
        setError('Failed to load listeners');
      }
    } catch (error) {
      // Network error - only use mock data if no WebSocket data
      setListeners(prev => {
        if (prev.length === 0) {
          console.log('Listeners: Network error, using mock data');
          return mockListeners;
        } else {
          console.log('Listeners: Keeping WebSocket data despite network error');
          return prev;
        }
      });
      setError('Network error - showing mock data');
    } finally {
      setLoading(false);
    }
  };

  const updateStats = (data) => {
    const stats = {
      total: data.length,
      mqtt: data.filter(item => item.protocol === 'mqtt').length,
      http: data.filter(item => item.protocol === 'http').length,
      tcp: data.filter(item => item.protocol === 'tcp').length,
      udp: data.filter(item => item.protocol === 'udp').length,
      lastUpdate: new Date().toLocaleTimeString()
    };
    setStats(stats);
  };

  const filterData = () => {
    let filtered = listeners;

    // Filter by protocol
    if (selectedProtocol !== 'all') {
      filtered = filtered.filter(item => item.protocol === selectedProtocol);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.protocol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.topic && item.topic.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.endpoint && item.endpoint.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.connection_id && item.connection_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.client_id && item.client_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        item.source_ip.includes(searchTerm) ||
        JSON.stringify(item.payload).toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredData(filtered);
  };

  const handleViewDetails = (data) => {
    setSelectedData(data);
    setDetailDialogOpen(true);
  };

  const handleClearData = async () => {
    if (window.confirm('Are you sure you want to clear all listener data?')) {
      try {
        const token = localStorage.getItem('iot_token');
        const response = await fetch(`${API_BASE_URL}/listeners`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setListeners([]);
            setFilteredData([]);
            updateStats([]);
            setError('All listener data cleared successfully');
          } else {
            setError(data.error || 'Failed to clear data');
          }
        } else {
          setError('Failed to clear data');
        }
      } catch (error) {
        setError('Network error - failed to clear data');
      }
    }
  };

  const checkSimulationStatus = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/listeners/simulation/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSimulationRunning(data.running);
        }
      }
    } catch (error) {
      console.error('Failed to check simulation status:', error);
    }
  };

  const handleStartSimulation = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/listeners/simulation/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSimulationRunning(true);
          setError('Protocol simulation started - generating mock data');
        } else {
          setError(data.error || 'Failed to start simulation');
        }
      } else {
        setError('Failed to start simulation');
      }
    } catch (error) {
      setError('Network error - simulation not started');
    }
  };

  const handleStopSimulation = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/listeners/simulation/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSimulationRunning(false);
          setError('Protocol simulation stopped');
        } else {
          setError(data.error || 'Failed to stop simulation');
        }
      } else {
        setError('Failed to stop simulation');
      }
    } catch (error) {
      setError('Network error - simulation not stopped');
    }
  };

  const getProtocolIcon = (protocol) => {
    switch (protocol) {
      case 'mqtt':
        return <WifiIcon />;
      case 'http':
        return <HttpIcon />;
      case 'tcp':
        return <RouterIcon />;
      case 'udp':
        return <StorageIcon />;
      default:
        return <TimelineIcon />;
    }
  };

  const getProtocolColor = (protocol) => {
    switch (protocol) {
      case 'mqtt':
        return 'primary';
      case 'http':
        return 'success';
      case 'tcp':
        return 'warning';
      case 'udp':
        return 'info';
      default:
        return 'default';
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatPayload = (payload) => {
    if (typeof payload === 'object') {
      return JSON.stringify(payload, null, 2);
    }
    return payload;
  };

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
        <Typography variant="h4">Data Listeners</Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadListeners}
          >
            Refresh
          </Button>
          {!simulationRunning ? (
            <Button
              variant="contained"
              color="success"
              onClick={handleStartSimulation}
            >
              Start Simulation
            </Button>
          ) : (
            <Button
              variant="contained"
              color="warning"
              onClick={handleStopSimulation}
            >
              Stop Simulation
            </Button>
          )}
          <Button
            variant="outlined"
            color="error"
            startIcon={<ClearIcon />}
            onClick={handleClearData}
          >
            Clear Data
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Messages
                  </Typography>
                  <Typography variant="h4">{stats.total}</Typography>
                </Box>
                <TimelineIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    MQTT
                  </Typography>
                  <Typography variant="h4">{stats.mqtt}</Typography>
                </Box>
                <WifiIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    HTTP
                  </Typography>
                  <Typography variant="h4">{stats.http}</Typography>
                </Box>
                <HttpIcon color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    TCP/UDP
                  </Typography>
                  <Typography variant="h4">{stats.tcp + stats.udp}</Typography>
                </Box>
                <RouterIcon color="warning" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                placeholder="Search messages..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth>
                <InputLabel>Protocol</InputLabel>
                <Select
                  value={selectedProtocol}
                  label="Protocol"
                  onChange={(e) => setSelectedProtocol(e.target.value)}
                >
                  <MenuItem value="all">All Protocols</MenuItem>
                  <MenuItem value="mqtt">MQTT</MenuItem>
                  <MenuItem value="http">HTTP</MenuItem>
                  <MenuItem value="tcp">TCP</MenuItem>
                  <MenuItem value="udp">UDP</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="body2" color="textSecondary">
                Last Update: {stats.lastUpdate}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Protocol Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={selectedTab} onChange={(e, newValue) => setSelectedTab(newValue)}>
          <Tab 
            label={
              <Badge badgeContent={stats.total} color="primary">
                All
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={stats.mqtt} color="primary">
                MQTT
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={stats.http} color="primary">
                HTTP
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={stats.tcp + stats.udp} color="primary">
                TCP/UDP
              </Badge>
            } 
          />
        </Tabs>
      </Box>

      {/* Data Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>Protocol</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Details</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  {searchTerm || selectedProtocol !== 'all' 
                    ? 'No messages match your filters' 
                    : 'No messages received yet'}
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Typography variant="body2">
                      {formatTimestamp(item.timestamp)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={getProtocolIcon(item.protocol)}
                      label={item.protocol.toUpperCase()}
                      color={getProtocolColor(item.protocol)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        {item.source_ip}:{item.port}
                      </Typography>
                      {item.topic && (
                        <Typography variant="caption" color="textSecondary">
                          Topic: {item.topic}
                        </Typography>
                      )}
                      {item.endpoint && (
                        <Typography variant="caption" color="textSecondary">
                          Endpoint: {item.endpoint}
                        </Typography>
                      )}
                      {item.connection_id && (
                        <Typography variant="caption" color="textSecondary">
                          Connection: {item.connection_id}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      {item.client_id && (
                        <Typography variant="body2">
                          Client: {item.client_id}
                        </Typography>
                      )}
                      {item.method && (
                        <Typography variant="body2">
                          Method: {item.method}
                        </Typography>
                      )}
                      <Typography variant="caption" color="textSecondary">
                        {Object.keys(item.payload).length} fields
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {item.size} bytes
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => handleViewDetails(item)}
                        color="primary"
                      >
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Detail Dialog */}
      <Dialog 
        open={detailDialogOpen} 
        onClose={() => setDetailDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          Message Details
          {selectedData && (
            <Chip
              icon={getProtocolIcon(selectedData?.protocol)}
              label={selectedData?.protocol?.toUpperCase()}
              color={getProtocolColor(selectedData?.protocol)}
              sx={{ ml: 2 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {selectedData && (
            <Box>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="h6" gutterBottom>Connection Info</Typography>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      <strong>Source IP:</strong> {selectedData.source_ip}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Port:</strong> {selectedData.port}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Timestamp:</strong> {formatTimestamp(selectedData.timestamp)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Size:</strong> {selectedData.size} bytes
                    </Typography>
                  </Box>
                  
                  {selectedData.topic && (
                    <Typography variant="body2">
                      <strong>Topic:</strong> {selectedData.topic}
                    </Typography>
                  )}
                  {selectedData.endpoint && (
                    <Typography variant="body2">
                      <strong>Endpoint:</strong> {selectedData.endpoint}
                    </Typography>
                  )}
                  {selectedData.method && (
                    <Typography variant="body2">
                      <strong>Method:</strong> {selectedData.method}
                    </Typography>
                  )}
                  {selectedData.client_id && (
                    <Typography variant="body2">
                      <strong>Client ID:</strong> {selectedData.client_id}
                    </Typography>
                  )}
                  {selectedData.connection_id && (
                    <Typography variant="body2">
                      <strong>Connection ID:</strong> {selectedData.connection_id}
                    </Typography>
                  )}
                </Grid>
                
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="h6" gutterBottom>Payload</Typography>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>View Payload Data</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box
                        component="pre"
                        sx={{
                          backgroundColor: '#f5f5f5',
                          p: 2,
                          borderRadius: 1,
                          overflow: 'auto',
                          maxHeight: 300,
                          fontSize: '0.875rem'
                        }}
                      >
                        {formatPayload(selectedData.payload)}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Listeners; 