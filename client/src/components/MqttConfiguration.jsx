import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SaveIcon from '@mui/icons-material/Save';
import { useTheme } from '@mui/material/styles';
import { API_BASE_URL } from '../config/api';
import PageHeader from './PageHeader';
import { getChartCardSx } from '../utils/chartStyles';
import { getDeviceDisplayName } from '../utils/deviceLabel';
import { usePermissions } from '../hooks/usePermissions';

function buildPublishTopicPreview(cfg) {
  if (!cfg?.project_code || !cfg?.group_identifier || !cfg?.terminal_code) return '';
  return `data/${cfg.project_code}/${cfg.group_identifier}/${cfg.terminal_code}`;
}

export default function MqttConfiguration() {
  const theme = useTheme();
  const { hasMenuPermission } = usePermissions();
  const canUpdate = hasMenuPermission('/mqtt-config', 'update');

  const [status, setStatus] = useState({ connected: false, brokerUrl: '', subscribedTopics: 0, globalSubscribePatterns: [] });
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [detail, setDetail] = useState(null);
  const [topics, setTopics] = useState(['']);
  const [publishDraft, setPublishDraft] = useState({ project_code: '', group_identifier: '', terminal_code: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copyHint, setCopyHint] = useState('');

  const token = useMemo(() => localStorage.getItem('iot_token'), []);

  const publishPreview = useMemo(() => buildPublishTopicPreview(publishDraft), [publishDraft]);
  const exampleJson = useMemo(() => {
    if (!detail?.example_payload) return '{}';
    return JSON.stringify(detail.example_payload, null, 2);
  }, [detail]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-config/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setStatus(data);
    } catch {
      /* ignore */
    }
  }, [token]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-config/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const list = Array.isArray(data?.devices) ? data.devices : [];
      setDevices(list);
      if (!deviceId && list.length) setDeviceId(list[0].device_id);
    } catch {
      setDevices([]);
    }
  }, [token, deviceId]);

  const loadDeviceDetail = useCallback(async (id) => {
    if (!id) return;
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-config/devices/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setDetail(null);
        setError(data?.error || 'Failed to load device MQTT config');
        return;
      }
      setDetail(data);
      setTopics(Array.isArray(data.subscribe_topics) && data.subscribe_topics.length ? [...data.subscribe_topics] : ['']);
      const pub = data.mqtt_publish || {};
      setPublishDraft({
        project_code: pub.project_code || '',
        group_identifier: pub.group_identifier || '',
        terminal_code: pub.terminal_code || data.device_id || '',
      });
    } catch (e) {
      setDetail(null);
      setError(e?.message || 'Failed to load device MQTT config');
    }
  }, [token]);

  useEffect(() => {
    loadStatus();
    loadDevices();
  }, [loadStatus, loadDevices]);

  useEffect(() => {
    if (deviceId) loadDeviceDetail(deviceId);
  }, [deviceId, loadDeviceDetail]);

  const handleTopicChange = (index, value) => {
    setTopics((prev) => prev.map((t, i) => (i === index ? value : t)));
  };

  const addTopic = (preset) => {
    setTopics((prev) => [...prev, preset || '']);
  };

  const removeTopic = (index) => {
    setTopics((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const applyPresetDefault = () => {
    if (!detail?.default_subscribe_topic) return;
    addTopic(detail.default_subscribe_topic);
  };

  const applyPresetSparing = () => {
    const topic = publishPreview || detail?.suggested_sparing_subscribe_topic;
    if (!topic) return;
    addTopic(topic);
  };

  const handleSave = async () => {
    if (!canUpdate || !deviceId) return;
    const cleaned = topics.map((t) => t.trim()).filter(Boolean);
    if (!cleaned.length) {
      setError('Add at least one subscribe topic');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const body = { subscribe_topics: cleaned };
      const hasPublish =
        publishDraft.project_code.trim() &&
        publishDraft.group_identifier.trim() &&
        publishDraft.terminal_code.trim();
      if (hasPublish) {
        body.mqtt_publish = {
          project_code: publishDraft.project_code.trim(),
          group_identifier: publishDraft.group_identifier.trim(),
          terminal_code: publishDraft.terminal_code.trim(),
        };
      }

      const res = await fetch(`${API_BASE_URL}/mqtt-config/devices/${encodeURIComponent(deviceId)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');

      setSuccess('MQTT configuration saved. Broker subscriptions refreshed.');
      setTopics(cleaned);
      await loadDevices();
      await loadDeviceDetail(deviceId);
      await loadStatus();
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(label);
      setTimeout(() => setCopyHint(''), 2000);
    } catch {
      setCopyHint('Copy failed');
    }
  };

  const cardSx = getChartCardSx(theme);

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <PageHeader
        title="MQTT Configuration"
        subtitle="Configure subscribe topics and review expected JSON payloads for MQTT devices"
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        <Chip
          label={status.connected ? 'Broker connected' : 'Broker disconnected'}
          color={status.connected ? 'success' : 'default'}
          size="small"
        />
        {status.brokerUrl ? (
          <Chip label={`Broker: ${status.brokerUrl}`} size="small" variant="outlined" />
        ) : (
          <Chip label="MQTT_BROKER_URL not set" size="small" color="warning" variant="outlined" />
        )}
        <Chip label={`${status.subscribedTopics || 0} active subscriptions`} size="small" variant="outlined" />
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert> : null}
      {success ? <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert> : null}
      {copyHint ? <Alert severity="info" sx={{ mb: 2 }}>{copyHint}</Alert> : null}

      {!devices.length ? (
        <Alert severity="info">
          No MQTT devices found. Create a device with protocol <strong>mqtt</strong> in{' '}
          <Link component={RouterLink} to="/devices">Devices</Link>.
        </Alert>
      ) : (
        <Stack spacing={2}>
          <Card sx={cardSx}>
            <CardContent>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel id="mqtt-config-device-label">MQTT device</InputLabel>
                <Select
                  labelId="mqtt-config-device-label"
                  label="MQTT device"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                >
                  {devices.map((d) => (
                    <MenuItem key={d.device_id} value={d.device_id}>
                      {getDeviceDisplayName(d)} ({d.device_id})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Typography variant="h6" gutterBottom>
                Subscribe topics
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Messages on these topics are ingested for this device. The server also listens to global wildcard patterns for auto-discovery.
              </Typography>

              <Stack spacing={1} sx={{ mb: 2 }}>
                {topics.map((topic, index) => (
                  <Stack key={`topic-${index}`} direction="row" spacing={1} alignItems="center">
                    <TextField
                      fullWidth
                      size="small"
                      label={`Topic ${index + 1}`}
                      value={topic}
                      onChange={(e) => handleTopicChange(index, e.target.value)}
                      disabled={!canUpdate}
                      placeholder="devices/{deviceId}/data"
                    />
                    <IconButton
                      aria-label="Remove topic"
                      onClick={() => removeTopic(index)}
                      disabled={!canUpdate || topics.length <= 1}
                    >
                      <DeleteOutlineIcon />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
                <Button startIcon={<AddIcon />} onClick={() => addTopic('')} disabled={!canUpdate}>
                  Add topic
                </Button>
                <Button onClick={applyPresetDefault} disabled={!canUpdate || !detail?.default_subscribe_topic}>
                  Add default ({detail?.default_subscribe_topic || 'devices/…/data'})
                </Button>
                <Button onClick={applyPresetSparing} disabled={!canUpdate || !publishPreview}>
                  Add sparing publish topic
                </Button>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" gutterBottom>
                Sparing publish topic (reference)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Optional. Used by MQTT Publisher and matches the common <code>data/project/group/terminal</code> ingest pattern.
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 1 }}>
                <TextField
                  size="small"
                  label="Project code"
                  value={publishDraft.project_code}
                  onChange={(e) => setPublishDraft((p) => ({ ...p, project_code: e.target.value }))}
                  disabled={!canUpdate}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Group identifier"
                  value={publishDraft.group_identifier}
                  onChange={(e) => setPublishDraft((p) => ({ ...p, group_identifier: e.target.value }))}
                  disabled={!canUpdate}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Terminal code"
                  value={publishDraft.terminal_code}
                  onChange={(e) => setPublishDraft((p) => ({ ...p, terminal_code: e.target.value }))}
                  disabled={!canUpdate}
                  fullWidth
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Publish / ingest topic preview:{' '}
                <strong>{publishPreview || '—'}</strong>
              </Typography>

              {canUpdate ? (
                <Button
                  sx={{ mt: 2 }}
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSave}
                  disabled={busy}
                >
                  {busy ? 'Saving…' : 'Save configuration'}
                </Button>
              ) : (
                <Alert severity="info" sx={{ mt: 2 }}>You have read-only access to MQTT configuration.</Alert>
              )}
            </CardContent>
          </Card>

          <Card sx={cardSx}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Expected JSON payload
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Keys should match <strong>source_field</strong> values from the Device Mapper assignment.
                Use <Link component={RouterLink} to="/listeners">Listeners</Link> to inspect live payloads.
              </Typography>

              {detail?.mapper ? (
                <Chip label={`Mapper: ${detail.mapper.template_name || detail.mapper.template_id}`} size="small" sx={{ mb: 2 }} />
              ) : (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  No Device Mapper assignment. Assign a template in{' '}
                  <Link component={RouterLink} to="/mapper">Device Mapper</Link> to see expected fields.
                </Alert>
              )}

              {detail?.payload_fields?.length ? (
                <Table size="small" sx={{ mb: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>JSON key (source)</TableCell>
                      <TableCell>Mapped to (target)</TableCell>
                      <TableCell>Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.payload_fields.map((f) => (
                      <TableRow key={f.source_field}>
                        <TableCell><code>{f.source_field}</code></TableCell>
                        <TableCell>{f.target_field || '—'}</TableCell>
                        <TableCell>{f.data_type || 'string'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}

              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Example payload</Typography>
                <IconButton size="small" aria-label="Copy example JSON" onClick={() => copyText(exampleJson, 'Example JSON copied')}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Stack>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 2,
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                  borderRadius: 1,
                  overflow: 'auto',
                  fontSize: '0.85rem',
                }}
              >
                {exampleJson}
              </Box>
            </CardContent>
          </Card>

          <Accordion sx={cardSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">JSON format &amp; global subscribe patterns</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" paragraph>
                Send a flat JSON object. Include <code>datetime</code> or <code>_terminalTime</code> for device timestamps (optional).
                Numeric top-level fields are stored as readings. For GPS, include <code>latitude</code> and <code>longitude</code>.
              </Typography>
              <Typography variant="subtitle2" gutterBottom>
                Global wildcard patterns (always active)
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                {(status.globalSubscribePatterns || detail?.globalSubscribePatterns || []).map((p) => (
                  <Chip key={p} label={p} size="small" variant="outlined" sx={{ mb: 0.5 }} />
                ))}
              </Stack>
              <Typography variant="body2">
                Related: <Link component={RouterLink} to="/listeners">Listeners</Link>
                {' · '}
                <Link component={RouterLink} to="/mqtt-publisher">MQTT Publisher</Link>
                {' · '}
                <Link component={RouterLink} to="/mapper">Device Mapper</Link>
              </Typography>
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}
    </Box>
  );
}
