import React, { useEffect, useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, CircularProgress, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, InputLabel, FormControl, IconButton, Alert } from '@mui/material';
import { API_BASE_URL } from '../config/api';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { usePermissions } from '../hooks/usePermissions.jsx';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'viewer' });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ user_id: '', username: '', email: '', role: '', status: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

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
    setForm({ username: '', email: '', password: '', role: 'viewer' });
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
      const res = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setFormSuccess('User created successfully');
        fetchUsers();
        setTimeout(() => {
          setOpenDialog(false);
        }, 1000);
      } else {
        const data = await res.json();
        setFormError(data.error || 'Failed to create user');
      }
    } catch (e) {
      setFormError('Failed to create user');
    }
    setFormLoading(false);
  };

  const handleOpenEditDialog = (user) => {
    setEditForm({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status
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
          status: editForm.status
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
                  <TableCell>{user.status}</TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => handleOpenEditDialog(user)} size="small">
                      <EditIcon fontSize="small" />
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
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete user <b>{deleteUser?.username}</b>?</Typography>
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