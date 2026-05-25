import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Alert,
  Stack,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { DataGrid } from '@mui/x-data-grid';
import { API_BASE_URL } from '../config/api';
import PageHeader from './PageHeader';
import { getChartCardSx } from '../utils/chartStyles';
import { getDeviceDisplayName } from '../utils/deviceLabel';

function buildTopicPreview(cfg) {
  if (!cfg?.project_code || !cfg?.group_identifier || !cfg?.terminal_code) return '-';
  return `data/${cfg.project_code}/${cfg.group_identifier}/${cfg.terminal_code}`;
}

export default function MqttPublisher() {
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [deviceConfig, setDeviceConfig] = useState(null); // { project_code, group_identifier, terminal_code }
  const [configDraft, setConfigDraft] = useState({ project_code: '', group_identifier: '', terminal_code: '' });
  const [mqttStatus, setMqttStatus] = useState({ connected: false, brokerUrl: '', subscribedTopics: 0 });

  const [tagName, setTagName] = useState('');
  const [tagValue, setTagValue] = useState('');
  const [retain, setRetain] = useState(false);
  const [qos, setQos] = useState(1);

  const [presets, setPresets] = useState([]);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetScopedToDevice, setPresetScopedToDevice] = useState(true);

  const [history, setHistory] = useState([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const token = useMemo(() => localStorage.getItem('iot_token'), []);

  const topicPreview = useMemo(() => buildTopicPreview(deviceConfig), [deviceConfig]);
  const configTopicPreview = useMemo(() => buildTopicPreview(configDraft), [configDraft]);

  const loadMqttStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-publisher/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return;
      setMqttStatus({
        connected: Boolean(data?.connected),
        brokerUrl: String(data?.brokerUrl || ''),
        subscribedTopics: Number(data?.subscribedTopics || 0),
      });
    } catch {
      /* ignore */
    }
  }, [token]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/devices/dropdown`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
    } catch (e) {
      setDevices([]);
    }
  }, [token]);

  const loadDeviceConfig = useCallback(async (id) => {
    if (!id) return;
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-publisher/devices/${encodeURIComponent(id)}/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const cfg = data?.mqtt_publish || null;
      setDeviceConfig(cfg);
      setConfigDraft({
        project_code: cfg?.project_code || '',
        group_identifier: cfg?.group_identifier || '',
        terminal_code: cfg?.terminal_code || '',
      });
    } catch (e) {
      setDeviceConfig(null);
    }
  }, [token]);

  const loadPresets = useCallback(async (id) => {
    try {
      const qs = id ? `?deviceId=${encodeURIComponent(id)}` : '';
      const res = await fetch(`${API_BASE_URL}/mqtt-publisher/presets${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setPresets(data?.presets || []);
    } catch {
      setPresets([]);
    }
  }, [token]);

  const loadHistory = useCallback(async (id) => {
    try {
      const qs = id ? `?deviceId=${encodeURIComponent(id)}&limit=200` : '?limit=200';
      const res = await fetch(`${API_BASE_URL}/mqtt-publisher/history${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setHistory(data?.history || []);
    } catch {
      setHistory([]);
    }
  }, [token]);

  useEffect(() => {
    loadDevices();
    loadMqttStatus();
  }, [loadDevices]);

  useEffect(() => {
    // Refresh status periodically while on this page.
    const id = setInterval(() => {
      loadMqttStatus();
    }, 5000);
    return () => clearInterval(id);
  }, [loadMqttStatus]);

  useEffect(() => {
    if (!deviceId) return;
    loadDeviceConfig(deviceId);
    loadPresets(deviceId);
    loadHistory(deviceId);
  }, [deviceId, loadDeviceConfig, loadPresets, loadHistory]);

  const handleSaveConfig = async () => {
    if (!deviceId) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-publisher/devices/${encodeURIComponent(deviceId)}/config`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(configDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save config');
      setDeviceConfig(data?.mqtt_publish || configDraft);
      setSuccess('Device MQTT publish topic saved.');
    } catch (e) {
      setError(e?.message || 'Failed to save config');
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!deviceId) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-publisher/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          tag_name: tagName,
          value: tagValue,
          qos,
          retain,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Publish failed');
      setSuccess(`Published to ${data.topic}`);
      await loadHistory(deviceId);
    } catch (e) {
      setError(e?.message || 'Publish failed');
      await loadHistory(deviceId);
    } finally {
      setBusy(false);
    }
  };

  const openPresetDialog = () => {
    setPresetName('');
    setPresetDialogOpen(true);
  };

  const handleCreatePreset = async () => {
    if (!presetName.trim()) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-publisher/presets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: presetName.trim(),
          device_id: presetScopedToDevice ? deviceId : null,
          tag_name: tagName,
          // Do not persist value; keep it editable per publish.
          tag_value_default: '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create preset');
      setPresetDialogOpen(false);
      setSuccess('Preset saved.');
      await loadPresets(deviceId);
    } catch (e) {
      setError(e?.message || 'Failed to create preset');
    } finally {
      setBusy(false);
    }
  };

  const handleApplyPreset = (p) => {
    setTagName(p?.tag_name || '');
    // Do not overwrite the current value; keep it editable / user-provided per publish.
    setTab(1);
  };

  const handleDeletePreset = async (id) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-publisher/presets/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to delete preset');
      setSuccess('Preset deleted.');
      await loadPresets(deviceId);
    } catch (e) {
      setError(e?.message || 'Failed to delete preset');
    } finally {
      setBusy(false);
    }
  };

  const historyColumns = [
    { field: 'created_at', headerName: 'Time', minWidth: 180, flex: 0.8, valueGetter: (p) => p.value },
    { field: 'device_id', headerName: 'Device', minWidth: 120, flex: 0.5 },
    { field: 'topic', headerName: 'Topic', minWidth: 220, flex: 1.2 },
    { field: 'tag_name', headerName: 'Tag', minWidth: 120, flex: 0.5 },
    { field: 'tag_value', headerName: 'Value', minWidth: 120, flex: 0.6 },
    { field: 'qos', headerName: 'QoS', minWidth: 70, flex: 0.2 },
    { field: 'retain', headerName: 'Retain', minWidth: 80, flex: 0.25 },
    { field: 'status', headerName: 'Status', minWidth: 110, flex: 0.3 },
    { field: 'error', headerName: 'Error', minWidth: 220, flex: 1 },
  ];

  const presetColumns = [
    { field: 'name', headerName: 'Name', minWidth: 180, flex: 0.8 },
    { field: 'device_id', headerName: 'Scope', minWidth: 160, flex: 0.5, valueGetter: (p) => (p.value ? `Device: ${p.value}` : 'Global') },
    { field: 'tag_name', headerName: 'Tag', minWidth: 120, flex: 0.4 },
    {
      field: '_actions',
      headerName: 'Actions',
      minWidth: 220,
      flex: 0.7,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={() => handleApplyPreset(params.row)}>Apply</Button>
          <Button size="small" color="error" variant="outlined" onClick={() => handleDeletePreset(params.row.id)}>Delete</Button>
        </Stack>
      ),
    },
  ];

  const canPublish = Boolean(deviceId) && Boolean(deviceConfig?.project_code) && Boolean(tagName.trim());

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <PageHeader title="MQTT Publisher" subtitle="Publish a single tag/value command to a device topic" />

      <Card sx={{ mb: 2, ...getChartCardSx(theme) }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel>Device</InputLabel>
              <Select value={deviceId} label="Device" onChange={(e) => setDeviceId(e.target.value)}>
                {devices.map((d) => (
                  <MenuItem key={d.device_id} value={d.device_id}>
                    {getDeviceDisplayName(d)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Chip
              label={
                mqttStatus.connected
                  ? `MQTT: Connected (${mqttStatus.subscribedTopics} topics)`
                  : 'MQTT: Disconnected'
              }
              color={mqttStatus.connected ? 'success' : 'error'}
              variant="outlined"
              sx={{ flexShrink: 0 }}
            />
            {mqttStatus.brokerUrl ? (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {mqttStatus.brokerUrl}
              </Typography>
            ) : null}

            <Chip
              label={deviceId ? `Topic: ${topicPreview}` : 'Select a device'}
              color={topicPreview === '-' ? 'default' : 'info'}
              variant="outlined"
              sx={{ flex: 1, justifyContent: 'flex-start' }}
            />
          </Stack>

          {(error || success) && (
            <Box sx={{ mt: 1.5 }}>
              {error && <Alert severity="error">{error}</Alert>}
              {success && <Alert severity="success">{success}</Alert>}
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={{ ...getChartCardSx(theme) }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, pt: 1 }}>
          <Tab label="Device Topic Config" />
          <Tab label="Publish" />
          <Tab label="Presets" />
          <Tab label="History" />
        </Tabs>
        <Divider />
        <CardContent>
          {tab === 0 && (
            <Box sx={{ maxWidth: 740 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
                Configure publish topic parts
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                Devices subscribe to <strong>data/&lt;project&gt;/&lt;group&gt;/&lt;terminal&gt;</strong>. This config is used to publish commands.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
                <TextField
                  label="project_code"
                  size="small"
                  value={configDraft.project_code}
                  onChange={(e) => setConfigDraft((p) => ({ ...p, project_code: e.target.value }))}
                  fullWidth
                />
                <TextField
                  label="group_identifier"
                  size="small"
                  value={configDraft.group_identifier}
                  onChange={(e) => setConfigDraft((p) => ({ ...p, group_identifier: e.target.value }))}
                  fullWidth
                />
                <TextField
                  label="terminal_code"
                  size="small"
                  value={configDraft.terminal_code}
                  onChange={(e) => setConfigDraft((p) => ({ ...p, terminal_code: e.target.value }))}
                  fullWidth
                />
              </Stack>

              <Chip label={`Topic preview: ${configTopicPreview}`} variant="outlined" sx={{ mb: 2 }} />

              <Button variant="contained" onClick={handleSaveConfig} disabled={!deviceId || busy}>
                Save
              </Button>
            </Box>
          )}

          {tab === 1 && (
            <Box sx={{ maxWidth: 740 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
                Publish one tag/value
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                Payload format: <code>{'{ "tag_name": "value" }'}</code>. No device ACK is expected.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
                <TextField
                  label="tag_name"
                  size="small"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  fullWidth
                  placeholder="e.g. minPH"
                />
                <TextField
                  label="value"
                  size="small"
                  value={tagValue}
                  onChange={(e) => setTagValue(e.target.value)}
                  fullWidth
                  placeholder="e.g. 7.2"
                />
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>QoS</InputLabel>
                  <Select value={qos} label="QoS" onChange={(e) => setQos(Number(e.target.value))}>
                    <MenuItem value={0}>0</MenuItem>
                    <MenuItem value={1}>1</MenuItem>
                    <MenuItem value={2}>2</MenuItem>
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={<Switch checked={retain} onChange={(e) => setRetain(e.target.checked)} />}
                  label="Retain"
                />
                <Box sx={{ flex: 1 }} />
                <Button variant="outlined" onClick={openPresetDialog} disabled={!tagName.trim() || busy}>
                  Save as preset
                </Button>
                <Button variant="contained" onClick={handlePublish} disabled={!canPublish || busy}>
                  Publish
                </Button>
              </Stack>

              {!deviceConfig?.project_code && deviceId && (
                <Alert severity="warning">
                  This device has no publish topic config yet. Set it in “Device Topic Config”.
                </Alert>
              )}
            </Box>
          )}

          {tab === 2 && (
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
                Presets
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                Presets are single tag templates. Apply a preset to prefill the tag name; you can type the value before publishing.
              </Typography>
              <Box sx={{ height: 420, width: '100%' }}>
                <DataGrid
                  rows={presets.map((p) => ({ ...p, id: p.id }))}
                  columns={presetColumns}
                  pageSize={10}
                  rowsPerPageOptions={[10, 25, 50]}
                  disableRowSelectionOnClick
                />
              </Box>
            </Box>
          )}

          {tab === 3 && (
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
                History
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                Shows publish attempts (published/failed). Devices do not send ACK, so “published” means broker accepted the message.
              </Typography>
              <Box sx={{ height: 460, width: '100%' }}>
                <DataGrid
                  rows={history.map((h) => ({ ...h, id: h.id }))}
                  columns={historyColumns}
                  pageSize={10}
                  rowsPerPageOptions={[10, 25, 50]}
                  disableRowSelectionOnClick
                />
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      <Dialog open={presetDialogOpen} onClose={() => setPresetDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Save preset</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label="Preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              fullWidth
              size="small"
            />
            <FormControlLabel
              control={<Switch checked={presetScopedToDevice} onChange={(e) => setPresetScopedToDevice(e.target.checked)} />}
              label={presetScopedToDevice ? 'Scope: this device' : 'Scope: global'}
            />
            <Alert severity="info">
              Preset will save tag: <strong>{tagName || '(tag)'}</strong>
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPresetDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreatePreset} disabled={!presetName.trim() || !tagName.trim() || busy}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

