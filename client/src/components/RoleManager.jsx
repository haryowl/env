import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Card,
  CardContent,
  CardActions,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Security as SecurityIcon,
  People as PeopleIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { usePermissions } from '../hooks/usePermissions';

const RoleManager = () => {
  const { canAccessMenu, canCreate, canUpdate, canDelete } = usePermissions();
  const [roles, setRoles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [editForm, setEditForm] = useState({
    display_name: '',
    description: ''
  });
  const [editPermissions, setEditPermissions] = useState({
    menu_permissions: {},
    device_permissions: {}
  });
  const [form, setForm] = useState({
    role_name: '',
    display_name: '',
    description: '',
    template_name: ''
  });
  const [permissions, setPermissions] = useState({
    menu_permissions: {},
    device_permissions: {}
  });
  const [devices, setDevices] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [editSpecificDevicePermissions, setEditSpecificDevicePermissions] = useState({});
  const [editAddDevices, setEditAddDevices] = useState([]);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    fetchRoles();
    fetchTemplates();
    fetchDevices();
  }, []);

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/roles`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRoles(data.roles || []);
      } else {
        setError('Failed to fetch roles');
      }
    } catch (error) {
      console.error('Fetch roles error:', error);
      setError('Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      } else {
        console.error('Failed to fetch devices');
      }
    } catch (error) {
      console.error('Fetch devices error:', error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/roles/templates`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Fetch templates error:', error);
    }
  };

  const handleCreateRole = async () => {
    if (!form.role_name || !form.display_name) {
      setFormError('Please fill in all required fields');
      return;
    }

    setFormLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const token = localStorage.getItem('iot_token');
      
      // Format device permissions properly
      const devicePermissions = {};
      if (selectedDevices.length > 0) {
        selectedDevices.forEach(deviceId => {
          devicePermissions[deviceId] = permissions.device_permissions || {};
        });
      }

      const requestData = {
        ...form,
        ...permissions,
        device_permissions: devicePermissions
      };

      console.log('=== ROLE CREATION DEBUG ===');
      console.log('Form data:', form);
      console.log('Permissions state:', permissions);
      console.log('Selected devices:', selectedDevices);
      console.log('Device permissions:', permissions.device_permissions);
      console.log('Formatted device permissions:', devicePermissions);
      console.log('Final request data:', requestData);
      console.log('Request data keys:', Object.keys(requestData));
      console.log('Request data types:', Object.fromEntries(
        Object.entries(requestData).map(([key, value]) => [key, typeof value])
      ));
      console.log('=== END DEBUG ===');

      const response = await fetch(`${API_BASE_URL}/roles`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();

      if (response.ok) {
        setFormSuccess('Role created successfully!');
        setOpenDialog(false);
        resetForm();
        fetchRoles();
      } else {
        console.error('Server error:', data);
        console.error('Error details:', data.details);
        setFormError(data.error || 'Failed to create role');
      }
    } catch (error) {
      console.error('Create role error:', error);
      setFormError('Failed to create role');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteRole = async (roleId, roleName) => {
    if (!window.confirm(`Are you sure you want to delete the role "${roleName}"?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/roles/${roleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        fetchRoles();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete role');
      }
    } catch (error) {
      console.error('Delete role error:', error);
      alert('Failed to delete role');
    }
  };

  const handleEditRole = async (roleId) => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/roles/${roleId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedRole(data.role);
        
        // Populate edit form with role data
        setEditForm({
          display_name: data.role.display_name || '',
          description: data.role.description || ''
        });
        
        // Populate edit permissions with role permissions
        setEditPermissions({
          menu_permissions: data.role.menu_permissions || {},
          device_permissions: data.role.device_permissions || {}
        });
        setEditSpecificDevicePermissions(data.role.specific_device_permissions ? { ...data.role.specific_device_permissions } : {});
        setEditAddDevices([]);
        setEditDialogOpen(true);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to fetch role details');
      }
    } catch (error) {
      console.error('Fetch role error:', error);
      alert('Failed to fetch role details');
    }
  };

  const resetForm = () => {
    setForm({
      role_name: '',
      display_name: '',
      description: '',
      template_name: ''
    });
    setPermissions({
      menu_permissions: {},
      device_permissions: {}
    });
    setSelectedDevices([]);
    setFormError('');
    setFormSuccess('');
  };

  const handleTemplateChange = (templateName) => {
    const template = templates.find(t => t.name === templateName);
    if (template) {
      console.log('Applying template:', templateName);
      console.log('Template permissions:', template);
      console.log('Current permissions before template:', permissions);
      
      setPermissions(prev => {
        const newPermissions = {
          menu_permissions: {
            ...prev.menu_permissions, // Preserve existing menu permissions
            ...template.menu_permissions
          },
          device_permissions: {
            ...prev.device_permissions, // Preserve existing device permissions
            ...template.device_permissions
          }
        };
        console.log('New permissions after template:', newPermissions);
        return newPermissions;
      });
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedRole) return;

    setFormLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const token = localStorage.getItem('iot_token');
      
      const requestData = {
        display_name: editForm.display_name,
        description: editForm.description,
        menu_permissions: editPermissions.menu_permissions,
        device_permissions: { ...(editPermissions.device_permissions || {}), ...editSpecificDevicePermissions }
      };

      console.log('Updating role:', selectedRole.role_id, requestData);

      const response = await fetch(`${API_BASE_URL}/roles/${selectedRole.role_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();

      if (response.ok) {
        setFormSuccess('Role updated successfully!');
        setEditDialogOpen(false);
        fetchRoles(); // Refresh the roles list
      } else {
        console.error('Server error:', data);
        setFormError(data.error || 'Failed to update role');
      }
    } catch (error) {
      console.error('Update role error:', error);
      setFormError('Failed to update role');
    } finally {
      setFormLoading(false);
    }
  };

  const updateMenuPermission = (menuPath, permission, value) => {
    console.log(`Updating menu permission: ${menuPath}.${permission} = ${value}`);
    setPermissions(prev => ({
      ...prev,
      menu_permissions: {
        ...prev.menu_permissions,
        [menuPath]: {
          ...prev.menu_permissions[menuPath],
          [permission]: value
        }
      }
    }));
  };

  const updateEditMenuPermission = (menuPath, permission, value) => {
    console.log(`Updating edit menu permission: ${menuPath}.${permission} = ${value}`);
    setEditPermissions(prev => ({
      ...prev,
      menu_permissions: {
        ...prev.menu_permissions,
        [menuPath]: {
          ...prev.menu_permissions[menuPath],
          [permission]: value
        }
      }
    }));
  };

  const updateDevicePermission = (permission, value) => {
    console.log(`Updating device permission: ${permission} = ${value}`);
    setPermissions(prev => ({
      ...prev,
      device_permissions: {
        ...prev.device_permissions,
          [permission]: value
      }
    }));
  };

  const updateEditDevicePermission = (permission, value) => {
    console.log(`Updating edit device permission: ${permission} = ${value}`);
    setEditPermissions(prev => ({
      ...prev,
      device_permissions: {
        ...prev.device_permissions,
        [permission]: value
      }
    }));
  };

  const updateEditSpecificDevicePermission = (deviceId, permission, value) => {
    setEditSpecificDevicePermissions(prev => ({
      ...prev,
      [deviceId]: {
        ...(prev[deviceId] || { read: false, write: false, delete: false, configure: false }),
        [permission]: value
      }
    }));
  };

  const removeEditSpecificDevice = (deviceId) => {
    setEditSpecificDevicePermissions(prev => {
      const next = { ...prev };
      delete next[deviceId];
      return next;
    });
  };

  const addEditSpecificDevices = (deviceIds) => {
    if (!deviceIds || deviceIds.length === 0) return;
    const defaults = { read: true, write: false, delete: false, configure: false };
    setEditSpecificDevicePermissions(prev => {
      const next = { ...prev };
      deviceIds.forEach(id => {
        if (!next[id]) next[id] = { ...defaults };
      });
      return next;
    });
    setEditAddDevices([]);
  };

  if (!canAccessMenu('/roles')) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Alert severity="error">
          You don't have permission to access the Role Manager.
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading roles...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Role Manager
        </Typography>
        {canCreate('/roles') && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Create Role
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Role Templates */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Role Templates
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Predefined role templates for quick setup
          </Typography>
          <Grid container spacing={2}>
            {templates.map((template) => (
              <Grid item xs={12} sm={6} md={4} key={template.name}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6">{template.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {template.description}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      size="small"
                      onClick={() => {
                        setForm(prev => ({ ...prev, template_name: template.name }));
                        setOpenDialog(true);
                      }}
                    >
                      Use Template
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
              </CardContent>
            </Card>

      {/* Roles Table */}
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Role Name</TableCell>
                <TableCell>Display Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Users</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
            {roles.map((role) => (
                <TableRow key={role.role_id}>
                  <TableCell>
                  <Typography variant="body2" fontWeight="bold">
                      {role.role_name}
                  </Typography>
                  </TableCell>
                  <TableCell>{role.display_name}</TableCell>
                  <TableCell>{role.description}</TableCell>
                  <TableCell>
                  <Chip
                    label={role.is_system_role ? 'System' : 'Custom'}
                    color={role.is_system_role ? 'primary' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={`${role.user_count || 0} users`}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  {new Date(role.created_at).toLocaleDateString()}
                  </TableCell>
                <TableCell>
                  <Box display="flex" gap={1}>
                    {canUpdate('/roles') && (
                      <Tooltip title="Edit Role">
                    <IconButton 
                      size="small"
                          onClick={() => handleEditRole(role.role_id)}
                    >
                          <EditIcon />
                    </IconButton>
                      </Tooltip>
                    )}
                    {canDelete('/roles') && !role.is_system_role && (
                      <Tooltip title="Delete Role">
                    <IconButton 
                      size="small" 
                      color="error"
                          onClick={() => handleDeleteRole(role.role_id, role.display_name)}
                    >
                          <DeleteIcon />
                    </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

      {/* Create Role Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create New Role</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Role Name"
                  value={form.role_name}
                  onChange={(e) => setForm(prev => ({ ...prev, role_name: e.target.value }))}
                  helperText="Unique identifier for the role"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Display Name"
                  value={form.display_name}
                  onChange={(e) => setForm(prev => ({ ...prev, display_name: e.target.value }))}
                  helperText="Human-readable name"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  multiline
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Template (Optional)</InputLabel>
                  <Select
                    value={form.template_name}
                    onChange={(e) => {
                      setForm(prev => ({ ...prev, template_name: e.target.value }));
                    }}
                  >
                    <MenuItem value="">No Template</MenuItem>
                    {templates.map((template) => (
                      <MenuItem key={template.name} value={template.name}>
                        {template.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              {form.template_name && (
                <Grid item xs={12}>
                  <Button
                    variant="outlined"
                    onClick={() => handleTemplateChange(form.template_name)}
                    startIcon={<SecurityIcon />}
                  >
                    Apply Template Permissions
                  </Button>
                </Grid>
              )}
            </Grid>

            {/* Menu Permissions */}
            <Accordion sx={{ mt: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Menu Permissions</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {Object.entries(permissions.menu_permissions || {}).map(([menuPath, perms]) => (
                    <Grid item xs={12} key={menuPath}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle1" gutterBottom>
                            {menuPath}
                          </Typography>
                          <Box display="flex" gap={2} flexWrap="wrap">
                            {Object.entries(perms).map(([perm, value]) => (
                              <FormControlLabel
                                key={perm}
                                control={
                                  <Switch
                                    checked={value}
                                    onChange={(e) => updateMenuPermission(menuPath, perm, e.target.checked)}
                                  />
                                }
                                label={perm}
                              />
                            ))}
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </AccordionDetails>
            </Accordion>

            {/* Device Permissions */}
            <Accordion sx={{ mt: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Device Permissions</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {/* Permission Toggles */}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      General Device Permissions:
                    </Typography>
                    <Box display="flex" gap={2} flexWrap="wrap">
                      {Object.entries(permissions.device_permissions || {}).map(([perm, value]) => (
                        <FormControlLabel
                          key={perm}
                          control={
                            <Switch
                              checked={value}
                              onChange={(e) => updateDevicePermission(perm, e.target.checked)}
                            />
                          }
                          label={perm}
                        />
                      ))}
                    </Box>
                  </Grid>
                  
                  {/* Device Selection */}
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Select Specific Devices:
                    </Typography>
                    <FormControl fullWidth>
                      <InputLabel>Devices</InputLabel>
                      <Select
                        multiple
                        value={selectedDevices}
                        onChange={(e) => setSelectedDevices(e.target.value)}
                        renderValue={(selected) => (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {selected.map((value) => {
                              const device = devices.find(d => d.device_id === value);
                              return (
                                <Chip 
                                  key={value} 
                                  label={device ? device.name : value} 
                                  size="small" 
                                />
                              );
                            })}
            </Box>
                        )}
                      >
                        {devices.map((device) => (
                          <MenuItem key={device.device_id} value={device.device_id}>
                            {device.name} ({device.device_id})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Selected devices will have the permissions above applied to them
                    </Typography>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button
            onClick={handleCreateRole}
            variant="contained"
            disabled={formLoading || !form.role_name || !form.display_name}
          >
            {formLoading ? 'Creating...' : 'Create Role'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Role Dialog */}
       <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Role: {selectedRole?.display_name}</DialogTitle>
        <DialogContent>
           <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
               <Grid item xs={12} sm={6}>
                 <TextField
                   fullWidth
                   label="Role Name"
                   value={selectedRole?.role_name || ''}
                   disabled
                   helperText="Role name cannot be changed"
                 />
               </Grid>
               <Grid item xs={12} sm={6}>
                <TextField
                   fullWidth
                  label="Display Name"
                   value={editForm.display_name}
                   onChange={(e) => setEditForm(prev => ({ ...prev, display_name: e.target.value }))}
                   helperText="Display name for the role"
                />
              </Grid>
               <Grid item xs={12}>
                <TextField
                   fullWidth
                  label="Description"
                  multiline
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  helperText="Description of the role"
                />
              </Grid>
            </Grid>

             {/* Menu Permissions */}
             <Accordion sx={{ mt: 2 }}>
               <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                 <Typography variant="h6">Menu Permissions</Typography>
               </AccordionSummary>
               <AccordionDetails>
                 <Grid container spacing={2}>
                   {Object.entries(editPermissions.menu_permissions || {}).map(([menuPath, perms]) => (
                     <Grid item xs={12} key={menuPath}>
                       <Card variant="outlined">
                         <CardContent>
                           <Typography variant="subtitle1" gutterBottom>
                             {menuPath}
                           </Typography>
                           <Box display="flex" gap={2} flexWrap="wrap">
                             {Object.entries(perms).map(([perm, value]) => (
                               <FormControlLabel
                                 key={perm}
                                 control={
                                   <Switch
                                     checked={value}
                                     onChange={(e) => updateEditMenuPermission(menuPath, perm, e.target.checked)}
                                   />
                                 }
                                 label={perm}
                               />
                             ))}
                           </Box>
                         </CardContent>
                       </Card>
                     </Grid>
                   ))}
                 </Grid>
               </AccordionDetails>
             </Accordion>

             {/* Device Permissions */}
             <Accordion sx={{ mt: 2 }}>
               <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                 <Typography variant="h6">Device Permissions</Typography>
               </AccordionSummary>
               <AccordionDetails>
                 <Grid container spacing={2}>
                   <Grid item xs={12}>
                     <Typography variant="subtitle2" gutterBottom>
                       General Device Permissions:
                     </Typography>
                     <Box display="flex" gap={2} flexWrap="wrap">
                       {Object.entries(editPermissions.device_permissions || {}).map(([perm, value]) => (
                         <FormControlLabel
                           key={perm}
                           control={
                             <Switch
                               checked={value}
                               onChange={(e) => updateEditDevicePermission(perm, e.target.checked)}
                             />
                           }
                           label={perm}
                         />
                       ))}
                     </Box>
                   </Grid>
                   <Grid item xs={12}>
                     <Typography variant="subtitle2" gutterBottom>
                       Specific Device Permissions:
                     </Typography>
                     <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                       <FormControl size="small" sx={{ minWidth: 220 }}>
                         <InputLabel>Add device(s)</InputLabel>
                         <Select
                           multiple
                           value={editAddDevices}
                           onChange={(e) => setEditAddDevices(e.target.value)}
                           renderValue={(selected) => (
                             <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                               {selected.map((id) => {
                                 const d = devices.find(x => x.device_id === id);
                                 return <Chip key={id} label={d ? d.name : id} size="small" />;
                               })}
                             </Box>
                           )}
                           label="Add device(s)"
                         >
                           {devices
                             .filter(d => !Object.keys(editSpecificDevicePermissions).includes(d.device_id))
                             .map((device) => (
                               <MenuItem key={device.device_id} value={device.device_id}>
                                 {device.name} ({device.device_id})
                               </MenuItem>
                             ))}
                         </Select>
                       </FormControl>
                       <Button
                         variant="outlined"
                         size="small"
                         startIcon={<AddIcon />}
                         onClick={() => addEditSpecificDevices(editAddDevices)}
                         disabled={!editAddDevices || editAddDevices.length === 0}
                       >
                         Add
                       </Button>
                     </Box>
                     <Box display="flex" gap={2} flexWrap="wrap">
                       {Object.entries(editSpecificDevicePermissions).map(([deviceId, perms]) => (
                         <Card variant="outlined" key={deviceId} sx={{ p: 1.5, minWidth: 200 }}>
                           <Box display="flex" alignItems="flex-start" justifyContent="space-between">
                             <Typography variant="body2" fontWeight="bold">
                               {devices.find(d => d.device_id === deviceId)?.name || deviceId}
                             </Typography>
                             <Tooltip title="Unassign device">
                               <IconButton
                                 size="small"
                                 color="error"
                                 onClick={() => removeEditSpecificDevice(deviceId)}
                               >
                                 <DeleteIcon fontSize="small" />
                               </IconButton>
                             </Tooltip>
                           </Box>
                           <Box display="flex" gap={2} flexWrap="wrap" sx={{ mt: 0.5 }}>
                             {['read', 'write', 'delete', 'configure'].map((perm) => (
                               <FormControlLabel
                                 key={perm}
                                 control={
                                   <Switch
                                     size="small"
                                     checked={!!(perms && perms[perm])}
                                     onChange={(e) => updateEditSpecificDevicePermission(deviceId, perm, e.target.checked)}
                                   />
                                 }
                                 label={perm}
                               />
                             ))}
                           </Box>
                         </Card>
                       ))}
                     </Box>
                   </Grid>
                 </Grid>
               </AccordionDetails>
             </Accordion>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleUpdateRole}
            variant="contained"
            disabled={formLoading || !editForm.display_name}
          >
            {formLoading ? 'Updating...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

       {/* Success/Error Messages */}
       {formSuccess && (
         <Alert severity="success" sx={{ mt: 2 }}>
           {formSuccess}
         </Alert>
       )}
       {formError && (
         <Alert severity="error" sx={{ mt: 2 }}>
           {formError}
            </Alert>
          )}
    </Box>
  );
 };

export default RoleManager; 