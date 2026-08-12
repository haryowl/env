import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box, Snackbar, Alert, CircularProgress } from '@mui/material';
import { UserThemeContextProvider } from './contexts/UserThemeContext';
import { FontProvider } from './contexts/FontContext';

import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import { useFeatureFlags } from './hooks/useFeatureFlags';

const Dashboard = lazy(() => import('./components/Dashboard'));
const UDashboard = lazy(() => import('./components/UDashboard'));
const NDashboard = lazy(() => import('./components/NDashboard'));
const StatusDashboard = lazy(() => import('./components/StatusDashboard'));
const MobileDashboard = lazy(() => import('./components/MobileDashboard'));
const QuickView = lazy(() => import('./components/QuickView'));
const MobileQuickView = lazy(() => import('./components/MobileQuickView'));
const DeviceManager = lazy(() => import('./components/DeviceManager'));
const UserManager = lazy(() => import('./components/UserManager.jsx'));
const TenantManager = lazy(() => import('./components/TenantManager.jsx'));
const RoleManager = lazy(() => import('./components/RoleManager.jsx'));
const FieldCreator = lazy(() => import('./components/FieldCreator'));
const DeviceMapper = lazy(() => import('./components/DeviceMapper'));
const LiveTracking = lazy(() => import('./components/LiveTracking'));
const Listeners = lazy(() => import('./components/Listeners'));
const DataViewer = lazy(() => import('./components/DataViewer'));
const Settings = lazy(() => import('./components/Settings'));
const DataDash = lazy(() => import('./components/DataDash'));
const DataDash2 = lazy(() => import('./components/DataDash2'));
const ComparisonDoughnutDashboard = lazy(() => import('./components/ComparisonDoughnutDashboard'));
const Alerts = lazy(() => import('./components/Alerts'));
const AlertSettings = lazy(() => import('./components/AlertSettings'));
const NotificationConfig = lazy(() => import('./components/NotificationConfig'));
const ThemeDemo = lazy(() => import('./components/ThemeDemo'));
const ColorCustomizer = lazy(() => import('./components/ColorCustomizer'));
const ParameterColorCustomizer = lazy(() => import('./components/ParameterColorCustomizer'));
const ParameterColorDemo = lazy(() => import('./components/ParameterColorDemo'));
const FontColorCustomizer = lazy(() => import('./components/FontColorCustomizer'));
const ScheduledExports = lazy(() => import('./components/ScheduledExports'));
const MqttConfiguration = lazy(() => import('./components/MqttConfiguration'));
const MqttPublisher = lazy(() => import('./components/MqttPublisher'));
const CompanySite = lazy(() => import('./components/CompanySite'));
const SensorManagement = lazy(() => import('./components/SensorManagement'));
const Maintenance = lazy(() => import('./components/Maintenance'));
const TechnicianDashboard = lazy(() => import('./components/TechnicianDashboard'));
const SystemInfo = lazy(() => import('./components/SystemInfo'));
const DataCleanup = lazy(() => import('./components/DataCleanup'));
const DataImport = lazy(() => import('./components/DataImport'));
const DeploymentSettings = lazy(() => import('./components/DeploymentSettings'));
const KlhkReporting = lazy(() => import('./components/KlhkReporting'));

function RouteFallback() {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="320px">
      <CircularProgress />
    </Box>
  );
}

// Services
import { AuthService } from './services/authService';
import { SocketService } from './services/socketService';

// Config
import { API_BASE_URL } from './config/api';
import { resetAuthFailureGuard } from './utils/authSession';

// Hooks
import { PermissionProvider, usePermissions } from './hooks/usePermissions.jsx';
import { useSocketEvent } from './hooks/useSocketEvent';

