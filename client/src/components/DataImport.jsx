import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import PreviewIcon from '@mui/icons-material/Preview';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import * as XLSX from 'xlsx';
import PageHeader from './PageHeader';
import { API_BASE_URL } from '../config/api';
import { usePermissions } from '../hooks/usePermissions';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { getDeviceDisplayName } from '../utils/deviceLabel';

const authHeaders = () => {
  const token = localStorage.getItem('iot_token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

function parseSpreadsheetFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          reject(new Error('Spreadsheet has no sheets'));
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export default function DataImport() {
  const { canAccessMenu } = usePermissions();
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [template, setTemplate] = useState(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [preview, setPreview] = useState(null);
  const [commitResult, setCommitResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.device_id === deviceId) || null,
    [devices, deviceId]
  );

  const loadDevices = useCallback(async () => {
    if (!canAccessMenu('/data-import')) return;
    setLoadingDevices(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/devices/dropdown`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load devices');
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.devices || [];
      setDevices(list);
    } catch (e) {
      setError(e.message || 'Failed to load devices');
    } finally {
      setLoadingDevices(false);
    }
  }, [canAccessMenu]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const loadTemplate = useCallback(async (id) => {
    if (!id) {
      setTemplate(null);
      return;
    }
    setLoadingTemplate(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/data-import/template/${encodeURIComponent(id)}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load template');
      setTemplate(data);
    } catch (e) {
      setTemplate(null);
      setError(e.message || 'Failed to load template');
    } finally {
      setLoadingTemplate(false);
    }
  }, []);

  useEffect(() => {
    setRows([]);
    setFileName('');
    setPreview(null);
    setCommitResult(null);
    setSuccess('');
    loadTemplate(deviceId);
  }, [deviceId, loadTemplate]);

  const downloadTemplate = async () => {
    if (!deviceId) return;
    setError('');
    try {
      const res = await fetch(
        `${API_BASE_URL}/data-import/template/${encodeURIComponent(deviceId)}?download=1`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('iot_token')}` } }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Template download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `data-import-${deviceId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Template download failed');
    }
  };

  const onFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setSuccess('');
    setPreview(null);
    setCommitResult(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (!parsed.length) throw new Error('File has no data rows');
      setRows(parsed);
      setFileName(file.name);
    } catch (e) {
      setRows([]);
      setFileName('');
      setError(e.message || 'Failed to parse file');
    }
  };

  const runPreview = async () => {
    if (!deviceId || !rows.length) return;
    setPreviewing(true);
    setError('');
    setSuccess('');
    setCommitResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/data-import/preview`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ deviceId, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreview(data);
    } catch (e) {
      setPreview(null);
      setError(e.message || 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const runCommit = async () => {
    if (!deviceId || !rows.length) return;
    setCommitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/data-import/commit`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ deviceId, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setCommitResult(data);
      setSuccess(
        `Imported ${data.summary?.rowsOk || 0} rows (${data.summary?.sensorInserted || 0} sensor readings).`
      );
      setConfirmOpen(false);
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setCommitting(false);
    }
  };

  if (!canAccessMenu('/data-import')) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">You do not have permission to import data.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Data import"
        subtitle="Upload missing historical readings from CSV/Excel (admin only). Does not fire alerts."
        icon={<UploadFileIcon />}
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

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
            1. Select device
          </Typography>
          {loadingDevices ? (
            <CircularProgress size={28} />
          ) : (
            <FormControl fullWidth size="small" sx={{ maxWidth: 480 }}>
              <InputLabel id="data-import-device">Device</InputLabel>
              <Select
                labelId="data-import-device"
                label="Device"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {devices.map((d) => (
                  <MenuItem key={d.device_id} value={d.device_id}>
                    {getDeviceDisplayName(d)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {selectedDevice && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Timezone: {template?.device?.timezone || selectedDevice.timezone || 'UTC'}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
            2. Download template &amp; upload file
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              disabled={!deviceId || loadingTemplate}
              onClick={downloadTemplate}
            >
              Download CSV template
            </Button>
            <Button
              variant="contained"
              component="label"
              startIcon={<CloudUploadIcon />}
              disabled={!deviceId}
            >
              Choose CSV / Excel
              <input hidden type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={onFileChange} />
            </Button>
          </Box>
          {fileName && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              File: <strong>{fileName}</strong> · {rows.length} rows
            </Typography>
          )}
          {template?.notes?.length > 0 && (
            <List dense disablePadding>
              {template.notes.map((n) => (
                <ListItem key={n} sx={{ py: 0 }}>
                  <ListItemText primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} primary={`• ${n}`} />
                </ListItem>
              ))}
            </List>
          )}
          {template?.headers?.length > 0 && (
            <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {template.headers.map((h) => (
                <Chip key={h} size="small" label={h} />
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
            3. Preview &amp; import
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Button
              variant="outlined"
              startIcon={previewing ? <CircularProgress size={16} /> : <PreviewIcon />}
              disabled={!deviceId || !rows.length || previewing || committing}
              onClick={runPreview}
            >
              Preview
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<UploadFileIcon />}
              disabled={!deviceId || !rows.length || !preview || preview.validRows < 1 || committing}
              onClick={() => setConfirmOpen(true)}
            >
              Confirm import
            </Button>
          </Box>

          {preview && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Valid: <strong>{preview.validRows}</strong> / {preview.totalRows}
                {preview.dateRange?.start && (
                  <>
                    {' '}
                    · Range:{' '}
                    {formatInUserTimezone(preview.dateRange.start)} →{' '}
                    {formatInUserTimezone(preview.dateRange.end)}
                  </>
                )}
              </Typography>
              {preview.errors?.length > 0 && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  {preview.errorRows} row issue(s). Showing first {preview.errors.length}.
                </Alert>
              )}
              {preview.sampleMapped?.length > 0 && (
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Datetime</TableCell>
                        <TableCell>Mapped fields (sample)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.sampleMapped.map((s) => (
                        <TableRow key={s.row}>
                          <TableCell>{s.row}</TableCell>
                          <TableCell>{formatInUserTimezone(s.datetime)}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {JSON.stringify(s.fields)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              {preview.errors?.length > 0 && (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Error</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.errors.map((e) => (
                        <TableRow key={`${e.row}-${e.error}`}>
                          <TableCell>{e.row}</TableCell>
                          <TableCell>{e.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {commitResult?.summary && (
            <Alert severity="info">
              Rows OK: {commitResult.summary.rowsOk} · Failed: {commitResult.summary.rowsFailed} ·
              Sensor inserted: {commitResult.summary.sensorInserted} · Duplicates skipped:{' '}
              {commitResult.summary.sensorSkippedDuplicate} · GPS: {commitResult.summary.gpsInserted}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onClose={() => !committing && setConfirmOpen(false)}>
        <DialogTitle>Confirm historical import</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Import <strong>{preview?.validRows || 0}</strong> valid rows for{' '}
            <strong>{selectedDevice ? getDeviceDisplayName(selectedDevice) : deviceId}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Alerts will not fire. Duplicate readings in the existing window may be skipped.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={committing}>
            Cancel
          </Button>
          <Button variant="contained" onClick={runCommit} disabled={committing}>
            {committing ? <CircularProgress size={18} /> : 'Import now'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
