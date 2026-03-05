import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  Grid,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Snackbar,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Business as BusinessIcon,
  LocationOn as LocationOnIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

const CompanySite = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [devices, setDevices] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    // Company fields
    company_name: '',
    address: '',
    contact_person_name: '',
    contact_person_phone: '',
    // Site fields
    site_name: '',
    company_id: null,
    user_ids: [],
    device_ids: [],
    description: '',
    location: ''
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Fetch data on component mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const token = localStorage.getItem('iot_token');
    const headers = { 'Authorization': `Bearer ${token}` };

    const [companiesRes, sitesRes, devicesRes, usersRes] = await Promise.allSettled([
      axios.get(`${API_BASE_URL}/companies`, { headers }),
      axios.get(`${API_BASE_URL}/sites`, { headers }),
      axios.get(`${API_BASE_URL}/devices/dropdown`, { headers }),
      axios.get(`${API_BASE_URL}/users/dropdown`, { headers })
    ]);

    if (companiesRes.status === 'fulfilled') {
      const data = companiesRes.value?.data ?? [];
      setCompanies((prev) => (data.length > 0 ? data : prev));
    }
    if (sitesRes.status === 'fulfilled') {
      const data = sitesRes.value?.data ?? [];
      setSites((prev) => (data.length > 0 ? data : prev));
    }
    if (devicesRes.status === 'fulfilled') setDevices(devicesRes.value?.data ?? []);
    if (usersRes.status === 'fulfilled') setUsers(usersRes.value?.data ?? []);
    if (sitesRes.status === 'rejected') console.error('Error fetching sites:', sitesRes.reason);
    if (companiesRes.status === 'rejected') console.error('Error fetching companies:', companiesRes.reason);

    setLoading(false);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleOpenDialog = (item = null, type = 'company') => {
    setEditingItem(item);
    if (item) {
      setFormData({
        company_name: item.company_name || '',
        address: item.address || '',
        contact_person_name: item.contact_person_name || '',
        contact_person_phone: item.contact_person_phone || '',
        site_name: item.site_name || '',
        company_id: item.company_id || null,
        user_ids: item.assigned_users ? item.assigned_users.map(username => {
          const user = users.find(u => u.username === username);
          return user ? user.user_id : null;
        }).filter(id => id !== null) : [],
        device_ids: item.assigned_devices ? item.assigned_devices.map(deviceName => {
          const device = devices.find(d => d.name === deviceName);
          return device ? device.device_id : null;
        }).filter(id => id !== null) : [],
        description: item.description || '',
        location: item.location || ''
      });
    } else {
      setFormData({
        company_name: '',
        address: '',
        contact_person_name: '',
        contact_person_phone: '',
        site_name: '',
        company_id: null,
        user_ids: [],
        device_ids: [],
        description: '',
        location: ''
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
    setFormData({
      company_name: '',
      address: '',
      contact_person_name: '',
      contact_person_phone: '',
      site_name: '',
      company_id: null,
      user_ids: [],
      device_ids: [],
      description: '',
      location: ''
    });
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      if (activeTab === 0) {
        // Save company
        const companyData = {
          company_name: formData.company_name,
          address: formData.address,
          contact_person_name: formData.contact_person_name,
          contact_person_phone: formData.contact_person_phone
        };

        if (editingItem) {
          await axios.put(`${API_BASE_URL}/companies/${editingItem.company_id}`, companyData, { headers });
        } else {
          const createRes = await axios.post(`${API_BASE_URL}/companies`, companyData, { headers });
          setCompanies((prev) => [...prev, createRes.data]);
        }
      } else {
        // Save site
        const siteData = {
          site_name: formData.site_name,
          company_id: formData.company_id,
          user_ids: formData.user_ids,
          device_ids: formData.device_ids,
          description: formData.description,
          location: formData.location
        };

        if (editingItem) {
          await axios.put(`${API_BASE_URL}/sites/${editingItem.site_id}`, siteData, { headers });
        } else {
          const createRes = await axios.post(`${API_BASE_URL}/sites`, siteData, { headers });
          setSites((prev) => [...prev, createRes.data]);
        }
      }

      handleCloseDialog();
      // Only refetch after edit so list isn't overwritten; after create the new item is already in state
      if (editingItem) fetchData();
      const entity = activeTab === 0 ? 'Company' : 'Site';
      setSnackbar({ open: true, message: `${entity} saved successfully`, severity: 'success' });
    } catch (error) {
      console.error('Error saving data:', error);
      const status = error.response?.status;
      const serverMessage = error.response?.data?.error;
      const message =
        status === 409
          ? (serverMessage || (activeTab === 0 ? 'Company name already exists.' : 'Site name already exists.'))
          : (serverMessage || 'Failed to save. Please try again.');
      setSnackbar({ open: true, message, severity: 'error' });
    }
  };

  const handleDelete = async (id, type) => {
    if (!window.confirm(`Are you sure you want to delete this ${type}?`)) return;

    try {
      const token = localStorage.getItem('iot_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      if (type === 'company') {
        await axios.delete(`${API_BASE_URL}/companies/${id}`, { headers });
      } else {
        await axios.delete(`${API_BASE_URL}/sites/${id}`, { headers });
      }

      fetchData();
      setSnackbar({ open: true, message: `${type} deleted successfully`, severity: 'success' });
    } catch (error) {
      console.error('Error deleting data:', error);
      const serverMessage = error.response?.data?.error;
      setSnackbar({ open: true, message: serverMessage || `Failed to delete ${type}. Please try again.`, severity: 'error' });
    }
  };

  // Company columns
  const companyColumns = [
    { field: 'company_name', headerName: 'Company Name', width: 200, headerAlign: 'center' },
    { field: 'address', headerName: 'Address', width: 250, headerAlign: 'center' },
    { field: 'contact_person_name', headerName: 'Contact Person', width: 150, headerAlign: 'center' },
    { field: 'contact_person_phone', headerName: 'Phone', width: 130, headerAlign: 'center' },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => handleOpenDialog(params.row, 'company')}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => handleDelete(params.row.company_id, 'company')} color="error">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )
    }
  ];

  // Site columns
  const siteColumns = [
    { field: 'site_name', headerName: 'Site Name', width: 180, headerAlign: 'center' },
    { field: 'company_name', headerName: 'Company', width: 150, headerAlign: 'center' },
    { 
      field: 'assigned_users', 
      headerName: 'Users', 
      width: 150, 
      headerAlign: 'center',
      renderCell: (params) => (
        <Box>
          {params.value && params.value.length > 0 ? (
            params.value.length === 1 ? (
              <Chip label={params.value[0]} size="small" />
            ) : (
              <Chip label={`${params.value.length} users`} size="small" />
            )
          ) : (
            <Typography variant="caption" color="text.secondary">No users</Typography>
          )}
        </Box>
      )
    },
    { 
      field: 'assigned_devices', 
      headerName: 'Devices', 
      width: 150, 
      headerAlign: 'center',
      renderCell: (params) => (
        <Box>
          {params.value && params.value.length > 0 ? (
            params.value.length === 1 ? (
              <Chip label={params.value[0]} size="small" />
            ) : (
              <Chip label={`${params.value.length} devices`} size="small" />
            )
          ) : (
            <Typography variant="caption" color="text.secondary">No devices</Typography>
          )}
        </Box>
      )
    },
    { field: 'location', headerName: 'Location', width: 150, headerAlign: 'center' },
    { field: 'description', headerName: 'Description', width: 200, headerAlign: 'center' },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => handleOpenDialog(params.row, 'site')}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => handleDelete(params.row.site_id, 'site')} color="error">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )
    }
  ];

  // Enhanced sites data with related names (only include rows that have site_id for Data Grid id)
  const enhancedSites = Array.isArray(sites)
    ? sites
        .filter((site) => site?.site_id != null)
        .map((site) => ({
          ...site,
          company_name: Array.isArray(companies) ? companies.find((c) => c.company_id === site.company_id)?.company_name || 'N/A' : 'N/A',
          assigned_users: site.assigned_users || [],
          assigned_devices: site.assigned_devices || []
        }))
    : [];

  const companyRows = Array.isArray(companies) ? companies.filter((c) => c?.company_id != null) : [];
  const siteRows = enhancedSites;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 600, color: '#007BA7' }}>
        Company and Site Management
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 2 }}>
            <Tab 
              icon={<BusinessIcon />} 
              label="Companies" 
              sx={{ fontSize: '0.875rem', fontWeight: 600 }}
            />
            <Tab 
              icon={<LocationOnIcon />} 
              label="Sites" 
              sx={{ fontSize: '0.875rem', fontWeight: 600 }}
            />
          </Tabs>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {activeTab === 0 ? 'Company List' : 'Site List'}
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog(null, activeTab === 0 ? 'company' : 'site')}
              sx={{ 
                fontSize: '0.875rem',
                fontWeight: 600,
                px: 2,
                py: 1
              }}
            >
              Add {activeTab === 0 ? 'Company' : 'Site'}
            </Button>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <DataGrid
              autoHeight
              rows={activeTab === 0 ? companyRows : siteRows}
              columns={activeTab === 0 ? companyColumns : siteColumns}
              getRowId={(row) => (activeTab === 0 ? row.company_id : row.site_id)}
              pageSize={10}
              rowsPerPageOptions={[10, 25, 50]}
              sx={{
                border: 'none',
                fontSize: '0.875rem',
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: '#f8fafc',
                  fontWeight: 600,
                  fontSize: '0.875rem'
                },
                '& .MuiDataGrid-cell': {
                  fontSize: '0.8rem',
                  py: 1
                }
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
          {editingItem ? 'Edit' : 'Add'} {activeTab === 0 ? 'Company' : 'Site'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {activeTab === 0 ? (
              // Company form fields
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Company Name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    size="small"
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    multiline
                    rows={2}
                    size="small"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Contact Person Name"
                    value={formData.contact_person_name}
                    onChange={(e) => setFormData({ ...formData, contact_person_name: e.target.value })}
                    size="small"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Contact Person Phone"
                    value={formData.contact_person_phone}
                    onChange={(e) => setFormData({ ...formData, contact_person_phone: e.target.value })}
                    size="small"
                  />
                </Grid>
              </>
            ) : (
              // Site form fields
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Site Name"
                    value={formData.site_name}
                    onChange={(e) => setFormData({ ...formData, site_name: e.target.value })}
                    size="small"
                    required
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Company</InputLabel>
                    <Select
                      value={formData.company_id || ''}
                      label="Company"
                      onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                    >
                      {Array.isArray(companies) ? companies.map((company) => (
                        <MenuItem key={company.company_id} value={company.company_id}>
                          {company.company_name}
                        </MenuItem>
                      )) : []}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Users</InputLabel>
                    <Select
                      multiple
                      value={formData.user_ids || []}
                      label="Users"
                      onChange={(e) => setFormData({ ...formData, user_ids: e.target.value })}
                      renderValue={(selected) => {
                        if (selected.length === 0) return '';
                        if (selected.length === 1) {
                          const user = users.find(u => u.user_id === selected[0]);
                          return user ? user.username : '';
                        }
                        return `${selected.length} users selected`;
                      }}
                    >
                      {Array.isArray(users) ? users.map((user) => (
                        <MenuItem key={user.user_id} value={user.user_id}>
                          {user.username}
                        </MenuItem>
                      )) : []}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Devices</InputLabel>
                    <Select
                      multiple
                      value={formData.device_ids || []}
                      label="Devices"
                      onChange={(e) => setFormData({ ...formData, device_ids: e.target.value })}
                      renderValue={(selected) => {
                        if (selected.length === 0) return '';
                        if (selected.length === 1) {
                          const device = devices.find(d => d.device_id === selected[0]);
                          return device ? device.name : '';
                        }
                        return `${selected.length} devices selected`;
                      }}
                    >
                      {Array.isArray(devices) ? devices.map((device) => (
                        <MenuItem key={device.device_id} value={device.device_id}>
                          {device.name}
                        </MenuItem>
                      )) : []}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    multiline
                    rows={2}
                    size="small"
                  />
                </Grid>
              </>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDialog} startIcon={<CancelIcon />} size="small">
            Cancel
          </Button>
          <Button onClick={handleSave} startIcon={<SaveIcon />} variant="contained" size="small">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CompanySite;
