import React, { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Button,
  CircularProgress,
} from '@mui/material';
import {
  CloudSync as CloudSyncIcon,
  CloudDone as CloudDoneIcon,
  CloudOff as CloudOffIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useUserTheme } from '../contexts/UserThemeContext';

const ThemeSyncStatus = ({ showDetails = false }) => {
  const { 
    isServerSync, 
    syncWithServer, 
    syncError, 
    isLoading 
  } = useUserTheme();
  
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncWithServer();
    } finally {
      setIsSyncing(false);
    }
  };

  const getSyncIcon = () => {
    if (isLoading || isSyncing) {
      return <CircularProgress size={16} />;
    }
    
    if (syncError) {
      return <CloudOffIcon color="error" />;
    }
    
    if (isServerSync) {
      return <CloudDoneIcon color="success" />;
    }
    
    return <CloudOffIcon color="warning" />;
  };

  const getSyncStatus = () => {
    if (isLoading || isSyncing) {
      return 'Syncing...';
    }
    
    if (syncError) {
      return 'Sync Error';
    }
    
    if (isServerSync) {
      return 'Synced';
    }
    
    return 'Local Only';
  };

  const getSyncColor = () => {
    if (syncError) return 'error';
    if (isServerSync) return 'success';
    return 'warning';
  };

  if (showDetails) {
    return (
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="h6">Theme Sync Status</Typography>
          <Chip
            icon={getSyncIcon()}
            label={getSyncStatus()}
            color={getSyncColor()}
            size="small"
          />
        </Box>

        {syncError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {syncError}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleSync}
            disabled={isLoading || isSyncing}
            size="small"
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>

          {isServerSync && (
            <Typography variant="caption" color="text.secondary">
              Your theme preferences are synced across all devices
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Tooltip 
      title={
        syncError 
          ? `Sync Error: ${syncError}` 
          : isServerSync 
            ? 'Theme synced with server' 
            : 'Theme stored locally only'
      }
    >
      <Chip
        icon={getSyncIcon()}
        label={getSyncStatus()}
        color={getSyncColor()}
        size="small"
        onClick={handleSync}
        disabled={isLoading || isSyncing}
        sx={{ cursor: 'pointer' }}
      />
    </Tooltip>
  );
};

export default ThemeSyncStatus;
