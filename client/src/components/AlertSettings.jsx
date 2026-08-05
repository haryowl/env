import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Grid, TextField,
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  Tabs, Tab, Divider, Alert, Snackbar, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { DataGrid, GridActionsCellItem } from '@mui/x-data-grid';
import { API_BASE_URL } from '../config/api';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { getDeviceDisplayName } from '../utils/deviceLabel';

const DEFAULT_WA_BODY = JSON.stringify(
  { data: [{ phone: '{{phone}}', message: '{{message}}' }] },
  null,
  2
);

export default function AlertSettings({ user }) {
  const [tab, setTab] = useState('email');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  
  // Check if user is admin or super_admin
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Keep tab valid if role changes / MQTT is hidden for non-admins
  useEffect(() => {
    if (!isAdmin && tab === 'mqtt') {
      setTab('email');
    }
  }, [isAdmin, tab]);  
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
  const [editingRecipient, setEditingRecipient] = useState(null);
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
    headersJson: '{}', // extra HTTP headers as JSON (e.g. Authorization for Wablas)
    alerts: [], // Which alerts this endpoint should receive
    body_template: '' // optional JSON; placeholders {{device}}, {{value}}, etc.
  });
  const [editingHttpEndpoint, setEditingHttpEndpoint] = useState(null);

  // Notification Logs
  const [notificationLogs, setNotificationLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [mqttStatus, setMqttStatus] = useState({ connected: false, brokerUrl: '' });

  // WhatsApp
  const [waProvider, setWaProvider] = useState({
    enabled: false,
    url: 'https://jogja.wablas.com/api/v2/send-message',
    method: 'POST',
    headersJson: '{}',
    body_template: DEFAULT_WA_BODY,
  });
  const [waSaving, setWaSaving] = useState(false);
  const [waDevices, setWaDevices] = useState([]);
  const [waDeviceId, setWaDeviceId] = useState('');
  const [waAlertsForDevice, setWaAlertsForDevice] = useState([]);
  const [waAlertId, setWaAlertId] = useState('');
  const [waPhone, setWaPhone] = useState('');
  const [waSubscriptions, setWaSubscriptions] = useState([]);
  const [waBusy, setWaBusy] = useState(false);

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

      try {
        const mqttRes = await fetch(`${API_BASE_URL}/mqtt-publisher/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (mqttRes.ok) {
          const mqttData = await mqttRes.json();
          setMqttStatus({
            connected: Boolean(mqttData.connected),
            brokerUrl: mqttData.brokerUrl || '',
          });
        }
      } catch {
        setMqttStatus({ connected: false, brokerUrl: '' });
      }

      // WhatsApp subscriptions (all users) + provider (admin)
      try {
        const [subRes, devRes] = await Promise.all([
          fetch(`${API_BASE_URL}/alert-settings/whatsapp-subscriptions`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/devices/dropdown`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (subRes.ok) {
          const subData = await subRes.json();
          setWaSubscriptions(subData.subscriptions || []);
        }
        if (devRes.ok) {
          const devData = await devRes.json();
          setWaDevices(Array.isArray(devData) ? devData : devData.devices || []);
        }
      } catch {
        /* ignore */
      }

      if (isAdmin) {
        try {
          const waRes = await fetch(`${API_BASE_URL}/alert-settings/whatsapp-provider`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (waRes.ok) {
            const waData = await waRes.json();
            const c = waData.config || {};
            let headersJson = '{}';
            if (c.headers && typeof c.headers === 'object') {
              headersJson = JSON.stringify(c.headers, null, 2);
            }
            let bodyTemplate = DEFAULT_WA_BODY;
            if (c.body_template != null) {
              bodyTemplate =
                typeof c.body_template === 'string'
                  ? c.body_template
                  : JSON.stringify(c.body_template, null, 2);
            }
            setWaProvider({
              enabled: Boolean(c.enabled),
              url: c.url || 'https://jogja.wablas.com/api/v2/send-message',
              method: c.method || 'POST',
              headersJson,
              body_template: bodyTemplate,
            });
          }
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to load configurations', severity: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadConfigurations();
  }, []);

  useEffect(() => {
    const loadWaAlerts = async () => {
      setWaAlertId('');
      setWaAlertsForDevice([]);
      if (!waDeviceId) return;
      try {
        const token = localStorage.getItem('iot_token');
        const res = await fetch(
          `${API_BASE_URL}/alert-settings/whatsapp-alerts?deviceId=${encodeURIComponent(waDeviceId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setWaAlertsForDevice(data.alerts || []);
        }
      } catch {
        setWaAlertsForDevice([]);
      }
    };
    loadWaAlerts();
  }, [waDeviceId]);

  const saveWhatsAppProvider = async () => {
    if (!isAdmin) return;
    setWaSaving(true);
    try {
      const token = localStorage.getItem('iot_token');
      let headers = {};
      try {
        const raw = (waProvider.headersJson || '').trim();
        headers = raw ? JSON.parse(raw) : {};
      } catch {
        setNotification({ open: true, message: 'HTTP headers must be valid JSON', severity: 'warning' });
        setWaSaving(false);
        return;
      }
      let body_template;
      try {
        body_template = JSON.parse(waProvider.body_template || DEFAULT_WA_BODY);
      } catch {
        setNotification({ open: true, message: 'Body template must be valid JSON', severity: 'warning' });
        setWaSaving(false);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/alert-settings/whatsapp-provider`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: waProvider.enabled,
          url: waProvider.url,
          method: waProvider.method,
          headers,
          body_template,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save WhatsApp provider');
      setNotification({ open: true, message: 'WhatsApp provider saved', severity: 'success' });
    } catch (e) {
      setNotification({ open: true, message: e.message || 'Failed to save WhatsApp provider', severity: 'error' });
    } finally {
      setWaSaving(false);
    }
  };

  const addWhatsAppSubscription = async () => {
    if (!waDeviceId || !waAlertId || !waPhone.trim()) {
      setNotification({ open: true, message: 'Select device, alert, and enter a phone number', severity: 'warning' });
      return;
    }
    setWaBusy(true);
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/alert-settings/whatsapp-subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          device_id: waDeviceId,
          alert_id: Number(waAlertId),
          phone: waPhone.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to add phone');
      setWaPhone('');
      const subRes = await fetch(`${API_BASE_URL}/alert-settings/whatsapp-subscriptions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        setWaSubscriptions(subData.subscriptions || []);
      }
      setNotification({ open: true, message: 'Phone subscribed', severity: 'success' });
    } catch (e) {
      setNotification({ open: true, message: e.message || 'Failed to add phone', severity: 'error' });
    } finally {
      setWaBusy(false);
    }
  };

  const deleteWhatsAppSubscription = async (id) => {
    setWaBusy(true);
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/alert-settings/whatsapp-subscriptions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      setWaSubscriptions((prev) => prev.filter((r) => r.id !== id));
      setNotification({ open: true, message: 'Subscription removed', severity: 'success' });
    } catch (e) {
      setNotification({ open: true, message: e.message || 'Failed to delete', severity: 'error' });
    } finally {
      setWaBusy(false);
    }
  };

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

  // Update email recipient
  const updateEmailRecipient = async () => {
    if (!editingRecipient) return;
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-settings/email-recipients/${editingRecipient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editingRecipient.name,
          email: editingRecipient.email,
          alerts: Array.isArray(editingRecipient.alerts) ? editingRecipient.alerts : []
        })
      });

      if (response.ok) {
        setNotification({ open: true, message: 'Recipient updated successfully', severity: 'success' });
        setEditingRecipient(null);
        loadConfigurations();
      } else {
        const data = await response.json().catch(() => ({}));
        setNotification({ open: true, message: data.error || 'Failed to update recipient', severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to update recipient', severity: 'error' });
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
        setEditingRecipient(null);
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

    let headersObj = {};
    try {
      const raw = (newEndpoint.headersJson || '').trim();
      if (raw) headersObj = JSON.parse(raw);
    } catch {
      setNotification({ open: true, message: 'HTTP headers must be valid JSON (object).', severity: 'warning' });
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
        body: JSON.stringify({
          url: newEndpoint.url,
          method: newEndpoint.method,
          headers: headersObj,
          alerts: newEndpoint.alerts,
          body_template: newEndpoint.body_template
        })
      });

      if (response.ok) {
        setNotification({ open: true, message: 'HTTP endpoint added successfully', severity: 'success' });
        setNewEndpoint({ url: '', method: 'POST', headersJson: '{}', alerts: [], body_template: '' });
        loadConfigurations();
      } else {
        setNotification({ open: true, message: 'Failed to add HTTP endpoint', severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to add HTTP endpoint', severity: 'error' });
    }
  };

  const openEditHttpEndpoint = (row) => {
    let headersJson = '{}';
    if (row.headers != null && typeof row.headers === 'object') {
      headersJson = JSON.stringify(row.headers, null, 2);
    }
    setEditingHttpEndpoint({
      id: row.id,
      url: row.url || '',
      method: row.method || 'POST',
      alerts: Array.isArray(row.alerts) ? row.alerts : [],
      headersJson,
      body_template:
        row.body_template == null || row.body_template === ''
          ? ''
          : typeof row.body_template === 'string'
            ? row.body_template
            : JSON.stringify(row.body_template, null, 2)
    });
  };

  const updateHttpEndpoint = async () => {
    if (!editingHttpEndpoint?.url) {
      setNotification({ open: true, message: 'URL is required', severity: 'warning' });
      return;
    }

    let headersObj = {};
    try {
      const raw = (editingHttpEndpoint.headersJson || '').trim();
      if (raw) headersObj = JSON.parse(raw);
    } catch {
      setNotification({ open: true, message: 'HTTP headers must be valid JSON (object).', severity: 'warning' });
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(
        `${API_BASE_URL}/alert-settings/http-endpoints/${editingHttpEndpoint.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            url: editingHttpEndpoint.url,
            method: editingHttpEndpoint.method,
            alerts: editingHttpEndpoint.alerts,
            headers: headersObj,
            body_template: editingHttpEndpoint.body_template
          })
        }
      );

      if (response.ok) {
        setNotification({ open: true, message: 'HTTP endpoint updated successfully', severity: 'success' });
        setEditingHttpEndpoint(null);
        loadConfigurations();
      } else {
        let msg = 'Failed to update HTTP endpoint';
        try {
          const err = await response.json();
          msg = err.error || msg;
        } catch {
          /* ignore */
        }
        setNotification({ open: true, message: msg, severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'Failed to update HTTP endpoint', severity: 'error' });
    }
  };

  // Delete HTTP endpoint
  const deleteHttpEndpoint = async (id) => {
    if (!window.confirm('Delete this HTTP endpoint? This cannot be undone.')) {
      return;
    }
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
        let errorMessage = 'Failed to send test email';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Server error ${response.status}. Check SMTP settings.`;
        }
        setNotification({ open: true, message: errorMessage, severity: 'error' });
      }
    } catch (error) {
      setNotification({ 
        open: true, 
        message: error.message || 'Network error. Check connection and try again.', 
        severity: 'error' 
      });
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
        let msg = 'HTTP endpoint test failed';
        try {
          const err = await response.json();
          msg = err.error || msg;
        } catch {
          msg = `${msg} (${response.status})`;
        }
        setNotification({ open: true, message: msg, severity: 'error' });
      }
    } catch (error) {
      setNotification({ open: true, message: 'HTTP endpoint test failed', severity: 'error' });
    }
  };

  const notificationLogColumns = [
    { field: 'timestamp', headerName: 'Timestamp', flex: 1, valueGetter: (params) => formatInUserTimezone(params.value) },
    { field: 'alert_name', headerName: 'Alert', flex: 1 },
    { field: 'type', headerName: 'Type', flex: 0.5 },
    { field: 'recipient', headerName: 'Recipient', flex: 1 },
    { field: 'status', headerName: 'Status', flex: 0.5, renderCell: (params) => (
      <Chip 
        label={params.value} 
        color={params.value === 'success' || params.value === 'sent' ? 'success' : params.value === 'failed' ? 'error' : 'warning'}
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" onClick={() => setEditingRecipient({ id: params.row.id, name: params.row.name, email: params.row.email, alerts: Array.isArray(params.row.alerts) ? params.row.alerts : [] })}>
            Edit
          </Button>
          <Button size="small" color="error" onClick={() => deleteEmailRecipient(params.row.id)}>
            Delete
          </Button>
        </Box>
      )
    },
  ];

  const httpEndpointColumns = [
    { field: 'url', headerName: 'URL', flex: 2, minWidth: 160 },
    { field: 'method', headerName: 'Method', width: 88, minWidth: 88 },
    {
      field: 'alerts',
      headerName: 'Alerts',
      flex: 1,
      minWidth: 120,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', py: 0.5 }}>
          {Array.isArray(params.value) ? params.value.map(alertId => {
            const alert = alerts.find(a => a.id === alertId || a.alert_id === alertId);
            return alert ? <Chip key={alertId} label={alert.name} size="small" /> : null;
          }) : <Typography variant="body2" color="text.secondary">No alerts assigned</Typography>}
        </Box>
      )
    },
    {
      field: 'actions',
      headerName: 'Actions',
      type: 'actions',
      width: 132,
      minWidth: 132,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      getActions: (params) => [
        <GridActionsCellItem
          key="test"
          icon={<PlayArrowIcon fontSize="small" />}
          label="Test"
          onClick={() => testHttpEndpoint(params.row)}
        />,
        <GridActionsCellItem
          key="edit"
          icon={<EditIcon fontSize="small" />}
          label="Edit"
          onClick={() => openEditHttpEndpoint(params.row)}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<DeleteOutlineIcon fontSize="small" />}
          label="Delete"
          onClick={() => deleteHttpEndpoint(params.row.id)}
          sx={{ color: 'error.main' }}
        />
      ]
    }
  ];

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, letterSpacing: 1 }}>Alert Settings</Typography>
      
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Email Configuration" value="email" />
        <Tab label="HTTP Configuration" value="http" />
        <Tab label="WhatsApp" value="whatsapp" />
        {isAdmin && <Tab label="MQTT" value="mqtt" />}
        <Tab label="Notification Logs" value="logs" />
      </Tabs>

      {tab === 'email' && (
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

                <Dialog open={!!editingRecipient} onClose={() => setEditingRecipient(null)} maxWidth="sm" fullWidth>
                  <DialogTitle>Edit Recipient</DialogTitle>
                  <DialogContent>
                    {editingRecipient && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <TextField
                          label="Name"
                          fullWidth
                          value={editingRecipient.name || ''}
                          onChange={(e) => setEditingRecipient({ ...editingRecipient, name: e.target.value })}
                        />
                        <TextField
                          label="Email"
                          fullWidth
                          value={editingRecipient.email || ''}
                          onChange={(e) => setEditingRecipient({ ...editingRecipient, email: e.target.value })}
                        />
                        <FormControl fullWidth>
                          <InputLabel>Alerts to Receive</InputLabel>
                          <Select
                            multiple
                            value={editingRecipient.alerts}
                            onChange={(e) => setEditingRecipient({ ...editingRecipient, alerts: e.target.value })}
                            label="Alerts to Receive"
                          >
                            {alerts.map(alert => (
                              <MenuItem key={alert.alert_id} value={alert.alert_id}>{alert.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                    )}
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => setEditingRecipient(null)}>Cancel</Button>
                    <Button variant="contained" onClick={updateEmailRecipient}>Save</Button>
                  </DialogActions>
                </Dialog>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 'http' && (
        <>
        <Grid container spacing={3}>
          {/* HTTP Configuration */}
          <Grid item xs={12}>
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
                      <TextField
                        label="HTTP headers (JSON, optional)"
                        fullWidth
                        multiline
                        minRows={3}
                        value={newEndpoint.headersJson}
                        onChange={(e) => setNewEndpoint({ ...newEndpoint, headersJson: e.target.value })}
                        placeholder={`{\n  "Authorization": "your-wablas-token-here"\n}`}
                        helperText="Merged with Content-Type: application/json. Use for API keys (e.g. Wablas)."
                        sx={{ mb: 1 }}
                        InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
                      />
                      <TextField
                        label="Custom JSON body (optional)"
                        fullWidth
                        multiline
                        minRows={6}
                        value={newEndpoint.body_template}
                        onChange={(e) => setNewEndpoint({ ...newEndpoint, body_template: e.target.value })}
                        placeholder={`{\n  "event": "alert",\n  "device": "{{device}}",\n  "reading": "{{value}}"\n}`}
                        helperText="Leave empty for the default payload. Valid JSON with placeholders: {{alert_id}}, {{device}}, {{parameter}}, {{value}}, {{min}}, {{max}}, {{message}}, {{timestamp}}, {{type}}, {{lastUpdate}}, {{thresholdTime}}. A property whose entire value is exactly {{value}} (etc.) keeps a JSON number or null."
                        sx={{ mb: 1 }}
                        InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
                      />
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

          {/* HTTP Endpoints List — full width so Actions column is not clipped */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>HTTP Endpoints</Typography>
                {isAdmin ? (
                  <div style={{ height: 400, width: '100%' }}>
                    <DataGrid
                      rows={httpConfig.endpoints}
                      columns={httpEndpointColumns}
                      getRowId={(row) => row.id}
                      initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                      pageSizeOptions={[5, 10, 25, 100]}
                      disableRowSelectionOnClick
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

        <Dialog open={Boolean(editingHttpEndpoint)} onClose={() => setEditingHttpEndpoint(null)} maxWidth="md" fullWidth>
          <DialogTitle>Edit HTTP endpoint</DialogTitle>
          <DialogContent>
            {editingHttpEndpoint && (
              <Box sx={{ pt: 1 }}>
                <TextField
                  label="URL"
                  fullWidth
                  value={editingHttpEndpoint.url}
                  onChange={(e) => setEditingHttpEndpoint({ ...editingHttpEndpoint, url: e.target.value })}
                  sx={{ mb: 1 }}
                />
                <FormControl fullWidth sx={{ mb: 1 }}>
                  <InputLabel>Method</InputLabel>
                  <Select
                    value={editingHttpEndpoint.method}
                    onChange={(e) => setEditingHttpEndpoint({ ...editingHttpEndpoint, method: e.target.value })}
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
                    value={editingHttpEndpoint.alerts}
                    onChange={(e) => setEditingHttpEndpoint({ ...editingHttpEndpoint, alerts: e.target.value })}
                    label="Alerts to Send"
                  >
                    {alerts.map((alert) => (
                      <MenuItem key={alert.alert_id} value={alert.alert_id}>
                        {alert.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="HTTP headers (JSON, optional)"
                  fullWidth
                  multiline
                  minRows={3}
                  value={editingHttpEndpoint.headersJson}
                  onChange={(e) =>
                    setEditingHttpEndpoint({ ...editingHttpEndpoint, headersJson: e.target.value })
                  }
                  helperText="Merged with Content-Type: application/json."
                  sx={{ mb: 1 }}
                  InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
                />
                <TextField
                  label="Custom JSON body (optional)"
                  fullWidth
                  multiline
                  minRows={8}
                  value={editingHttpEndpoint.body_template}
                  onChange={(e) =>
                    setEditingHttpEndpoint({ ...editingHttpEndpoint, body_template: e.target.value })
                  }
                  helperText="Leave empty for the default IoT payload. Same placeholder rules as when adding an endpoint."
                  InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
                />
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditingHttpEndpoint(null)}>Cancel</Button>
            <Button variant="contained" onClick={updateHttpEndpoint}>
              Save
            </Button>
          </DialogActions>
        </Dialog>
        </>
      )}

      {tab === 'whatsapp' && (
        <Grid container spacing={3}>
          {isAdmin && (
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>WhatsApp provider (admin)</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Base Wablas configuration. End users only manage Device → Alert → phone numbers below.
                    Use placeholders {'{{phone}}'}, {'{{message}}'}, {'{{value}}'}, {'{{device}}'} in the body template.
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={waProvider.enabled}
                        onChange={(e) => setWaProvider({ ...waProvider, enabled: e.target.checked })}
                      />
                    }
                    label="Enable WhatsApp notifications"
                    sx={{ mb: 2, display: 'block' }}
                  />
                  <TextField
                    label="URL"
                    fullWidth
                    value={waProvider.url}
                    onChange={(e) => setWaProvider({ ...waProvider, url: e.target.value })}
                    sx={{ mb: 2 }}
                  />
                  <FormControl fullWidth size="small" sx={{ mb: 2, maxWidth: 200 }}>
                    <InputLabel id="wa-method">Method</InputLabel>
                    <Select
                      labelId="wa-method"
                      label="Method"
                      value={waProvider.method}
                      onChange={(e) => setWaProvider({ ...waProvider, method: e.target.value })}
                    >
                      <MenuItem value="POST">POST</MenuItem>
                      <MenuItem value="PUT">PUT</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="HTTP headers (JSON)"
                    fullWidth
                    multiline
                    minRows={3}
                    value={waProvider.headersJson}
                    onChange={(e) => setWaProvider({ ...waProvider, headersJson: e.target.value })}
                    placeholder='{"Authorization":"your-wablas-token"}'
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    label="Custom JSON body template"
                    fullWidth
                    multiline
                    minRows={6}
                    value={waProvider.body_template}
                    onChange={(e) => setWaProvider({ ...waProvider, body_template: e.target.value })}
                    sx={{ mb: 2, fontFamily: 'monospace' }}
                  />
                  <Button variant="contained" onClick={saveWhatsAppProvider} disabled={waSaving}>
                    {waSaving ? 'Saving…' : 'Save provider'}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          )}

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>My WhatsApp subscriptions</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Choose a device, then an alert for that device, and add one or more phone numbers.
                  Numbers are private to your account. Enable <strong>WhatsApp</strong> on the alert under Alerts.
                </Typography>
                <Grid container spacing={2} alignItems="flex-end" sx={{ mb: 2 }}>
                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="wa-device">Device</InputLabel>
                      <Select
                        labelId="wa-device"
                        label="Device"
                        value={waDeviceId}
                        onChange={(e) => setWaDeviceId(e.target.value)}
                      >
                        {waDevices.map((d) => (
                          <MenuItem key={d.device_id} value={d.device_id}>
                            {getDeviceDisplayName(d)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small" disabled={!waDeviceId}>
                      <InputLabel id="wa-alert">Alert</InputLabel>
                      <Select
                        labelId="wa-alert"
                        label="Alert"
                        value={waAlertId}
                        onChange={(e) => setWaAlertId(e.target.value)}
                      >
                        {waAlertsForDevice.map((a) => (
                          <MenuItem key={a.alert_id} value={String(a.alert_id)}>
                            {a.name || a.parameter || a.alert_id}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="Phone number"
                      fullWidth
                      size="small"
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      placeholder="0812… or 62812…"
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Button
                      variant="contained"
                      fullWidth
                      onClick={addWhatsAppSubscription}
                      disabled={waBusy || !waDeviceId || !waAlertId || !waPhone.trim()}
                    >
                      Add phone
                    </Button>
                  </Grid>
                </Grid>

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Device</TableCell>
                        <TableCell>Alert</TableCell>
                        <TableCell>Phone</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {waSubscriptions.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <Typography variant="body2" color="text.secondary">
                              No subscriptions yet.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                      {waSubscriptions.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.device_name || row.device_id}</TableCell>
                          <TableCell>{row.alert_name || row.alert_id}</TableCell>
                          <TableCell>{row.phone}</TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              color="error"
                              disabled={waBusy}
                              onClick={() => deleteWhatsAppSubscription(row.id)}
                              aria-label="Delete"
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 'mqtt' && isAdmin && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>MQTT alert publishing</Typography>
            <Alert severity={mqttStatus.connected ? 'success' : 'warning'} sx={{ mb: 2 }}>
              {mqttStatus.connected
                ? `MQTT broker connected${mqttStatus.brokerUrl ? ` (${mqttStatus.brokerUrl})` : ''}.`
                : 'MQTT broker is not connected. Alert MQTT actions will fail until the server connects to the broker (check MQTT_BROKER_URL).'}
            </Alert>
            <Typography variant="body2" color="text.secondary" paragraph>
              When an alert has the <strong>MQTT</strong> action enabled, the server publishes a JSON message when the alert triggers.
              Topic codes come from each device&apos;s MQTT Publisher configuration (project / group / terminal).
            </Typography>
            <Typography variant="subtitle2" gutterBottom>Topic format</Typography>
            <Typography variant="body2" component="pre" sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1, mb: 2, fontFamily: 'monospace' }}>
              alert/{'{project_code}'}/{'{group_identifier}'}/{'{terminal_code}'}
            </Typography>
            <Typography variant="subtitle2" gutterBottom>Default payload (JSON)</Typography>
            <Typography variant="body2" component="pre" sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1, mb: 2, fontFamily: 'monospace', fontSize: '0.8rem' }}>
{`{
  "type": "iot_alert",
  "alert_id": 1,
  "device_id": "...",
  "device": "Device name",
  "parameter": "ph",
  "value": 7.2,
  "min": 6,
  "max": 8,
  "message": "processed template text",
  "timestamp": "ISO-8601"
}`}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Enable MQTT on each alert under <strong>Alerts</strong> (checkbox next to Popup / HTTP / Email).
              Configure the device topic in <strong>MQTT Publisher</strong> before alerts can publish.
              Delivery attempts appear in Notification Logs with type <strong>mqtt</strong>.
            </Typography>
            <Button variant="outlined" onClick={() => window.open('/mqtt-publisher', '_blank')}>
              Open MQTT Publisher
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'logs' && (
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