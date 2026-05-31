import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
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
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import { subHours } from 'date-fns';
import { API_BASE_URL } from '../config/api';
import { MAP_BASE_LAYERS } from '../config/mapLayers';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { getChartCardSx } from '../utils/chartStyles';
import { formatInUserTimezone } from '../utils/timezoneUtils';

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

// Escape HTML for safe use in marker label
const escapeHtml = (str) => {
  if (str == null || str === '') return '';
  const s = String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

// Future Map style: green pin with white dot center and white rectangular label beneath
const createDeviceIcon = (status, hasAlerts = false, name = '') => {
  let color = '#10B981'; // green for online / in range
  let className = 'custom-device-marker';
  let pulseColor = 'rgba(16, 185, 129, 0.2)';
  
  if (hasAlerts) {
    color = '#EF4444';
    className = 'custom-device-marker alert-blink';
    pulseColor = 'rgba(239, 68, 68, 0.35)';
  } else if (status === 'offline') {
    color = '#6B7280';
    pulseColor = 'rgba(107, 114, 128, 0.2)';
  } else if (status !== 'online') {
    color = '#F59E0B';
    pulseColor = 'rgba(245, 158, 11, 0.25)';
  }
  
  const hasName = name && String(name).trim() !== '';
  const labelHtml = hasName
    ? `<div style="
        margin-top: 4px;
        padding: 3px 8px;
        background: #fff;
        color: #1f2937;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        border-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        border: 1px solid rgba(0,0,0,0.08);
        text-align: center;
      ">${escapeHtml(String(name).trim())}</div>`
    : '';
  
  const wrapperHeight = hasName ? 48 : 32;
  const iconAnchorY = 16;
  
  return L.divIcon({
    className: className,
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 32px;
      ">
        <div style="
          position: relative;
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            position: absolute;
            width: 28px;
            height: 28px;
            background-color: ${pulseColor};
            border-radius: 50%;
            animation: pulse 2.5s infinite;
          "></div>
          <div style="
            width: 22px;
            height: 22px;
            background: ${color};
            border: 2.5px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            position: relative;
            z-index: 1;
          "></div>
          <div style="
            position: absolute;
            width: 6px;
            height: 6px;
            background: white;
            border-radius: 50%;
            z-index: 2;
          "></div>
        </div>
        ${labelHtml}
      </div>
      <style>
        @keyframes pulse {
          0% { transform: scale(0.9); opacity: 0.8; }
          70% { transform: scale(1.15); opacity: 0.2; }
          100% { transform: scale(1.2); opacity: 0; }
        }
      </style>
    `,
    iconSize: [32, wrapperHeight],
    iconAnchor: [16, iconAnchorY]
  });
};

const mapLayers = MAP_BASE_LAYERS;

// Map bounds updater: fit all markers only when positions / device set actually changes — not on every
// parent re-render (e.g. opening popup / loading latest data used to recreate `devices` array each time).
const MapBoundsUpdater = ({ devices }) => {
  const map = useMap();
  const lastBoundsSigRef = useRef('');

  useEffect(() => {
    if (devices.length === 0) {
      lastBoundsSigRef.current = '';
      return;
    }
    const bounds = L.latLngBounds();
    let hasPoints = false;

    devices.forEach((device) => {
      if (device.latitude && device.longitude) {
        bounds.extend([device.latitude, device.longitude]);
        hasPoints = true;
      }
    });

    if (!hasPoints) return;

    const sig = devices
      .map((d) => `${d.device_id}:${Number(d.latitude).toFixed(5)},${Number(d.longitude).toFixed(5)}`)
      .sort()
      .join('|');

    if (sig === lastBoundsSigRef.current) return;
    lastBoundsSigRef.current = sig;

    map.fitBounds(bounds, { padding: [20, 20] });
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

// Build deviceId -> list of { parameter, min, max } for threshold alerts
const buildDeviceThresholds = (alerts) => {
  const map = {};
  if (!Array.isArray(alerts)) return map;
  alerts.forEach((a) => {
    if (a.type !== 'threshold' || (a.min == null && a.max == null)) return;
    const id = a.device_id;
    if (!map[id]) map[id] = [];
    map[id].push({
      parameter: a.parameter,
      min: a.min != null ? Number(a.min) : null,
      max: a.max != null ? Number(a.max) : null
    });
  });
  return map;
};

// True if latest data object has any value out of range for the device's thresholds
const isLatestDataOutOfRange = (latestData, thresholds) => {
  if (!latestData || typeof latestData !== 'object' || !Array.isArray(thresholds) || thresholds.length === 0) return false;
  for (const t of thresholds) {
    const value = latestData[t.parameter];
    if (value === undefined || value === null) continue;
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (Number.isNaN(num)) continue;
    if (t.min != null && num < t.min) return true;
    if (t.max != null && num > t.max) return true;
  }
  return false;
};

/** Same exclusions as Dashboard realtime cards / chart series */
const isGpsDisplayField = (p) => {
  const k = String(p || '').toLowerCase();
  return ['latitude', 'longitude', 'lat', 'lng', 'lon', 'altitude', 'speed', 'heading', 'accuracy', 'satellites'].includes(k);
};

const chartParamsFromMappings = (mappings) =>
  (mappings || [])
    .map((m) => m.target_field)
    .filter((p) => p && p !== 'datetime' && p !== 'timestamp' && !isGpsDisplayField(p));

const pickMappedSnapshot = (record, allowedParams) => {
  if (!record || !allowedParams?.length) return {};
  const out = {};
  allowedParams.forEach((key) => {
    if (record[key] !== undefined && record[key] !== null) {
      out[key] = record[key];
    }
  });
  return out;
};

const mergeSocketPayloadIntoDeviceData = (raw, allowedParams) => {
  if (!raw || typeof raw !== 'object' || !allowedParams?.length) return null;
  const allowed = new Set(allowedParams);
  const next = {};
  let changed = false;
  for (const key of allowedParams) {
    const value = raw[key];
    if (value === null || value === undefined || typeof value === 'object') continue;
    next[key] = value;
    changed = true;
  }
  return changed ? next : null;
};

const buildPopupParameterEntries = (data, allowedParams, formatLabelForPopup, formatValueForPopup) => {
  if (!data || typeof data !== 'object' || !allowedParams?.length) return [];
  return allowedParams
    .map((key) => {
      const value = data[key];
      if (value === null || value === undefined || typeof value === 'object') return null;
      const label = formatLabelForPopup(key);
      const displayValue = formatValueForPopup(key, value);
      if (!label || displayValue === '') return null;
      return { key, label, displayValue };
    })
    .filter(Boolean);
};

/** Leaflet popups do not always re-render when React state updates — refresh open popup + key remount */
const DeviceMapMarker = React.memo(function DeviceMapMarker({
  device,
  status,
  hasAlert,
  popupData,
  allowedParams,
  lastUpdated,
  isLoading,
  compactPopup,
  theme,
  formatLabelForPopup,
  formatValueForPopup,
  onMarkerClick,
  onPopupOpen,
}) {
  const markerRef = useRef(null);

  const entries = useMemo(
    () => buildPopupParameterEntries(popupData, allowedParams, formatLabelForPopup, formatValueForPopup),
    [popupData, allowedParams, formatLabelForPopup, formatValueForPopup]
  );

  const popupContentKey = useMemo(
    () =>
      `${lastUpdated || 'none'}|${entries.map((e) => `${e.key}=${e.displayValue}`).join('|')}`,
    [lastUpdated, entries]
  );

  const popupRefreshSignature = `${popupContentKey}|${isLoading ? 'loading' : 'ready'}`;

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker?.isPopupOpen?.()) return;
    const popup = marker.getPopup?.();
    if (popup) {
      popup.update();
    }
  }, [popupRefreshSignature]);

  const handlePopupOpen = useCallback(() => {
    onPopupOpen(device.device_id);
  }, [device.device_id, onPopupOpen]);

  const handleClick = useCallback(() => {
    onMarkerClick(device);
  }, [device, onMarkerClick]);

  return (
    <Marker
      ref={markerRef}
      position={[device.latitude, device.longitude]}
      icon={createDeviceIcon(status, hasAlert, device.name)}
      eventHandlers={{
        click: handleClick,
        popupopen: handlePopupOpen,
      }}
    >
      <Popup>
        <ThemedPopup theme={theme}>
          <Box
            sx={{
              minWidth: 200,
              maxWidth: 280,
              color: theme.palette.text.primary,
              backgroundColor: 'transparent',
            }}
          >
            <Typography
              variant="h6"
              fontWeight="bold"
              sx={{
                color: theme.palette.text.primary,
                mb: 0.5,
                fontSize: compactPopup ? '0.92rem' : '1.1rem',
              }}
            >
              {device.name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.4 }}>
              <Chip
                label={status}
                color={status === 'online' ? 'success' : 'error'}
                size="small"
                sx={{ fontSize: compactPopup ? '0.62rem' : '0.7rem', height: compactPopup ? 16 : 18 }}
              />
              {hasAlert && (
                <Chip
                  label="ALERT"
                  color="error"
                  size="small"
                  sx={{
                    animation: 'alertBlink 1s infinite',
                    fontSize: compactPopup ? '0.62rem' : '0.7rem',
                    height: compactPopup ? 16 : 18,
                  }}
                />
              )}
            </Box>
            <Typography
              variant="body2"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: compactPopup ? '0.68rem' : '0.78rem',
                mb: 0.5,
              }}
            >
              Last update:{' '}
              {lastUpdated ? formatInUserTimezone(lastUpdated) : 'no data yet'}
            </Typography>
            <Typography
              variant="subtitle2"
              sx={{
                mt: 0.5,
                mb: 0.3,
                color: theme.palette.text.primary,
                fontWeight: 'bold',
                fontSize: compactPopup ? '0.78rem' : '0.9rem',
              }}
            >
              Latest Parameters:
            </Typography>
            {entries.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ color: theme.palette.text.secondary, fontSize: compactPopup ? '0.68rem' : undefined }}
              >
                {isLoading ? 'Loading latest values...' : 'No recent data available'}
              </Typography>
            ) : (
              <Box
                sx={{
                  fontSize: compactPopup ? '0.68rem' : '0.8rem',
                  lineHeight: compactPopup ? 1.35 : 1.5,
                  '& > div': {
                    margin: 0,
                    padding: 0,
                    lineHeight: compactPopup ? 1.35 : 1.5,
                  },
                }}
              >
                {entries.map(({ key, label, displayValue }) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      margin: 0,
                      padding: 0,
                      lineHeight: compactPopup ? 1.35 : 1.5,
                      fontSize: compactPopup ? '0.68rem' : '0.8rem',
                      color: theme.palette.text.primary,
                    }}
                  >
                    <span style={{ color: theme.palette.text.secondary }}>{label}:</span>
                    <span style={{ fontWeight: 'bold', color: theme.palette.text.primary }}>
                      {displayValue}
                    </span>
                  </div>
                ))}
              </Box>
            )}
          </Box>
        </ThemedPopup>
      </Popup>
    </Marker>
  );
});

const DashboardMap = ({ socket, cardSx = {}, mapBoxSx, fillHeight = false, compactPopup = false }) => {
  const theme = useTheme();
  const { formatDisplayName, getUnit } = useFieldMetadata();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLayer, setSelectedLayer] = useState('dark');
  const [deviceData, setDeviceData] = useState({});
  /** Mapper target fields per device — popup shows only these (same as Realtime Data View cards) */
  const [deviceMappedParams, setDeviceMappedParams] = useState({});
  const deviceMappedParamsRef = useRef({});
  const [deviceLastUpdated, setDeviceLastUpdated] = useState({});
  const [deviceDataLoading, setDeviceDataLoading] = useState({});
  const [deviceAlerts, setDeviceAlerts] = useState({});
  const [alertThresholdsByDevice, setAlertThresholdsByDevice] = useState({});
  const [centerCoords, setCenterCoords] = useState(null);
  const mapRef = useRef(null);
  const refreshTimersRef = useRef({});
  const alertThresholdsRef = useRef({});

  useEffect(() => {
    alertThresholdsRef.current = alertThresholdsByDevice;
  }, [alertThresholdsByDevice]);

  const formatLabelForPopup = (key) => {
    if (key === 'datetime') return 'Data Time';
    if (key === 'timestamp') return 'Server Time';
    const label = formatDisplayName(key, { withUnit: false });
    const unit = getUnit(key);
    if (unit && !label.includes(`(${unit})`)) {
      return `${label} (${unit})`;
    }
    return label;
  };

  const formatValueForPopup = (key, value, precision = 3) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    if (key === 'datetime' || key === 'timestamp') {
      return formatInUserTimezone(value);
    }

    const formatNumeric = (num) =>
      Number.isFinite(num) ? num.toFixed(precision) : String(num);

    if (typeof value === 'number') {
      return formatNumeric(value);
    }

    if (typeof value === 'string') {
      const numeric = parseFloat(value);
      if (!Number.isNaN(numeric)) {
        return formatNumeric(numeric);
      }
      return value;
    }

    return typeof value === 'object' ? '' : value;
  };

  // Load alert threshold rules once (used to derive "out of range" from latest data)
  const loadAlertThresholds = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alerts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const list = data.alerts || [];
        setAlertThresholdsByDevice(buildDeviceThresholds(list));
      }
    } catch (e) {
      console.error('Error loading alert thresholds for map:', e);
    }
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

  const applyMappedDeviceSnapshot = (deviceId, chartParams, incoming, lastUpdatedIso) => {
    const patch = pickMappedSnapshot(incoming, chartParams);
    if (Object.keys(patch).length === 0) return false;

    setDeviceData((prev) => {
      const merged = { ...pickMappedSnapshot(prev[deviceId] || {}, chartParams), ...patch };
      const thresholds = alertThresholdsRef.current[deviceId] || [];
      setDeviceAlerts((prevAlerts) => ({
        ...prevAlerts,
        [deviceId]: isLatestDataOutOfRange(merged, thresholds),
      }));
      return { ...prev, [deviceId]: merged };
    });

    if (lastUpdatedIso) {
      setDeviceLastUpdated((prev) => ({
        ...prev,
        [deviceId]: new Date(lastUpdatedIso).toISOString(),
      }));
    }
    return true;
  };

  // Hydrate popup on login: data-dash newest row (48h, same as Dashboard) + DB latest-data fallback
  const loadDeviceData = useCallback(async (deviceId) => {
    setDeviceDataLoading((prev) => ({ ...prev, [deviceId]: true }));

    try {
      const token = localStorage.getItem('iot_token');
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      const assignRes = await fetch(`${API_BASE_URL}/device-mapper-assignments/${deviceId}`, { headers });
      if (!assignRes.ok) return;

      const assignJson = await assignRes.json();
      const mappings = assignJson.assignment?.mappings || [];
      const chartParams = chartParamsFromMappings(mappings);
      if (chartParams.length === 0) return;

      setDeviceMappedParams((prev) => ({ ...prev, [deviceId]: chartParams }));
      deviceMappedParamsRef.current[deviceId] = chartParams;

      const paramList = [...chartParams];
      if (!paramList.includes('datetime')) {
        paramList.unshift('datetime');
      }

      const endDate = new Date().toISOString();
      const startDate = subHours(new Date(), 48).toISOString();
      const dashQuery = new URLSearchParams({
        deviceIds: deviceId,
        parameters: paramList.join(','),
        startDate,
        endDate,
        limit: '5000',
      });

      const [dashRes, latestRes] = await Promise.all([
        fetch(`${API_BASE_URL}/data-dash?${dashQuery}`, { headers }),
        fetch(`${API_BASE_URL}/devices/${deviceId}/latest-data`, { headers }),
      ]);

      let dashRecord = null;
      let dashLastTs = null;
      if (dashRes.ok) {
        const dashJson = await dashRes.json();
        const mappedData = dashJson.data || [];
        if (mappedData.length > 0) {
          const sortedData = [...mappedData].sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
          );
          dashRecord = sortedData[0];
          dashLastTs = dashRecord.timestamp || dashRecord.datetime;
        }
      }

      let dbRecord = null;
      let dbLastTs = null;
      if (latestRes.ok) {
        const latestJson = await latestRes.json();
        dbRecord = latestJson.data || {};
        dbLastTs = latestJson.last_updated_at;
      }

      const dashPatch = pickMappedSnapshot(dashRecord, chartParams);
      const dbPatch = pickMappedSnapshot(dbRecord, chartParams);
      const mergedIncoming = { ...dbPatch, ...dashPatch };
      const lastTs =
        Object.keys(dashPatch).length > 0
          ? dashLastTs
          : dbLastTs;

      applyMappedDeviceSnapshot(deviceId, chartParams, mergedIncoming, lastTs);
    } catch (error) {
      console.error('Error loading device data:', error);
    } finally {
      setDeviceDataLoading((prev) => ({ ...prev, [deviceId]: false }));
    }
  }, []);

  const handleMarkerClick = useCallback(
    (device) => {
      loadDeviceData(device.device_id);
      setCenterCoords({ lat: device.latitude, lng: device.longitude });
    },
    [loadDeviceData]
  );

  const handlePopupOpen = useCallback(
    (deviceId) => {
      loadDeviceData(deviceId);
    },
    [loadDeviceData]
  );

  // Load devices and alert thresholds on mount
  useEffect(() => {
    loadDevices();
    loadAlertThresholds();

    const onStatusUpdate = (data) => {
      setDevices((prevDevices) =>
        prevDevices.map((device) =>
          device.device_id === data.device_id ? { ...device, status: data.status } : device
        )
      );
    };

    const onDeviceData = (payload) => {
      const deviceId = payload?.deviceId || payload?.device_id;
      if (!deviceId) return;

      const allowed = deviceMappedParamsRef.current[deviceId];
      if (!allowed?.length) {
        loadDeviceData(deviceId);
        return;
      }

      const livePatch = mergeSocketPayloadIntoDeviceData(payload?.data, allowed);
      if (livePatch) {
        setDeviceData((prev) => {
          const merged = { ...pickMappedSnapshot(prev[deviceId] || {}, allowed), ...livePatch };
          const thresholds = alertThresholdsRef.current[deviceId] || [];
          setDeviceAlerts((prevAlerts) => ({
            ...prevAlerts,
            [deviceId]: isLatestDataOutOfRange(merged, thresholds),
          }));
          return { ...prev, [deviceId]: merged };
        });
        setDeviceLastUpdated((prev) => ({
          ...prev,
          [deviceId]:
            payload.timestamp != null
              ? new Date(payload.timestamp).toISOString()
              : new Date().toISOString(),
        }));
      }

      clearTimeout(refreshTimersRef.current[deviceId]);
      refreshTimersRef.current[deviceId] = setTimeout(() => {
        loadDeviceData(deviceId);
      }, 800);
    };

    if (socket) {
      socket.on('device_status_update', onStatusUpdate);
      socket.on('device_data', onDeviceData);
    }

    const interval = setInterval(loadDevices, 2 * 60 * 1000);
    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('device_status_update', onStatusUpdate);
        socket.off('device_data', onDeviceData);
      }
      Object.values(refreshTimersRef.current).forEach(clearTimeout);
    };
  }, [socket, loadDeviceData]);

  // Preload latest data once devices are on the map (do not re-fetch when alert rules load)
  useEffect(() => {
    if (loading) return;
    const withCoords = devices.filter(
      (d) => d.latitude && d.longitude && !isNaN(d.latitude) && !isNaN(d.longitude)
    );
    withCoords.forEach((device) => loadDeviceData(device.device_id));
  }, [devices, loading, loadDeviceData]);

  // Recompute marker alert state when thresholds arrive (without re-fetching all device data)
  useEffect(() => {
    if (Object.keys(alertThresholdsByDevice).length === 0) return;
    setDeviceAlerts((prevAlerts) => {
      const next = { ...prevAlerts };
      Object.entries(deviceData).forEach(([deviceId, data]) => {
        if (!data || typeof data !== 'object') return;
        next[deviceId] = isLatestDataOutOfRange(data, alertThresholdsByDevice[deviceId] || []);
      });
      return next;
    });
  }, [alertThresholdsByDevice]);

  // Periodic refresh of latest data so "next data" in range turns marker green
  useEffect(() => {
    if (loading) return;
    const withCoords = devices.filter(
      (d) => d.latitude && d.longitude && !isNaN(d.latitude) && !isNaN(d.longitude)
    );
    if (withCoords.length === 0) return;
    const interval = setInterval(() => {
      withCoords.forEach((device) => loadDeviceData(device.device_id));
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [devices, loading, loadDeviceData]);

  // Stable reference unless `devices` from API changes — avoids MapBoundsUpdater refitting on unrelated state (popup data).
  const devicesWithCoordinates = useMemo(
    () =>
      devices.filter(
        (device) =>
          device.latitude &&
          device.longitude &&
          !isNaN(device.latitude) &&
          !isNaN(device.longitude)
      ),
    [devices]
  );

  if (loading) {
    return (
      <Card sx={{ mt: 1, mb: 1, borderRadius: 1, ...getChartCardSx(theme), ...cardSx }}>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={fillHeight ? 200 : 400}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ 
      mt: 1, 
      mb: 1,
      borderRadius: 1,
      ...getChartCardSx(theme),
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
      overflow: 'hidden',
      ...(fillHeight ? { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, mt: 0, mb: 0 } : {}),
      ...cardSx,
    }}>
      <CardContent sx={{ p: 0, ...(fillHeight ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}) }}>
        <Box sx={{ pt: 0.5, px: 1, pb: 1, ...(fillHeight ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}) }}>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

          <Box sx={{ 
            width: '100%', 
            position: 'relative',
            borderRadius: '4px',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
            border: '1px solid rgba(0, 0, 0, 0.05)',
            ...(fillHeight ? { flex: 1, minHeight: 160, height: '100%' } : { height: 500 }),
            ...mapBoxSx,
          }}>
          {/* Device count badge - inside map, adjacent to zoom controls (Future Map style) */}
          <Box
            sx={{
              position: 'absolute',
              top: 10,
              left: 50,
              zIndex: 1000,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              borderRadius: 1,
              bgcolor: 'rgba(255,255,255,0.95)',
              border: '1px solid rgba(0,0,0,0.1)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              color: 'text.primary',
              fontWeight: 500,
              fontSize: '0.8rem',
            }}
          >
            <LocationIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography component="span" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
              {devicesWithCoordinates.length} devices on map
            </Typography>
          </Box>

          {/* Map controls - top right (layer swatches + refresh) */}
          <Box
            sx={{
              position: 'absolute',
              top: 10,
              right: 12,
              zIndex: 1000,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
            }}
            role="group"
            aria-label="Map controls"
          >
            {mapLayers.map((layer) => {
              const selected = selectedLayer === layer.value;
              return (
                <Tooltip key={layer.value} title={layer.label} placement="bottom">
                  <IconButton
                    onClick={() => setSelectedLayer(layer.value)}
                    size="small"
                    aria-label={layer.label}
                    aria-pressed={selected}
                    sx={{
                      p: '4px',
                      borderRadius: '50%',
                      border: '2px solid',
                      borderColor: selected ? 'primary.main' : 'rgba(255,255,255,0.65)',
                      bgcolor: 'rgba(255,255,255,0.06)',
                      backdropFilter: 'blur(6px)',
                      boxShadow: selected ? 2 : 0,
                      '&:hover': {
                        bgcolor: 'rgba(255,255,255,0.12)',
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: layer.swatch,
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)',
                      }}
                    />
                  </IconButton>
                </Tooltip>
              );
            })}
            <Tooltip title="Refresh">
              <IconButton
                onClick={loadDevices}
                size="small"
                sx={{
                  color: 'rgba(255,255,255,0.9)',
                  bgcolor: 'rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(6px)',
                  border: '1px solid rgba(255,255,255,0.35)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
                }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Site Location label - bottom left (overlay) */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 10,
              left: 12,
              zIndex: 1000,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.25,
              py: 0.75,
              borderRadius: 1,
              color: 'rgba(255,255,255,0.9)',
              fontWeight: 600,
              bgcolor: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.18)',
            }}
          >
            <LocationIcon sx={{ fontSize: 18, color: 'rgba(56, 189, 248, 0.95)' }} />
            <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
              Site Location
            </Typography>
          </Box>
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
            
            <MarkerClusterGroup
              chunkedLoading
              showCoverageOnHover={false}
              spiderfyOnMaxZoom
              disableClusteringAtZoom={17}
              maxClusterRadius={55}
            >
              {devicesWithCoordinates.map((device) => (
                <DeviceMapMarker
                  key={device.device_id}
                  device={device}
                  status={device.status}
                  hasAlert={!!deviceAlerts[device.device_id]}
                  popupData={deviceData[device.device_id]}
                  allowedParams={
                    deviceMappedParams[device.device_id] ||
                    deviceMappedParamsRef.current[device.device_id] ||
                    []
                  }
                  lastUpdated={deviceLastUpdated[device.device_id]}
                  isLoading={!!deviceDataLoading[device.device_id]}
                  compactPopup={compactPopup}
                  theme={theme}
                  formatLabelForPopup={formatLabelForPopup}
                  formatValueForPopup={formatValueForPopup}
                  onMarkerClick={handleMarkerClick}
                  onPopupOpen={handlePopupOpen}
                />
              ))}
            </MarkerClusterGroup>
            
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