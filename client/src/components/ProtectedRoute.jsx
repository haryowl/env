import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { usePermissions } from '../hooks/usePermissions.jsx';
import { getMenuPathForRoute } from '../config/navigationConfig';

function redirectPathForRole(role) {
  if (role === 'technician') return '/technician';
  return '/dashboard';
}

function defaultLandingPath({ role, canAccessMenu }) {
  if (role === 'technician') return '/technician';
  if (canAccessMenu?.('/dashboard')) return '/dashboard';
  if (canAccessMenu?.('/u-dashboard')) return '/u-dashboard';
  // fall back to dashboard (will show "No access" if nothing else is allowed)
  return '/dashboard';
}

/**
 * Enforces the same menu access rules as the sidebar for direct URL visits.
 */
export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const { canAccessMenu, loading, userPermissions } = usePermissions();
  const menuPath = getMenuPathForRoute(location.pathname);

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight={240} gap={2}>
        <CircularProgress size={36} />
        <Typography variant="body2" color="text.secondary">
          Checking access…
        </Typography>
      </Box>
    );
  }

  if (!canAccessMenu(menuPath)) {
    const role = userPermissions?.role;
    const to = defaultLandingPath({ role, canAccessMenu });
    if (to !== location.pathname) {
      return <Navigate to={to} replace state={{ from: location.pathname }} />;
    }
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" gutterBottom>
          No access
        </Typography>
        <Typography variant="body2" color="text.secondary">
          You do not have permission to open this page. Contact an administrator if you need access.
        </Typography>
      </Box>
    );
  }

  return children;
}
