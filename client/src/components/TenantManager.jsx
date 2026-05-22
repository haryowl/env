import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DomainIcon from '@mui/icons-material/Domain';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { usePermissions } from '../hooks/usePermissions.jsx';
import PageHeader from './PageHeader';

export default function TenantManager() {
  const { canAccessMenu } = usePermissions();

  if (!canAccessMenu('/tenants')) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Alert severity="error">You do not have permission to access Tenants.</Alert>
      </Box>
    );
  }

  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [postLogoutUrl, setPostLogoutUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTenants = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/tenants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tenants');
      setTenants(data.tenants || []);
    } catch (e) {
      setError(e.message || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setPostLogoutUrl('');
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setName(t.name || '');
    setPostLogoutUrl(t.post_logout_redirect_url || '');
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      const token = localStorage.getItem('iot_token');
      const body = {
        name: name.trim(),
        post_logout_redirect_url: postLogoutUrl.trim() || null,
      };
      const url = editing
        ? `${API_BASE_URL}/tenants/${editing.tenant_id}`
        : `${API_BASE_URL}/tenants`;
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setDialogOpen(false);
      fetchTenants();
    } catch (e) {
      setFormError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/tenants/${deleteTarget.tenant_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setDeleteTarget(null);
      fetchTenants();
    } catch (e) {
      setError(e.message || 'Delete failed');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ mb: 2 }}>
        <PageHeader
          icon={<DomainIcon sx={{ fontSize: 20 }} />}
          title="Tenants"
          subtitle="Default post-logout URL per tenant; users can override in User Manager"
          right={
            <Button variant="contained" size="small" onClick={openCreate}>
              Add tenant
            </Button>
          }
        />
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Allowed redirect hosts come from <code>ALLOWED_LOGOUT_REDIRECT_HOSTS</code> or hostnames parsed from{' '}
        <code>CORS_ORIGINS</code>. Production URLs must use HTTPS.{' '}
        <Link to="/deployment-settings">Edit in Deployment &amp; domain</Link>.
      </Alert>

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Default logout URL</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.tenant_id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell sx={{ maxWidth: 360, wordBreak: 'break-all' }}>
                    {t.post_logout_redirect_url || '—'}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(t)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(t)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit tenant' : 'Add tenant'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Tenant name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            margin="normal"
            required
          />
          <TextField
            label="Default post-logout URL (optional)"
            value={postLogoutUrl}
            onChange={(e) => setPostLogoutUrl(e.target.value)}
            fullWidth
            margin="normal"
            placeholder="https://portal.customer.example/"
            helperText="Used when the user has no per-user override"
          />
          {formError ? (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {formError}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={saving || !name.trim()}>
            {saving ? <CircularProgress size={22} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)}>
        <DialogTitle>Delete tenant</DialogTitle>
        <DialogContent>
          <Typography>
            Remove tenant <strong>{deleteTarget?.name}</strong>? Users assigned to this tenant will have their tenant
            cleared (not deleted).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? <CircularProgress size={22} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
