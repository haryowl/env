import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Grid, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, Checkbox, ListItemText, Tabs, Tab, useTheme, OutlinedInput,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { API_BASE_URL } from '../config/api';
import { getChartCardSx } from '../utils/chartStyles';
import PageHeader from './PageHeader';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { getAlertDeviceIds } from '../utils/alertDevices';

export default function Alerts({ socket, devices = [], alerts = [], onAlertsChange }) {
  const theme = useTheme();
  const { formatDisplayName } = useFieldMetadata();
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

  const emptyForm = {
    name: '',
    device_ids: [],
    parameter: '',
    min: '',
    max: '',
    type: 'threshold',
    threshold_time: '',
    trigger_mode: 'on_enter',
    consecutive_count: 3,
    popup: false,
    http: false,
    email: false,
    mqtt: false,
    whatsapp: false,
    template: '',
  };

  const [form, setForm] = useState(emptyForm);
  const [alertType, setAlertType] = useState('threshold');
  const isInactivity = alertType === 'inactivity';
  const [deviceParams, setDeviceParams] = useState([]);

  const [localAlerts, setLocalAlerts] = useState([]);
  const alertsToShow = onAlertsChange ? alerts : localAlerts;

  useEffect(() => {
    if (editingAlert) {
      const incomingType = editingAlert.type || 'threshold';
      setAlertType(incomingType);
      setForm({
        name: editingAlert.name || '',
        device_ids: getAlertDeviceIds(editingAlert),
        parameter: incomingType === 'inactivity' ? 'last_update' : (editingAlert.parameter || ''),
        min: incomingType === 'inactivity' ? '' : (editingAlert.min ?? ''),
        max: incomingType === 'inactivity' ? '' : (editingAlert.max ?? ''),
        type: incomingType,
        threshold_time: editingAlert.threshold_time || '',
        trigger_mode: editingAlert.trigger_mode || 'on_enter',
        consecutive_count: editingAlert.consecutive_count || 3,
        popup: editingAlert.actions?.popup || false,
        http: editingAlert.actions?.http || false,
        email: editingAlert.actions?.email || false,
        mqtt: editingAlert.actions?.mqtt || false,
        whatsapp: editingAlert.actions?.whatsapp || false,
        template: editingAlert.template || '',
      });
    } else {
      setAlertType('threshold');
      setForm({ ...emptyForm });
    }
  }, [editingAlert]);

  // Union of mapped target fields across selected devices
  useEffect(() => {
    if (!form.device_ids?.length) {
      setDeviceParams([]);
      return;
    }
    const fetchParams = async () => {
      const token = localStorage.getItem('iot_token');
      const paramSet = new Set();
      let anyMapper = false;
      await Promise.all(
        form.device_ids.map(async (deviceId) => {
          try {
            const res = await fetch(`${API_BASE_URL}/device-mapper-assignments/${deviceId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              if (data.assignment?.mappings?.length) {
                anyMapper = true;
                data.assignment.mappings.forEach((m) => {
                  if (m.target_field) paramSet.add(m.target_field);
                });
              }
            }
          } catch {
            /* ignore */
          }
        })
      );
      if (anyMapper && paramSet.size > 0) {
        setDeviceParams([...paramSet]);
      } else {
        setDeviceParams(parameters);
      }
    };
    fetchParams();
  }, [form.device_ids, parameters]);

  const handleFormChange = (field, value) => {
    if (field === 'type') {
      setAlertType(value);
      setForm((f) => ({
        ...f,
        type: value,
        parameter: value === 'inactivity' ? 'last_update' : '',
        min: value === 'inactivity' ? '' : f.min,
        max: value === 'inactivity' ? '' : f.max,
        threshold_time: value === 'inactivity' ? f.threshold_time || '' : '',
      }));
      return;
    }
    setForm((f) => ({ ...f, [field]: value }));
  };

  useEffect(() => {
    setForm((f) => ({
      ...f,
      type: alertType,
      parameter: alertType === 'inactivity' ? f.parameter || 'last_update' : f.parameter,
    }));
  }, [alertType]);

  const handleSaveAlert = async () => {
    const token = localStorage.getItem('iot_token');
    const requiresParameter = alertType !== 'inactivity';
    if (!form.name || !form.device_ids?.length || (requiresParameter && !form.parameter) || !alertType) {
      alert('Please fill in all required fields (Name, Device(s), Parameter, Type)');
      return;
    }
    if (alertType === 'inactivity') {
      const thresholdMinutes = Number(form.threshold_time);
      if (!thresholdMinutes || Number.isNaN(thresholdMinutes) || thresholdMinutes <= 0) {
        alert('Please provide a valid threshold time (minutes) for inactivity alerts.');
        return;
      }
    }
    if (alertType === 'threshold' && form.trigger_mode === 'consecutive') {
      const n = Number(form.consecutive_count);
      if (!n || Number.isNaN(n) || n < 2) {
        alert('Please provide a consecutive count of 2 or more.');
        return;
      }
    }

    const alertData = {
      name: form.name,
      device_id: form.device_ids[0],
      device_ids: form.device_ids,
      parameter: alertType === 'inactivity' ? 'last_update' : form.parameter,
      min: form.min === '' || isNaN(Number(form.min)) ? null : Number(form.min),
      max: form.max === '' || isNaN(Number(form.max)) ? null : Number(form.max),
      type: alertType || 'threshold',
      threshold_time:
        form.threshold_time === '' || isNaN(Number(form.threshold_time)) ? null : Number(form.threshold_time),
      trigger_mode: alertType === 'inactivity' ? 'on_enter' : (form.trigger_mode || 'on_enter'),
      consecutive_count: Number(form.consecutive_count) || 3,
      actions: { popup: form.popup, http: form.http, email: form.email, mqtt: form.mqtt, whatsapp: form.whatsapp },
      template: form.template,
    };

    if (editingAlert) {
      try {
        const alertId = editingAlert.alert_id || editingAlert.id;
        const response = await fetch(`${API_BASE_URL}/alerts/${alertId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(alertData),
        });
        if (response.ok) {
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
      try {
        const response = await fetch(`${API_BASE_URL}/alerts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(alertData),
        });
        if (response.ok) {
          await fetchAll();
          setDialogOpen(false);
          setEditingAlert(null);
        }
      } catch (e) {
        /* ignore */
      }
    }
  };

  const handleDeleteAlert = async (id) => {
    if (window.confirm('Are you sure you want to delete this alert?')) {
      try {
        const token = localStorage.getItem('iot_token');
        await fetch(`${API_BASE_URL}/alerts/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        /* ignore */
      }
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('iot_token');
      const [alertsRes, paramsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/alerts`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/field-definitions`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
          r.json()
        ),
      ]);
      const mapped = (alertsRes.alerts || []).map((a) => ({ ...a, id: a.alert_id }));
      if (!onAlertsChange) {
        setLocalAlerts(mapped);
      } else {
        onAlertsChange(mapped);
      }
      setParameters((paramsRes.fields || []).map((f) => f.field_name));
    } catch (e) {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAlertLogs = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/alert-logs`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setAlertLogs(
        (data.logs || []).map((l, i) => ({
          id: l.log_id || i,
          alert_name: l.alert_name,
          device: l.device_name || l.device_id,
          parameter: l.parameter,
          value: l.value,
          detected_at: l.detected_at,
          status: l.status,
        }))
      );
    } catch (e) {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!socket || alerts.length === 0) return;
  }, [socket, alerts, devices]);

  useEffect(() => {
    if (tab === 1) fetchAlertLogs();
  }, [tab]);

  const deviceLabel = (ids) => {
    const list = Array.isArray(ids) ? ids : getAlertDeviceIds({ device_id: ids, device_ids: ids });
    if (!list.length) return '';
    const names = list.map((id) => devices.find((d) => d.device_id === id)?.name || id);
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  };

  const columns = [
    { field: 'name', headerName: 'Alert Name', flex: 1 },
    {
      field: 'device_ids',
      headerName: 'Device(s)',
      flex: 1.2,
      valueGetter: (params) => getAlertDeviceIds(params.row).join(','),
      renderCell: (params) => deviceLabel(getAlertDeviceIds(params.row)),
    },
    {
      field: 'parameter',
      headerName: 'Parameter',
      flex: 1,
      renderCell: (params) =>
        params.row.type === 'inactivity'
          ? 'Last Update'
          : formatDisplayName(params.value, { withUnit: true }) || params.value,
    },
    { field: 'min', headerName: 'Min', flex: 0.5 },
    { field: 'max', headerName: 'Max', flex: 0.5 },
    { field: 'type', headerName: 'Type', flex: 1 },
    {
      field: 'trigger_mode',
      headerName: 'Trigger',
      flex: 1.1,
      renderCell: (params) => {
        if (params.row.type === 'inactivity') return '—';
        const mode = params.row.trigger_mode || 'on_enter';
        if (mode === 'every_reading') return 'Every reading';
        if (mode === 'consecutive') return `${params.row.consecutive_count || 3} in a row`;
        return 'On enter';
      },
    },
    {
      field: 'popup',
      headerName: 'Popup',
      flex: 0.5,
      renderCell: (params) => (params.row.actions?.popup ? '✔️' : ''),
    },
    {
      field: 'http',
      headerName: 'HTTP',
      flex: 0.5,
      renderCell: (params) => (params.row.actions?.http ? '✔️' : ''),
    },
    {
      field: 'email',
      headerName: 'Email',
      flex: 0.5,
      renderCell: (params) => (params.row.actions?.email ? '✔️' : ''),
    },
    {
      field: 'mqtt',
      headerName: 'MQTT',
      flex: 0.5,
      renderCell: (params) => (params.row.actions?.mqtt ? '✔️' : ''),
    },
    {
      field: 'whatsapp',
      headerName: 'WA',
      flex: 0.5,
      renderCell: (params) => (params.row.actions?.whatsapp ? '✔️' : ''),
    },
    {
      field: 'inactivity',
      headerName: 'Inactivity',
      flex: 0.7,
      renderCell: (params) => (params.row.type === 'inactivity' ? '✔️' : ''),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 1,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={() => handleOpenDialog(params.row)}>
            Edit
          </Button>
          <Button
            size="small"
            color="error"
            onClick={() => handleDeleteAlert(params.row.alert_id || params.row.id)}
          >
            Delete
          </Button>
        </Box>
      ),
    },
  ];

  const variableHints = {
    threshold: [
      { label: 'Device', value: '{device}' },
      { label: 'Parameter', value: '{parameter}' },
      { label: 'Parameter Key', value: '{parameter_key}' },
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
    {
      field: 'parameter',
      headerName: 'Parameter',
      flex: 1,
      renderCell: (params) =>
        params.value === 'last_update'
          ? 'Last Update'
          : formatDisplayName(params.value, { withUnit: true }) || params.value,
    },
    { field: 'value', headerName: 'Value', flex: 1 },
    {
      field: 'detected_at',
      headerName: 'Detected At',
      flex: 1,
      valueFormatter: (value) => formatInUserTimezone(value),
    },
    { field: 'status', headerName: 'Status', flex: 1 },
  ];

  const previewDeviceName =
    form.device_ids.length === 1
      ? devices.find((d) => d.device_id === form.device_ids[0])?.name || ''
      : form.device_ids.length > 1
        ? deviceLabel(form.device_ids)
        : '';

  const previewParameter = formatDisplayName(form.parameter) || form.parameter;

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Box sx={{ mb: 2 }}>
        <PageHeader
          icon={<NotificationsIcon sx={{ fontSize: 18 }} />}
          title="Alerts"
          subtitle="Manage alert rules and review alert logs"
        />
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Alert Management" />
        <Tab label="Alert Logs" />
      </Tabs>
      {tab === 0 && (
        <Card sx={{ mb: 3, borderRadius: 1, ...getChartCardSx(theme) }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Alert Management
            </Typography>
            <Button variant="contained" color="primary" sx={{ mb: 2 }} onClick={() => handleOpenDialog()}>
              Create New Alert
            </Button>
            <div style={{ height: 350, width: '100%' }}>
              <DataGrid
                rows={alertsToShow}
                columns={columns}
                pageSize={5}
                rowsPerPageOptions={[5]}
                disableSelectionOnClick
                loading={loading}
              />
            </div>
          </CardContent>
        </Card>
      )}
      {tab === 1 && (
        <Card sx={{ mb: 3, borderRadius: 1, ...getChartCardSx(theme) }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Alert Logs
            </Typography>
            <div style={{ height: 350, width: '100%' }}>
              <DataGrid
                rows={alertLogs}
                columns={alertLogColumns}
                pageSize={10}
                rowsPerPageOptions={[10, 25, 50]}
                disableSelectionOnClick
              />
            </div>
          </CardContent>
        </Card>
      )}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
        <DialogTitle>{editingAlert ? 'Edit Alert' : 'Create Alert'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Alert Name"
            fullWidth
            sx={{ mb: 2, mt: 1 }}
            value={form.name}
            onChange={(e) => handleFormChange('name', e.target.value)}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Devices</InputLabel>
            <Select
              multiple
              value={form.device_ids}
              label="Devices"
              onChange={(e) => handleFormChange('device_ids', e.target.value)}
              input={<OutlinedInput label="Devices" />}
              renderValue={(selected) =>
                selected.map((id) => devices.find((d) => d.device_id === id)?.name || id).join(', ')
              }
              MenuProps={{
                PaperProps: {
                  sx: {
                    backgroundColor: `${theme.palette.background.paper} !important`,
                    '& .MuiMenuItem-root': {
                      color: `${theme.palette.text.primary} !important`,
                      '& .MuiListItemText-primary': {
                        color: `${theme.palette.text.primary} !important`,
                      },
                      '& .MuiCheckbox-root': {
                        color: `${theme.palette.text.primary} !important`,
                      },
                    },
                  },
                },
              }}
            >
              {devices.map((d) => (
                <MenuItem
                  key={d.device_id}
                  value={d.device_id}
                  sx={{ color: `${theme.palette.text.primary} !important` }}
                >
                  <Checkbox
                    checked={form.device_ids.indexOf(d.device_id) > -1}
                    sx={{ color: `${theme.palette.text.primary} !important` }}
                  />
                  <ListItemText
                    primary={d.name}
                    primaryTypographyProps={{
                      sx: { color: `${theme.palette.text.primary} !important` },
                    }}
                  />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {!isInactivity && (
            <>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Parameter</InputLabel>
                <Select
                  value={form.parameter}
                  label="Parameter"
                  onChange={(e) => handleFormChange('parameter', e.target.value)}
                >
                  {[...new Set([form.parameter, ...deviceParams].filter(Boolean))].map((p) => (
                    <MenuItem key={p} value={p}>
                      {formatDisplayName(p, { withUnit: true }) || p}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <TextField
                    label="Min"
                    fullWidth
                    value={form.min}
                    onChange={(e) => handleFormChange('min', e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Max"
                    fullWidth
                    value={form.max}
                    onChange={(e) => handleFormChange('max', e.target.value)}
                  />
                </Grid>
              </Grid>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Trigger rule</InputLabel>
                <Select
                  value={form.trigger_mode || 'on_enter'}
                  label="Trigger rule"
                  onChange={(e) => handleFormChange('trigger_mode', e.target.value)}
                >
                  <MenuItem value="on_enter">Only when the value begins out of range</MenuItem>
                  <MenuItem value="every_reading">Each time the value is out of range</MenuItem>
                  <MenuItem value="consecutive">When out of range X times in a row</MenuItem>
                </Select>
              </FormControl>
              {form.trigger_mode === 'consecutive' && (
                <TextField
                  label="Consecutive out-of-range readings (X)"
                  fullWidth
                  type="number"
                  inputProps={{ min: 2, max: 100 }}
                  sx={{ mb: 2 }}
                  value={form.consecutive_count}
                  onChange={(e) => handleFormChange('consecutive_count', e.target.value)}
                  helperText="Fires after X consecutive out-of-range readings, then waits until the value is back in range."
                />
              )}
            </>
          )}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select value={alertType} label="Type" onChange={(e) => handleFormChange('type', e.target.value)}>
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
                value="Last Update"
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Threshold Time (minutes)"
                fullWidth
                sx={{ mb: 2 }}
                value={form.threshold_time}
                onChange={(e) => handleFormChange('threshold_time', e.target.value)}
              />
            </>
          )}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl>
              <Checkbox checked={form.popup} onChange={(e) => handleFormChange('popup', e.target.checked)} />
              Popup
            </FormControl>
            <FormControl>
              <Checkbox checked={form.http} onChange={(e) => handleFormChange('http', e.target.checked)} />
              HTTP
            </FormControl>
            <FormControl>
              <Checkbox checked={form.email} onChange={(e) => handleFormChange('email', e.target.checked)} />
              Email
            </FormControl>
            <FormControl>
              <Checkbox checked={form.mqtt} onChange={(e) => handleFormChange('mqtt', e.target.checked)} />
              MQTT
            </FormControl>
            <FormControl>
              <Checkbox checked={form.whatsapp} onChange={(e) => handleFormChange('whatsapp', e.target.checked)} />
              WhatsApp
            </FormControl>
          </Box>

          {(form.http || form.email) && (
            <Box sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Email &amp; HTTP setup
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                Configure SMTP, recipients, and HTTP endpoints in Alert Settings, then assign them to this alert after
                saving.
              </Typography>
              <Button variant="outlined" size="small" onClick={() => window.open('/alert-settings', '_blank')}>
                Open Alert Settings
              </Button>
            </Box>
          )}
          {form.whatsapp && (
            <Box sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                WhatsApp setup
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                Admin configures the Wablas provider under Alert Settings → WhatsApp. Each user adds their own phone
                numbers for Device → Alert there.
              </Typography>
              <Button variant="outlined" size="small" onClick={() => window.open('/alert-settings', '_blank')}>
                Open WhatsApp Settings
              </Button>
            </Box>
          )}
          {form.mqtt && (
            <Box sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                MQTT setup
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                Configure the device publish topic (project / group / terminal) in MQTT Publisher. On trigger, the
                server publishes to alert/{'{project}'}/{'{group}'}/{'{terminal}'} with a JSON payload for the device
                that triggered the alert.
              </Typography>
              <Button variant="outlined" size="small" onClick={() => window.open('/mqtt-publisher', '_blank')}>
                Open MQTT Publisher
              </Button>
            </Box>
          )}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Notification Template
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              {(variableHints[alertType] || []).map((v) => (
                <Button
                  key={v.value}
                  size="small"
                  variant="outlined"
                  onClick={() => handleFormChange('template', form.template + v.value)}
                >
                  {v.label}
                </Button>
              ))}
            </Box>
            <TextField
              label="Template"
              fullWidth
              multiline
              minRows={3}
              value={form.template}
              onChange={(e) => handleFormChange('template', e.target.value)}
              placeholder={
                alertType === 'threshold'
                  ? 'e.g. {device} {parameter} value {value} exceeded max {max}'
                  : 'e.g. {device} last update at {lastUpdate} exceeded threshold {thresholdTime}'
              }
            />
            <Typography variant="caption" color="text.secondary">
              {'{parameter}'} inserts the display name. Use {'{parameter_key}'} for the raw field name.
              {'{lastUpdate}'} is shown in your account timezone (Settings). Template is used
              for email, HTTP, MQTT, and WhatsApp notifications.
            </Typography>
            <Box sx={{ mt: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="subtitle2">Preview:</Typography>
              <Typography variant="body2">
                {form.template
                  .replaceAll('{device}', previewDeviceName)
                  .replaceAll('{parameter}', previewParameter)
                  .replaceAll('{parameter_key}', form.parameter || '')
                  .replaceAll('{value}', form.value || '')
                  .replaceAll('{min}', form.min)
                  .replaceAll('{max}', form.max)
                  .replaceAll('{lastUpdate}', '[last update]')
                  .replaceAll('{thresholdTime}', form.threshold_time)}
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSaveAlert} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
