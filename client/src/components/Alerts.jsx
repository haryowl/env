import React, { useState, useEffect, useContext } from 'react';
import { Box, Typography, Card, CardContent, Button, Grid, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, Checkbox, ListItemText, Switch, Tabs, Tab } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { API_BASE_URL } from '../config/api';
import moment from 'moment-timezone';

// Utility: Format datetime in user's selected timezone
const getUserTimezone = () => localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';
const formatInUserTimezone = (dt, fmt = 'YYYY-MM-DD HH:mm:ss') => {
  if (!dt) return '-';
  return moment.utc(dt).tz(getUserTimezone()).format(fmt);
};

export default function Alerts({ socket, devices = [], alerts = [], onAlertsChange }) {
  const [parameters, setParameters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState(null);
  const [tab, setTab] = useState(0);
  const [alertLogs, setAlertLogs] = useState([]);

  const handleOpenDialog = (alert = null) => {
    setEditingAlert(alert);
    setDialogOpen(true);
  };
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingAlert(null);
  };

  const [form, setForm] = useState({
    name: '',
    device_id: '',
    parameter: '',
    min: '',
    max: '',
    type: 'threshold',
    threshold_time: '',
    popup: false,
    http: false,
    email: false,
    template: '',
  });
  const [alertType, setAlertType] = useState('threshold');
  const isInactivity = alertType === 'inactivity';
  const [deviceParams, setDeviceParams] = useState([]);

  // Add local state for alerts if onAlertsChange is not provided
  const [localAlerts, setLocalAlerts] = useState([]);
  const alertsToShow = onAlertsChange ? alerts : localAlerts;

  // When editing, populate form state
  useEffect(() => {
    if (editingAlert) {
      const incomingType = editingAlert.type || 'threshold';
      setAlertType(incomingType);
      setForm({
        name: editingAlert.name || '',
        device_id: editingAlert.device_id || '',
        parameter: incomingType === 'inactivity' ? 'last_update' : (editingAlert.parameter || ''),
        min: incomingType === 'inactivity' ? '' : (editingAlert.min || ''),
        max: incomingType === 'inactivity' ? '' : (editingAlert.max || ''),
        type: incomingType,
        threshold_time: editingAlert.threshold_time || '',
        popup: editingAlert.actions?.popup || false,
        http: editingAlert.actions?.http || false,
        email: editingAlert.actions?.email || false,
        template: editingAlert.template || '',
      });
    } else {
      setAlertType('threshold');
      setForm({
        name: '',
        device_id: '',
        parameter: '',
        min: '',
        max: '',
        type: 'threshold',
        threshold_time: '',
        popup: false,
        http: false,
        email: false,
        template: '',
      });
    }
  }, [editingAlert]);

  // Update deviceParams when device_id changes
  useEffect(() => {
    if (!form.device_id) {
      setDeviceParams([]);
      return;
    }
    // Try to fetch mapped fields for the selected device
    const fetchParams = async () => {
      const token = localStorage.getItem('iot_token');
      try {
        const res = await fetch(`${API_BASE_URL}/device-mapper-assignments/${form.device_id}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data.assignment && data.assignment.mappings) {
            setDeviceParams(data.assignment.mappings.map(m => m.target_field));
            return;
          }
        }
      } catch {}
      // Fallback: show all parameters
      setDeviceParams(parameters);
    };
    fetchParams();
  }, [form.device_id, parameters]);

  const handleFormChange = (field, value) => {
    if (field === 'type') {
      setAlertType(value);
      setForm(f => ({
        ...f,
        type: value,
        parameter: value === 'inactivity' ? 'last_update' : '',
        min: value === 'inactivity' ? '' : f.min,
        max: value === 'inactivity' ? '' : f.max,
        threshold_time: value === 'inactivity' ? (f.threshold_time || '') : '',
      }));
      return;
    }
    setForm(f => ({ ...f, [field]: value }));
  };

  useEffect(() => {
    setForm(f => ({
      ...f,
      type: alertType,
      parameter: alertType === 'inactivity' ? (f.parameter || 'last_update') : f.parameter,
    }));
  }, [alertType]);

  const handleSaveAlert = async () => {
    const token = localStorage.getItem('iot_token');
    
    // Validate required fields
    const requiresParameter = alertType !== 'inactivity';
    if (!form.name || !form.device_id || (requiresParameter && !form.parameter) || !alertType) {
      alert('Please fill in all required fields (Name, Device, Parameter, Type)');
      return;
    }
    if (alertType === 'inactivity') {
      const thresholdMinutes = Number(form.threshold_time);
      if (!thresholdMinutes || Number.isNaN(thresholdMinutes) || thresholdMinutes <= 0) {
        alert('Please provide a valid threshold time (minutes) for inactivity alerts.');
        return;
      }
    }
    
    const alertData = {
      name: form.name,
      device_id: form.device_id,
      parameter: alertType === 'inactivity' ? 'last_update' : form.parameter,
      min: form.min === '' || isNaN(Number(form.min)) ? null : Number(form.min),
      max: form.max === '' || isNaN(Number(form.max)) ? null : Number(form.max),
      type: alertType || 'threshold', // Default to 'threshold' if empty
      threshold_time: form.threshold_time === '' || isNaN(Number(form.threshold_time)) ? null : Number(form.threshold_time),
      actions: { popup: form.popup, http: form.http, email: form.email },
      template: form.template,
    };
    
    console.log('Sending alert data:', alertData);

    if (editingAlert) {
      // Update existing alert
      try {
        const alertId = editingAlert.alert_id || editingAlert.id;
        const response = await fetch(`${API_BASE_URL}/alerts/${alertId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(alertData),
        });
        if (response.ok) {
          // After update, refresh alerts
          await fetchAll();
          setDialogOpen(false);
          setEditingAlert(null);
        } else {
          const errorData = await response.json();
          console.error('Failed to update alert:', errorData);
          alert(`Failed to update alert: ${errorData.error || 'Unknown error'}`);
        }
      } catch (e) {
        console.error('Error updating alert:', e);
        alert(`Failed to update alert: ${e.message}`);
      }
    } else {
      // Create new alert
      try {
        const response = await fetch(`${API_BASE_URL}/alerts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(alertData),
        });
        if (response.ok) {
          // After create, refresh alerts
          await fetchAll();
          setDialogOpen(false);
          setEditingAlert(null);
        } else {
          // setNotification({ open: true, message: 'Failed to create alert', severity: 'error' }); // Removed global notification
        }
      } catch (e) {
        // setNotification({ open: true, message: 'Failed to create alert', severity: 'error' }); // Removed global notification
      }
    }
  };
  const handleDeleteAlert = async (id) => {
    if (window.confirm('Are you sure you want to delete this alert?')) {
      try {
        const token = localStorage.getItem('iot_token');
        const response = await fetch(`${API_BASE_URL}/alerts/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          // setNotification({ open: true, message: 'Alert deleted successfully', severity: 'success' }); // Removed global notification
          // fetchAll(); // Refresh alerts - now handled by parent
        } else {
          // setNotification({ open: true, message: 'Failed to delete alert', severity: 'error' }); // Removed global notification
        }
      } catch (e) {
        // setNotification({ open: true, message: 'Failed to delete alert', severity: 'error' }); // Removed global notification
      }
    }
  };

  // Fetch alerts, devices, parameters
  const fetchAll = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('iot_token');
      const [alertsRes, devicesRes, paramsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/alerts`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
        fetch(`${API_BASE_URL}/devices`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
        fetch(`${API_BASE_URL}/field-definitions`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
      ]);
      if (!onAlertsChange) {
        setLocalAlerts((alertsRes.alerts || []).map(a => ({ ...a, id: a.alert_id })));
      } else {
        // If parent manages alerts, call callback
        onAlertsChange((alertsRes.alerts || []).map(a => ({ ...a, id: a.alert_id })));
      }
      setParameters((paramsRes.fields || []).map(f => f.field_name));
    } catch (e) {
      // setNotification({ open: true, message: 'Failed to load data', severity: 'error' }); // Removed global notification
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Fetch real alert logs from backend
  const fetchAlertLogs = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/alert-logs`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setAlertLogs((data.logs || []).map((l, i) => ({
        id: l.log_id || i,
        alert_name: l.alert_name,
        device: l.device_name || l.device_id,
        parameter: l.parameter,
        value: l.value,
        detected_at: l.detected_at,
        status: l.status
      })));
    } catch (e) {
      // setNotification({ open: true, message: 'Failed to load alert logs', severity: 'error' }); // Removed global notification
    }
  };

  // Listen for real-time alert logs via WebSocket
  useEffect(() => {
    if (!socket || alerts.length === 0) return;
    // const handleNewAlertLog = (log) => { // Removed global new_alert_log listener
    //   console.log('Alerts.jsx: Received new_alert_log:', log);
    //   const alertDef = alerts.find(a => String(a.alert_id) === String(log.alert_id) || String(a.id) === String(log.alert_id));
    //   const deviceName = devices.find(d => d.device_id === log.device_id)?.name || log.device_id;
    //   console.log('Alerts.jsx: alertDef:', alertDef, 'alerts:', alerts);
    //   if (alertDef?.actions?.popup) {
    //     setNotification({ // Now handled globally
    //       open: true,
    //       message: `ALERT: ${log.type === 'threshold' ? 'Threshold' : 'Inactivity'} on ${deviceName} (${log.parameter})`,
    //       severity: 'error'
    //     });
    //   } else {
    //     console.log('Popup not shown: alertDef missing or actions.popup is false');
    //   }
    //   fetchAlertLogs();
    // };
    // socket.on('new_alert_log', handleNewAlertLog); // Removed global new_alert_log listener
    // return () => socket.off('new_alert_log', handleNewAlertLog); // Removed global new_alert_log listener
  }, [socket, alerts, devices]);

  useEffect(() => {
    if (tab === 1) fetchAlertLogs();
  }, [tab]);

  const columns = [
    { field: 'name', headerName: 'Alert Name', flex: 1 },
    {
      field: 'device_id',
      headerName: 'Device',
      flex: 1,
      renderCell: (params) => devices.find(d => d.device_id === params.value)?.name || params.value
    },
    { field: 'parameter', headerName: 'Parameter', flex: 1 },
    { field: 'min', headerName: 'Min', flex: 0.5 },
    { field: 'max', headerName: 'Max', flex: 0.5 },
    { field: 'type', headerName: 'Type', flex: 1 },
    {
      field: 'popup',
      headerName: 'Popup',
      flex: 0.5,
      renderCell: (params) => params.row.actions?.popup ? '✔️' : ''
    },
    {
      field: 'http',
      headerName: 'HTTP',
      flex: 0.5,
      renderCell: (params) => params.row.actions?.http ? '✔️' : ''
    },
    {
      field: 'email',
      headerName: 'Email',
      flex: 0.5,
      renderCell: (params) => params.row.actions?.email ? '✔️' : ''
    },
    { field: 'inactivity', headerName: 'Inactivity', flex: 0.7, renderCell: (params) => params.row.type === 'inactivity' ? '✔️' : '' },
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 1,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={() => handleOpenDialog(params.row)}>Edit</Button>
          <Button size="small" color="error" onClick={() => handleDeleteAlert(params.row.alert_id || params.row.id)}>Delete</Button>
        </Box>
      )
    },
  ];

  const variableHints = {
    threshold: [
      { label: 'Device', value: '{device}' },
      { label: 'Parameter', value: '{parameter}' },
      { label: 'Value', value: '{value}' },
      { label: 'Min', value: '{min}' },
      { label: 'Max', value: '{max}' },
    ],
    inactivity: [
      { label: 'Device', value: '{device}' },
      { label: 'Last Update', value: '{lastUpdate}' },
      { label: 'Threshold Time', value: '{thresholdTime}' },
    ],
  };

  const alertLogColumns = [
    { field: 'alert_name', headerName: 'Alert Name', flex: 1 },
    { field: 'device', headerName: 'Device', flex: 1 },
    { field: 'parameter', headerName: 'Parameter', flex: 1 },
    { field: 'value', headerName: 'Value', flex: 1 },
    { field: 'detected_at', headerName: 'Detected At', flex: 1 },
    { field: 'status', headerName: 'Status', flex: 1 },
  ];

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      {/* Snackbar removed, now global in App.jsx */}
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, letterSpacing: 1 }}>Alerts</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Alert Management" />
        <Tab label="Alert Logs" />
      </Tabs>
      {tab === 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Alert Management</Typography>
            <Button variant="contained" color="primary" sx={{ mb: 2 }} onClick={() => handleOpenDialog()}>Create New Alert</Button>
            <div style={{ height: 350, width: '100%' }}>
              <DataGrid rows={alertsToShow} columns={columns} pageSize={5} rowsPerPageOptions={[5]} disableSelectionOnClick />
            </div>
          </CardContent>
        </Card>
      )}
      {tab === 1 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Alert Logs</Typography>
            <div style={{ height: 350, width: '100%' }}>
              <DataGrid rows={alertLogs} columns={alertLogColumns} pageSize={10} rowsPerPageOptions={[10, 25, 50]} disableSelectionOnClick />
            </div>
          </CardContent>
        </Card>
      )}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingAlert ? 'Edit Alert' : 'Create Alert'}</DialogTitle>
        <DialogContent>
          <TextField label="Alert Name" fullWidth sx={{ mb: 2 }} value={form.name} onChange={e => handleFormChange('name', e.target.value)} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Device</InputLabel>
            <Select value={form.device_id} label="Device" onChange={e => handleFormChange('device_id', e.target.value)}>
              {devices.map(d => <MenuItem key={d.device_id} value={d.device_id}>{d.name}</MenuItem>)}
            </Select>
          </FormControl>
          {!isInactivity && (
            <>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Parameter</InputLabel>
                <Select value={form.parameter} label="Parameter" onChange={e => handleFormChange('parameter', e.target.value)}>
                  {/* Always include the current parameter if not in deviceParams */}
                  {[...new Set([form.parameter, ...deviceParams].filter(Boolean))].map(p => (
                    <MenuItem key={p} value={p}>{p}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}><TextField label="Min" fullWidth value={form.min} onChange={e => handleFormChange('min', e.target.value)} /></Grid>
                <Grid item xs={6}><TextField label="Max" fullWidth value={form.max} onChange={e => handleFormChange('max', e.target.value)} /></Grid>
              </Grid>
            </>
          )}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select value={alertType} label="Type" onChange={e => handleFormChange('type', e.target.value)}>
              <MenuItem value="threshold">Threshold</MenuItem>
              <MenuItem value="inactivity">Inactivity</MenuItem>
            </Select>
          </FormControl>
          {isInactivity && (
            <>
              <TextField
                label="Parameter"
                fullWidth
                sx={{ mb: 2 }}
                value="last_update"
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Threshold Time (minutes)"
                fullWidth
                sx={{ mb: 2 }}
                value={form.threshold_time}
                onChange={e => handleFormChange('threshold_time', e.target.value)}
              />
            </>
          )}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl><Checkbox checked={form.popup} onChange={e => handleFormChange('popup', e.target.checked)} />Popup</FormControl>
            <FormControl><Checkbox checked={form.http} onChange={e => handleFormChange('http', e.target.checked)} />HTTP</FormControl>
            <FormControl><Checkbox checked={form.email} onChange={e => handleFormChange('email', e.target.checked)} />Email</FormControl>
          </Box>
          
          {/* Notification Configuration Assignment */}
          {(form.http || form.email) && (
            <Box sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Notification Configuration</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                Configure notification settings in the Notification Configuration section. 
                You can assign email recipients and HTTP endpoints to this alert after saving.
              </Typography>
              <Button 
                variant="outlined" 
                size="small" 
                onClick={() => window.open('/notification-config', '_blank')}
              >
                Open Notification Config
              </Button>
            </Box>
          )}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Notification Template</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              {(variableHints[alertType] || []).map(v => (
                <Button key={v.value} size="small" variant="outlined" onClick={() => handleFormChange('template', form.template + v.value)}>{v.label}</Button>
              ))}
            </Box>
            <TextField
              label="Template"
              fullWidth
              multiline
              minRows={3}
              value={form.template}
              onChange={e => handleFormChange('template', e.target.value)}
              placeholder={alertType === 'threshold' ? 'e.g. {device} {parameter} value {value} exceeded max {max}' : 'e.g. {device} last update at {lastUpdate} exceeded threshold {thresholdTime}'}
            />
            <Typography variant="caption" color="text.secondary">
              This template will be used for both email and HTTP push notifications. Use the variable buttons above to insert dynamic values.
            </Typography>
            <Box sx={{ mt: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="subtitle2">Preview:</Typography>
              <Typography variant="body2">
                {form.template
                  .replaceAll('{device}', devices.find(d => d.device_id === form.device_id)?.name || '')
                  .replaceAll('{parameter}', form.parameter)
                  .replaceAll('{value}', form.value || '')
                  .replaceAll('{min}', form.min)
                  .replaceAll('{max}', form.max)
                  .replaceAll('{lastUpdate}', '[last update]')
                  .replaceAll('{thresholdTime}', form.threshold_time)
                }
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSaveAlert} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
      <Button onClick={() => { /* Removed global test popup */ }} variant="outlined" sx={{ mb: 2 }}>Test Popup</Button>
    </Box>
  );
} 