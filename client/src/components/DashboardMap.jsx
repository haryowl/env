import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  useTheme
} from '@mui/material';
import {
  Map as MapIcon,
  Refresh as RefreshIcon,
  LocationOn as LocationIcon
} from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { API_BASE_URL } from '../config/api';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { CHART_CARD_SX } from '../utils/chartStyles';

// Custom styled popup component that respects theme
const ThemedPopup = ({ children, theme }) => {
  useEffect(() => {
    // Apply theme-specific styles to Leaflet popup
    const style = document.createElement('style');
    style.textContent = `
      .leaflet-popup-content-wrapper {
        background-color: ${theme.palette.background.paper} !important;
        color: ${theme.palette.text.primary} !important;
        border-radius: ${theme.shape.borderRadius}px !important;
        box-shadow: ${theme.shadows[8]} !important;
      }
      .leaflet-popup-content {
        margin: 8px !important;
        color: ${theme.palette.text.primary} !important;
      }
      .leaflet-popup-tip {
        background-color: ${theme.palette.background.paper} !important;
      }
      .leaflet-popup-close-button {
        color: ${theme.palette.text.secondary} !important;
        font-size: 18px !important;
        font-weight: bold !important;
        padding: 4px 8px !important;
      }
      .leaflet-popup-close-button:hover {
        color: ${theme.palette.text.primary} !important;
        background-color: ${theme.palette.action.hover} !important;
      }
      /* Ensure all text inside popup inherits theme colors */
      .leaflet-popup-content * {
        color: inherit !important;
      }
      /* Override any white/black text specifically */
      .leaflet-popup-content .MuiTypography-root {
        color: ${theme.palette.text.primary} !important;
      }
      .leaflet-popup-content .MuiTypography-colorTextSecondary {
        color: ${theme.palette.text.secondary} !important;
      }
    `;
    style.id = 'leaflet-theme-styles';
    
    // Remove existing theme styles if any
    const existingStyle = document.getElementById('leaflet-theme-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    document.head.appendChild(style);
    
    return () => {
      const styleEl = document.getElementById('leaflet-theme-styles');
      if (styleEl) {
        styleEl.remove();
      }
    };
  }, [theme]);

  return children;
};
import { formatInUserTimezone } from '../utils/timezoneUtils';

// Add CSS for blinking animation
const alertBlinkStyle = `
  @keyframes alertBlink {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
  }
  
  .alert-blink {
    animation: alertBlink 1s infinite;
  }
`;

// Inject the CSS
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = alertBlinkStyle;
  document.head.appendChild(style);
}

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Modern professional device marker with enhanced styling
const createDeviceIcon = (status, hasAlerts = false) => {
  let color = '#10B981'; // Modern green for online
  let className = 'custom-device-marker';
  let pulseColor = 'rgba(16, 185, 129, 0.3)';
  
  if (hasAlerts) {
    color = '#EF4444'; // Modern red for alerts
    className = 'custom-device-marker alert-blink';
    pulseColor = 'rgba(239, 68, 68, 0.3)';
  } else if (status !== 'online') {
    color = '#F59E0B'; // Modern orange for offline
    pulseColor = 'rgba(245, 158, 11, 0.3)';
  }
  
  return L.divIcon({
    className: className,
    html: `
      <div style="
        position: relative;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <!-- Pulse ring -->
        <div style="
          position: absolute;
          width: 32px;
          height: 32px;
          background-color: ${pulseColor};
          border-radius: 50%;
          animation: pulse 2s infinite;
        "></div>
        <!-- Main marker -->
        <div style="
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, ${color} 0%, ${color}CC 100%);
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.1);
          position: relative;
          z-index: 1;
        "></div>
        <!-- Inner dot -->
        <div style="
          position: absolute;
          width: 8px;
          height: 8px;
          background-color: white;
          border-radius: 50%;
          z-index: 2;
        "></div>
      </div>
      <style>
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 1; }
          70% { transform: scale(1.2); opacity: 0.3; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      </style>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};

// Modern map layer options with professional styling
const mapLayers = [
  { 
    value: 'dark', 
    label: 'Dark Professional', 
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  { 
    value: 'modern', 
    label: 'Modern Light', 
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  { 
    value: 'satellite', 
    label: 'Satellite', 
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>'
  },
  { 
    value: 'terrain', 
    label: 'Terrain', 
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org/">OpenTopoMap</a> contributors'
  }
];

// Map bounds updater component
const MapBoundsUpdater = ({ devices }) => {
  const map = useMap();
  
  useEffect(() => {
    if (devices.length > 0) {
      const bounds = L.latLngBounds();
      let hasPoints = false;
      
      devices.forEach(device => {
        if (device.latitude && device.longitude) {
          bounds.extend([device.latitude, device.longitude]);
          hasPoints = true;
        }
      });
      
      if (hasPoints) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  }, [devices, map]);

  return null;
};

// Map center updater component
const MapCenterUpdater = ({ centerCoords, mapRef }) => {
  const map = useMap();
  
  useEffect(() => {
    if (mapRef) {
      mapRef.current = map;
    }
  }, [map, mapRef]);

  useEffect(() => {
    if (centerCoords && map) {
      map.setView([centerCoords.lat, centerCoords.lng], map.getZoom());
    }
  }, [centerCoords, map]);

  return null;
};

const DashboardMap = ({ socket }) => {
  const theme = useTheme();
  const { formatDisplayName } = useFieldMetadata();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLayer, setSelectedLayer] = useState('dark');
  const [deviceData, setDeviceData] = useState({});
  const [deviceAlerts, setDeviceAlerts] = useState({});
  const [centerCoords, setCenterCoords] = useState(null);
  const mapRef = useRef(null);

  const popupIgnoredKeys = ['device_id', 'deviceId', 'device_name', 'metadata', 'status', 'sensor_type', '_id', 'created_at', 'updated_at'];

  const formatLabelForPopup = (key) => {
    if (key === 'datetime') return 'Data Time';
    if (key === 'timestamp') return 'Server Time';
    return formatDisplayName(key, { withUnit: true });
  };

  const formatValueForPopup = (key, value) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    if (key === 'datetime' || key === 'timestamp') {
      return formatInUserTimezone(value);
    }

    if (typeof value === 'number') {
      const formatted = Number.isFinite(value) ? value.toFixed(2) : value;
      return `${formatted}`;
    }

    if (typeof value === 'string') {
      return value;
    }

    return typeof value === 'object' ? '' : value;
  };

  // Load devices with coordinates
  const loadDevices = async () => {
    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices/with-coordinates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const devicesList = data.devices || [];
        setDevices(devicesList);
        
        // Check alerts for each device
        devicesList.forEach(device => {
          checkDeviceAlerts(device.device_id);
        });
      } else {
        setError('Failed to load devices');
      }
    } catch (error) {
      console.error('Error loading devices:', error);
      setError('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  // Load device data for popup
  const loadDeviceData = async (deviceId) => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices/${deviceId}/latest-data`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDeviceData(prev => ({
          ...prev,
          [deviceId]: data.data || {}
        }));
      }
    } catch (error) {
      console.error('Error loading device data:', error);
    }
  };

  // Check for device alerts
  const checkDeviceAlerts = async (deviceId) => {
    try {
      const token = localStorage.getItem('iot_token');
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      const response = await fetch(`${API_BASE_URL}/alert-logs?deviceId=${deviceId}&startDate=${oneHourAgo.toISOString()}&endDate=${now.toISOString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const hasAlerts = data.logs && data.logs.length > 0;
        setDeviceAlerts(prev => ({
          ...prev,
          [deviceId]: hasAlerts
        }));
      }
    } catch (error) {
      console.error('Error checking device alerts:', error);
    }
  };

  // Real-time updates
  useEffect(() => {
    loadDevices();
    
    if (socket) {
      socket.on('device_status_update', (data) => {
        setDevices(prevDevices => 
          prevDevices.map(device => 
            device.device_id === data.device_id 
              ? { ...device, status: data.status }
              : device
          )
        );
      });
    }

    // Refresh every 10 minutes
    const interval = setInterval(loadDevices, 10 * 60 * 1000);

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('device_status_update');
      }
    };
  }, [socket]);

  // Preload latest data for all devices with coordinates so popup shows parameters without waiting for click
  useEffect(() => {
    const withCoords = devices.filter(d => d.latitude && d.longitude && !isNaN(d.latitude) && !isNaN(d.longitude));
    withCoords.forEach(device => loadDeviceData(device.device_id));
  }, [devices]);

  // Filter devices with valid coordinates
  const devicesWithCoordinates = devices.filter(device => 
    device.latitude && device.longitude && 
    !isNaN(device.latitude) && !isNaN(device.longitude)
  );

  if (loading) {
    return (
      <Card sx={{ mt: 3, mb: 3, borderRadius: 1, ...CHART_CARD_SX }}>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ 
      mt: 3, 
      mb: 3,
      borderRadius: 1,
      ...CHART_CARD_SX,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
      overflow: 'hidden'
    }}>
      <CardContent sx={{ p: 0 }}>
        {/* Site Location header - clean layout per design */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'primary.light'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <LocationIcon sx={{ mr: 1.25, fontSize: 22, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '1.1rem' }}>
              Site Location
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, mb: 0.25 }}>
                Layer
              </Typography>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <Select
                  value={selectedLayer}
                  onChange={(e) => setSelectedLayer(e.target.value)}
                  displayEmpty
                  sx={{
                    color: 'primary.main',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'divider',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'primary.main',
                      borderWidth: '1px',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'primary.main',
                      borderWidth: '1.5px',
                    },
                    '& .MuiSvgIcon-root': {
                      color: 'primary.main',
                    },
                  }}
                >
                  {mapLayers.map(layer => (
                    <MenuItem key={layer.value} value={layer.value}>
                      {layer.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <Tooltip title="Refresh">
              <IconButton 
                onClick={loadDevices} 
                size="small"
                sx={{ 
                  color: 'primary.main',
                  mt: 2.5,
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  }
                }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Box sx={{ p: 3 }}>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

          {/* Device count - rounded bar with subtle border */}
          <Box sx={{ mb: 2 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1.25,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.default',
                color: 'text.primary',
                fontWeight: 500,
                fontSize: '0.9rem',
              }}
            >
              <LocationIcon sx={{ fontSize: 20, color: 'primary.main' }} />
              <Typography component="span" sx={{ fontWeight: 500, fontSize: '0.9rem' }}>
                {devicesWithCoordinates.length} devices on map
              </Typography>
            </Box>
          </Box>

          <Box sx={{ 
            height: 500, 
            width: '100%', 
            position: 'relative',
            borderRadius: '4px',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
            border: '1px solid rgba(0, 0, 0, 0.05)'
          }}>
          <MapContainer
            ref={mapRef}
            center={[0, 0]}
            zoom={2}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url={mapLayers.find(l => l.value === selectedLayer)?.url}
              attribution={mapLayers.find(l => l.value === selectedLayer)?.attribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
            />
            
            {devicesWithCoordinates.map(device => (
              <Marker
                key={device.device_id}
                position={[device.latitude, device.longitude]}
                icon={createDeviceIcon(device.status, deviceAlerts[device.device_id])}
                eventHandlers={{
                  click: (e) => {
                    loadDeviceData(device.device_id);
                    // Center the map on the clicked marker
                    setCenterCoords({ lat: device.latitude, lng: device.longitude });
                  }
                }}
              >
                <Popup>
                  <ThemedPopup theme={theme}>
                    <Box 
                      sx={{ 
                        minWidth: 200,
                        maxWidth: 280,
                        color: theme.palette.text.primary,
                        backgroundColor: 'transparent'
                      }}
                    >
                      <Typography 
                        variant="h6" 
                        fontWeight="bold" 
                        sx={{ 
                          color: theme.palette.text.primary,
                          mb: 0.5,
                          fontSize: '1.1rem'
                        }}
                      >
                        {device.name}
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          color: theme.palette.text.secondary,
                          mb: 0.4,
                          fontSize: '0.8rem'
                        }}
                      >
                        ID: {device.device_id}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, mb: 0.4 }}>
                        <Chip 
                          label={device.status} 
                          color={device.status === 'online' ? 'success' : 'error'}
                          size="small"
                          sx={{ fontSize: '0.7rem', height: 18 }}
                        />
                        {deviceAlerts[device.device_id] && (
                          <Chip 
                            label="ALERT" 
                            color="error"
                            size="small"
                            sx={{ 
                              animation: 'alertBlink 1s infinite',
                              fontSize: '0.7rem',
                              height: 18
                            }}
                          />
                        )}
                      </Box>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          color: theme.palette.text.secondary,
                          mb: 0.3,
                          fontSize: '0.8rem'
                        }}
                      >
                        Coordinates: {device.latitude}, {device.longitude}
                      </Typography>
                      
                      <Typography 
                        variant="subtitle2" 
                        sx={{ 
                          mt: 1, 
                          mb: 0.3,
                          color: theme.palette.text.primary,
                          fontWeight: 'bold',
                          fontSize: '0.9rem'
                        }}
                      >
                        Latest Parameters:
                      </Typography>
                      {deviceData[device.device_id] && Object.keys(deviceData[device.device_id]).length > 0 ? (
                        <Box 
                          sx={{ 
                            fontSize: '0.8rem',
                            lineHeight: 1.5,
                            '& > div': {
                              margin: 0,
                              padding: 0,
                              lineHeight: 1.5
                            }
                          }}
                        >
                          {Object.entries(deviceData[device.device_id])
                            .filter(([key, value]) => {
                              if (popupIgnoredKeys.includes(key)) return false;
                              if (value === null || value === undefined) return false;
                              if (typeof value === 'object') return false;
                              return true;
                            })
                            .map(([key, value]) => {
                              const label = formatLabelForPopup(key);
                              const displayValue = formatValueForPopup(key, value);
                              if (!label || displayValue === '') {
                                return null;
                              }
                              return (
                                <div
                                  key={key}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    margin: 0,
                                    padding: 0,
                                    lineHeight: 1.5,
                                    fontSize: '0.8rem',
                                    color: theme.palette.text.primary
                                  }}
                                >
                                  <span style={{ color: theme.palette.text.secondary }}>{label}:</span>
                                  <span style={{ fontWeight: 'bold', color: theme.palette.text.primary }}>{displayValue}</span>
                                </div>
                              );
                            })}
                        </Box>
                      ) : (
                        <Typography 
                          variant="body2" 
                          sx={{ color: theme.palette.text.secondary }}
                        >
                          No recent data available
                        </Typography>
                      )}
                    </Box>
                  </ThemedPopup>
                </Popup>
              </Marker>
            ))}
            
            <MapBoundsUpdater devices={devicesWithCoordinates} />
            <MapCenterUpdater centerCoords={centerCoords} mapRef={mapRef} />
          </MapContainer>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default DashboardMap;