import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import PreviewIcon from '@mui/icons-material/Preview';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageHeader from './PageHeader';
import { API_BASE_URL } from '../config/api';
import { usePermissions } from '../hooks/usePermissions';
import { formatInUserTimezone } from '../utils/timezoneUtils';

const authHeaders = () => {
  const token = localStorage.getItem('iot_token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

const emptyPolicies = () => ({
  sensor_readings: { enabled: true, retention_value: 90, retention_unit: 'days' },
  gps_tracks: { enabled: true, retention_value: 180, retention_unit: 'days' },
  alert_logs: { enabled: true, retention_value: 365, retention_unit: 'days' },
  device_events: { enabled: false, retention_value: 90, retention_unit: 'days' },
});

export default function DataCleanup() {
  const { canAccessMenu } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [targets, setTargets] = useState([]);
  const [policies, setPolicies] = useState(emptyPolicies());
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoIntervalHours, setAutoIntervalHours] = useState(24);
  const [lastAutoRun, setLastAutoRun] = useState(null);
  const [stats, setStats] = useState({});
  const [history, setHistory] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastPreview, setLastPreview] = useState(null);

  const deviceOptions = useMemo(
    () => devices.map((d) => ({ id: d.device_id, label: d.name ? `${d.name} (${d.device_id})` : d.device_id })),
    [devices]
  );

  const loadAll = useCallback(async () => {
    if (!canAccessMenu('/data-cleanup')) return;
    setLoading(true);
    setError('');
    try {
      const deviceIds = selectedDevices.length ? selectedDevices.map((d) => d.id).join(',') : '';
      const statsQs = deviceIds ? `?deviceIds=${encodeURIComponent(deviceIds)}` : '';
      const [settingsRes, statsRes, historyRes, devicesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/data-cleanup/settings`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/data-cleanup/stats${statsQs}`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/data-cleanup/history?limit=15`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/devices/dropdown`, { headers: authHeaders() }),
      ]);
      const settingsBody = await settingsRes.json();
      const statsBody = await statsRes.json();
      const historyBody = await historyRes.json();
      const devicesBody = await devicesRes.json();

      if (!settingsRes.ok) throw new Error(settingsBody.error || 'Failed to load settings');
      setTargets(settingsBody.targets || []);
      setPolicies(settingsBody.policies || emptyPolicies());
      setAutoEnabled(Boolean(settingsBody.auto_cleanup_enabled));
      setAutoIntervalHours(settingsBody.auto_cleanup_interval_hours || 24);
      setLastAutoRun(settingsBody.last_auto_run_at || null);

      if (statsRes.ok) setStats(statsBody.stats || {});
      if (historyRes.ok) setHistory(historyBody.history || []);

      const devList = Array.isArray(devicesBody) ? devicesBody : devicesBody.devices || [];
      setDevices(devList);
    } catch (e) {
      setError(e.message || 'Failed to load data cleanup');
    } finally {
      setLoading(false);
    }
  }, [canAccessMenu, selectedDevices]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const updatePolicy = (key, field, value) => {
    setPolicies((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/data-cleanup/settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          policies,
          auto_cleanup_enabled: autoEnabled,
          auto_cleanup_interval_hours: Number(autoIntervalHours),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to save settings');
      setSuccess('Retention settings saved.');
      if (body.settings) {
        setPolicies(body.settings.policies);
        setAutoEnabled(body.settings.auto_cleanup_enabled);
        setAutoIntervalHours(body.settings.auto_cleanup_interval_hours);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    setPreviewing(true);
    setError('');
    setLastPreview(null);
    try {
      const res = await fetch(`${API_BASE_URL}/data-cleanup/preview`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          device_ids: selectedDevices.map((d) => d.id),
          policy_overrides: policies,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Preview failed');
      setLastPreview(body);
      setSuccess('Preview complete — no data was deleted.');
    } catch (e) {
      setError(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  const runCleanup = async () => {
    setConfirmOpen(false);
    setRunning(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/data-cleanup/run`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          device_ids: selectedDevices.map((d) => d.id),
          policy_overrides: policies,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Cleanup failed');
      setLastPreview(body);
      const total = Object.values(body.results || {}).reduce((s, r) => s + (r.deleted || 0), 0);
      setSuccess(`Cleanup finished. ${total.toLocaleString()} row(s) deleted.`);
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  if (!canAccessMenu('/data-cleanup')) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">You do not have permission to manage data cleanup.</Alert>
      </Box>
    );
  }

  if (loading && !targets.length) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={320}>
        <CircularProgress />
      </Box>
    );
  }

  const targetMeta = targets.length
    ? targets
    : Object.keys(policies).map((key) => ({ key, label: key }));

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        icon={<DeleteSweepIcon />}
        title="Data cleanup"
        subtitle="Delete historical sensor, GPS, and alert data older than your retention period"
        right={
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadAll} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Alert severity="warning" sx={{ mb: 2 }}>
        Deletion is permanent. Use <strong>Preview</strong> first to see how many rows would be removed. Keep at least
        one recent day of data unless you are sure.
      </Alert>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Scope (optional)
          </Typography>
          <Autocomplete
            multiple
            options={deviceOptions}
            getOptionLabel={(o) => o.label}
            value={selectedDevices}
            onChange={(_, v) => setSelectedDevices(v)}
            renderInput={(params) => (
              <TextField {...params} label="Limit to devices" placeholder="All devices if empty" />
            )}
          />
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Retention policies
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Data older than the retention period will be deleted. Use days or months per data type.
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Data type</TableCell>
                  <TableCell align="center">Enabled</TableCell>
                  <TableCell>Keep for</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell align="right">Rows (approx.)</TableCell>
                  <TableCell>Oldest record</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {targetMeta.map(({ key, label, description }) => {
                  const p = policies[key] || emptyPolicies()[key];
                  const st = stats[key];
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {label || key}
                        </Typography>
                        {description && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={Boolean(p?.enabled)}
                          onChange={(e) => updatePolicy(key, 'enabled', e.target.checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          size="small"
                          value={p?.retention_value ?? 90}
                          onChange={(e) => updatePolicy(key, 'retention_value', Number(e.target.value))}
                          inputProps={{ min: 1, max: 3650 }}
                          sx={{ width: 88 }}
                        />
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" sx={{ minWidth: 100 }}>
                          <Select
                            value={p?.retention_unit || 'days'}
                            onChange={(e) => updatePolicy(key, 'retention_unit', e.target.value)}
                          >
                            <MenuItem value="days">Days</MenuItem>
                            <MenuItem value="months">Months</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell align="right">
                        {st?.rowCount != null ? Number(st.rowCount).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>
                        {st?.oldest ? formatInUserTimezone(st.oldest) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ my: 2 }} />

          <FormControlLabel
            control={<Switch checked={autoEnabled} onChange={(e) => setAutoEnabled(e.target.checked)} />}
            label="Run cleanup automatically on a schedule"
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, flexWrap: 'wrap' }}>
            <TextField
              label="Interval (hours)"
              type="number"
              size="small"
              value={autoIntervalHours}
              onChange={(e) => setAutoIntervalHours(e.target.value)}
              disabled={!autoEnabled}
              inputProps={{ min: 1, max: 168 }}
              sx={{ width: 140 }}
            />
            {lastAutoRun && (
              <Typography variant="caption" color="text.secondary">
                Last automatic run: {formatInUserTimezone(lastAutoRun)}
              </Typography>
            )}
          </Box>

          <StackActions
            onSave={handleSaveSettings}
            saving={saving}
            onPreview={runPreview}
            previewing={previewing}
            onRun={() => setConfirmOpen(true)}
            running={running}
          />
        </CardContent>
      </Card>

      {lastPreview?.results && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {lastPreview.dryRun ? 'Preview results' : 'Last run results'}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Cutoff (UTC)</TableCell>
                  <TableCell align="right">{lastPreview.dryRun ? 'Would delete' : 'Deleted'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(lastPreview.results).map(([key, r]) => (
                  <TableRow key={key}>
                    <TableCell>{key}</TableCell>
                    <TableCell>
                      {r.skipped ? (
                        <Chip size="small" label="disabled" />
                      ) : (
                        r.cutoff ? formatInUserTimezone(r.cutoff) : '—'
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {r.skipped
                        ? '—'
                        : Number(lastPreview.dryRun ? r.wouldDelete : r.deleted).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Recent cleanup runs
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Trigger</TableCell>
                  <TableCell>Dry run</TableCell>
                  <TableCell align="right">Rows removed</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((h) => {
                  const total = Object.values(h.results || {}).reduce(
                    (s, r) => s + (h.dry_run ? r.wouldDelete || 0 : r.deleted || 0),
                    0
                  );
                  return (
                    <TableRow key={h.run_id}>
                      <TableCell>{formatInUserTimezone(h.started_at)}</TableCell>
                      <TableCell>{h.triggered_by}</TableCell>
                      <TableCell>{h.dry_run ? 'Yes' : 'No'}</TableCell>
                      <TableCell align="right">{Number(total).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onClose={() => !running && setConfirmOpen(false)}>
        <DialogTitle>Delete old data?</DialogTitle>
        <DialogContent>
          <Typography>
            This permanently deletes rows older than the retention settings above
            {selectedDevices.length ? ` for ${selectedDevices.length} selected device(s)` : ' for all devices'}.
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={running}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={runCleanup} disabled={running}>
            {running ? <CircularProgress size={22} /> : 'Delete now'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function StackActions({ onSave, saving, onPreview, previewing, onRun, running }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 2 }}>
      <Button variant="contained" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />} onClick={onSave} disabled={saving}>
        Save settings
      </Button>
      <Button
        variant="outlined"
        startIcon={previewing ? <CircularProgress size={18} /> : <PreviewIcon />}
        onClick={onPreview}
        disabled={previewing || running}
      >
        Preview cleanup
      </Button>
      <Button
        color="error"
        variant="outlined"
        startIcon={running ? <CircularProgress size={18} /> : <DeleteSweepIcon />}
        onClick={onRun}
        disabled={previewing || running}
      >
        Run cleanup now
      </Button>
    </Box>
  );
}
