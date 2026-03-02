import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
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
  Snackbar,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Checkbox
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { API_BASE_URL } from '../config/api';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';

export default function NotificationConfig() {
  const [tab, setTab] = useState(0);
  const [emailConfigs, setEmailConfigs] = useState([]);
  const [httpConfigs, setHttpConfigs] = useState([]);
  const [emailRecipients, setEmailRecipients] = useState([]);
  const [notificationLogs, setNotificationLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Dialog states
  const [emailConfigDialog, setEmailConfigDialog] = useState(false);
  const [httpConfigDialog, setHttpConfigDialog] = useState(false);
  const [recipientDialog, setRecipientDialog] = useState(false);
  const [testEmailDialog, setTestEmailDialog] = useState(false);
  const [testHttpDialog, setTestHttpDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [editingRecipient, setEditingRecipient] = useState(null);

  // Form states
  const [emailForm, setEmailForm] = useState({
    name: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_secure: false,
    username: '',
    password: '',
    from_email: '',
    from_name: '',
    is_default: false
  });

  const [httpForm, setHttpForm] = useState({
    name: '',
    url: '',
    method: 'POST',
    headers: '{"Content-Type": "application/json"}',
    timeout: 30000,
    retry_count: 3,
    retry_delay: 5000,
    is_default: false
  });

  const [recipientForm, setRecipientForm] = useState({
    email: '',
    name: '',
    is_active: true
  });

  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState(null);

  // Fetch all data
  const fetchAll = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('iot_token');
      const [emailRes, httpRes, recipientsRes, logsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/notification-config/email`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/notification-config/http`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/notification-config/email-recipients`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/notification-config/logs`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const [emailData, httpData, recipientsData, logsData] = await Promise.all([
        emailRes.json(),
        httpRes.json(),
        recipientsRes.json(),
        logsRes.json()
      ]);

      setEmailConfigs(emailData.configs || []);
      setHttpConfigs(httpData.configs || []);
      setEmailRecipients(recipientsData.recipients || []);
      setNotificationLogs(logsData.logs || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      showSnackbar('Failed to load data', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // Email configuration handlers
  const handleEmailConfigSubmit = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const url = editingConfig 
        ? `${API_BASE_URL}/notification-config/email/${editingConfig.config_id}`
        : `${API_BASE_URL}/notification-config/email`;
      
      const response = await fetch(url, {
        method: editingConfig ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(emailForm)
      });

      if (response.ok) {
        showSnackbar(`Email configuration ${editingConfig ? 'updated' : 'created'} successfully`);
        setEmailConfigDialog(false);
        setEditingConfig(null);
        fetchAll();
      } else {
        showSnackbar('Failed to save email configuration', 'error');
      }
    } catch (error) {
      showSnackbar('Failed to save email configuration', 'error');
    }
  };

  const handleEmailConfigEdit = (config) => {
    setEditingConfig(config);
    setEmailForm({
      name: config.name,
      smtp_host: config.smtp_host,
      smtp_port: config.smtp_port,
      smtp_secure: config.smtp_secure,
      username: config.username,
      password: config.password,
      from_email: config.from_email,
      from_name: config.from_name,
      is_default: config.is_default
    });
    setEmailConfigDialog(true);
  };

  const handleEmailConfigDelete = async (configId) => {
    if (!window.confirm('Are you sure you want to delete this email configuration?')) return;

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/notification-config/email/${configId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        showSnackbar('Email configuration deleted successfully');
        fetchAll();
      } else {
        showSnackbar('Failed to delete email configuration', 'error');
      }
    } catch (error) {
      showSnackbar('Failed to delete email configuration', 'error');
    }
  };

  // HTTP configuration handlers
  const handleHttpConfigSubmit = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const url = editingConfig 
        ? `${API_BASE_URL}/notification-config/http/${editingConfig.config_id}`
        : `${API_BASE_URL}/notification-config/http`;
      
      const response = await fetch(url, {
        method: editingConfig ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...httpForm,
          headers: JSON.parse(httpForm.headers)
        })
      });

      if (response.ok) {
        showSnackbar(`HTTP configuration ${editingConfig ? 'updated' : 'created'} successfully`);
        setHttpConfigDialog(false);
        setEditingConfig(null);
        fetchAll();
      } else {
        showSnackbar('Failed to save HTTP configuration', 'error');
      }
    } catch (error) {
      showSnackbar('Failed to save HTTP configuration', 'error');
    }
  };

  const handleHttpConfigEdit = (config) => {
    setEditingConfig(config);
    setHttpForm({
      name: config.name,
      url: config.url,
      method: config.method,
      headers: JSON.stringify(config.headers, null, 2),
      timeout: config.timeout,
      retry_count: config.retry_count,
      retry_delay: config.retry_delay,
      is_default: config.is_default
    });
    setHttpConfigDialog(true);
  };

  const handleHttpConfigDelete = async (configId) => {
    if (!window.confirm('Are you sure you want to delete this HTTP configuration?')) return;

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/notification-config/http/${configId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        showSnackbar('HTTP configuration deleted successfully');
        fetchAll();
      } else {
        showSnackbar('Failed to delete HTTP configuration', 'error');
      }
    } catch (error) {
      showSnackbar('Failed to delete HTTP configuration', 'error');
    }
  };

  // Email recipient handlers
  const handleRecipientSubmit = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const url = editingRecipient 
        ? `${API_BASE_URL}/notification-config/email-recipients/${editingRecipient.recipient_id}`
        : `${API_BASE_URL}/notification-config/email-recipients`;
      
      const response = await fetch(url, {
        method: editingRecipient ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(recipientForm)
      });

      if (response.ok) {
        showSnackbar(`Email recipient ${editingRecipient ? 'updated' : 'created'} successfully`);
        setRecipientDialog(false);
        setEditingRecipient(null);
        fetchAll();
      } else {
        showSnackbar('Failed to save email recipient', 'error');
      }
    } catch (error) {
      showSnackbar('Failed to save email recipient', 'error');
    }
  };

  const handleRecipientEdit = (recipient) => {
    setEditingRecipient(recipient);
    setRecipientForm({
      email: recipient.email,
      name: recipient.name,
      is_active: recipient.is_active
    });
    setRecipientDialog(true);
  };

  const handleRecipientDelete = async (recipientId) => {
    if (!window.confirm('Are you sure you want to delete this email recipient?')) return;

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/notification-config/email-recipients/${recipientId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        showSnackbar('Email recipient deleted successfully');
        fetchAll();
      } else {
        showSnackbar('Failed to delete email recipient', 'error');
      }
    } catch (error) {
      showSnackbar('Failed to delete email recipient', 'error');
    }
  };

  // Test handlers
  const handleTestEmail = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/notification-config/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          config_id: editingConfig?.config_id,
          test_email: testEmail
        })
      });

      const result = await response.json();
      setTestResult(result);
      if (result.success) {
        showSnackbar('Test email sent successfully');
      } else {
        showSnackbar(`Test failed: ${result.message}`, 'error');
      }
    } catch (error) {
      showSnackbar('Failed to send test email', 'error');
    }
  };

  const handleTestHttp = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/notification-config/test-http`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          config_id: editingConfig?.config_id
        })
      });

      const result = await response.json();
      setTestResult(result);
      if (result.success) {
        showSnackbar('Test HTTP notification sent successfully');
      } else {
        showSnackbar(`Test failed: ${result.message}`, 'error');
      }
    } catch (error) {
      showSnackbar('Failed to send test HTTP notification', 'error');
    }
  };

  // Reset forms
  const resetEmailForm = () => {
    setEmailForm({
      name: '',
      smtp_host: '',
      smtp_port: 587,
      smtp_secure: false,
      username: '',
      password: '',
      from_email: '',
      from_name: '',
      is_default: false
    });
    setEditingConfig(null);
  };

  const resetHttpForm = () => {
    setHttpForm({
      name: '',
      url: '',
      method: 'POST',
      headers: '{"Content-Type": "application/json"}',
      timeout: 30000,
      retry_count: 3,
      retry_delay: 5000,
      is_default: false
    });
    setEditingConfig(null);
  };

  const resetRecipientForm = () => {
    setRecipientForm({
      email: '',
      name: '',
      is_active: true
    });
    setEditingRecipient(null);
  };

  // Table columns
  const emailConfigColumns = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'smtp_host', headerName: 'SMTP Host', flex: 1 },
    { field: 'smtp_port', headerName: 'Port', flex: 0.5 },
    { field: 'from_email', headerName: 'From Email', flex: 1 },
    { 
      field: 'is_default', 
      headerName: 'Default', 
      flex: 0.5,
      renderCell: (params) => params.value ? <Chip label="Default" color="primary" size="small" /> : ''
    },
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 1,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton size="small" onClick={() => handleEmailConfigEdit(params.row)}>
            <EditIcon />
          </IconButton>
          <IconButton size="small" onClick={() => handleEmailConfigDelete(params.row.config_id)}>
            <DeleteIcon />
          </IconButton>
          <IconButton size="small" onClick={() => {
            setEditingConfig(params.row);
            setTestEmailDialog(true);
          }}>
            <SendIcon />
          </IconButton>
        </Box>
      )
    }
  ];

  const httpConfigColumns = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'url', headerName: 'URL', flex: 1.5 },
    { field: 'method', headerName: 'Method', flex: 0.5 },
    { field: 'timeout', headerName: 'Timeout (ms)', flex: 0.5 },
    { 
      field: 'is_default', 
      headerName: 'Default', 
      flex: 0.5,
      renderCell: (params) => params.value ? <Chip label="Default" color="primary" size="small" /> : ''
    },
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 1,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton size="small" onClick={() => handleHttpConfigEdit(params.row)}>
            <EditIcon />
          </IconButton>
          <IconButton size="small" onClick={() => handleHttpConfigDelete(params.row.config_id)}>
            <DeleteIcon />
          </IconButton>
          <IconButton size="small" onClick={() => {
            setEditingConfig(params.row);
            setTestHttpDialog(true);
          }}>
            <SendIcon />
          </IconButton>
        </Box>
      )
    }
  ];

  const recipientColumns = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'email', headerName: 'Email', flex: 1.5 },
    { 
      field: 'is_active', 
      headerName: 'Active', 
      flex: 0.5,
      renderCell: (params) => params.value ? <Chip label="Active" color="success" size="small" /> : <Chip label="Inactive" color="default" size="small" />
    },
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 1,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton size="small" onClick={() => handleRecipientEdit(params.row)}>
            <EditIcon />
          </IconButton>
          <IconButton size="small" onClick={() => handleRecipientDelete(params.row.recipient_id)}>
            <DeleteIcon />
          </IconButton>
        </Box>
      )
    }
  ];

  const logColumns = [
    { field: 'alert_name', headerName: 'Alert', flex: 1 },
    { field: 'notification_type', headerName: 'Type', flex: 0.5 },
    { field: 'recipient', headerName: 'Recipient', flex: 1 },
    { field: 'status', headerName: 'Status', flex: 0.5 },
    { field: 'created_at', headerName: 'Created', flex: 1 },
    { field: 'sent_at', headerName: 'Sent', flex: 1 }
  ];

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, letterSpacing: 1 }}>
        Notification Configuration
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Email Configuration" />
        <Tab label="HTTP Configuration" />
        <Tab label="Email Recipients" />
        <Tab label="Notification Logs" />
      </Tabs>

      {/* Email Configuration Tab */}
      {tab === 0 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Email Configurations</Typography>
              <Button 
                variant="contained" 
                onClick={() => {
                  resetEmailForm();
                  setEmailConfigDialog(true);
                }}
              >
                Add Email Config
              </Button>
            </Box>
            <div style={{ height: 400, width: '100%' }}>
              <DataGrid 
                rows={emailConfigs.map(row => ({ ...row, id: row.config_id }))} 
                columns={emailConfigColumns} 
                pageSize={5} 
                rowsPerPageOptions={[5, 10, 25]}
                disableSelectionOnClick
                loading={loading}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* HTTP Configuration Tab */}
      {tab === 1 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">HTTP Configurations</Typography>
              <Button 
                variant="contained" 
                onClick={() => {
                  resetHttpForm();
                  setHttpConfigDialog(true);
                }}
              >
                Add HTTP Config
              </Button>
            </Box>
            <div style={{ height: 400, width: '100%' }}>
              <DataGrid 
                rows={httpConfigs.map(row => ({ ...row, id: row.config_id }))} 
                columns={httpConfigColumns} 
                pageSize={5} 
                rowsPerPageOptions={[5, 10, 25]}
                disableSelectionOnClick
                loading={loading}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Recipients Tab */}
      {tab === 2 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Email Recipients</Typography>
              <Button 
                variant="contained" 
                onClick={() => {
                  resetRecipientForm();
                  setRecipientDialog(true);
                }}
              >
                Add Recipient
              </Button>
            </Box>
            <div style={{ height: 400, width: '100%' }}>
              <DataGrid 
                rows={emailRecipients.map(row => ({ ...row, id: row.recipient_id }))} 
                columns={recipientColumns} 
                pageSize={5} 
                rowsPerPageOptions={[5, 10, 25]}
                disableSelectionOnClick
                loading={loading}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notification Logs Tab */}
      {tab === 3 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Notification Logs</Typography>
            <div style={{ height: 400, width: '100%' }}>
              <DataGrid 
                rows={notificationLogs.map(row => ({ ...row, id: row.log_id }))} 
                columns={logColumns} 
                pageSize={5} 
                rowsPerPageOptions={[5, 10, 25]}
                disableSelectionOnClick
                loading={loading}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Configuration Dialog */}
      <Dialog open={emailConfigDialog} onClose={() => setEmailConfigDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingConfig ? 'Edit Email Configuration' : 'Add Email Configuration'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Configuration Name"
                fullWidth
                value={emailForm.name}
                onChange={(e) => setEmailForm({ ...emailForm, name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="SMTP Host"
                fullWidth
                value={emailForm.smtp_host}
                onChange={(e) => setEmailForm({ ...emailForm, smtp_host: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="SMTP Port"
                type="number"
                fullWidth
                value={emailForm.smtp_port}
                onChange={(e) => setEmailForm({ ...emailForm, smtp_port: parseInt(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={emailForm.smtp_secure}
                    onChange={(e) => setEmailForm({ ...emailForm, smtp_secure: e.target.checked })}
                  />
                }
                label="Use SSL/TLS"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Username"
                fullWidth
                value={emailForm.username}
                onChange={(e) => setEmailForm({ ...emailForm, username: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Password"
                type="password"
                fullWidth
                value={emailForm.password}
                onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="From Email"
                fullWidth
                value={emailForm.from_email}
                onChange={(e) => setEmailForm({ ...emailForm, from_email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="From Name"
                fullWidth
                value={emailForm.from_name}
                onChange={(e) => setEmailForm({ ...emailForm, from_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={emailForm.is_default}
                    onChange={(e) => setEmailForm({ ...emailForm, is_default: e.target.checked })}
                  />
                }
                label="Set as Default Configuration"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailConfigDialog(false)}>Cancel</Button>
          <Button onClick={handleEmailConfigSubmit} variant="contained">
            {editingConfig ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* HTTP Configuration Dialog */}
      <Dialog open={httpConfigDialog} onClose={() => setHttpConfigDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingConfig ? 'Edit HTTP Configuration' : 'Add HTTP Configuration'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Configuration Name"
                fullWidth
                value={httpForm.name}
                onChange={(e) => setHttpForm({ ...httpForm, name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Method</InputLabel>
                <Select
                  value={httpForm.method}
                  label="Method"
                  onChange={(e) => setHttpForm({ ...httpForm, method: e.target.value })}
                >
                  <MenuItem value="GET">GET</MenuItem>
                  <MenuItem value="POST">POST</MenuItem>
                  <MenuItem value="PUT">PUT</MenuItem>
                  <MenuItem value="PATCH">PATCH</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="URL"
                fullWidth
                value={httpForm.url}
                onChange={(e) => setHttpForm({ ...httpForm, url: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Headers (JSON)"
                fullWidth
                multiline
                rows={4}
                value={httpForm.headers}
                onChange={(e) => setHttpForm({ ...httpForm, headers: e.target.value })}
                helperText="Enter headers as JSON object"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Timeout (ms)"
                type="number"
                fullWidth
                value={httpForm.timeout}
                onChange={(e) => setHttpForm({ ...httpForm, timeout: parseInt(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Retry Count"
                type="number"
                fullWidth
                value={httpForm.retry_count}
                onChange={(e) => setHttpForm({ ...httpForm, retry_count: parseInt(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Retry Delay (ms)"
                type="number"
                fullWidth
                value={httpForm.retry_delay}
                onChange={(e) => setHttpForm({ ...httpForm, retry_delay: parseInt(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={httpForm.is_default}
                    onChange={(e) => setHttpForm({ ...httpForm, is_default: e.target.checked })}
                  />
                }
                label="Set as Default Configuration"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHttpConfigDialog(false)}>Cancel</Button>
          <Button onClick={handleHttpConfigSubmit} variant="contained">
            {editingConfig ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Email Recipient Dialog */}
      <Dialog open={recipientDialog} onClose={() => setRecipientDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRecipient ? 'Edit Email Recipient' : 'Add Email Recipient'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Name"
                fullWidth
                value={recipientForm.name}
                onChange={(e) => setRecipientForm({ ...recipientForm, name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                value={recipientForm.email}
                onChange={(e) => setRecipientForm({ ...recipientForm, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={recipientForm.is_active}
                    onChange={(e) => setRecipientForm({ ...recipientForm, is_active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecipientDialog(false)}>Cancel</Button>
          <Button onClick={handleRecipientSubmit} variant="contained">
            {editingRecipient ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog open={testEmailDialog} onClose={() => setTestEmailDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Test Email Configuration</DialogTitle>
        <DialogContent>
          <TextField
            label="Test Email Address"
            type="email"
            fullWidth
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            sx={{ mt: 1 }}
          />
          {testResult && (
            <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
              {testResult.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestEmailDialog(false)}>Cancel</Button>
          <Button onClick={handleTestEmail} variant="contained">
            Send Test Email
          </Button>
        </DialogActions>
      </Dialog>

      {/* Test HTTP Dialog */}
      <Dialog open={testHttpDialog} onClose={() => setTestHttpDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Test HTTP Configuration</DialogTitle>
        <DialogContent>
          {testResult && (
            <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mt: 1 }}>
              {testResult.message}
              {testResult.status && (
                <div>Status: {testResult.status} {testResult.statusText}</div>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestHttpDialog(false)}>Cancel</Button>
          <Button onClick={handleTestHttp} variant="contained">
            Send Test Request
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
} 