function HomeRedirect({ user }) {
  const { loading, canAccessMenu, userPermissions } = usePermissions();

  if (loading) {
    return null;
  }

  const role = user?.role || userPermissions?.role;
  const isAdmin = role === 'admin' || role === 'super_admin';

  // Non-admin users land on the modern overview first.
  if (!isAdmin && canAccessMenu('/n-dashboard')) {
    return <Navigate to="/n-dashboard" replace />;
  }
  if (isAdmin && canAccessMenu('/dashboard')) {
    return <Navigate to="/dashboard" replace />;
  }
  if (canAccessMenu('/n-dashboard')) {
    return <Navigate to="/n-dashboard" replace />;
  }
  if (canAccessMenu('/u-dashboard')) {
    return <Navigate to="/u-dashboard" replace />;
  }
  if (role === 'technician' && canAccessMenu('/technician')) {
    return <Navigate to="/technician" replace />;
  }
  if (canAccessMenu('/dashboard')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/n-dashboard" replace />;
}

function App() {
  const { flags: featureFlags } = useFeatureFlags();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [userContext, setUserContext] = useState(() => {
    try {
      const raw = localStorage.getItem('iot_user_context');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  });
  const [fontType, setFontType] = useState(() => {
    return localStorage.getItem('iot_font_preference') || 'monospace';
  });
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('iot_token');
    const userData = localStorage.getItem('iot_user');
    
    if (token && userData) {
      try {
        const user = JSON.parse(userData);
        // Ensure user.id is always set
        const userWithId = { ...user, id: user.user_id };
        setUser(userWithId);
        // Optionally update localStorage if missing
        if (!user.id) {
          localStorage.setItem('iot_user', JSON.stringify(userWithId));
        }
        // Initialize socket connection
        const socketService = new SocketService();
        socketService.connect(token);
        setSocket(socketService);
      } catch (error) {
        console.error('Failed to parse user data:', error);
        localStorage.removeItem('iot_token');
        localStorage.removeItem('iot_user');
      }
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    const onUserStorageSync = () => {
      try {
        const raw = localStorage.getItem('iot_user');
        if (!raw) return;
        const u = JSON.parse(raw);
        setUser((prev) =>
          prev && String(prev.user_id) === String(u.user_id)
            ? { ...prev, ...u, id: u.user_id }
            : prev
        );
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('iot-user-updated', onUserStorageSync);
    return () => window.removeEventListener('iot-user-updated', onUserStorageSync);
  }, []);

  // Fetch logged-in user's company/site context for header display
  useEffect(() => {
    const fetchUserContext = async () => {
      if (!user) {
        setUserContext(null);
        localStorage.removeItem('iot_user_context');
        return;
      }
      const token = localStorage.getItem('iot_token');
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE_URL}/users/me/context`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) return;
        setUserContext(data);
        localStorage.setItem('iot_user_context', JSON.stringify(data));
      } catch (e) {
        // Best-effort only; header can fall back to cached context
      }
    };
    fetchUserContext();
  }, [user?.user_id]);

  // Apply saved font preference on startup
  useEffect(() => {
    const savedFont = localStorage.getItem('iot_font_preference') || 'monospace';
    setFontType(savedFont);
    
    // Apply font to document body
    const applyFontToDocument = (fontType) => {
      const fontFamilies = {
        monospace: "'Courier New', 'Monaco', 'Consolas', 'Roboto Mono', 'Fira Code', 'Source Code Pro', monospace",
        'sans-serif': "'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif",
        serif: "'Times New Roman', 'Georgia', 'Palatino', serif",
        system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif",
        condensed: "'Roboto Condensed', 'Arial Narrow', sans-serif",
        rounded: "'Comic Sans MS', 'Varela Round', 'Quicksand', sans-serif"
      };
      
      document.body.style.fontFamily = fontFamilies[fontType] || fontFamilies.monospace;
    };
    
    applyFontToDocument(savedFont);
  }, []);

  // Fetch devices and alerts globally for device name lookup and alert management
  useEffect(() => {
    const fetchGlobals = async () => {
      const token = localStorage.getItem('iot_token');
      if (!token) return;
      try {
        const [alertsRes, devicesRes] = await Promise.all([
          fetch(`${API_BASE_URL}/alerts`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
          fetch(`${API_BASE_URL}/devices`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
        ]);
        setAlerts((alertsRes.alerts || []).map(a => ({ ...a, id: a.alert_id })));
        setDevices(devicesRes.devices || []);
      } catch (e) {
        // Optionally handle error
      }
    };
    fetchGlobals();
  }, [user]);

  useSocketEvent(
    socket,
    'new_alert_log',
    (log) => {
      const alertDef = alerts.find(
        (a) => String(a.alert_id) === String(log.alert_id) || String(a.id) === String(log.alert_id)
      );
      const deviceName = devices.find((d) => d.device_id === log.device_id)?.name || log.device_id;
      if (alertDef?.actions?.popup) {
        setNotification({
          open: true,
          message: `ALERT: ${log.type === 'threshold' ? 'Threshold' : 'Inactivity'} on ${deviceName} (${log.parameter})`,
          severity: 'error',
        });
      }
    },
    Boolean(socket && alerts.length > 0 && devices.length > 0)
  );

  const handleLogin = async (credentials) => {
    try {
      const authService = new AuthService();
      const { user, token } = await authService.login(credentials);
      // Ensure user.id is always set
      const userWithId = { ...user, id: user.user_id };
      const isAdmin = userWithId.role === 'admin' || userWithId.role === 'super_admin';
      // The authenticated router is mounted after setUser. Set its initial URL now
      // so non-admin users enter N-Dashboard directly after a successful login.
      window.history.replaceState({}, '', isAdmin ? '/dashboard' : '/n-dashboard');
      setUser(userWithId);
      localStorage.setItem('iot_token', token);
      localStorage.setItem('iot_user', JSON.stringify(userWithId));
      resetAuthFailureGuard();
      // Initialize socket connection
      const socketService = new SocketService();
      socketService.connect(token);
      setSocket(socketService);
      // Trigger permission refresh after successful login
      setTimeout(() => {
        window.dispatchEvent(new Event('refreshPermissions'));
      }, 100);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const handleLogout = useCallback(async () => {
    let redirectUrl = null;
    try {
      const authService = new AuthService();
      redirectUrl = await authService.logout();
    } catch (e) {
      console.error('Logout request failed:', e);
    }
    if (socket) {
      socket.disconnect();
    }
    setUser(null);
    setSocket(null);
    localStorage.removeItem('iot_token');
    localStorage.removeItem('iot_user');
    if (redirectUrl) {
      window.location.assign(redirectUrl);
    }
  }, [socket]);

  useEffect(() => {
    const onSessionExpired = () => {
      setNotification({
        open: true,
        message: 'Your session has expired. Please sign in again.',
        severity: 'warning',
      });
      handleLogout();
    };
    window.addEventListener('iot-session-expired', onSessionExpired);
    return () => window.removeEventListener('iot-session-expired', onSessionExpired);
  }, [handleLogout]);

  const handleFontChange = (newFontType) => {
    // Font change is now handled by UserThemeContext
    // This function is kept for compatibility with Settings component
  };

  if (loading) {
    return (
      <FontProvider>
        <UserThemeContextProvider>
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            minHeight="100vh"
          >
            Loading...
          </Box>
        </UserThemeContextProvider>
      </FontProvider>
    );
  }

  return (
    <FontProvider>
      <UserThemeContextProvider>
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ '& .MuiPaper-root': { maxWidth: 560, minWidth: 400 } }}
      >
        <Alert
          onClose={() => setNotification({ ...notification, open: false })}
          severity={notification.severity}
          sx={{
            width: '100%',
            py: 2,
            px: 2.5,
            fontSize: '1.1rem',
            fontWeight: 700,
            '& .MuiAlert-icon': { fontSize: 28, color: 'inherit' },
            '& .MuiAlert-message': { color: 'inherit', fontWeight: 700 },
            ...(notification.severity === 'error' && {
              backgroundColor: '#DC2626',
              color: '#fff',
              '& .MuiAlert-icon': { color: '#fff' },
              '& .MuiAlert-action .MuiIconButton-root': { color: 'rgba(255,255,255,0.9)' },
            }),
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
      <PermissionProvider>
        {!user ? (
          <Router>
            <Routes>
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/login" element={<Login onLogin={handleLogin} />} />
              <Route path="*" element={<Login onLogin={handleLogin} />} />
            </Routes>
          </Router>
        ) : (
          <ErrorBoundary>
          <Router>
            <Layout user={user} userContext={userContext} onLogout={handleLogout}>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<HomeRedirect user={user} />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard socket={socket} /></ProtectedRoute>} />
                <Route path="/u-dashboard" element={<ProtectedRoute><UDashboard socket={socket} /></ProtectedRoute>} />
                <Route path="/n-dashboard" element={<ProtectedRoute><NDashboard socket={socket} /></ProtectedRoute>} />
                <Route path="/status" element={<ProtectedRoute><StatusDashboard socket={socket} /></ProtectedRoute>} />
                <Route path="/m/dashboard" element={<ProtectedRoute><MobileDashboard socket={socket} /></ProtectedRoute>} />
                <Route path="/quick-view" element={<ProtectedRoute><QuickView /></ProtectedRoute>} />
                <Route path="/m/quick-view" element={<ProtectedRoute><MobileQuickView /></ProtectedRoute>} />
                <Route path="/devices" element={<ProtectedRoute><DeviceManager /></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute><UserManager /></ProtectedRoute>} />
                <Route path="/tenants" element={<ProtectedRoute><TenantManager /></ProtectedRoute>} />
                <Route path="/roles" element={<ProtectedRoute><RoleManager /></ProtectedRoute>} />
                <Route path="/field-creator" element={<ProtectedRoute><FieldCreator /></ProtectedRoute>} />
                <Route path="/live-tracking" element={<ProtectedRoute><LiveTracking socket={socket} /></ProtectedRoute>} />
                <Route path="/mapper" element={<ProtectedRoute><DeviceMapper /></ProtectedRoute>} />
                <Route path="/listeners" element={<ProtectedRoute><Listeners socket={socket} /></ProtectedRoute>} />
                <Route path="/mqtt-config" element={<ProtectedRoute><MqttConfiguration /></ProtectedRoute>} />
                <Route path="/data" element={<ProtectedRoute><DataViewer /></ProtectedRoute>} />
                <Route path="/data-dash" element={<ProtectedRoute><DataDash /></ProtectedRoute>} />
                <Route path="/data-dash-2" element={<ProtectedRoute><DataDash2 /></ProtectedRoute>} />
                <Route path="/comparison-dashboard" element={<ProtectedRoute><ComparisonDoughnutDashboard /></ProtectedRoute>} />
                <Route path="/alerts" element={<ProtectedRoute><Alerts socket={socket} devices={devices} alerts={alerts} /></ProtectedRoute>} />
                <Route path="/alert-settings" element={<ProtectedRoute><AlertSettings user={user} /></ProtectedRoute>} />
                <Route path="/notification-config" element={<ProtectedRoute><NotificationConfig /></ProtectedRoute>} />
                <Route path="/theme-demo" element={<ProtectedRoute><ThemeDemo /></ProtectedRoute>} />
                <Route path="/color-customizer" element={<ProtectedRoute><ColorCustomizer onColorChange={() => window.location.reload()} /></ProtectedRoute>} />
                <Route path="/parameter-colors" element={<ProtectedRoute><ParameterColorCustomizer onParameterColorsChange={() => window.location.reload()} /></ProtectedRoute>} />
                <Route path="/parameter-demo" element={<ProtectedRoute><ParameterColorDemo /></ProtectedRoute>} />
                <Route path="/font-customizer" element={<ProtectedRoute><FontColorCustomizer /></ProtectedRoute>} />
                <Route path="/scheduled-exports" element={<ProtectedRoute><ScheduledExports /></ProtectedRoute>} />
                {featureFlags?.mqttPublisher ? (
                  <Route path="/mqtt-publisher" element={<ProtectedRoute><MqttPublisher /></ProtectedRoute>} />
                ) : null}
                {featureFlags?.klhkReporting ? (
                  <Route path="/klhk-reporting" element={<ProtectedRoute><KlhkReporting /></ProtectedRoute>} />
                ) : null}
                <Route path="/company-site" element={<ProtectedRoute><CompanySite /></ProtectedRoute>} />
                <Route path="/sensor-management" element={<ProtectedRoute><SensorManagement /></ProtectedRoute>} />
                <Route path="/maintenance" element={<ProtectedRoute><Maintenance /></ProtectedRoute>} />
                <Route path="/technician" element={<ProtectedRoute><TechnicianDashboard /></ProtectedRoute>} />
                <Route path="/system-info" element={<ProtectedRoute><SystemInfo /></ProtectedRoute>} />
                <Route path="/data-cleanup" element={<ProtectedRoute><DataCleanup /></ProtectedRoute>} />
                <Route path="/data-import" element={<ProtectedRoute><DataImport /></ProtectedRoute>} />
                <Route path="/deployment-settings" element={<ProtectedRoute><DeploymentSettings /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings user={user} onFontChange={handleFontChange} /></ProtectedRoute>} />
              </Routes>
              </Suspense>
            </Layout>
          </Router>
          </ErrorBoundary>
        )}
      </PermissionProvider>
      </UserThemeContextProvider>
    </FontProvider>
  );
}

export default App;
