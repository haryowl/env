import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageHeader from './PageHeader';
import { API_BASE_URL } from '../config/api';
import { usePermissions } from '../hooks/usePermissions.jsx';
import { getDeviceDisplayName } from '../utils/deviceLabel';

/** Must match server/services/klhkReporting/klhkConstants.js */
const DEFAULT_SPARING_API_BASE = 'https://sparing.kemenlh.go.id/api';
const DEFAULT_TMAT_API_URL =
  'https://gambutindonesia.kemenlh.go.id/backoffice-SPAgambut/api/v1/realtime_push';

const authHeaders = () => {
  const token = localStorage.getItem('iot_token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

const TMAT_LABELS = {
  tmat_value: 'Tinggi Muka Air Tanah',
  hujan_value: 'Curah hujan',
  kelembapan_tanah: 'Kelembapan tanah',
  suhu_value: 'Suhu',
  ph_value: 'pH air',
  baterai_value: 'Level baterai',
  tss_value: 'TSS',
};

export default function KlhkReporting() {
  const { canAccessMenu, userPermissions } = usePermissions();
  const isAdmin = ['super_admin', 'admin'].includes(userPermissions?.role);

  const [tab, setTab] = useState(0);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [meta, setMeta] = useState({ sparing_params: [], tmat_params: [] });
  const [config, setConfig] = useState(null);
  const [sparingMappings, setSparingMappings] = useState([]);
  const [tmatMappings, setTmatMappings] = useState([]);
  const [logs, setLogs] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [backfillHour, setBackfillHour] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [periodMode, setPeriodMode] = useState('hourly');
  const [skipAlreadySent, setSkipAlreadySent] = useState(true);
  const [periodPreview, setPeriodPreview] = useState(null);
  const [periodSummary, setPeriodSummary] = useState(null);
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);

  const canUpdate = canAccessMenu('/klhk-reporting') && isAdmin;

  const loadDevices = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/klhk-reporting/devices`, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load devices');
    setDevices(data.devices || []);
  }, []);

  const loadMeta = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/klhk-reporting/meta`, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMeta(data);
  }, []);

  const loadDeviceDetail = useCallback(async (id) => {
    if (!id) return;
    const res = await fetch(`${API_BASE_URL}/klhk-reporting/devices/${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load device KLHK config');
    setConfig(data.config);
    setSparingMappings(data.sparing_mappings || []);
    setTmatMappings(data.tmat_mappings || []);
    setApiKeyDraft('');
  }, []);

  const loadLogs = useCallback(async (id) => {
    const res = await fetch(`${API_BASE_URL}/klhk-reporting/devices/${encodeURIComponent(id)}/logs`, {
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setLogs(data.logs || []);
  }, []);

  const loadQueue = useCallback(async (id) => {
    const res = await fetch(`${API_BASE_URL}/klhk-reporting/devices/${encodeURIComponent(id)}/queue`, {
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setQueue(data.queue || []);
  }, []);

  useEffect(() => {
    if (!canAccessMenu('/klhk-reporting')) return;
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadDevices(), loadMeta()]);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [canAccessMenu, loadDevices, loadMeta]);

  useEffect(() => {
    if (!deviceId) return;
    (async () => {
      try {
        setError('');
        setLoading(true);
        await loadDeviceDetail(deviceId);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [deviceId, loadDeviceDetail]);

  useEffect(() => {
    if (!deviceId || tab !== 2) return;
    loadLogs(deviceId).catch(() => {});
  }, [deviceId, tab, loadLogs]);

  useEffect(() => {
    if (!deviceId || tab !== 3) return;
    loadQueue(deviceId).catch(() => {});
  }, [deviceId, tab, loadQueue]);

  const reportingType = config?.reporting_type || 'off';
  const isRunning = Boolean(config?.backup_running);
  const selectedDeviceMeta = devices.find((d) => d.device_id === deviceId);
  /** Last saved reporting type from device list (not unsaved form edits). */
  const savedReportingType = selectedDeviceMeta?.reporting_type || 'off';
  const configDirtyUnsaved =
    Boolean(config) && reportingType !== 'off' && savedReportingType !== reportingType;

  const saveConfig = async () => {
    if (!deviceId || !config) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const body = {
        reporting_type: config.reporting_type,
        retry_max_attempts: config.retry_max_attempts,
        retry_interval_minutes: config.retry_interval_minutes,
        logger_id: config.logger_id,
        send_mode: config.send_mode,
        retry_all_failed_on_reconnect: config.retry_all_failed_on_reconnect,
        device_id_unik: config.device_id_unik,
        api_url: config.api_url,
        push_interval_seconds: config.push_interval_seconds,
        api_base: config.api_base,
      };
      if (apiKeyDraft.trim()) body.api_key = apiKeyDraft.trim();

      const res = await fetch(`${API_BASE_URL}/klhk-reporting/devices/${encodeURIComponent(deviceId)}/config`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setConfig(data.config);
      setApiKeyDraft('');
      setSuccess('Configuration saved');
      await loadDevices();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const postAction = async (path, okMessage, body) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/klhk-reporting/devices/${encodeURIComponent(deviceId)}/${path}`, {
        method: 'POST',
        headers: authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      if (data.config) setConfig(data.config);
      setSuccess(okMessage);
      await loadDevices();
      if (tab === 2) await loadLogs(deviceId);
      if (tab === 3) await loadQueue(deviceId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveMappings = async () => {
    if (!deviceId) return;
    setBusy(true);
    setError('');
    try {
      const path =
        reportingType === 'sparing'
          ? 'mappings/sparing'
          : reportingType === 'tmat'
            ? 'mappings/tmat'
            : null;
      if (!path) throw new Error('Set reporting type first');
      const mappings =
        reportingType === 'sparing'
          ? sparingMappings.filter((m) => m.sensor_field?.trim())
          : tmatMappings.filter((m) => m.sensor_field?.trim());
      const res = await fetch(
        `${API_BASE_URL}/klhk-reporting/devices/${encodeURIComponent(deviceId)}/${path}`,
        { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ mappings }) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save mappings');
      if (reportingType === 'sparing') setSparingMappings(data.mappings || []);
      else setTmatMappings(data.mappings || []);
      setSuccess('Mappings saved');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const initSparingMappings = () => {
    const params = meta.sparing_params || [];
    setSparingMappings(
      params.map((p) => {
        const existing = sparingMappings.find((m) => m.sparing_param === p);
        return existing || { sparing_param: p, sensor_field: p, enabled: true };
      })
    );
  };

  const initTmatMappings = () => {
    const params = meta.tmat_params || [];
    setTmatMappings(
      params.map((p) => {
        const existing = tmatMappings.find((m) => m.tmat_param === p);
        return existing || { tmat_param: p, sensor_field: p, enabled: false };
      })
    );
  };

  const parseDatetimeLocal = (value) => {
    if (!value?.trim()) return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  };

  const buildPeriodPayload = () => {
    const period_from = parseDatetimeLocal(periodFrom);
    const period_to = parseDatetimeLocal(periodTo);
    if (period_from == null || period_to == null) {
      throw new Error('Select valid From and To dates');
    }
    return {
      period_from,
      period_to,
      mode: periodMode,
      skip_already_sent: skipAlreadySent,
    };
  };

  const previewPeriod = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    setPeriodPreview(null);
    setPeriodSummary(null);
    try {
      const body = buildPeriodPayload();
      const res = await fetch(
        `${API_BASE_URL}/klhk-reporting/devices/${encodeURIComponent(deviceId)}/sparing/period/preview`,
        { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPeriodPreview(data.preview);
      setSuccess('Period preview ready');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sendPeriodAction = async (action) => {
    setBusy(true);
    setError('');
    setSuccess('');
    setPeriodSummary(null);
    try {
      const body = { ...buildPeriodPayload(), action };
      const res = await fetch(
        `${API_BASE_URL}/klhk-reporting/devices/${encodeURIComponent(deviceId)}/sparing/period/send`,
        { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Period send failed');
      setPeriodSummary(data.summary);
      setSuccess(action === 'queue' ? 'Period added to queue' : 'Period send completed');
      if (tab === 2) await loadLogs(deviceId);
      if (tab === 3) await loadQueue(deviceId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const processQueuePeriod = async () => {
    try {
      const { period_from, period_to } = buildPeriodPayload();
      await postAction('process-queue', 'Queue processed for period', {
        period_from,
        period_to,
        limit: 200,
      });
    } catch (e) {
      setError(e.message);
    }
  };

  const backfillFromInput = () => {
    if (!backfillHour.trim()) {
      setError('Enter backfill hour as ISO datetime or unix ms');
      return;
    }
    let ms = Number(backfillHour);
    if (!Number.isFinite(ms)) {
      ms = new Date(backfillHour).getTime();
    }
    if (!Number.isFinite(ms)) {
      setError('Invalid backfill hour');
      return;
    }
    const HOUR_MS = 60 * 60 * 1000;
    const hourStart = Math.floor(ms / HOUR_MS) * HOUR_MS;
    postAction('backfill', 'Backfill send completed', { hour_start: hourStart });
  };

  const formatSlotTime = (ms) => {
    if (!Number.isFinite(ms)) return '—';
    return new Date(ms).toLocaleString();
  };

  if (!canAccessMenu('/klhk-reporting')) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">You do not have access to KLHK Reporting.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title="KLHK Reporting"
        subtitle="Backup SPARING/TMAT reporting from cloud data when on-site LT-IDP is unavailable"
      />

      <Alert severity="warning" sx={{ mb: 2 }}>
        Manual Start/Stop controls scheduled backup sends from ENV. If on-site LT-IDP is also sending,
        KLHK may receive duplicate data. Stop ENV when LT-IDP is healthy again.
      </Alert>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      ) : null}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} flexWrap="wrap">
            <FormControl sx={{ minWidth: 280 }} size="small">
              <InputLabel>Device</InputLabel>
              <Select label="Device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                {devices.map((d) => (
                  <MenuItem key={d.device_id} value={d.device_id}>
                    {getDeviceDisplayName(d)} ({d.reporting_type || 'off'})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {config ? (
              <>
                <Chip label={isRunning ? 'Running' : 'Idle'} color={isRunning ? 'success' : 'default'} />
                <Chip
                  label={(savedReportingType || 'off').toUpperCase()}
                  variant="outlined"
                  color={savedReportingType === 'off' ? 'default' : 'primary'}
                />
                {configDirtyUnsaved ? (
                  <Chip label={`Unsaved: ${reportingType.toUpperCase()}`} color="warning" size="small" />
                ) : null}
                {canUpdate && savedReportingType !== 'off' ? (
                  <>
                    {isRunning ? (
                      <Button
                        color="error"
                        variant="contained"
                        startIcon={<StopIcon />}
                        disabled={busy}
                        onClick={() => postAction('stop', 'Backup reporting stopped')}
                      >
                        Stop backup reporting
                      </Button>
                    ) : (
                      <Button
                        color="success"
                        variant="contained"
                        startIcon={<PlayArrowIcon />}
                        disabled={busy || configDirtyUnsaved}
                        onClick={() => setConfirmStartOpen(true)}
                      >
                        Start backup reporting
                      </Button>
                    )}
                    <Button
                      variant="outlined"
                      startIcon={<SendIcon />}
                      disabled={busy || configDirtyUnsaved}
                      onClick={() =>
                        postAction(
                          'send-now',
                          'Send completed',
                          savedReportingType === 'tmat' ? {} : { mode: 'hourly' }
                        )
                      }
                    >
                      Send now
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={busy || configDirtyUnsaved}
                      onClick={() => postAction('process-queue', 'Queue processed')}
                    >
                      Process queue
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      {!deviceId ? (
        <Alert severity="info">Select a device to configure KLHK backup reporting.</Alert>
      ) : loading && !config ? (
        <Typography color="text.secondary">Loading…</Typography>
      ) : !config ? null : (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="Configuration" />
            <Tab label="Mappings" />
            <Tab label="Send logs" />
            <Tab label="Queue" />
          </Tabs>

          {tab === 0 ? (
            <Card>
              <CardContent>
                <Stack spacing={2} maxWidth={720}>
                  <FormControl size="small">
                    <InputLabel>Reporting type</InputLabel>
                    <Select
                      label="Reporting type"
                      value={config.reporting_type || 'off'}
                      disabled={!canUpdate}
                      onChange={(e) => setConfig({ ...config, reporting_type: e.target.value })}
                    >
                      <MenuItem value="off">Off</MenuItem>
                      <MenuItem value="sparing">SPARING</MenuItem>
                      <MenuItem value="tmat">TMAT</MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    label="Retry max attempts"
                    size="small"
                    type="number"
                    value={config.retry_max_attempts ?? ''}
                    disabled={!canUpdate}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        retry_max_attempts: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                  <TextField
                    label="Retry interval (minutes)"
                    size="small"
                    type="number"
                    value={config.retry_interval_minutes ?? ''}
                    disabled={!canUpdate}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        retry_interval_minutes: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />

                  {reportingType === 'sparing' ? (
                    <>
                      {configDirtyUnsaved ? (
                        <Alert severity="warning">
                          Reporting type is changed but not saved. Click <strong>Save configuration</strong> before
                          Fetch secret / Start / Send.
                        </Alert>
                      ) : null}
                      <TextField
                        label="Logger ID (KLHK)"
                        size="small"
                        value={config.logger_id || ''}
                        disabled={!canUpdate}
                        onChange={(e) => setConfig({ ...config, logger_id: e.target.value })}
                      />
                      <TextField
                        label="SPARING API base URL"
                        size="small"
                        value={config.api_base || ''}
                        disabled={!canUpdate}
                        onChange={(e) => setConfig({ ...config, api_base: e.target.value })}
                        placeholder={DEFAULT_SPARING_API_BASE}
                        helperText={`Leave blank to use default: ${DEFAULT_SPARING_API_BASE} (secret: …/secret-sensor, hourly: …/send-hourly, 2min: …/send)`}
                      />
                      <FormControl size="small">
                        <InputLabel>Send mode</InputLabel>
                        <Select
                          label="Send mode"
                          value={config.send_mode || 'hourly'}
                          disabled={!canUpdate}
                          onChange={(e) => setConfig({ ...config, send_mode: e.target.value })}
                        >
                          <MenuItem value="hourly">Hourly</MenuItem>
                          <MenuItem value="2min">2-minute</MenuItem>
                          <MenuItem value="both">Both</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={Boolean(config.retry_all_failed_on_reconnect)}
                            disabled={!canUpdate}
                            onChange={(e) =>
                              setConfig({ ...config, retry_all_failed_on_reconnect: e.target.checked })
                            }
                          />
                        }
                        label="Retry all failed on reconnect"
                      />
                      <Typography variant="body2" color="text.secondary">
                        API secret: {config.api_secret_set ? config.api_secret_masked : 'not set'}
                      </Typography>
                      {canUpdate ? (
                        <Button
                          variant="outlined"
                          disabled={busy || savedReportingType !== 'sparing'}
                          onClick={() => postAction('fetch-secret', 'API secret fetched')}
                        >
                          Fetch SPARING secret
                        </Button>
                      ) : null}

                      <Typography variant="subtitle2" sx={{ pt: 1 }}>
                        Send period (on-demand)
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Preview or send SPARING data for a date range. Works while backup is Idle (Option B).
                        Max 168 hourly slots or ~24h of 2-minute slots per request.
                      </Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <TextField
                          label="From"
                          type="datetime-local"
                          size="small"
                          value={periodFrom}
                          disabled={!canUpdate}
                          onChange={(e) => {
                            setPeriodFrom(e.target.value);
                            setPeriodPreview(null);
                            setPeriodSummary(null);
                          }}
                          InputLabelProps={{ shrink: true }}
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          label="To"
                          type="datetime-local"
                          size="small"
                          value={periodTo}
                          disabled={!canUpdate}
                          onChange={(e) => {
                            setPeriodTo(e.target.value);
                            setPeriodPreview(null);
                            setPeriodSummary(null);
                          }}
                          InputLabelProps={{ shrink: true }}
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                      <FormControl size="small" sx={{ maxWidth: 240 }}>
                        <InputLabel>Period mode</InputLabel>
                        <Select
                          label="Period mode"
                          value={periodMode}
                          disabled={!canUpdate}
                          onChange={(e) => {
                            setPeriodMode(e.target.value);
                            setPeriodPreview(null);
                            setPeriodSummary(null);
                          }}
                        >
                          <MenuItem value="hourly">Hourly</MenuItem>
                          <MenuItem value="2min">2-minute</MenuItem>
                          <MenuItem value="both">Both</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={skipAlreadySent}
                            disabled={!canUpdate}
                            onChange={(e) => {
                              setSkipAlreadySent(e.target.checked);
                              setPeriodPreview(null);
                              setPeriodSummary(null);
                            }}
                          />
                        }
                        label="Skip already sent slots"
                      />
                      {canUpdate ? (
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Button variant="outlined" disabled={busy} onClick={previewPeriod}>
                            Preview
                          </Button>
                          <Button
                            variant="contained"
                            startIcon={<SendIcon />}
                            disabled={busy}
                            onClick={() => sendPeriodAction('send')}
                          >
                            Send period
                          </Button>
                          <Button variant="outlined" disabled={busy} onClick={() => sendPeriodAction('queue')}>
                            Add to queue
                          </Button>
                          <Button variant="outlined" disabled={busy} onClick={processQueuePeriod}>
                            Process queue (period)
                          </Button>
                        </Stack>
                      ) : null}
                      {periodPreview ? (
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip label={`Total slots: ${periodPreview.total_slots}`} size="small" />
                          <Chip label={`To send: ${periodPreview.to_send}`} color="primary" size="small" />
                          <Chip label={`Already sent: ${periodPreview.already_sent}`} size="small" />
                          <Chip label={`No data: ${periodPreview.no_data}`} size="small" />
                        </Stack>
                      ) : null}
                      {periodSummary ? (
                        <Box>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                            <Chip label={`Sent: ${periodSummary.sent}`} color="success" size="small" />
                            <Chip label={`Queued: ${periodSummary.queued}`} size="small" />
                            <Chip label={`Skipped (sent): ${periodSummary.skipped_already_sent}`} size="small" />
                            <Chip label={`Skipped (no data): ${periodSummary.skipped_no_data}`} size="small" />
                            {periodSummary.failed > 0 ? (
                              <Chip label={`Failed: ${periodSummary.failed}`} color="error" size="small" />
                            ) : null}
                          </Stack>
                          {periodSummary.results?.length > 0 && periodSummary.results.length <= 20 ? (
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Type</TableCell>
                                  <TableCell>Time</TableCell>
                                  <TableCell>Status</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {periodSummary.results.map((row, idx) => (
                                  <TableRow key={`${row.send_type}-${row.timestamp}-${idx}`}>
                                    <TableCell>{row.send_type}</TableCell>
                                    <TableCell>{formatSlotTime(row.timestamp)}</TableCell>
                                    <TableCell>
                                      {row.reason ? `${row.status} (${row.reason})` : row.status}
                                      {row.error ? `: ${row.error}` : ''}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : periodSummary.results?.length > 20 ? (
                            <Typography variant="body2" color="text.secondary">
                              {periodSummary.results.length} slot results — see Send logs tab for details.
                            </Typography>
                          ) : null}
                        </Box>
                      ) : null}

                      <Typography variant="subtitle2" sx={{ pt: 1 }}>
                        Quick: single hour backfill
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          label="Backfill hour (ISO or unix ms)"
                          size="small"
                          value={backfillHour}
                          disabled={!canUpdate}
                          onChange={(e) => setBackfillHour(e.target.value)}
                          sx={{ flex: 1 }}
                        />
                        <Button variant="outlined" disabled={!canUpdate || busy} onClick={backfillFromInput}>
                          Backfill hour
                        </Button>
                      </Stack>
                    </>
                  ) : null}

                  {reportingType === 'tmat' ? (
                    <>
                      {configDirtyUnsaved ? (
                        <Alert severity="warning">
                          Reporting type is changed but not saved. Click <strong>Save configuration</strong> before
                          Start / Send.
                        </Alert>
                      ) : null}
                      <TextField
                        label="device_id_unik"
                        size="small"
                        value={config.device_id_unik || ''}
                        disabled={!canUpdate}
                        onChange={(e) => setConfig({ ...config, device_id_unik: e.target.value })}
                      />
                      <TextField
                        label="TMAT API URL"
                        size="small"
                        value={config.api_url || ''}
                        disabled={!canUpdate}
                        onChange={(e) => setConfig({ ...config, api_url: e.target.value })}
                        placeholder={DEFAULT_TMAT_API_URL}
                        helperText={`Leave blank to use default: ${DEFAULT_TMAT_API_URL}`}
                      />
                      <TextField
                        label="Push interval (seconds)"
                        size="small"
                        type="number"
                        value={config.push_interval_seconds ?? 60}
                        disabled={!canUpdate}
                        onChange={(e) =>
                          setConfig({ ...config, push_interval_seconds: Number(e.target.value) })
                        }
                      />
                      <TextField
                        label="API key (X-API-KEY)"
                        size="small"
                        type="password"
                        placeholder={config.api_key_set ? 'Leave blank to keep existing' : 'Enter API key'}
                        value={apiKeyDraft}
                        disabled={!canUpdate}
                        onChange={(e) => setApiKeyDraft(e.target.value)}
                      />
                    </>
                  ) : null}

                  {canUpdate ? (
                    <Button startIcon={<SaveIcon />} variant="contained" onClick={saveConfig} disabled={busy}>
                      Save configuration
                    </Button>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {tab === 1 ? (
            <Card>
              <CardContent>
                {reportingType === 'off' ? (
                  <Alert severity="info">Set reporting type to SPARING or TMAT first.</Alert>
                ) : null}
                {reportingType === 'sparing' ? (
                  <>
                    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                      <Button size="small" onClick={initSparingMappings} disabled={!canUpdate}>
                        Load all SPARING params
                      </Button>
                      {canUpdate ? (
                        <Button size="small" variant="contained" onClick={saveMappings} disabled={busy}>
                          Save mappings
                        </Button>
                      ) : null}
                    </Stack>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>KLHK param</TableCell>
                          <TableCell>Sensor field</TableCell>
                          <TableCell>Enabled</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sparingMappings.map((m, idx) => (
                          <TableRow key={m.sparing_param || idx}>
                            <TableCell>{m.sparing_param}</TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                value={m.sensor_field || ''}
                                disabled={!canUpdate}
                                onChange={(e) => {
                                  const next = [...sparingMappings];
                                  next[idx] = { ...m, sensor_field: e.target.value };
                                  setSparingMappings(next);
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={m.enabled !== false}
                                disabled={!canUpdate}
                                onChange={(e) => {
                                  const next = [...sparingMappings];
                                  next[idx] = { ...m, enabled: e.target.checked };
                                  setSparingMappings(next);
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                ) : null}
                {reportingType === 'tmat' ? (
                  <>
                    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                      <Button size="small" onClick={initTmatMappings} disabled={!canUpdate}>
                        Load all TMAT params
                      </Button>
                      {canUpdate ? (
                        <Button size="small" variant="contained" onClick={saveMappings} disabled={busy}>
                          Save mappings
                        </Button>
                      ) : null}
                    </Stack>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>TMAT param</TableCell>
                          <TableCell>Sensor field</TableCell>
                          <TableCell>Enabled</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tmatMappings.map((m, idx) => (
                          <TableRow key={m.tmat_param || idx}>
                            <TableCell>
                              {m.tmat_param}
                              <Typography variant="caption" display="block" color="text.secondary">
                                {TMAT_LABELS[m.tmat_param] || ''}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                value={m.sensor_field || ''}
                                disabled={!canUpdate}
                                onChange={(e) => {
                                  const next = [...tmatMappings];
                                  next[idx] = { ...m, sensor_field: e.target.value };
                                  setTmatMappings(next);
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={m.enabled !== false}
                                disabled={!canUpdate}
                                onChange={(e) => {
                                  const next = [...tmatMappings];
                                  next[idx] = { ...m, enabled: e.target.checked };
                                  setTmatMappings(next);
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {tab === 2 ? (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">Send logs</Typography>
                  <Button size="small" startIcon={<RefreshIcon />} onClick={() => loadLogs(deviceId)}>
                    Refresh
                  </Button>
                </Stack>
                {logs.length === 0 ? (
                  <Typography color="text.secondary">No send logs yet.</Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Duration</TableCell>
                        <TableCell>Response</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {logs.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                          <TableCell>{row.send_type}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={row.status}
                              color={row.status === 'success' ? 'success' : 'error'}
                            />
                          </TableCell>
                          <TableCell>{row.duration_ms != null ? `${row.duration_ms} ms` : '—'}</TableCell>
                          <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.response || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === 3 ? (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">Queue</Typography>
                  <Button size="small" startIcon={<RefreshIcon />} onClick={() => loadQueue(deviceId)}>
                    Refresh
                  </Button>
                </Stack>
                {queue.length === 0 ? (
                  <Typography color="text.secondary">Queue empty.</Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Created</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Retries</TableCell>
                        <TableCell>Error</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {queue.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                          <TableCell>{row.send_type}</TableCell>
                          <TableCell>{row.status}</TableCell>
                          <TableCell>{row.retry_count ?? 0}</TableCell>
                          <TableCell>{row.error_message || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <Dialog open={confirmStartOpen} onClose={() => setConfirmStartOpen(false)}>
        <DialogTitle>Start backup reporting?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Scheduled KLHK sends will run for this device until you stop them. Confirm on-site LT-IDP is
            not sending to avoid duplicate data at KLHK.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmStartOpen(false)}>Cancel</Button>
          <Button
            color="success"
            variant="contained"
            onClick={() => {
              setConfirmStartOpen(false);
              postAction('start', 'Backup reporting started');
            }}
          >
            Start
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
