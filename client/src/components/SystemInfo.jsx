import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Button,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
} from '@mui/material';
import MemoryIcon from '@mui/icons-material/Memory';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageHeader from './PageHeader';
import { API_BASE_URL } from '../config/api';
import { usePermissions } from '../hooks/usePermissions.jsx';

function formatUptime(seconds) {
  if (seconds == null) return '—';
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

export default function SystemInfo() {
  const { canAccessMenu } = usePermissions();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!canAccessMenu('/system-info')) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/system-info`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Request failed (${res.status})`);
        setData(null);
        return;
      }
      setData(body);
    } catch (e) {
      setError(e.message || 'Failed to load system information');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [canAccessMenu]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canAccessMenu('/system-info')) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">You do not have permission to view System Information.</Alert>
      </Box>
    );
  }

  const memPct = data?.memory?.usedPercent;
  const memColor =
    memPct == null ? 'inherit' : memPct > 90 ? 'error' : memPct > 75 ? 'warning' : 'primary';

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <PageHeader
        icon={<MemoryIcon />}
        title="System Information"
        subtitle="OS, CPU, memory, storage, and Node process — for the server running this app"
        right={
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={load}
            disabled={loading}
          >
            Refresh
          </Button>
        }
        sx={{ mb: 2 }}
      />

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {loading && !data ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : null}

      {data ? (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Operating system
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {data.os?.type} {data.os?.release}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Platform: {data.os?.platform} · Arch: {data.os?.arch} · Host: {data.os?.hostname}
                </Typography>
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  Endianness: {data.os?.endianness}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Uptime
                </Typography>
                <Typography variant="body1">
                  System: <strong>{formatUptime(data.uptime?.systemSeconds)}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Node process: {formatUptime(data.uptime?.processSeconds)}
                </Typography>
                <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                  Collected: {data.collectedAt ? new Date(data.collectedAt).toLocaleString() : '—'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  CPU
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {data.cpu?.logicalCores} logical cores
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {data.cpu?.model}
                  {data.cpu?.speedMhz ? ` · ~${data.cpu.speedMhz} MHz` : ''}
                </Typography>
                {Array.isArray(data.loadAverage) && data.loadAverage.length === 3 ? (
                  <Typography variant="body2">
                    Load (1 / 5 / 15 min):{' '}
                    <strong>
                      {data.loadAverage.map((n) => (typeof n === 'number' ? n.toFixed(2) : n)).join(', ')}
                    </strong>
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    Load average not available on this platform (e.g. Windows).
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  System memory (RAM)
                </Typography>
                <Typography variant="body1">
                  Used: <strong>{data.memory?.usedFormatted}</strong> / {data.memory?.totalFormatted} (
                  {data.memory?.usedPercent != null ? `${data.memory.usedPercent}%` : '—'})
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, data.memory?.usedPercent ?? 0)}
                  color={memColor}
                  sx={{ mt: 1, height: 8, borderRadius: 1 }}
                />
                <Typography variant="caption" display="block" sx={{ mt: 0.5 }} color="text.secondary">
                  Free: {data.memory?.freeFormatted}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Storage (filesystem)
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Volumes for app working directory and root (Linux/macOS). Requires Node 18.15+ for size data.
                </Typography>
                <Grid container spacing={2}>
                  {(data.disks || []).map((d, i) => (
                    <Grid item xs={12} md={6} key={`${d.path}-${i}`}>
                      <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={d.path}>
                          {d.path}
                        </Typography>
                        {d.unavailable ? (
                          <Typography variant="caption" color="text.secondary">
                            {d.reason || 'Unavailable'}
                          </Typography>
                        ) : d.error ? (
                          <Typography variant="caption" color="error">
                            {d.error}
                          </Typography>
                        ) : (
                          <>
                            <Typography variant="body2">
                              Used: {d.usedFormatted} / {d.totalFormatted} (
                              {d.usedPercent != null ? `${d.usedPercent}%` : '—'})
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(100, d.usedPercent ?? 0)}
                              color={d.usedPercent > 90 ? 'error' : d.usedPercent > 75 ? 'warning' : 'primary'}
                              sx={{ mt: 1, height: 6, borderRadius: 1 }}
                            />
                            <Typography variant="caption" display="block" color="text.secondary">
                              Free: {d.freeFormatted}
                            </Typography>
                          </>
                        )}
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Node.js process
                </Typography>
                <Typography variant="body2">Version: {data.process?.nodeVersion}</Typography>
                <Typography variant="body2">PID: {data.process?.pid}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  RSS: {data.process?.memory?.rssFormatted}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Heap: {data.process?.memory?.heapUsedFormatted} / {data.process?.memory?.heapTotalFormatted}
                </Typography>
                <Typography variant="caption" display="block" sx={{ mt: 1 }} color="text.secondary" noWrap>
                  CWD: {data.process?.cwd}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Network interfaces
                </Typography>
                <TableContainer sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Interface</TableCell>
                        <TableCell>Family</TableCell>
                        <TableCell>Address</TableCell>
                        <TableCell>Scope</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(data.networkInterfaces || []).map((row, idx) => (
                        <TableRow key={`${row.name}-${row.address}-${idx}`}>
                          <TableCell>{row.name}</TableCell>
                          <TableCell>{row.family}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.address}</TableCell>
                          <TableCell>
                            {row.internal ? (
                              <Chip label="internal" size="small" />
                            ) : (
                              <Chip label="external" size="small" variant="outlined" />
                            )}
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
      ) : null}
    </Box>
  );
}
