import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
} from '@mui/icons-material';

import { API_BASE_URL } from '../config/api';
import {
  VALUE_KIND_OPTIONS,
  inferValueKind,
  valueKindLabel,
} from '../utils/valueKind';
import { invalidateFieldMetadataCache } from '../hooks/useFieldMetadata';

const FieldCreator = () => {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [formData, setFormData] = useState({
    field_name: '',
    display_name: '',
    data_type: 'string',
    unit: '',
    description: '',
    category: '',
    is_standard: true,
    status_keywords: '',
    display_min: '',
    display_max: '',
    value_kind: 'auto',
  });

  const dataTypes = ['string', 'number', 'boolean', 'timestamp', 'json'];
  const categories = [
    'Water Quality',
    'Temperature',
    'Humidity',
    'Pressure',
    'Flow',
    'Electrical',
    'Location',
    'Status',
    'Other'
  ];

  useEffect(() => {
    loadFields();
  }, []);

  const loadFields = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/field-definitions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setFields(data.fields || []);
      } else {
        setError('Failed to load field definitions');
      }
    } catch (error) {
      console.error('Failed to load fields:', error);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (field = null) => {
    if (field) {
      setEditingField(field);
      setFormData({
        field_name: field.field_name || '',
        display_name: field.display_name || '',
        data_type: field.data_type || 'string',
        unit: field.unit || '',
        description: field.description || '',
        category: field.category || '',
        is_standard: field.is_standard !== false,
        status_keywords: field.status_keywords || '',
        display_min: field.display_min === null || field.display_min === undefined ? '' : String(field.display_min),
        display_max: field.display_max === null || field.display_max === undefined ? '' : String(field.display_max),
        value_kind: field.value_kind || 'auto',
      });
    } else {
      setEditingField(null);
      setFormData({
        field_name: '',
        display_name: '',
        data_type: 'string',
        unit: '',
        description: '',
        category: '',
        is_standard: true,
        status_keywords: '',
        display_min: '',
        display_max: '',
        value_kind: 'auto',
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingField(null);
    setFormData({
      field_name: '',
      display_name: '',
      data_type: 'string',
      unit: '',
      description: '',
      category: '',
      is_standard: true,
      status_keywords: '',
      display_min: '',
      display_max: '',
      value_kind: 'auto',
    });
  };

  const suggestedValueKind = useMemo(
    () =>
      inferValueKind({
        unit: formData.unit,
        category: formData.category,
        fieldName: formData.field_name,
      }),
    [formData.unit, formData.category, formData.field_name]
  );

  const selectedValueKindOption = VALUE_KIND_OPTIONS.find((o) => o.value === formData.value_kind)
    || VALUE_KIND_OPTIONS[0];

  const handleInputChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSwitchChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.checked,
    }));
  };

  const handleSubmit = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      
      // Validate required fields
      if (!formData.field_name.trim() || !formData.display_name.trim()) {
        setError('Field name and display name are required');
        return;
      }

      const url = editingField 
        ? `${API_BASE_URL}/field-definitions/${editingField.field_id}`
        : `${API_BASE_URL}/field-definitions`;
      
      const method = editingField ? 'PUT' : 'POST';

      const payload = {
        ...formData,
        value_kind: formData.value_kind === 'auto' ? null : formData.value_kind,
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        invalidateFieldMetadataCache();
        handleCloseDialog();
        loadFields();
        setError('');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save field definition');
      }
    } catch (error) {
      console.error('Submit error:', error);
      setError('Network error');
    }
  };

  const handleDelete = async (fieldId) => {
    if (!window.confirm('Are you sure you want to delete this field definition?')) {
      return;
    }

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/field-definitions/${fieldId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        loadFields();
        setError('');
      } else {
        setError('Failed to delete field definition');
      }
    } catch (error) {
      console.error('Delete error:', error);
      setError('Network error');
    }
  };

  const filteredFields = fields.filter(field =>
    field.field_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    field.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    field.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDataTypeColor = (type) => {
    const colors = {
      string: 'primary',
      number: 'success',
      boolean: 'warning',
      timestamp: 'info',
      json: 'secondary'
    };
    return colors[type] || 'default';
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Field Creator</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Field Definition
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Search field definitions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />
        </CardContent>
      </Card>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Field Name</TableCell>
              <TableCell>Display Name</TableCell>
              <TableCell>Data Type</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell>Value kind</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Standard</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredFields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  {searchTerm ? 'No fields match your search' : 'No field definitions found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredFields.map((field) => (
                <TableRow key={field.field_id}>
                  <TableCell>
                    <Typography variant="subtitle2">{field.field_name}</Typography>
                    {field.description && (
                      <Typography variant="body2" color="text.secondary">
                        {field.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{field.display_name}</TableCell>
                  <TableCell>
                    <Chip 
                      label={field.data_type} 
                      color={getDataTypeColor(field.data_type)}
                      size="small" 
                    />
                  </TableCell>
                  <TableCell>{field.unit || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={
                        field.value_kind
                          ? valueKindLabel(field.value_kind)
                          : `Auto → ${valueKindLabel(inferValueKind({ unit: field.unit, category: field.category, fieldName: field.field_name }))}`
                      }
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={field.category} 
                      variant="outlined"
                      size="small" 
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={field.is_standard ? 'Yes' : 'No'}
                      color={field.is_standard ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(field)}
                      color="primary"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(field.field_id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Field Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingField ? 'Edit Field Definition' : 'Add New Field Definition'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Field Name"
                value={formData.field_name}
                onChange={handleInputChange('field_name')}
                placeholder="e.g., temperature_celsius"
                required
                disabled={editingField !== null}
                helperText="Unique identifier for the field"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Display Name"
                value={formData.display_name}
                onChange={handleInputChange('display_name')}
                placeholder="e.g., Temperature (°C)"
                required
                helperText="Human-readable name"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Data Type</InputLabel>
                <Select
                  value={formData.data_type}
                  onChange={handleInputChange('data_type')}
                  label="Data Type"
                >
                  {dataTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Unit"
                value={formData.unit}
                onChange={handleInputChange('unit')}
                placeholder="e.g., °C, mg/L, L/min"
                helperText="Measurement unit (optional)"
              />
            </Grid>
            {formData.data_type === 'number' && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Value kind</InputLabel>
                  <Select
                    value={formData.value_kind}
                    onChange={handleInputChange('value_kind')}
                    label="Value kind"
                  >
                    {VALUE_KIND_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                    {selectedValueKindOption.helper}
                    {formData.value_kind === 'auto'
                      ? ` Inferred: ${valueKindLabel(suggestedValueKind)}.`
                      : ''}
                  </Typography>
                </FormControl>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={formData.category}
                  onChange={handleInputChange('category')}
                  label="Category"
                >
                  {categories.map((category) => (
                    <MenuItem key={category} value={category}>
                      {category}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_standard}
                    onChange={handleSwitchChange('is_standard')}
                  />
                }
                label="Standard Field"
              />
            </Grid>
            {formData.data_type === 'number' && (
              <>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Display Min"
                    value={formData.display_min}
                    onChange={handleInputChange('display_min')}
                    placeholder="e.g., 0"
                    helperText="Low end of the dashboard gauge scale (optional)"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Display Max"
                    value={formData.display_max}
                    onChange={handleInputChange('display_max')}
                    placeholder="e.g., 14"
                    helperText="High end of the dashboard gauge scale (optional)"
                  />
                </Grid>
              </>
            )}
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Description"
                value={formData.description}
                onChange={handleInputChange('description')}
                multiline
                rows={3}
                placeholder="Describe what this field represents..."
              />
            </Grid>
            {formData.category === 'Status' && (
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Status distribution keywords"
                  value={formData.status_keywords}
                  onChange={handleInputChange('status_keywords')}
                  placeholder="e.g. sukses, success, false, true"
                  helperText="Comma-separated words used to group status text on the Status chart (case-insensitive match inside the value)."
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingField ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FieldCreator; 