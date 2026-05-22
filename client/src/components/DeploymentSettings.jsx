import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  TextField,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PublicIcon from '@mui/icons-material/Public';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PageHeader from './PageHeader';
import { API_BASE_URL } from '../config/api';
import { usePermissions } from '../hooks/usePermissions.jsx';

const authHeaders = () => {
  const token = localStorage.getItem('iot_token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

function CopyBlock({ label, text, onCopied }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text || '');
      onCopied?.(`Copied ${label}`);
    } catch {
      onCopied?.('Copy failed — select the text manually');
    }
  };
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Button size="small" startIcon={<ContentCopyIcon />} onClick={copy}>
          Copy
        </Button>
      </Stack>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          bgcolor: 'action.hover',
          borderRadius: 1,
          overflow: 'auto',
          fontSize: '0.8rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </Box>
    </Box>
  );
}

export default function DeploymentSettings() {
  const { canAccessMenu } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [data, setData] = useState(null);
  const [corsOrigins, setCorsOrigins] = useState('');
  const [logoutHosts, setLogoutHosts] = useState('');

  const load = useCallback(async () => {
    if (!canAccessMenu('/deployment-settings')) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/deployment-settings`, { headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      setData(body);
      setCorsOrigins(body.cors_origins || '');
      setLogoutHosts(body.allowed_logout_redirect_hosts || '');
    } catch (e) {
      setError(e.message || 'Failed to load deployment settings');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [canAccessMenu]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/deployment-settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          cors_origins: corsOrigins,
          allowed_logout_redirect_hosts: logoutHosts,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Save failed');
      setSuccess(body.message || 'Saved');
      if (body.settings) {
        setCorsOrigins(body.settings.cors_origins || '');
        setLogoutHosts(body.settings.allowed_logout_redirect_hosts || '');
        setData((prev) =>
          prev
            ? {
                ...prev,
                cors_origins: body.settings.cors_origins,
                allowed_logout_redirect_hosts: body.settings.allowed_logout_redirect_hosts,
                effective_allowed_hosts: body.settings.effective_allowed_hosts,
              }
            : prev
        );
      }
      await load();
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!canAccessMenu('/deployment-settings')) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">You do not have permission to view Deployment &amp; domain settings.</Alert>
      </Box>
    );
  }

  const effectiveHosts = data?.effective_allowed_hosts || [];

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <PageHeader
        icon={<PublicIcon />}
        title="Deployment & domain"
        subtitle="Public URL, CORS, tenant logout redirects, and nginx / SSL steps (server-side)"
        right={
          <Button startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        This page updates only <code>CORS_ORIGINS</code> and <code>ALLOWED_LOGOUT_REDIRECT_HOSTS</code> in the
        server <code>.env</code>. nginx and Certbot must be run on the host (SSH). After saving, restart the app:{' '}
        <code>pm2 restart iot-monitoring</code>. Full install guide: <code>docs/INSTALL-UBUNTU-NGINX.md</code>.
      </Alert>

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

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Application URLs
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Browser origins allowed for API calls (comma-separated full URLs, e.g.{' '}
                <code>https://monitor.example.com</code>). Include both HTTP (during setup) and HTTPS after SSL.
              </Typography>
              <TextField
                fullWidth
                label="CORS_ORIGINS"
                value={corsOrigins}
                onChange={(e) => setCorsOrigins(e.target.value)}
                placeholder="https://monitor.example.com,http://monitor.example.com"
                multiline
                minRows={2}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="ALLOWED_LOGOUT_REDIRECT_HOSTS (optional)"
                value={logoutHosts}
                onChange={(e) => setLogoutHosts(e.target.value)}
                placeholder="monitor.example.com,portal.example.com"
                helperText="Hostnames only, comma-separated. Overrides hosts inferred from CORS when set."
                sx={{ mb: 2 }}
              />
              {effectiveHosts.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    Effective allowed logout hosts
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.5}>
                    {effectiveHosts.map((h) => (
                      <Chip key={h} label={h} size="small" />
                    ))}
                  </Stack>
                </Box>
              )}
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                  onClick={save}
                  disabled={saving}
                >
                  Save to .env
                </Button>
                {data?.env_file && (
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    File: {data.env_file}
                    {!data.env_file_exists ? ' (will be created)' : ''}
                  </Typography>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Suggested server name: <strong>{data?.suggested_server_name || '—'}</strong>
                {data?.request_host ? ` · Current request Host: ${data.request_host}` : ''}
                {data?.app_port ? ` · App listens on port ${data.app_port}` : ''}
              </Typography>
            </CardContent>
          </Card>

          <Accordion defaultExpanded={false}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">nginx reverse proxy (copy-paste)</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <CopyBlock label="Site config" text={data?.nginx_config || ''} onCopied={setSuccess} />
            </AccordionDetails>
          </Accordion>

          <Accordion sx={{ mt: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">Let&apos;s Encrypt / Certbot</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <CopyBlock
                label="Commands"
                text={(data?.certbot_steps || []).join('\n')}
                onCopied={setSuccess}
              />
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary">
                After HTTPS works, add <code>https://your-domain</code> to CORS_ORIGINS above, save, and restart PM2.
              </Typography>
            </AccordionDetails>
          </Accordion>
        </>
      )}
    </Box>
  );
}
