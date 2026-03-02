import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Grid, TextField, 
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  Tabs, Tab, Divider, Alert, Snackbar, Chip, IconButton
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { API_BASE_URL } from '../config/api';

export default function AlertSettings({ user }) {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  
  // Check if user is admin or super_admin
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  // Email Configuration
  const [emailConfig, setEmailConfig] = useState({
    smtp_host: '',
    smtp_port: 587,
    smtp_secure: false,
    smtp_user: '',
    smtp_pass: '',
    from_email: '',
    from_name: '',
    enabled: false
  });

  // Email Recipients
  const [emailRecipients, setEmailRecipients] = useState([]);
  const [newRecipient, setNewRecipient] = useState({
    email: '',
    name: '',
    alerts: [] // Which alerts this recipient should receive
  });

  // HTTP Configuration
  const [httpConfig, setHttpConfig] = useState({
    enabled: false,
    endpoints: []
  });
  const [newEndpoint, setNewEndpoint] = useState({
    url: '',
    method: 'POST',
    headers: {},
    alerts: [] // Which alerts this endpoint should receive
  });

  // Notification Logs
  const [notificationLogs, setNotificationLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // Load configurations
  const loadConfigurations = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('iot_token');
      const [emailRes, recipientsRes, httpRes, logsRes, alertsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/alert-settings/email-config`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/alert-settings/email-recipients`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/alert-settings/http-config`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/alert-settings/notification-logs`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/alerts`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (emailRes.ok) {
        const emailData = await emailRes.json();
        const config = emailData.config || {};
        setEmailConfig({
          smtp_host: config.smtp_host || '',
          smtp_port: config.smtp_port || 587,
          smtp_secure: config.smtp_secure || false,
          smtp_user: config.smtp_user || '',
          smtp_pass: config.smtp_pass || '',
          from_email: config.from_email || '',
          from_name: config.from_name || '',
          enabled: config.enabled || false
        });
      }

      if (recipientsRes.ok) {
        const recipientsData = await recipientsRes.json();
        console.log('Email recipients data from server:', recipientsData);
        setEmailRecipients(recipientsData.recipients || []);
      }

      if (httpRes.ok) {
        const httpData = await httpRes.json();
        const config = httpData.config || {};
        setHttpConfig({
          enabled: config.enabled || false,
          endpoints: httpData.endpoints || []
        });
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setNotificationLogs(logsData.logs || []);
      }

      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        console.log('Alerts data from server:', alertsData);
        setAlerts(alertsData.alerts || []);
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to load configurations', severity: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadConfigurations();
  }, []);

  // Save email configuration
  const saveEmailConfig = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-settings/email-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(emailConfig)
      });

      if (response.ok) {
        setNotification({ open: true, message: 'Email configuration saved successfully', severity: 'success' });
      } else {
        setNotification({ open: true, message: 'Failed to save email configuration', severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to save email configuration', severity: 'error' });
    }
  };

  // Add email recipient
  const addEmailRecipient = async () => {
    if (!newRecipient.email || !newRecipient.name) {
      setNotification({ open: true, message: 'Please fill in all required fields', severity: 'warning' });
      return;
    }

    console.log('Adding email recipient with data:', newRecipient);
    console.log('Alerts array details:', {
      alerts: newRecipient.alerts,
      alertsType: typeof newRecipient.alerts,
      alertsLength: newRecipient.alerts.length,
      alertsContent: newRecipient.alerts
    });

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-settings/email-recipients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newRecipient)
      });

      if (response.ok) {
        setNotification({ open: true, message: 'Email recipient added successfully', severity: 'success' });
        setNewRecipient({ email: '', name: '', alerts: [] });
        loadConfigurations();
      } else {
        setNotification({ open: true, message: 'Failed to add email recipient', severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to add email recipient', severity: 'error' });
    }
  };

  // Delete email recipient
  const deleteEmailRecipient = async (id) => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-settings/email-recipients/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setNotification({ open: true, message: 'Email recipient deleted successfully', severity: 'success' });
        loadConfigurations();
      } else {
        setNotification({ open: true, message: 'Failed to delete email recipient', severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to delete email recipient', severity: 'error' });
    }
  };

  // Save HTTP configuration
  const saveHttpConfig = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-settings/http-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(httpConfig)
      });

      if (response.ok) {
        setNotification({ open: true, message: 'HTTP configuration saved successfully', severity: 'success' });
      } else {
        setNotification({ open: true, message: 'Failed to save HTTP configuration', severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to save HTTP configuration', severity: 'error' });
    }
  };

  // Add HTTP endpoint
  const addHttpEndpoint = async () => {
    if (!newEndpoint.url || !newEndpoint.method) {
      setNotification({ open: true, message: 'Please fill in all required fields', severity: 'warning' });
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-settings/http-endpoints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newEndpoint)
      });

      if (response.ok) {
        setNotification({ open: true, message: 'HTTP endpoint added successfully', severity: 'success' });
        setNewEndpoint({ url: '', method: 'POST', headers: {}, alerts: [] });
        loadConfigurations();
      } else {
        setNotification({ open: true, message: 'Failed to add HTTP endpoint', severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to add HTTP endpoint', severity: 'error' });
    }
  };

  // Delete HTTP endpoint
  const deleteHttpEndpoint = async (id) => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-settings/http-endpoints/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setNotification({ open: true, message: 'HTTP endpoint deleted successfully', severity: 'success' });
        loadConfigurations();
      } else {
        setNotification({ open: true, message: 'Failed to delete HTTP endpoint', severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to delete HTTP endpoint', severity: 'error' });
    }
  };

  // Test email configuration
  const testEmailConfig = async () => {
    // Validate required fields
    const requiredFields = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'from_email', 'from_name'];
    const missingFields = requiredFields.filter(field => !emailConfig[field]);
    
    if (missingFields.length > 0) {
      setNotification({ 
        open: true, 
        message: `Please fill in all required fields: ${missingFields.join(', ')}`, 
        severity: 'warning' 
      });
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-settings/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(emailConfig)
      });

      if (response.ok) {
        setNotification({ open: true, message: 'Test email sent successfully', severity: 'success' });
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to send test email';
        setNotification({ open: true, message: errorMessage, severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to send test email', severity: 'error' });
    }
  };

  // Test HTTP endpoint
  const testHttpEndpoint = async (endpoint) => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-settings/test-http`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(endpoint)
      });

      if (response.ok) {
        setNotification({ open: true, message: 'HTTP endpoint test successful', severity: 'success' });
      } else {
        setNotification({ open: true, message: 'HTTP endpoint test failed', severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'HTTP endpoint test failed', severity: 'error' });
    }
  };

  const notificationLogColumns = [
    { field: 'timestamp', headerName: 'Timestamp', flex: 1, valueGetter: (params) => new Date(params.value).toLocaleString() },
    { field: 'alert_name', headerName: 'Alert', flex: 1 },
    { field: 'type', headerName: 'Type', flex: 0.5 },
    { field: 'recipient', headerName: 'Recipient', flex: 1 },
    { field: 'status', headerName: 'Status', flex: 0.5, renderCell: (params) => (
      <Chip 
        label={params.value} 
        color={params.value === 'success' ? 'success' : params.value === 'failed' ? 'error' : 'warning'}
        size="small"
      />
    )},
    { field: 'message', headerName: 'Message', flex: 1.5 },
  ];

  const emailRecipientColumns = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'email', headerName: 'Email', flex: 1.5 },
    { field: 'alerts', headerName: 'Alerts', flex: 1.5, renderCell: (params) => {
      console.log('Rendering alerts for recipient:', params.row.name, 'alerts value:', params.value, 'available alerts:', alerts);
      return (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {Array.isArray(params.value) ? params.value.map(alertId => {
            const alert = alerts.find(a => a.id === alertId || a.alert_id === alertId);
            console.log(`Looking for alert ID ${alertId}, found:`, alert);
            return alert ? <Chip key={alertId} label={alert.name} size="small" /> : null;
          }) : <Typography variant="body2" color="text.secondary">No alerts assigned</Typography>}
        </Box>
      );
    }},
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 1,
      renderCell: (params) => (
        <Button size="small" color="error" onClick={() => deleteEmailRecipient(params.row.id)}>
          Delete
        </Button>
      )
    },
  ];

  const httpEndpointColumns = [
    { field: 'url', headerName: 'URL', flex: 2 },
    { field: 'method', headerName: 'Method', flex: 0.5 },
    { field: 'alerts', headerName: 'Alerts', flex: 1.5, renderCell: (params) => (
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {Array.isArray(params.value) ? params.value.map(alertId => {
          const alert = alerts.find(a => a.id === alertId || a.alert_id === alertId);
          return alert ? <Chip key={alertId} label={alert.name} size="small" /> : null;
        }) : <Typography variant="body2" color="text.secondary">No alerts assigned</Typography>}
      </Box>
    )},
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 1,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={() => testHttpEndpoint(params.row)}>
            Test
          </Button>
          <Button size="small" color="error" onClick={() => deleteHttpEndpoint(params.row.id)}>
            Delete
          </Button>
        </Box>
      )
    },
  ];

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, letterSpacing: 1 }}>Alert Settings</Typography>
      
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Email Configuration" />
        <Tab label="HTTP Configuration" />
        <Tab label="Notification Logs" />
      </Tabs>

      {tab === 0 && (
        <Grid container spacing={3}>
          {/* Email Configuration */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>SMTP Configuration</Typography>
                {isAdmin ? (
                  <>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={emailConfig.enabled}
                          onChange={(e) => setEmailConfig({ ...emailConfig, enabled: e.target.checked })}
                        />
                      }
                      label="Enable Email Notifications"
                      sx={{ mb: 2 }}
                    />
                    
                    <TextField
                      label="SMTP Host"
                      fullWidth
                      value={emailConfig.smtp_host || ''}
                      onChange={(e) => setEmailConfig({ ...emailConfig, smtp_host: e.target.value })}
                      sx={{ mb: 2 }}
                    />
                    
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={6}>
                        <TextField
                          label="SMTP Port"
                          type="number"
                          fullWidth
                          value={emailConfig.smtp_port}
                          onChange={(e) => setEmailConfig({ ...emailConfig, smtp_port: parseInt(e.target.value) })}
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={emailConfig.smtp_secure}
                              onChange={(e) => setEmailConfig({ ...emailConfig, smtp_secure: e.target.checked })}
                            />
                          }
                          label="Use SSL/TLS"
                        />
                      </Grid>
                    </Grid>

                    <TextField
                      label="SMTP Username"
                      fullWidth
                      value={emailConfig.smtp_user || ''}
                      onChange={(e) => setEmailConfig({ ...emailConfig, smtp_user: e.target.value })}
                      sx={{ mb: 2 }}
                    />

                    <TextField
                      label="SMTP Password"
                      type="password"
                      fullWidth
                      value={emailConfig.smtp_pass || ''}
                      onChange={(e) => setEmailConfig({ ...emailConfig, smtp_pass: e.target.value })}
                      sx={{ mb: 2 }}
                    />

                    <TextField
                      label="From Email"
                      fullWidth
                      value={emailConfig.from_email || ''}
                      onChange={(e) => setEmailConfig({ ...emailConfig, from_email: e.target.value })}
                      sx={{ mb: 2 }}
                    />

                    <TextField
                      label="From Name"
                      fullWidth
                      value={emailConfig.from_name || ''}
                      onChange={(e) => setEmailConfig({ ...emailConfig, from_name: e.target.value })}
                      sx={{ mb: 2 }}
                    />

                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Button variant="contained" onClick={saveEmailConfig}>
                        Save Configuration
                      </Button>
                      <Button variant="outlined" onClick={testEmailConfig}>
                        Test Connection
                      </Button>
                    </Box>
                  </>
                ) : (
                  <Alert severity="info">
                    Email configuration is only accessible to administrators.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Email Recipients */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Email Recipients</Typography>
                {/* Email Recipients - all users can add, only admins can delete */}
                <Box sx={{ mb: 2, p: 2, border: '1px solid #ddd', borderRadius: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>Add New Recipient</Typography>
                  <TextField
                    label="Name"
                    fullWidth
                    value={newRecipient.name || ''}
                    onChange={(e) => setNewRecipient({ ...newRecipient, name: e.target.value })}
                    sx={{ mb: 1 }}
                  />
                  <TextField
                    label="Email"
                    fullWidth
                    value={newRecipient.email || ''}
                    onChange={(e) => setNewRecipient({ ...newRecipient, email: e.target.value })}
                    sx={{ mb: 1 }}
                  />
                  <FormControl fullWidth sx={{ mb: 1 }}>
                    <InputLabel>Alerts to Receive</InputLabel>
                    <Select
                      multiple
                      value={newRecipient.alerts}
                      onChange={(e) => setNewRecipient({ ...newRecipient, alerts: e.target.value })}
                      label="Alerts to Receive"
                    >
                      {alerts.map(alert => (
                        <MenuItem key={alert.alert_id} value={alert.alert_id}>{alert.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button variant="contained" onClick={addEmailRecipient}>
                    Add Recipient
                  </Button>
                </Box>

                <div style={{ height: 300 }}>
                  <DataGrid
                    rows={emailRecipients}
                    columns={isAdmin ? emailRecipientColumns : emailRecipientColumns.filter(col => col.field !== 'actions')}
                    pageSize={5}
                    rowsPerPageOptions={[5]}
                    disableSelectionOnClick
                  />
                </div>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 1 && (
        <Grid container spacing={3}>
          {/* HTTP Configuration */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>HTTP Configuration</Typography>
                {isAdmin ? (
                  <>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={httpConfig.enabled}
                          onChange={(e) => setHttpConfig({ ...httpConfig, enabled: e.target.checked })}
                        />
                      }
                      label="Enable HTTP Notifications"
                      sx={{ mb: 2 }}
                    />

                    <Box sx={{ mb: 2, p: 2, border: '1px solid #ddd', borderRadius: 1 }}>
                      <Typography variant="subtitle2" gutterBottom>Add New Endpoint</Typography>
                      <TextField
                        label="URL"
                        fullWidth
                        value={newEndpoint.url || ''}
                        onChange={(e) => setNewEndpoint({ ...newEndpoint, url: e.target.value })}
                        sx={{ mb: 1 }}
                        placeholder="https://api.example.com/webhook"
                      />
                      <FormControl fullWidth sx={{ mb: 1 }}>
                        <InputLabel>Method</InputLabel>
                        <Select
                          value={newEndpoint.method}
                          onChange={(e) => setNewEndpoint({ ...newEndpoint, method: e.target.value })}
                          label="Method"
                        >
                          <MenuItem value="GET">GET</MenuItem>
                          <MenuItem value="POST">POST</MenuItem>
                          <MenuItem value="PUT">PUT</MenuItem>
                          <MenuItem value="PATCH">PATCH</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControl fullWidth sx={{ mb: 1 }}>
                        <InputLabel>Alerts to Send</InputLabel>
                        <Select
                          multiple
                          value={newEndpoint.alerts}
                          onChange={(e) => setNewEndpoint({ ...newEndpoint, alerts: e.target.value })}
                          label="Alerts to Send"
                        >
                          {alerts.map(alert => (
                            <MenuItem key={alert.alert_id} value={alert.alert_id}>{alert.name}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button variant="contained" onClick={addHttpEndpoint}>
                        Add Endpoint
                      </Button>
                    </Box>

                    <Button variant="contained" onClick={saveHttpConfig}>
                      Save Configuration
                    </Button>
                  </>
                ) : (
                  <Alert severity="info">
                    HTTP configuration is only accessible to administrators.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* HTTP Endpoints List */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>HTTP Endpoints</Typography>
                {isAdmin ? (
                  <div style={{ height: 400 }}>
                    <DataGrid
                      rows={httpConfig.endpoints}
                      columns={httpEndpointColumns}
                      pageSize={5}
                      rowsPerPageOptions={[5]}
                      disableSelectionOnClick
                    />
                  </div>
                ) : (
                  <Alert severity="info">
                    HTTP endpoints management is only accessible to administrators.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Notification Logs</Typography>
            {isAdmin ? (
              <div style={{ height: 500 }}>
                <DataGrid
                  rows={notificationLogs}
                  columns={notificationLogColumns}
                  pageSize={10}
                  rowsPerPageOptions={[10, 25, 50]}
                  disableSelectionOnClick
                />
              </div>
            ) : (
              <Alert severity="info">
                Notification logs are only accessible to administrators.
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
      >
        <Alert severity={notification.severity} onClose={() => setNotification({ ...notification, open: false })}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
} 