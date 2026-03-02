import React, { useState, useEffect } from 'react';
import FontSettings from './FontSettings';
import ThemeSelector from './ThemeSelector';
import ColorCustomizer from './ColorCustomizer';
import ParameterColorQuickAccess from './ParameterColorQuickAccess';
import FontColorCustomizer from './FontColorCustomizer';
import ThemeSyncStatus from './ThemeSyncStatus';
import UserPreferencesTest from './UserPreferencesTest';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
  Security as SecurityIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  FormatSize as FormatSizeIcon,
} from '@mui/icons-material';

import { API_BASE_URL } from '../config/api';
import moment from 'moment-timezone';
import { TIMEZONE_OPTIONS, getUserTimezone } from '../utils/timezoneUtils';

const Settings = ({ user, onFontChange }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [profileData, setProfileData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    timezone: user?.timezone || 'UTC',
    theme: localStorage.getItem('aksadata-theme') || 'light',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    realTimeUpdates: true,
    autoRefresh: true,
    refreshInterval: 30,
    timezone: getUserTimezone(),
  });

  const handleProfileChange = (field) => (event) => {
    setProfileData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handlePasswordChange = (field) => (event) => {
    setPasswordData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handlePreferenceChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setPreferences(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'timezone') {
        localStorage.setItem('iot_timezone', value);
      }
      return updated;
    });
  };

  const handleProfileUpdate = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(profileData),
      });

      if (response.ok) {
        setSuccess('Profile updated successfully!');
        // Update local storage with new user data
        const updatedUser = { ...user, ...profileData };
        localStorage.setItem('iot_user', JSON.stringify(updatedUser));
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update profile');
      }
    } catch (error) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      if (response.ok) {
        setSuccess('Password updated successfully!');
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update password');
      }
    } catch (error) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handlePreferencesSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        setSuccess('Preferences saved successfully!');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save preferences');
      }
    } catch (error) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Profile Settings */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <PersonIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Profile Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Card>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        label="Username"
                        value={profileData.username}
                        onChange={handleProfileChange('username')}
                        disabled
                        helperText="Username cannot be changed"
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        label="Email"
                        type="email"
                        value={profileData.email}
                        onChange={handleProfileChange('email')}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <FormControl fullWidth>
                        <InputLabel>Timezone</InputLabel>
                        <Select
                          value={profileData.timezone}
                          onChange={handleProfileChange('timezone')}
                          label="Timezone"
                        >
                          {TIMEZONE_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Button
                        variant="contained"
                        onClick={handleProfileUpdate}
                        disabled={loading}
                        fullWidth
                      >
                        {loading ? <CircularProgress size={20} /> : 'Update Profile'}
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Security Settings */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <SecurityIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Security Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Card>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        label="Current Password"
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={handlePasswordChange('currentPassword')}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        label="New Password"
                        type="password"
                        value={passwordData.newPassword}
                        onChange={handlePasswordChange('newPassword')}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        label="Confirm New Password"
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={handlePasswordChange('confirmPassword')}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Button
                        variant="contained"
                        onClick={handlePasswordUpdate}
                        disabled={loading}
                        fullWidth
                      >
                        {loading ? <CircularProgress size={20} /> : 'Update Password'}
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Application Preferences */}
        <Grid size={{ xs: 12 }}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <SettingsIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Application Preferences</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Card>
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Typography variant="h6" gutterBottom>
                        Notifications
                      </Typography>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={preferences.emailNotifications}
                            onChange={handlePreferenceChange('emailNotifications')}
                          />
                        }
                        label="Email Notifications"
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={preferences.realTimeUpdates}
                            onChange={handlePreferenceChange('realTimeUpdates')}
                          />
                        }
                        label="Real-time Updates"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Typography variant="h6" gutterBottom>
                        Appearance
                      </Typography>
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          Theme
                        </Typography>
                        <ThemeSelector variant="chips" size="medium" />
                      </Box>
                      
                      {/* Parameter Color Quick Access */}
                      <Box sx={{ mb: 3 }}>
                        <ParameterColorQuickAccess />
                      </Box>

                      {/* User Preferences Test */}
                      <Box sx={{ mb: 3 }}>
                        <UserPreferencesTest />
                      </Box>

                      {/* Theme Sync Status */}
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          Theme Sync Status
                        </Typography>
                        <ThemeSyncStatus showDetails={true} />
                      </Box>

                      {/* Font Color & Size Customization */}
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          Font Color & Size Customization
                        </Typography>
                        <FontColorCustomizer />
                      </Box>

                      {/* Color Customization - Show for all themes */}
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          Theme Color Customization
                        </Typography>
                        <ColorCustomizer 
                          onColorChange={(colors) => {
                            // Colors are automatically saved to localStorage
                            // Force a re-render by updating a dummy state
                            setProfileData(prev => ({ ...prev }));
                          }}
                          currentTheme={profileData.theme}
                        />
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Typography variant="h6" gutterBottom>
                        Data & Timezone
                      </Typography>
                      <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>User Timezone</InputLabel>
                        <Select
                          value={preferences.timezone}
                          onChange={handlePreferenceChange('timezone')}
                          label="User Timezone"
                          MenuProps={{ style: { maxHeight: 400 } }}
                        >
                          {TIMEZONE_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={preferences.autoRefresh}
                            onChange={handlePreferenceChange('autoRefresh')}
                          />
                        }
                        label="Auto Refresh"
                      />
                      <TextField
                        fullWidth
                        label="Refresh Interval (seconds)"
                        type="number"
                        value={preferences.refreshInterval}
                        onChange={handlePreferenceChange('refreshInterval')}
                        disabled={!preferences.autoRefresh}
                        sx={{ mt: 2 }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Button
                        variant="contained"
                        onClick={handlePreferencesSave}
                        disabled={loading}
                      >
                        {loading ? <CircularProgress size={20} /> : 'Save Preferences'}
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* System Information */}
        <Grid size={{ xs: 12 }}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <NotificationsIcon sx={{ mr: 1 }} />
              <Typography variant="h6">System Information</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Card>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        User ID
                      </Typography>
                      <Typography variant="body1" gutterBottom>
                        {user?.id}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Role
                      </Typography>
                      <Typography variant="body1" gutterBottom>
                        {user?.role}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Account Created
                      </Typography>
                      <Typography variant="body1" gutterBottom>
                        {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Last Login
                      </Typography>
                      <Typography variant="body1" gutterBottom>
                        {user?.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Font Settings */}
        <Grid size={{ xs: 12 }}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <FormatSizeIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Font Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FontSettings onFontChange={onFontChange} />
            </AccordionDetails>
          </Accordion>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Settings; 