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
  FormControlLabel,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  Switch,
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

const DEFAULT_INGEST = {
  device_id_source: 'topic',
  device_id_json_field: '',
  flatten_paths: [],
  flatten_nested: false,
  flatten_depth: 'shallow',
  validation_mode: 'off',
};

const DEVICE_ID_SOURCE_LABELS = {
  topic: 'Topic only (default)',
  json: 'JSON field only',
  topic_then_json: 'Topic, then JSON field',
  json_then_topic: 'JSON field, then topic',
  both_must_match: 'Topic and JSON must match',
};

function buildPublishTopicPreview(cfg) {
  if (!cfg?.project_code || !cfg?.group_identifier || !cfg?.terminal_code) return '';
  return `data/${cfg.project_code}/${cfg.group_identifier}/${cfg.terminal_code}`;
}

export default function MqttConfiguration() {
  const theme = useTheme();
  const { hasMenuPermission, userPermissions } = usePermissions();
  const canUpdate = hasMenuPermission('/mqtt-config', 'update');
  const role = userPermissions?.role || userPermissions?.roles?.[0]?.role_name;
  const canManageGlobal = canUpdate && ['super_admin', 'admin'].includes(role);

  const [status, setStatus] = useState({
    connected: false,
    brokerUrl: '',
    subscribedTopics: 0,
    globalSubscribePatterns: [],
  });
  const [globalDraft, setGlobalDraft] = useState({ custom_patterns: [], use_builtin_defaults: true });
  const [effectivePatterns, setEffectivePatterns] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [detail, setDetail] = useState(null);
  const [topics, setTopics] = useState(['']);
  const [publishDraft, setPublishDraft] = useState({ project_code: '', group_identifier: '', terminal_code: '' });
  const [ingestDraft, setIngestDraft] = useState({ ...DEFAULT_INGEST });
  const [busy, setBusy] = useState(false);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copyHint, setCopyHint] = useState('');

  const token = useMemo(() => localStorage.getItem('iot_token'), []);
  const ingestOptions = detail?.ingestOptions || status.ingestOptions || {};

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
      if (res.ok) {
        setStatus(data);
        if (data.globalSettings?.effective_patterns) {
          setEffectivePatterns(data.globalSettings.effective_patterns);
        } else if (data.globalSubscribePatterns) {
          setEffectivePatterns(data.globalSubscribePatterns);
        }
      }
    } catch {
      /* ignore */
    }
  }, [token]);

  const loadGlobal = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-config/global`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setGlobalDraft({
          custom_patterns: Array.isArray(data.custom_patterns) && data.custom_patterns.length
            ? [...data.custom_patterns]
            : [''],
          use_builtin_defaults: data.use_builtin_defaults !== false,
        });
        setEffectivePatterns(data.effective_patterns || []);
      }
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
      setDeviceId((prev) => prev || (list[0]?.device_id ?? ''));
    } catch {
      setDevices([]);
    }
  }, [token]);

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
      const ing = data.mqtt_ingest || DEFAULT_INGEST;
      setIngestDraft({
        device_id_source: ing.device_id_source || 'topic',
        device_id_json_field: ing.device_id_json_field || '',
        flatten_paths: Array.isArray(ing.flatten_paths) && ing.flatten_paths.length
          ? ing.flatten_paths.map((r) => ({ ...r }))
          : [],
        flatten_nested: Boolean(ing.flatten_nested),
        flatten_depth: ing.flatten_depth === 'deep' ? 'deep' : 'shallow',
        validation_mode: ing.validation_mode || 'off',
      });
    } catch (e) {
      setDetail(null);
      setError(e?.message || 'Failed to load device MQTT config');
    }
  }, [token]);

  useEffect(() => {
    loadStatus();
    loadGlobal();
    loadDevices();
  }, [loadStatus, loadGlobal, loadDevices]);

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

  const handleGlobalPatternChange = (index, value) => {
    setGlobalDraft((prev) => ({
      ...prev,
      custom_patterns: prev.custom_patterns.map((t, i) => (i === index ? value : t)),
    }));
  };

  const addGlobalPattern = () => {
    setGlobalDraft((prev) => ({
      ...prev,
      custom_patterns: [...prev.custom_patterns, ''],
    }));
  };

  const removeGlobalPattern = (index) => {
    setGlobalDraft((prev) => ({
      ...prev,
      custom_patterns: prev.custom_patterns.length <= 1
        ? ['']
        : prev.custom_patterns.filter((_, i) => i !== index),
    }));
  };

  const addFlattenPath = () => {
    setIngestDraft((prev) => ({
      ...prev,
      flatten_paths: [...prev.flatten_paths, { from: '', to: '' }],
    }));
  };

  const updateFlattenPath = (index, key, value) => {
    setIngestDraft((prev) => ({
      ...prev,
      flatten_paths: prev.flatten_paths.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      ),
    }));
  };

  const removeFlattenPath = (index) => {
    setIngestDraft((prev) => ({
      ...prev,
      flatten_paths: prev.flatten_paths.filter((_, i) => i !== index),
    }));
  };

  const handleSaveGlobal = async () => {
    if (!canManageGlobal) return;
    const cleaned = globalDraft.custom_patterns.map((t) => t.trim()).filter(Boolean);
    setGlobalBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/mqtt-config/global`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          custom_patterns: cleaned,
          use_builtin_defaults: globalDraft.use_builtin_defaults,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      setSuccess('Global MQTT patterns saved. Broker subscriptions updated.');
      setEffectivePatterns(data.effective_patterns || []);
      await loadStatus();
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setGlobalBusy(false);
    }
  };

  const handleSave = async () => {
    if (!canUpdate || !deviceId) return;
    const cleaned = topics.map((t) => t.trim()).filter(Boolean);
    if (!cleaned.length) {
      setError('Add at least one subscribe topic');
      return;
    }
    if (
      ['json', 'json_then_topic', 'both_must_match'].includes(ingestDraft.device_id_source) &&
      !ingestDraft.device_id_json_field.trim()
    ) {
      setError('Set a JSON device ID field when using JSON-based device ID resolution');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const body = {
        subscribe_topics: cleaned,
        mqtt_ingest: {
          device_id_source: ingestDraft.device_id_source,
          device_id_json_field: ingestDraft.device_id_json_field.trim(),
          flatten_paths: ingestDraft.flatten_paths
            .map((r) => ({ from: r.from.trim(), to: r.to.trim() }))
            .filter((r) => r.from && r.to),
          flatten_nested: ingestDraft.flatten_nested,
          flatten_depth: ingestDraft.flatten_depth,
          validation_mode: ingestDraft.validation_mode,
        },
      };
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

      setSuccess('Device MQTT configuration saved.');
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
        subtitle="Subscribe topics, global wildcards, device ID rules, flattening, and payload validation"
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

      <Stack spacing={2}>
        <Card sx={cardSx}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Global wildcard subscribe patterns
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Used for auto-discovery on unknown topics. Built-in defaults stay enabled unless you turn them off.
              Changes apply to new messages only; existing database data is not modified.
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={globalDraft.use_builtin_defaults}
                  onChange={(e) =>
                    setGlobalDraft((p) => ({ ...p, use_builtin_defaults: e.target.checked }))
                  }
                  disabled={!canManageGlobal}
                />
              }
              label="Include built-in default patterns"
              sx={{ mb: 2, display: 'block' }}
            />

            <Typography variant="subtitle2" gutterBottom>
              Custom patterns (MQTT + and # wildcards)
            </Typography>
            <Stack spacing={1} sx={{ mb: 2 }}>
              {globalDraft.custom_patterns.map((pattern, index) => (
                <Stack key={`global-${index}`} direction="row" spacing={1} alignItems="center">
                  <TextField
                    fullWidth
                    size="small"
                    label={`Pattern ${index + 1}`}
                    value={pattern}
                    onChange={(e) => handleGlobalPatternChange(index, e.target.value)}
                    disabled={!canManageGlobal}
                    placeholder="data/+/+/+"
                  />
                  <IconButton
                    onClick={() => removeGlobalPattern(index)}
                    disabled={!canManageGlobal}
                    aria-label="Remove pattern"
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
            {canManageGlobal ? (
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Button startIcon={<AddIcon />} onClick={addGlobalPattern}>
                  Add pattern
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveGlobal}
                  disabled={globalBusy}
                >
                  {globalBusy ? 'Saving…' : 'Save global patterns'}
                </Button>
              </Stack>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>
                Only administrators can edit global patterns. You can still view effective patterns below.
              </Alert>
            )}

            <Typography variant="subtitle2" gutterBottom>
              Effective patterns on broker
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {(effectivePatterns.length ? effectivePatterns : status.globalSubscribePatterns || []).map((p) => (
                <Chip key={p} label={p} size="small" variant="outlined" sx={{ mb: 0.5 }} />
              ))}
            </Stack>
          </CardContent>
        </Card>

        {!devices.length ? (
          <Alert severity="info">
            No MQTT devices found. Create a device with protocol <strong>mqtt</strong> in{' '}
            <Link component={RouterLink} to="/devices">Devices</Link> to configure per-device rules.
          </Alert>
        ) : (
          <>
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
                        {d.has_ingest_rules ? ' · custom ingest' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Typography variant="h6" gutterBottom>
                  Subscribe topics
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
                      />
                      <IconButton
                        onClick={() => removeTopic(index)}
                        disabled={!canUpdate || topics.length <= 1}
                        aria-label="Remove topic"
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
                  <Button onClick={() => addTopic(detail?.default_subscribe_topic)} disabled={!canUpdate}>
                    Add default topic
                  </Button>
                  <Button onClick={() => addTopic(publishPreview)} disabled={!canUpdate || !publishPreview}>
                    Add sparing topic
                  </Button>
                </Stack>

                <Divider sx={{ my: 2 }} />

                <Typography variant="h6" gutterBottom>
                  Advanced ingest (Phase 3)
                </Typography>
                <Stack spacing={2} sx={{ mb: 2 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Device ID source</InputLabel>
                    <Select
                      label="Device ID source"
                      value={ingestDraft.device_id_source}
                      onChange={(e) =>
                        setIngestDraft((p) => ({ ...p, device_id_source: e.target.value }))
                      }
                      disabled={!canUpdate}
                    >
                      {(ingestOptions.device_id_sources || Object.keys(DEVICE_ID_SOURCE_LABELS)).map((k) => (
                        <MenuItem key={k} value={k}>
                          {DEVICE_ID_SOURCE_LABELS[k] || k}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    label="JSON device ID field"
                    helperText="e.g. terminalId, IMEI, device_id — used when JSON-based resolution is enabled"
                    value={ingestDraft.device_id_json_field}
                    onChange={(e) =>
                      setIngestDraft((p) => ({ ...p, device_id_json_field: e.target.value }))
                    }
                    disabled={!canUpdate}
                    fullWidth
                  />
                  <FormControl fullWidth size="small">
                    <InputLabel>Validation mode</InputLabel>
                    <Select
                      label="Validation mode"
                      value={ingestDraft.validation_mode}
                      onChange={(e) =>
                        setIngestDraft((p) => ({ ...p, validation_mode: e.target.value }))
                      }
                      disabled={!canUpdate}
                    >
                      <MenuItem value="off">Off (default — same as before)</MenuItem>
                      <MenuItem value="warn">Warn only (log, still ingest)</MenuItem>
                      <MenuItem value="reject">Reject invalid payloads</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={ingestDraft.flatten_nested}
                        onChange={(e) =>
                          setIngestDraft((p) => ({ ...p, flatten_nested: e.target.checked }))
                        }
                        disabled={!canUpdate}
                      />
                    }
                    label="Auto-flatten one level of nested JSON (when no manual paths below)"
                  />
                  <FormControl fullWidth size="small">
                    <InputLabel>Flatten depth</InputLabel>
                    <Select
                      label="Flatten depth"
                      value={ingestDraft.flatten_depth}
                      onChange={(e) =>
                        setIngestDraft((p) => ({ ...p, flatten_depth: e.target.value }))
                      }
                      disabled={!canUpdate || !ingestDraft.flatten_nested}
                    >
                      <MenuItem value="shallow">Shallow (one level)</MenuItem>
                      <MenuItem value="deep">Deep (dot keys)</MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="subtitle2">Manual flatten paths</Typography>
                  {ingestDraft.flatten_paths.map((row, index) => (
                    <Stack key={`flat-${index}`} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <TextField
                        size="small"
                        label="From (JSON path)"
                        value={row.from}
                        onChange={(e) => updateFlattenPath(index, 'from', e.target.value)}
                        disabled={!canUpdate}
                        fullWidth
                        placeholder="readings.TSS"
                      />
                      <TextField
                        size="small"
                        label="To (flat key)"
                        value={row.to}
                        onChange={(e) => updateFlattenPath(index, 'to', e.target.value)}
                        disabled={!canUpdate}
                        fullWidth
                        placeholder="TSS"
                      />
                      <IconButton
                        onClick={() => removeFlattenPath(index)}
                        disabled={!canUpdate}
                        aria-label="Remove flatten path"
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Stack>
                  ))}
                  <Button startIcon={<AddIcon />} onClick={addFlattenPath} disabled={!canUpdate}>
                    Add flatten path
                  </Button>
                </Stack>

                <Divider sx={{ my: 2 }} />

                <Typography variant="h6" gutterBottom>
                  Sparing publish topic (reference)
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
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Publish / ingest preview: <strong>{publishPreview || '—'}</strong>
                </Typography>

                {canUpdate ? (
                  <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={busy}>
                    {busy ? 'Saving…' : 'Save device configuration'}
                  </Button>
                ) : (
                  <Alert severity="info">Read-only access for this device.</Alert>
                )}
              </CardContent>
            </Card>

            <Card sx={cardSx}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Expected JSON payload
                </Typography>
                {detail?.mapper ? (
                  <Chip
                    label={`Mapper: ${detail.mapper.template_name || detail.mapper.template_id}`}
                    size="small"
                    sx={{ mb: 2 }}
                  />
                ) : (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Assign a Device Mapper template to see expected fields.
                  </Alert>
                )}
                {detail?.payload_fields?.length ? (
                  <Table size="small" sx={{ mb: 2 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>JSON key (source)</TableCell>
                        <TableCell>Mapped to</TableCell>
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
                  <IconButton size="small" onClick={() => copyText(exampleJson, 'Example JSON copied')}>
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
          </>
        )}

        <Accordion sx={cardSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">JSON format help</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" paragraph>
              Flat JSON is recommended. Use <code>datetime</code> or <code>_terminalTime</code> for timestamps.
              Validation uses mapper required fields when mode is Warn or Reject.
            </Typography>
            <Typography variant="body2">
              <Link component={RouterLink} to="/listeners">Listeners</Link>
              {' · '}
              <Link component={RouterLink} to="/mqtt-publisher">MQTT Publisher</Link>
              {' · '}
              <Link component={RouterLink} to="/mapper">Device Mapper</Link>
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Stack>
    </Box>
  );
}
