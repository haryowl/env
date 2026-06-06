import React, { useEffect, useState, useRef } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, CircularProgress, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, InputLabel, FormControl, IconButton, Alert, Avatar, Stack } from '@mui/material';
import { API_BASE_URL } from '../config/api';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LockResetIcon from '@mui/icons-material/LockReset';
import { usePermissions } from '../hooks/usePermissions.jsx';
import { broadcastUserProfilePicture, resolveProfilePictureUrl } from '../utils/profilePicture';

function UserManager() {
  const { canAccessMenu } = usePermissions();
  
  // Check if user has permission to access users
  if (!canAccessMenu('/users')) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Alert severity="error">
          You don't have permission to access the User Manager.
        </Alert>
      </Box>
    );
  }
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'viewer',
    tenant_id: '',
    post_logout_redirect_url: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    user_id: '',
    username: '',
    email: '',
    role: '',
    status: '',
    tenant_id: '',
    post_logout_redirect_url: '',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [pictureUploading, setPictureUploading] = useState(false);
  const profilePicInputRef = useRef(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [emailResetLoading, setEmailResetLoading] = useState(false);

  const currentUserId = (() => {
    try {
      const me = JSON.parse(localStorage.getItem('iot_user') || '{}');
      return me.user_id != null ? String(me.user_id) : '';
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/tenants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
      }
    } catch (e) {
      console.warn('Tenants list not loaded:', e);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      } else {
        setError('Failed to fetch users');
      }
    } catch (e) {
      setError('Failed to fetch users');
    }
    setLoading(false);
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/roles`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
      }
    } catch (e) {
      console.error('Failed to fetch roles:', e);
    }
  };

  const handleOpenDialog = () => {
    setForm({
      username: '',
      email: '',
      password: '',
      role: 'viewer',
      tenant_id: '',
      post_logout_redirect_url: '',
    });
    setFormError('');
    setFormSuccess('');
    setOpenDialog(true);
  };
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };
  const handleFormChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    setFormSuccess('');
    try {
      const token = localStorage.getItem('iot_token');
      const payload = {
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
        ...(form.tenant_id !== '' && form.tenant_id != null
          ? { tenant_id: Number(form.tenant_id) }
          : {}),
        ...(form.post_logout_redirect_url.trim()
          ? { post_logout_redirect_url: form.post_logout_redirect_url.trim() }
          : {}),
      };
      const res = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setFormSuccess('User created successfully');
        fetchUsers();
        setTimeout(() => {
          setOpenDialog(false);
        }, 1000);
      } else {
        let data = {};
        try {
          data = await res.json();
        } catch {
          setFormError(`Request failed (${res.status}). Check server logs.`);
        }
        if (data && Object.keys(data).length > 0) {
          const joiHint = Array.isArray(data.details)
            ? data.details.map((d) => d.message).join(' ')
            : '';
          const parts = [
            joiHint,
            data.error,
            data.details && typeof data.details === 'string' ? data.details : null,
          ].filter(Boolean);
          setFormError(parts.join(' — ') || 'Failed to create user');
        }
      }
    } catch (e) {
      setFormError(e.message || 'Failed to create user');
    } finally {
      setFormLoading(false);
    }
  };

  const handleOpenEditDialog = (user) => {
    setEditForm({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      tenant_id: user.tenant_id != null ? String(user.tenant_id) : '',
      post_logout_redirect_url: user.post_logout_redirect_url || '',
      profile_picture: user.profile_picture || null,
    });
    setEditError('');
    setEditSuccess('');
    setEditDialogOpen(true);
  };
  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
  };
  const handleEditFormChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const uploadEditProfilePicture = async (file) => {
    if (!file || !editForm.user_id) return;
    setPictureUploading(true);
    setEditError('');
    setEditSuccess('');
    try {
      const token = localStorage.getItem('iot_token');
      const fd = new FormData();
      fd.append('picture', file);
      const res = await fetch(`${API_BASE_URL}/users/${editForm.user_id}/profile-picture`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditForm((f) => ({ ...f, profile_picture: data.profile_picture }));
        try {
          const me = JSON.parse(localStorage.getItem('iot_user') || '{}');
          if (String(me.user_id) === String(editForm.user_id)) {
            broadcastUserProfilePicture(data.profile_picture);
          }
        } catch {
          /* ignore */
        }
        setEditSuccess('Profile photo updated');
        fetchUsers();
      } else {
        setEditError(data.error || 'Failed to upload photo');
      }
    } catch {
      setEditError('Failed to upload photo');
    }
    setPictureUploading(false);
    if (profilePicInputRef.current) profilePicInputRef.current.value = '';
  };

  const removeEditProfilePicture = async () => {
    if (!editForm.user_id) return;
    setPictureUploading(true);
    setEditError('');
    setEditSuccess('');
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/users/${editForm.user_id}/profile-picture`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditForm((f) => ({ ...f, profile_picture: null }));
        try {
          const me = JSON.parse(localStorage.getItem('iot_user') || '{}');
          if (String(me.user_id) === String(editForm.user_id)) {
            broadcastUserProfilePicture(null);
          }
        } catch {
          /* ignore */
        }
        setEditSuccess('Profile photo removed');
        fetchUsers();
      } else {
        setEditError(data.error || 'Failed to remove photo');
      }
    } catch {
      setEditError('Failed to remove photo');
    }
    setPictureUploading(false);
  };
  const handleEditFormSubmit = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError('');
    setEditSuccess('');
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/users/${editForm.user_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: editForm.username,
          email: editForm.email,
          role: editForm.role,
          status: editForm.status,
          tenant_id: editForm.tenant_id === '' ? null : Number(editForm.tenant_id),
          post_logout_redirect_url: editForm.post_logout_redirect_url.trim() || null,
        })
      });
      if (res.ok) {
        setEditSuccess('User updated successfully');
        fetchUsers();
        setTimeout(() => {
          setEditDialogOpen(false);
        }, 1000);
      } else {
        const data = await res.json();
        setEditError(data.error || 'Failed to update user');
      }
    } catch (e) {
      setEditError('Failed to update user');
    }
    setEditLoading(false);
  };

  const handleOpenPasswordDialog = (user) => {
    setPasswordUser(user);
    setPasswordForm({ newPassword: '', confirmPassword: '' });
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordDialogOpen(true);
  };

  const handleClosePasswordDialog = () => {
    setPasswordDialogOpen(false);
    setPasswordUser(null);
  };

  const handleSetUserPassword = async () => {
    if (!passwordUser) return;
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/users/${passwordUser.user_id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: passwordForm.newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPasswordSuccess(data.message || 'Password updated successfully');
        setPasswordForm({ newPassword: '', confirmPassword: '' });
      } else {
        setPasswordError(data.error || 'Failed to update password');
      }
    } catch {
      setPasswordError('Failed to update password');
    }
    setPasswordLoading(false);
  };

  const handleSendPasswordResetEmail = async () => {
    if (!passwordUser) return;
    setPasswordError('');
    setPasswordSuccess('');
    setEmailResetLoading(true);
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(
        `${API_BASE_URL}/users/${passwordUser.user_id}/send-password-reset`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPasswordSuccess(data.message || 'Password reset email sent');
      } else {
        setPasswordError(data.error || 'Failed to send reset email');
      }
    } catch {
      setPasswordError('Failed to send reset email');
    }
    setEmailResetLoading(false);
  };

  const handleOpenDeleteDialog = (user) => {
    setDeleteUser(user);
    setDeleteError('');
    setDeleteSuccess('');
    setDeleteDialogOpen(true);
  };
  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
  };
  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setDeleteLoading(true);
    setDeleteError('');
    setDeleteSuccess('');
    try {
      const token = localStorage.getItem('iot_token');
      const res = await fetch(`${API_BASE_URL}/users/${deleteUser.user_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setDeleteSuccess('User deleted successfully');
        fetchUsers();
        setTimeout(() => {
          setDeleteDialogOpen(false);
        }, 1000);
      } else {
        const data = await res.json();
        setDeleteError(data.error || 'Failed to delete user');
      }
    } catch (e) {
      setDeleteError('Failed to delete user');
    }
    setDeleteLoading(false);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>User Manager</Typography>
      <Button variant="contained" sx={{ mb: 2 }} onClick={handleOpenDialog}>Add User</Button>
      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>Add User</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleFormSubmit} sx={{ mt: 1, minWidth: 300 }}>
            <TextField
              label="Username"
              name="username"
              value={form.username}
              onChange={handleFormChange}
              fullWidth
              margin="normal"
              required
            />
            <TextField
              label="Email"
              name="email"
              value={form.email}
              onChange={handleFormChange}
              fullWidth
              margin="normal"
              required
              type="email"
            />
            <TextField
              label="Password"
              name="password"
              value={form.password}
              onChange={handleFormChange}
              fullWidth
              margin="normal"
              required
              type="password"
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Role</InputLabel>
              <Select
                name="role"
                value={form.role}
                onChange={handleFormChange}
                label="Role"
              >
                {roles.map(role => (
                  <MenuItem key={role.role_id} value={role.role_name}>
                    {role.display_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <InputLabel>Tenant (optional)</InputLabel>
              <Select
                name="tenant_id"
                value={form.tenant_id}
                onChange={handleFormChange}
                label="Tenant (optional)"
              >
                <MenuItem value="">None</MenuItem>
                {tenants.map((t) => (
                  <MenuItem key={t.tenant_id} value={String(t.tenant_id)}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Post-logout URL override (optional)"
              name="post_logout_redirect_url"
              value={form.post_logout_redirect_url}
              onChange={handleFormChange}
              fullWidth
              margin="normal"
              helperText="Overrides tenant default after sign out"
            />
            {formError && <Typography color="error" sx={{ mt: 1 }}>{formError}</Typography>}
            {formSuccess && <Typography color="success.main" sx={{ mt: 1 }}>{formSuccess}</Typography>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={formLoading}>Cancel</Button>
          <Button onClick={handleFormSubmit} variant="contained" disabled={formLoading}>
            {formLoading ? <CircularProgress size={20} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Username</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Tenant</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.user_id || user.id}>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>{user.tenant_name || '—'}</TableCell>
                  <TableCell>{user.status}</TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => handleOpenEditDialog(user)} size="small">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      onClick={() => handleOpenPasswordDialog(user)}
                      size="small"
                      color="primary"
                      disabled={String(user.user_id) === currentUserId}
                      title={
                        String(user.user_id) === currentUserId
                          ? 'Use Settings to change your own password'
                          : 'Reset password'
                      }
                    >
                      <LockResetIcon fontSize="small" />
                    </IconButton>
                    <IconButton onClick={() => handleOpenDeleteDialog(user)} size="small" color="error">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog}>
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleEditFormSubmit} sx={{ mt: 1, minWidth: 300 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Avatar
                src={resolveProfilePictureUrl(editForm.profile_picture) || undefined}
                sx={{ width: 64, height: 64 }}
              />
              <Box>
                <input
                  ref={profilePicInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadEditProfilePicture(f);
                  }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  disabled={pictureUploading}
                  onClick={() => profilePicInputRef.current?.click()}
                >
                  {pictureUploading ? <CircularProgress size={18} /> : 'Upload photo'}
                </Button>
                {editForm.profile_picture ? (
                  <Button
                    variant="text"
                    size="small"
                    color="error"
                    disabled={pictureUploading}
                    onClick={removeEditProfilePicture}
                    sx={{ ml: 1 }}
                  >
                    Remove
                  </Button>
                ) : null}
                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5, maxWidth: 260 }}>
                  Square image recommended, at least 256×256 px. Max 2 MB (JPEG, PNG, GIF, WebP).
                </Typography>
              </Box>
            </Stack>
            <TextField
              label="Username"
              name="username"
              value={editForm.username}
              onChange={handleEditFormChange}
              fullWidth
              margin="normal"
              required
            />
            <TextField
              label="Email"
              name="email"
              value={editForm.email}
              onChange={handleEditFormChange}
              fullWidth
              margin="normal"
              required
              type="email"
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Role</InputLabel>
              <Select
                name="role"
                value={editForm.role}
                onChange={handleEditFormChange}
                label="Role"
              >
                {roles.map(role => (
                  <MenuItem key={role.role_id} value={role.role_name}>
                    {role.display_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <InputLabel>Status</InputLabel>
              <Select
                name="status"
                value={editForm.status}
                onChange={handleEditFormChange}
                label="Status"
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <InputLabel>Tenant</InputLabel>
              <Select
                name="tenant_id"
                value={editForm.tenant_id}
                onChange={handleEditFormChange}
                label="Tenant"
              >
                <MenuItem value="">None</MenuItem>
                {tenants.map((t) => (
                  <MenuItem key={t.tenant_id} value={String(t.tenant_id)}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Post-logout URL override"
              name="post_logout_redirect_url"
              value={editForm.post_logout_redirect_url}
              onChange={handleEditFormChange}
              fullWidth
              margin="normal"
              helperText="Leave empty to use tenant default only"
            />
            {editError && <Typography color="error" sx={{ mt: 1 }}>{editError}</Typography>}
            {editSuccess && <Typography color="success.main" sx={{ mt: 1 }}>{editSuccess}</Typography>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditDialog} disabled={editLoading}>Cancel</Button>
          <Button onClick={handleEditFormSubmit} variant="contained" disabled={editLoading}>
            {editLoading ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={passwordDialogOpen} onClose={handleClosePasswordDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Reset password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            User: <strong>{passwordUser?.username}</strong>
            {passwordUser?.email ? ` (${passwordUser.email})` : ''}
          </Typography>
          <TextField
            label="New password"
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
            fullWidth
            margin="normal"
            autoComplete="new-password"
          />
          <TextField
            label="Confirm new password"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            fullWidth
            margin="normal"
            autoComplete="new-password"
          />
          {passwordError && <Typography color="error" sx={{ mt: 1 }}>{passwordError}</Typography>}
          {passwordSuccess && <Typography color="success.main" sx={{ mt: 1 }}>{passwordSuccess}</Typography>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={handleClosePasswordDialog} disabled={passwordLoading || emailResetLoading}>
            Close
          </Button>
          <Button
            onClick={handleSendPasswordResetEmail}
            variant="outlined"
            disabled={passwordLoading || emailResetLoading || !passwordUser?.email}
          >
            {emailResetLoading ? <CircularProgress size={20} /> : 'Email reset link'}
          </Button>
          <Button
            onClick={handleSetUserPassword}
            variant="contained"
            disabled={passwordLoading || emailResetLoading}
          >
            {passwordLoading ? <CircularProgress size={20} /> : 'Set password'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently delete user <b>{deleteUser?.username}</b>?
            This cannot be undone.
          </Typography>
          {deleteError && <Typography color="error" sx={{ mt: 1 }}>{deleteError}</Typography>}
          {deleteSuccess && <Typography color="success.main" sx={{ mt: 1 }}>{deleteSuccess}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={deleteLoading}>Cancel</Button>
          <Button onClick={handleDeleteUser} variant="contained" color="error" disabled={deleteLoading}>
            {deleteLoading ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UserManager;