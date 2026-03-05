import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box, Snackbar, Alert } from '@mui/material';
import { UserThemeContextProvider } from './contexts/UserThemeContext';
import { FontProvider } from './contexts/FontContext';

// Components
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import QuickView from './components/QuickView';
import DeviceManager from './components/DeviceManager';
import UserManager from './components/UserManager.jsx';
import RoleManager from './components/RoleManager.jsx';
import FieldCreator from './components/FieldCreator';
import DeviceMapper from './components/DeviceMapper';
import Listeners from './components/Listeners';
import DataViewer from './components/DataViewer';
import Settings from './components/Settings';
import Layout from './components/Layout';
import DataDash from './components/DataDash';
import DataDash2 from './components/DataDash2';
import Alerts from './components/Alerts';
import AlertSettings from './components/AlertSettings';
import NotificationConfig from './components/NotificationConfig';
import ThemeDemo from './components/ThemeDemo';
import ColorCustomizer from './components/ColorCustomizer';
import ParameterColorCustomizer from './components/ParameterColorCustomizer';
import ParameterColorDemo from './components/ParameterColorDemo';
import FontColorCustomizer from './components/FontColorCustomizer';
import ScheduledExports from './components/ScheduledExports';
import CompanySite from './components/CompanySite';
import SensorManagement from './components/SensorManagement';
import Maintenance from './components/Maintenance';
import TechnicianDashboard from './components/TechnicianDashboard';
import ErrorBoundary from './components/ErrorBoundary';

// Services
import { AuthService } from './services/authService';
import { SocketService } from './services/socketService';

// Config
import { API_BASE_URL } from './config/api';

// Hooks
import { PermissionProvider, usePermissions } from './hooks/usePermissions.jsx';


function App() {
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

  // Global new_alert_log listener
  useEffect(() => {
    if (!socket || alerts.length === 0 || devices.length === 0) return;
    const handleNewAlertLog = (log) => {
      const alertDef = alerts.find(a => String(a.alert_id) === String(log.alert_id) || String(a.id) === String(log.alert_id));
      const deviceName = devices.find(d => d.device_id === log.device_id)?.name || log.device_id;
      if (alertDef?.actions?.popup) {
        setNotification({
          open: true,
          message: `ALERT: ${log.type === 'threshold' ? 'Threshold' : 'Inactivity'} on ${deviceName} (${log.parameter})`,
          severity: 'error'
        });
      }
    };
    socket.on('new_alert_log', handleNewAlertLog);
    return () => socket.off('new_alert_log', handleNewAlertLog);
  }, [socket, alerts, devices]);

  // Register real-time listeners for device_data and listener_data
  useEffect(() => {
    if (!socket) return;
    const handleDeviceData = (payload) => {
      console.log('App: Received device_data:', payload);
      // TODO: Optionally update state/UI here
    };
    const handleListenerData = (payload) => {
      console.log('App: Received listener_data:', payload);
      // TODO: Optionally update state/UI here
    };
    socket.on('device_data', handleDeviceData);
    socket.on('listener_data', handleListenerData);
    return () => {
      socket.off('device_data', handleDeviceData);
      socket.off('listener_data', handleListenerData);
    };
  }, [socket]);

  const handleLogin = async (credentials) => {
    try {
      const authService = new AuthService();
      const { user, token } = await authService.login(credentials);
      // Ensure user.id is always set
      const userWithId = { ...user, id: user.user_id };
      setUser(userWithId);
      localStorage.setItem('iot_token', token);
      localStorage.setItem('iot_user', JSON.stringify(userWithId));
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

  const handleLogout = () => {
    if (socket) {
      socket.disconnect();
    }
    setUser(null);
    setSocket(null);
    localStorage.removeItem('iot_token');
    localStorage.removeItem('iot_user');
  };

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
      <Snackbar open={notification.open} autoHideDuration={6000} onClose={() => setNotification({ ...notification, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={() => setNotification({ ...notification, open: false })} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
      <PermissionProvider>
        {!user ? (
          <Login onLogin={handleLogin} />
        ) : (
          <ErrorBoundary>
          <Router>
            <Layout user={user} userContext={userContext} onLogout={handleLogout}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard socket={socket} />} />
                <Route path="/quick-view" element={<QuickView />} />
                <Route path="/devices" element={<DeviceManager />} />
                <Route path="/users" element={<UserManager />} />
                <Route path="/roles" element={<RoleManager />} />
                <Route path="/field-creator" element={<FieldCreator />} />
                <Route path="/mapper" element={<DeviceMapper />} />
                <Route path="/listeners" element={<Listeners socket={socket} />} />
                <Route path="/data" element={<DataViewer />} />
                <Route path="/data-dash" element={<DataDash />} />
                <Route path="/data-dash-2" element={<DataDash2 />} />
                <Route path="/alerts" element={<Alerts socket={socket} devices={devices} alerts={alerts} />} />
                <Route path="/alert-settings" element={<AlertSettings user={user} />} />
                <Route path="/notification-config" element={<NotificationConfig />} />
                <Route path="/theme-demo" element={<ThemeDemo />} />
                <Route path="/color-customizer" element={<ColorCustomizer onColorChange={() => window.location.reload()} />} />
                <Route path="/parameter-colors" element={<ParameterColorCustomizer onParameterColorsChange={() => window.location.reload()} />} />
                <Route path="/parameter-demo" element={<ParameterColorDemo />} />
                <Route path="/font-customizer" element={<FontColorCustomizer />} />
                <Route path="/scheduled-exports" element={<ScheduledExports />} />
                <Route path="/company-site" element={<CompanySite />} />
                <Route path="/sensor-management" element={<SensorManagement />} />
                <Route path="/maintenance" element={<Maintenance />} />
                <Route path="/technician" element={<TechnicianDashboard />} />
                <Route path="/settings" element={<Settings user={user} onFontChange={handleFontChange} />} />
              </Routes>
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
