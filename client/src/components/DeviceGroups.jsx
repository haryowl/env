import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FolderIcon from '@mui/icons-material/Folder';
import PageHeader from './PageHeader';
import { API_BASE_URL } from '../config/api';
import { usePermissions } from '../hooks/usePermissions.jsx';

const emptyForm = { name: '', description: '' };

export default function DeviceGroups() {
  const { userPermissions } = usePermissions();
  const isAdmin = ['super_admin', 'admin'].includes(userPermissions?.role);
  const canEdit = isAdmin;
  const canRemove = isAdmin;

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('iot_token')}`,
    'Content-Type': 'application/json',
  });

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/device-groups`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load device groups');
      setGroups(data.groups || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const openDialog = (group = null) => {
    setEditing(group);
    setForm({
      name: group?.name || '',
      description: group?.description || '',
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const saveGroup = async () => {
    if (!form.name.trim()) {
      setError('Group name is required');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const url = editing
        ? `${API_BASE_URL}/device-groups/${editing.group_id}`
        : `${API_BASE_URL}/device-groups`;
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save group');
      closeDialog();
      setSuccess(editing ? 'Group updated' : 'Group created');
      await loadGroups();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteGroup = async (group) => {
    if (
      !window.confirm(
        `Delete group "${group.name}"? Devices in this group will become ungrouped. Readings are not changed.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/device-groups/${group.group_id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete group');
      setSuccess('Group deleted');
      await loadGroups();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        icon={<FolderIcon sx={{ fontSize: 18 }} />}
        title="Device Groups"
        subtitle="Name monitoring programmes (for example wastewater or TMAT). The description is shown on N-Dashboard."
        right={
          canEdit ? (
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => openDialog()}>
              Add group
            </Button>
          ) : null
        }
      />

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

      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Assign devices to a group on the Devices page. This does not change ingest, alerts, or KLHK sending.
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Devices</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      No groups yet. Create one, then assign it on Devices.
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((group) => (
                    <TableRow key={group.group_id}>
                      <TableCell>
                        <Typography variant="subtitle2">{group.name}</Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 480 }}>
                        <Typography variant="body2" color="text.secondary">
                          {group.description || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>{group.device_count ?? 0}</TableCell>
                      <TableCell align="right">
                        {canEdit ? (
                          <IconButton size="small" color="primary" onClick={() => openDialog(group)} disabled={busy}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        ) : null}
                        {canRemove ? (
                          <IconButton size="small" color="error" onClick={() => deleteGroup(group)} disabled={busy}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit group' : 'Add group'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Group name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            sx={{ mt: 1.5 }}
            required
            helperText="Shown as a section on N-Dashboard Site Overview"
          />
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Description"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            sx={{ mt: 2 }}
            helperText="Shown under the N-Dashboard title for devices in this group"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveGroup} disabled={busy}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
