import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  CloudSync as CloudSyncIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import userPreferencesService from '../services/userPreferencesService';

const UserPreferencesTest = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setIsAuthenticated(userPreferencesService.isAuthenticated());
  }, []);

  const testUserPreferences = async () => {
    setIsLoading(true);
    setTestResults(null);

    try {
      const results = {
        isAuthenticated: userPreferencesService.isAuthenticated(),
        serverPreferences: null,
        saveResult: null,
        syncResult: null,
      };

      // Test 1: Get user preferences
      try {
        results.serverPreferences = await userPreferencesService.getUserPreferences();
        results.serverSuccess = true;
      } catch (error) {
        results.serverError = error.message;
        results.serverSuccess = false;
      }

      // Test 2: Save test preferences
      try {
        const testPreferences = {
          theme: 'kima',
          customColors: {
            sidebar: '#007BA7',
            accent: '#F59E0B',
            background: '#F8FAFC',
            card: '#FFFFFF',
            text: '#1F2937',
          },
          testData: 'This is a test preference',
          timestamp: new Date().toISOString(),
        };

        results.saveResult = await userPreferencesService.saveUserPreferences(testPreferences);
        results.saveSuccess = results.saveResult;
      } catch (error) {
        results.saveError = error.message;
        results.saveSuccess = false;
      }

      // Test 3: Sync with server
      try {
        results.syncResult = await userPreferencesService.syncWithServer();
        results.syncSuccess = results.syncResult;
      } catch (error) {
        results.syncError = error.message;
        results.syncSuccess = false;
      }

      setTestResults(results);
    } catch (error) {
      setTestResults({
        error: error.message,
        isAuthenticated: userPreferencesService.isAuthenticated(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (success) => {
    if (success === true) return <CheckCircleIcon color="success" />;
    if (success === false) return <ErrorIcon color="error" />;
    return <CloudSyncIcon color="warning" />;
  };

  const getStatusColor = (success) => {
    if (success === true) return 'success';
    if (success === false) return 'error';
    return 'warning';
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          User Preferences Service Test
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Chip
            icon={isAuthenticated ? <CheckCircleIcon /> : <ErrorIcon />}
            label={isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
            color={isAuthenticated ? 'success' : 'error'}
            sx={{ mb: 2 }}
          />
        </Box>

        <Button
          variant="contained"
          startIcon={isLoading ? <CircularProgress size={20} /> : <CloudSyncIcon />}
          onClick={testUserPreferences}
          disabled={isLoading}
          sx={{ mb: 2 }}
        >
          {isLoading ? 'Testing...' : 'Test User Preferences Service'}
        </Button>

        {testResults && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Test Results
            </Typography>

            {/* Authentication Status */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Authentication:</strong>
              </Typography>
              <Chip
                icon={getStatusIcon(testResults.isAuthenticated)}
                label={testResults.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
                color={getStatusColor(testResults.isAuthenticated)}
                size="small"
              />
            </Box>

            {/* Server Preferences Test */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Get Server Preferences:</strong>
              </Typography>
              <Chip
                icon={getStatusIcon(testResults.serverSuccess)}
                label={testResults.serverSuccess ? 'Success' : 'Failed'}
                color={getStatusColor(testResults.serverSuccess)}
                size="small"
              />
              {testResults.serverError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {testResults.serverError}
                </Alert>
              )}
              {testResults.serverPreferences && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Data: {JSON.stringify(testResults.serverPreferences, null, 2)}
                </Typography>
              )}
            </Box>

            {/* Save Preferences Test */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Save Preferences:</strong>
              </Typography>
              <Chip
                icon={getStatusIcon(testResults.saveSuccess)}
                label={testResults.saveSuccess ? 'Success' : 'Failed'}
                color={getStatusColor(testResults.saveSuccess)}
                size="small"
              />
              {testResults.saveError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {testResults.saveError}
                </Alert>
              )}
            </Box>

            {/* Sync Test */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Sync with Server:</strong>
              </Typography>
              <Chip
                icon={getStatusIcon(testResults.syncSuccess)}
                label={testResults.syncSuccess ? 'Success' : 'Failed'}
                color={getStatusColor(testResults.syncSuccess)}
                size="small"
              />
              {testResults.syncError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {testResults.syncError}
                </Alert>
              )}
            </Box>

            {/* General Error */}
            {testResults.error && (
              <Alert severity="error">
                <strong>General Error:</strong> {testResults.error}
              </Alert>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default UserPreferencesTest;



