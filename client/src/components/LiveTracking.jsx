import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Divider,
  Tooltip,
  useTheme,
  IconButton,
  Slider,
  Switch,
  FormControlLabel,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import ReplayIcon from '@mui/icons-material/Replay';
import { API_BASE_URL } from '../config/api';
import { MAP_BASE_LAYERS, OWM_WEATHER_OVERLAYS } from '../config/mapLayers';
import { deriveStateSegments, extractGpsFromDevicePayload } from '../utils/liveTrackingStates';
import { filterGpsOutliers } from '../utils/gpsFilter';
import { formatInUserTimezone } from '../utils/timezoneUtils';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const replayHeadIcon = L.divIcon({
  className: 'lt-replay-head',
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#fb923c;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const MAX_LIVE_POINTS = 800;
const CLICK_DEG_TOLERANCE = 0.04;
/** Max circle markers on map for click + popup (performance); rest use background polyline + map click */
const MAX_HISTORY_POINT_MARKERS = 900;
const DEVICE_REFRESH_MS = 45000;
const REPLAY_BASE_INTERVAL_MS = 180;

const escapeHtml = (str) => {
  if (str == null || str === '') return '';
  const s = String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

function createDeviceMapIcon(name, { selected, pulse }) {
  const label = escapeHtml((name || '').trim() || 'Device');
  const ring = pulse ? '0 0 0 3px rgba(34,197,94,0.35)' : 'none';
  const bg = selected ? '#2563eb' : '#10b981';
  return L.divIcon({
    className: 'live-tracking-device-marker',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;">
        <div style="
          width:22px;height:22px;border-radius:50%;
          background:${bg};border:2.5px solid #fff;
          box-shadow:${ring}, 0 2px 8px rgba(0,0,0,0.35);
        "></div>
        <div style="
          margin-top:4px;padding:2px 8px;background:#fff;color:#111827;
          font-size:11px;font-weight:600;max-width:140px;white-space:nowrap;
          overflow:hidden;text-overflow:ellipsis;border-radius:4px;
          box-shadow:0 1px 3px rgba(0,0,0,0.2);border:1px solid rgba(0,0,0,0.08);
        ">${label}</div>
      </div>`,
    iconSize: [140, 48],
    iconAnchor: [11, 22],
  });
}

function PopupGpsTable({ point }) {
  if (!point) return null;
  return (
    <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        <tr>
          <td style={{ padding: '2px 6px 2px 0', color: '#64748b' }}>Time</td>
          <td>{formatInUserTimezone(point.timestamp)}</td>
        </tr>
        <tr>
          <td style={{ padding: '2px 6px 2px 0', color: '#64748b' }}>Lat</td>
          <td>{Number(point.latitude).toFixed(6)}</td>
        </tr>
        <tr>
          <td style={{ padding: '2px 6px 2px 0', color: '#64748b' }}>Lng</td>
          <td>{Number(point.longitude).toFixed(6)}</td>
        </tr>
        <tr>
          <td style={{ padding: '2px 6px 2px 0', color: '#64748b' }}>Speed</td>
          <td>{point.speed != null ? String(point.speed) : '—'}</td>
        </tr>
        {point.heading != null && (
          <tr>
            <td style={{ padding: '2px 6px 2px 0', color: '#64748b' }}>Heading</td>
            <td>{String(point.heading)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function PopupSensorBlock({ loading, snapshot }) {
  if (loading) {
    return (
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
        Loading sensors…
      </Typography>
    );
  }
  if (!snapshot?.readings?.length) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        No sensor readings in window.
      </Typography>
    );
  }
  return (
    <Box sx={{ mt: 0.75, maxHeight: 180, overflow: 'auto' }}>
      <Typography variant="caption" fontWeight={600}>
        Nearest sensors
      </Typography>
      <table style={{ fontSize: 11, width: '100%', marginTop: 4 }}>
        <tbody>
          {snapshot.readings.map((r) => (
            <tr key={r.sensor_type}>
              <td style={{ padding: '2px 4px 2px 0' }}>{r.sensor_type}</td>
              <td style={{ padding: '2px 0', textAlign: 'right' }}>
                {r.value != null ? r.value : '—'} {r.unit || ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}

function HistorySelectionMarker({ position, point, snapshotLoading, sensorSnapshot }) {
  return (
    <Marker
      position={position}
      zIndexOffset={800}
      eventHandlers={{
        add: (e) => {
          e.target.openPopup();
        },
      }}
    >
      <Popup>
        <Box sx={{ minWidth: 200, maxWidth: 280 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            GPS point
          </Typography>
          <PopupGpsTable point={point} />
          <Divider sx={{ my: 0.75 }} />
          <PopupSensorBlock loading={snapshotLoading} snapshot={sensorSnapshot} />
        </Box>
      </Popup>
    </Marker>
  );
}

function DeviceFleetMarker({ device, selected, livePulse, onSelectDevice }) {
  const lat = Number(device.latitude);
  const lng = Number(device.longitude);
  const icon = useMemo(
    () => createDeviceMapIcon(device.name || device.device_id, { selected, pulse: livePulse }),
    [device.name, device.device_id, selected, livePulse]
  );
  return (
    <Marker
      position={[lat, lng]}
      icon={icon}
      zIndexOffset={selected ? 600 : 400}
      eventHandlers={{
        click: () => onSelectDevice(device.device_id),
      }}
    >
      <Popup>
        <Box sx={{ minWidth: 200, maxWidth: 280 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            {device.name || device.device_id}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
            {device.device_id}
          </Typography>
          <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 6px 2px 0', color: '#64748b' }}>Status</td>
                <td>{device.status ?? '—'}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 6px 2px 0', color: '#64748b' }}>Last data</td>
                <td>{device.last_data_at ? formatInUserTimezone(device.last_data_at) : '—'}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 6px 2px 0', color: '#64748b' }}>Lat</td>
                <td>{lat.toFixed(6)}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 6px 2px 0', color: '#64748b' }}>Lng</td>
                <td>{lng.toFixed(6)}</td>
              </tr>
            </tbody>
          </table>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            Position from server: manual coordinates if set, otherwise latest device GPS track.
          </Typography>
        </Box>
      </Popup>
    </Marker>
  );
}

function authHeaders() {
  const token = localStorage.getItem('iot_token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function FitBounds({ positions, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (!positions || positions.length < 1) return;
    try {
      if (positions.length === 1) {
        const [lat, lng] = positions[0];
        map.setView([lat, lng], 14, { animate: false });
        return;
      }
      const b = L.latLngBounds(positions.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(b, { padding: [28, 28], maxZoom: 16, animate: false });
    } catch {
      /* ignore */
    }
  }, [map, positions, trigger]);
  return null;
}

function MapClickSelect({ points, onSelect }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      let best = null;
      let bestScore = Infinity;
      for (const p of points) {
        const dlat = p.latitude - lat;
        const dlng = p.longitude - lng;
        const d = dlat * dlat + dlng * dlng;
        if (d < bestScore) {
          bestScore = d;
          best = p;
        }
      }
      if (best && Math.sqrt(bestScore) <= CLICK_DEG_TOLERANCE) {
        onSelect(best);
      }
    },
  });
  return null;
}

const STATE_COLOR = {
  moving: '#2563eb',
  stop: '#f59e0b',
  park: '#7c3aed',
};

const OPENWEATHERMAP_API_KEY = import.meta.env.VITE_OPENWEATHERMAP_API_KEY;

export default function LiveTracking({ socket }) {
  const theme = useTheme();
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [deviceError, setDeviceError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);

  const [settings, setSettings] = useState(null);
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [historyPoints, setHistoryPoints] = useState([]);
  const [historyMeta, setHistoryMeta] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [mapFitTrigger, setMapFitTrigger] = useState(0);

  const [liveTrail, setLiveTrail] = useState([]);
  const liveTrailRef = useRef([]);

  const [rangeStart, setRangeStart] = useState(() => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [rangeEnd, setRangeEnd] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  const [selectedGps, setSelectedGps] = useState(null);
  const [sensorSnapshot, setSensorSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [baseMapId, setBaseMapId] = useState('dark');
  const [weatherOverlay, setWeatherOverlay] = useState('none');
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);

  const loadDevices = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent);
    if (!silent) {
      setLoadingDevices(true);
      setDeviceError(null);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/devices/with-coordinates`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load devices');
      const list = data.devices || [];
      setDevices(list);
      setSelectedId((prev) => {
        if (prev && list.some((d) => d.device_id === prev)) return prev;
        return list[0]?.device_id || null;
      });
      if (!silent) {
        setMapFitTrigger((t) => t + 1);
      }
    } catch (e) {
      if (!silent) setDeviceError(e.message || 'Failed to load devices');
    } finally {
      if (!silent) setLoadingDevices(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/live-tracking/settings`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed settings');
      setSettings(data.settings);
      setSettingsDraft(data.settings);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    loadDevices();
    loadSettings();
  }, [loadDevices, loadSettings]);

  useEffect(() => {
    const id = setInterval(() => loadDevices({ silent: true }), DEVICE_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadDevices]);

  const saveSettings = async () => {
    if (!settingsDraft) return;
    setSettingsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/live-tracking/settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(settingsDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSettings(data.settings);
      setSettingsDraft(data.settings);
    } catch (e) {
      setDeviceError(e.message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const loadHistory = async () => {
    if (!selectedId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    setSelectedGps(null);
    setSensorSnapshot(null);
    try {
      const startIso = new Date(rangeStart).toISOString();
      const endIso = new Date(rangeEnd).toISOString();
      const q = new URLSearchParams({ start: startIso, end: endIso, limit: '20000' });
      const res = await fetch(`${API_BASE_URL}/live-tracking/devices/${encodeURIComponent(selectedId)}/gps-tracks?${q}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load history');
      setHistoryPoints(data.points || []);
      setHistoryMeta({
        total_in_range: data.total_in_range,
        returned: data.returned,
        downsampled: data.downsampled,
      });
      setReplayIndex(0);
      setReplayPlaying(false);
      setMapFitTrigger((t) => t + 1);
    } catch (e) {
      setHistoryError(e.message || 'History load failed');
      setHistoryPoints([]);
      setHistoryMeta(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchSnapshot = async (gpsPoint) => {
    if (!selectedId || !gpsPoint?.timestamp) return;
    setSnapshotLoading(true);
    setSensorSnapshot(null);
    try {
      const at = new Date(gpsPoint.timestamp).toISOString();
      const w = settings?.sensorSnapshotWindowMs || 300000;
      const q = new URLSearchParams({ at, windowMs: String(w) });
      const res = await fetch(
        `${API_BASE_URL}/live-tracking/devices/${encodeURIComponent(selectedId)}/sensor-snapshot?${q}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Snapshot failed');
      setSensorSnapshot(data);
    } catch {
      setSensorSnapshot({ readings: [], error: true });
    } finally {
      setSnapshotLoading(false);
    }
  };

  const onSelectPoint = (p) => {
    setSelectedGps(p);
    fetchSnapshot(p);
  };

  const onSelectDeviceFromMap = useCallback((deviceId) => {
    setSelectedId(deviceId);
  }, []);

  useEffect(() => {
    liveTrailRef.current = [];
    setLiveTrail([]);
    setSelectedGps(null);
    setSensorSnapshot(null);
    setHistoryPoints([]);
    setHistoryMeta(null);
  }, [selectedId]);

  useEffect(() => {
    if (!socket || typeof socket.on !== 'function') return undefined;
    const handler = (payload) => {
      if (!payload?.deviceId || !payload.data) return;
      const gps = extractGpsFromDevicePayload(payload.data);
      if (!gps) return;

      setDevices((prev) => {
        const has = prev.some((d) => d.device_id === payload.deviceId);
        if (!has) return prev;
        return prev.map((d) =>
          d.device_id === payload.deviceId ? { ...d, latitude: gps.latitude, longitude: gps.longitude } : d
        );
      });

      if (selectedId && payload.deviceId === selectedId) {
        const next = [...liveTrailRef.current, gps];
        if (next.length > MAX_LIVE_POINTS) next.splice(0, next.length - MAX_LIVE_POINTS);
        liveTrailRef.current = next;
        setLiveTrail(next);
      }
    };
    socket.on('device_data', handler);
    if (selectedId && typeof socket.subscribeDevice === 'function') {
      socket.subscribeDevice(selectedId);
    }
    return () => {
      if (typeof socket.off === 'function') socket.off('device_data', handler);
      if (selectedId && typeof socket.unsubscribeDevice === 'function') {
        socket.unsubscribeDevice(selectedId);
      }
    };
  }, [socket, selectedId]);

  const filteredHistoryPoints = useMemo(() => {
    if (!settings) return historyPoints;
    return filterGpsOutliers(historyPoints, settings);
  }, [historyPoints, settings]);

  const segments = useMemo(() => {
    if (!settings || !filteredHistoryPoints.length) return [];
    return deriveStateSegments(filteredHistoryPoints, settings);
  }, [filteredHistoryPoints, settings]);

  const timelineRange = useMemo(() => {
    if (!filteredHistoryPoints.length) return null;
    const t0 = new Date(filteredHistoryPoints[0].timestamp).getTime();
    const t1 = new Date(filteredHistoryPoints[filteredHistoryPoints.length - 1].timestamp).getTime();
    return { t0, t1, span: Math.max(1, t1 - t0) };
  }, [filteredHistoryPoints]);

  const historyPositions = useMemo(
    () => filteredHistoryPoints.map((p) => [p.latitude, p.longitude]),
    [filteredHistoryPoints]
  );

  const replayPolyPositions = useMemo(() => {
    if (filteredHistoryPoints.length < 2 || replayIndex < 1) return [];
    return filteredHistoryPoints.slice(0, replayIndex + 1).map((p) => [Number(p.latitude), Number(p.longitude)]);
  }, [filteredHistoryPoints, replayIndex]);
  const livePositions = useMemo(() => liveTrail.map((p) => [p.latitude, p.longitude]), [liveTrail]);
  const deviceFitPositions = useMemo(
    () =>
      devices
        .filter((d) => d.latitude != null && d.longitude != null)
        .map((d) => [Number(d.latitude), Number(d.longitude)]),
    [devices]
  );

  const allFitPositions = useMemo(() => {
    const dev = deviceFitPositions;
    const h = historyPositions.length >= 2 ? historyPositions : [];
    const l = livePositions.length >= 2 ? livePositions : [];
    const singleH = historyPositions.length === 1 ? historyPositions : [];
    const singleL = livePositions.length === 1 ? livePositions : [];

    if (h.length >= 2) return h;
    if (l.length >= 2) return l;
    if (h.length === 1) return singleL.length ? [...singleH, ...singleL] : [...singleH, ...dev];
    if (l.length === 1) return [...singleL, ...dev];
    if (dev.length >= 2) return dev;
    if (dev.length === 1) return dev;
    return [];
  }, [deviceFitPositions, historyPositions, livePositions]);

  const clickablePoints = useMemo(() => {
    const map = new Map();
    for (const p of filteredHistoryPoints) {
      const k = `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)},${p.timestamp}`;
      map.set(k, p);
    }
    for (const p of liveTrail) {
      const k = `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)},${p.timestamp}`;
      if (!map.has(k)) map.set(k, { ...p, id: `live-${p.timestamp}` });
    }
    return Array.from(map.values());
  }, [filteredHistoryPoints, liveTrail]);

  const historyPointMarkers = useMemo(() => {
    const n = filteredHistoryPoints.length;
    if (n === 0) return [];
    if (n <= MAX_HISTORY_POINT_MARKERS) {
      return filteredHistoryPoints.map((p) => ({ p, key: p.id ?? `${p.timestamp}-${p.latitude}-${p.longitude}` }));
    }
    const step = Math.ceil(n / MAX_HISTORY_POINT_MARKERS);
    const out = [];
    for (let i = 0; i < n; i += step) {
      const p = filteredHistoryPoints[i];
      out.push({ p, key: p.id ?? `${p.timestamp}-${i}` });
    }
    const last = filteredHistoryPoints[n - 1];
    const lastKey = last.id ?? `${last.timestamp}-last`;
    if (out[out.length - 1]?.key !== lastKey) {
      out.push({ p: last, key: lastKey });
    }
    return out;
  }, [filteredHistoryPoints]);

  useEffect(() => {
    setReplayIndex((i) => {
      const max = Math.max(0, filteredHistoryPoints.length - 1);
      return Math.min(i, max);
    });
  }, [historyPoints, settings, filteredHistoryPoints.length]);

  useEffect(() => {
    if (!replayPlaying || filteredHistoryPoints.length < 2) return undefined;
    const ms = Math.max(50, Math.round(REPLAY_BASE_INTERVAL_MS / replaySpeed));
    const id = setInterval(() => {
      setReplayIndex((i) => {
        const max = filteredHistoryPoints.length - 1;
        if (i >= max) {
          setReplayPlaying(false);
          return max;
        }
        return i + 1;
      });
    }, ms);
    return () => clearInterval(id);
  }, [replayPlaying, replaySpeed, filteredHistoryPoints.length]);

  const replayMarkerPosition = useMemo(() => {
    if (!filteredHistoryPoints.length) return null;
    const p = filteredHistoryPoints[Math.min(replayIndex, filteredHistoryPoints.length - 1)];
    return [Number(p.latitude), Number(p.longitude)];
  }, [filteredHistoryPoints, replayIndex]);

  const activeBaseLayer = useMemo(
    () => MAP_BASE_LAYERS.find((l) => l.value === baseMapId) || MAP_BASE_LAYERS[0],
    [baseMapId]
  );

  useEffect(() => {
    if (weatherOverlay !== 'none' && !OPENWEATHERMAP_API_KEY) {
      setWeatherOverlay('none');
    }
  }, [weatherOverlay]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 1.5,
          flex: 1,
          minHeight: 0,
          alignItems: 'stretch',
        }}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              flex: 1,
              minHeight: { xs: 360, md: 420 },
              position: 'relative',
              overflow: 'hidden',
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
            }}
          >
            {!sidebarOpen && (
              <IconButton
                size="small"
                onClick={() => setSidebarOpen(true)}
                aria-label="Show settings panel"
                sx={{
                  position: 'absolute',
                  right: 8,
                  top: 8,
                  zIndex: 1000,
                  bgcolor: 'background.paper',
                  boxShadow: 2,
                }}
              >
                <ChevronLeftIcon />
              </IconButton>
            )}
            {loadingDevices ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <>
            <Box
              sx={{
                position: 'absolute',
                left: 48,
                top: 8,
                zIndex: 1000,
                pointerEvents: 'auto',
                maxWidth: { xs: 'calc(100% - 56px)', md: 'min(580px, calc(100% - 100px))' },
              }}
            >
              <Paper elevation={3} sx={{ p: 0.75 }}>
                <Stack direction="row" flexWrap="wrap" alignItems="center" spacing={0.75} useFlexGap>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 0.25 }}>
                    Base
                  </Typography>
                  {MAP_BASE_LAYERS.map((layer) => {
                    const selected = baseMapId === layer.value;
                    return (
                      <Tooltip key={layer.value} title={layer.label} placement="bottom">
                        <Box
                          component="button"
                          type="button"
                          onClick={() => setBaseMapId(layer.value)}
                          aria-label={layer.label}
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: 1,
                            border: selected ? '2px solid' : '1px solid',
                            borderColor: selected ? 'primary.main' : 'divider',
                            background: layer.swatch,
                            cursor: 'pointer',
                            p: 0,
                            flexShrink: 0,
                          }}
                        />
                      </Tooltip>
                    );
                  })}
                  <Divider orientation="vertical" flexItem sx={{ height: 26, mx: 0.25 }} />
                  <FormControl size="small" sx={{ minWidth: 132, flex: '1 1 120px' }}>
                    <InputLabel id="lt-weather-ol">Weather</InputLabel>
                    <Select
                      labelId="lt-weather-ol"
                      label="Weather"
                      value={weatherOverlay}
                      onChange={(e) => setWeatherOverlay(e.target.value)}
                    >
                      {OWM_WEATHER_OVERLAYS.map((o) => (
                        <MenuItem key={o.value} value={o.value} disabled={o.layer != null && !OPENWEATHERMAP_API_KEY}>
                          {o.label}
                          {!OPENWEATHERMAP_API_KEY && o.layer ? ' — set VITE_OPENWEATHERMAP_API_KEY' : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Paper>
            </Box>
            <MapContainer
            center={[-2.5, 118]}
            zoom={5}
            style={{ height: '100%', width: '100%', minHeight: 360 }}
            scrollWheelZoom
          >
            <TileLayer
              key={activeBaseLayer.value}
              attribution={activeBaseLayer.attribution}
              url={activeBaseLayer.url}
            />
            {weatherOverlay !== 'none' && OPENWEATHERMAP_API_KEY && (
              <TileLayer
                key={weatherOverlay}
                attribution='Weather &copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>'
                url={`https://tile.openweathermap.org/map/${weatherOverlay}/{z}/{x}/{y}.png?appid=${OPENWEATHERMAP_API_KEY}`}
                opacity={0.55}
                zIndex={500}
              />
            )}
            <FitBounds positions={allFitPositions} trigger={mapFitTrigger} />
            {historyPositions.length >= 2 && (
              <Polyline positions={historyPositions} pathOptions={{ color: '#38bdf8', weight: 4, opacity: 0.85 }} />
            )}
            {replayPolyPositions.length >= 2 && (
              <Polyline positions={replayPolyPositions} pathOptions={{ color: '#fb923c', weight: 3, opacity: 0.92 }} />
            )}
            {replayMarkerPosition && filteredHistoryPoints.length > 0 && (
              <Marker position={replayMarkerPosition} icon={replayHeadIcon} zIndexOffset={900} interactive={false} />
            )}
            {livePositions.length >= 2 && (
              <Polyline positions={livePositions} pathOptions={{ color: '#22c55e', weight: 3, opacity: 0.9 }} />
            )}
            {devices.map((d) => (
              <DeviceFleetMarker
                key={d.device_id}
                device={d}
                selected={d.device_id === selectedId}
                livePulse={d.device_id === selectedId && liveTrail.length > 0}
                onSelectDevice={onSelectDeviceFromMap}
              />
            ))}
            {historyPointMarkers.map(({ p, key }) => (
              <CircleMarker
                key={key}
                center={[Number(p.latitude), Number(p.longitude)]}
                radius={6}
                pathOptions={{
                  color: '#bae6fd',
                  fillColor: '#38bdf8',
                  fillOpacity: 0.45,
                  weight: 1,
                }}
                eventHandlers={{
                  click: () => onSelectPoint(p),
                }}
              />
            ))}
            {selectedGps && (
              <HistorySelectionMarker
                key={`sel-${selectedGps.id ?? selectedGps.timestamp}`}
                position={[Number(selectedGps.latitude), Number(selectedGps.longitude)]}
                point={selectedGps}
                snapshotLoading={snapshotLoading}
                sensorSnapshot={sensorSnapshot}
              />
            )}
            <MapClickSelect points={clickablePoints} onSelect={onSelectPoint} />
          </MapContainer>
          </>
        )}
        <Box
          sx={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            bgcolor: 'rgba(0,0,0,0.55)',
            color: '#fff',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            fontSize: 11,
            pointerEvents: 'none',
          }}
        >
          Device markers = last server position · Blue = history (filtered) · Orange = replay head · Green = live
        </Box>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              flexShrink: 0,
              p: 1.5,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">State timeline (filtered history)</Typography>
              <Tooltip title="Moving / stop / park from speed ≤ stop threshold and dwell times">
                <Typography variant="caption" color="text.secondary">
                  {filteredHistoryPoints.length}/{historyPoints.length} pts
                </Typography>
              </Tooltip>
            </Stack>
            <Box sx={{ height: 32, display: 'flex', borderRadius: 1, overflow: 'hidden', border: `1px solid ${theme.palette.divider}`, mb: 1 }}>
              {timelineRange && segments.length ? (
                segments.map((seg, idx) => {
                  const w = ((seg.to - seg.from) / timelineRange.span) * 100;
                  return (
                    <Box
                      key={`${seg.from}-${idx}`}
                      sx={{
                        width: `${w}%`,
                        bgcolor: STATE_COLOR[seg.state] || '#64748b',
                        minWidth: seg.durationMs > 0 ? 2 : 0,
                      }}
                    />
                  );
                })
              ) : (
                <Box sx={{ flex: 1, bgcolor: 'action.hover' }} />
              )}
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
              {['moving', 'stop', 'park'].map((k) => (
                <Stack key={k} direction="row" alignItems="center" spacing={0.5}>
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: STATE_COLOR[k] }} />
                  <Typography variant="caption">{k}</Typography>
                </Stack>
              ))}
            </Stack>

            <Divider sx={{ my: 1 }} />

            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
              Replay
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <IconButton
                color="primary"
                size="small"
                aria-label={replayPlaying ? 'Pause' : 'Play'}
                disabled={filteredHistoryPoints.length < 2}
                onClick={() => setReplayPlaying((p) => !p)}
              >
                {replayPlaying ? <PauseIcon /> : <PlayArrowIcon />}
              </IconButton>
              <IconButton
                size="small"
                aria-label="Reset replay"
                disabled={filteredHistoryPoints.length < 1}
                onClick={() => {
                  setReplayPlaying(false);
                  setReplayIndex(0);
                }}
              >
                <ReplayIcon />
              </IconButton>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={replaySpeed}
                onChange={(_, v) => v != null && setReplaySpeed(v)}
                sx={{ ml: { xs: 0, sm: 1 } }}
              >
                <ToggleButton value={1}>1×</ToggleButton>
                <ToggleButton value={2}>2×</ToggleButton>
                <ToggleButton value={4}>4×</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <Slider
              size="small"
              value={replayIndex}
              min={0}
              max={Math.max(0, filteredHistoryPoints.length - 1)}
              step={1}
              disabled={filteredHistoryPoints.length < 2}
              onChange={(_, v) => {
                setReplayPlaying(false);
                setReplayIndex(v);
              }}
              valueLabelDisplay="auto"
              valueLabelFormat={(i) => {
                const p = filteredHistoryPoints[i];
                return p ? formatInUserTimezone(p.timestamp) : String(i);
              }}
            />
          </Paper>
        </Box>

        <Box
          sx={{
            width: { xs: sidebarOpen ? '100%' : 0, md: sidebarOpen ? 380 : 0 },
            flexShrink: 0,
            transition: theme.transitions.create('width', { duration: 200 }),
            overflow: 'hidden',
            display: { xs: sidebarOpen ? 'block' : 'none', md: 'block' },
          }}
        >
          <Paper
            elevation={0}
            sx={{
              width: { xs: '100%', md: 380 },
              height: '100%',
              maxHeight: { md: '100%' },
              p: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              overflow: 'auto',
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
              boxSizing: 'border-box',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={1}>
                <MyLocationIcon color="primary" />
                <Typography variant="h6">Live tracking</Typography>
              </Stack>
              <IconButton size="small" onClick={() => setSidebarOpen(false)} aria-label="Hide panel">
                <ChevronRightIcon />
              </IconButton>
            </Stack>

        {deviceError && (
          <Alert severity="error" onClose={() => setDeviceError(null)}>
            {deviceError}
          </Alert>
        )}

        <Typography variant="subtitle2" color="text.secondary">
          Devices (with coordinates)
        </Typography>
        <List dense disablePadding sx={{ maxHeight: 160, overflow: 'auto', border: `1px solid ${theme.palette.divider}`, borderRadius: 1 }}>
          {devices.map((d) => (
            <ListItemButton key={d.device_id} selected={d.device_id === selectedId} onClick={() => setSelectedId(d.device_id)}>
              <ListItemText primary={d.name || d.device_id} secondary={d.device_id} />
            </ListItemButton>
          ))}
          {!devices.length && !loadingDevices ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No devices with coordinates.
              </Typography>
            </Box>
          ) : null}
        </List>

        <Divider />

        <Typography variant="subtitle2">History range</Typography>
        <Stack spacing={1}>
          <TextField
            label="Start"
            type="datetime-local"
            size="small"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End"
            type="datetime-local"
            size="small"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" onClick={loadHistory} disabled={!selectedId || historyLoading}>
            {historyLoading ? <CircularProgress size={22} color="inherit" /> : 'Load history (max 20k)'}
          </Button>
        </Stack>
        {historyError && <Alert severity="warning">{historyError}</Alert>}
        {historyMeta && (
          <Typography variant="caption" color="text.secondary">
            Points in range: {historyMeta.total_in_range} · Returned: {historyMeta.returned}
            {historyMeta.downsampled ? ' (downsampled)' : ''}
            {settings?.gpsFilterEnabled && historyPoints.length
              ? ` · Map/timeline: ${filteredHistoryPoints.length} after filter`
              : ''}
          </Typography>
        )}

        <Divider />

        <Typography variant="subtitle2">Thresholds (same unit as stored speed)</Typography>
        {settingsDraft && (
          <Stack spacing={1}>
            <TextField
              label="Move speed ≥"
              type="number"
              size="small"
              value={settingsDraft.moveSpeedThreshold}
              onChange={(e) => setSettingsDraft((s) => ({ ...s, moveSpeedThreshold: Number(e.target.value) }))}
              helperText="Used with stop threshold in settings validation"
            />
            <TextField
              label="Stop speed ≤ (still)"
              type="number"
              size="small"
              value={settingsDraft.stopSpeedThreshold}
              onChange={(e) => setSettingsDraft((s) => ({ ...s, stopSpeedThreshold: Number(e.target.value) }))}
            />
            <TextField
              label="Stop after (minutes)"
              type="number"
              size="small"
              value={settingsDraft.stopMinutes}
              onChange={(e) => setSettingsDraft((s) => ({ ...s, stopMinutes: Number(e.target.value) }))}
            />
            <TextField
              label="Park after (minutes)"
              type="number"
              size="small"
              value={settingsDraft.parkMinutes}
              onChange={(e) => setSettingsDraft((s) => ({ ...s, parkMinutes: Number(e.target.value) }))}
            />
            <TextField
              label="Sensor window (ms)"
              type="number"
              size="small"
              value={settingsDraft.sensorSnapshotWindowMs}
              onChange={(e) => setSettingsDraft((s) => ({ ...s, sensorSnapshotWindowMs: Number(e.target.value) }))}
            />
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              GPS map filter (outliers)
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(settingsDraft.gpsFilterEnabled)}
                  onChange={(e) => setSettingsDraft((s) => ({ ...s, gpsFilterEnabled: e.target.checked }))}
                />
              }
              label="Filter history polyline"
            />
            <TextField
              label="Max jump from prev point (m)"
              type="number"
              size="small"
              value={settingsDraft.gpsMaxJumpMeters ?? 500}
              onChange={(e) => setSettingsDraft((s) => ({ ...s, gpsMaxJumpMeters: Number(e.target.value) }))}
              helperText="Drop points farther than this from the last kept point"
            />
            <TextField
              label="Max speed (0 = off)"
              type="number"
              size="small"
              value={settingsDraft.gpsMaxSpeed ?? 0}
              onChange={(e) => setSettingsDraft((s) => ({ ...s, gpsMaxSpeed: Number(e.target.value) }))}
              helperText="Drop points with speed above this (same unit as track)"
            />
            <TextField
              label="Max accuracy (m, 0 = off)"
              type="number"
              size="small"
              value={settingsDraft.gpsMaxAccuracyMeters ?? 0}
              onChange={(e) => setSettingsDraft((s) => ({ ...s, gpsMaxAccuracyMeters: Number(e.target.value) }))}
              helperText="Drop points with worse GPS accuracy (if reported)"
            />
            <Button variant="outlined" size="small" onClick={saveSettings} disabled={settingsSaving}>
              {settingsSaving ? 'Saving…' : 'Save thresholds'}
            </Button>
          </Stack>
        )}

        <Divider />

        <Typography variant="subtitle2">Selected point</Typography>
        {!selectedGps && <Typography variant="body2" color="text.secondary">Click the map near a track point.</Typography>}
        {selectedGps && (
          <Table size="small" padding="none">
            <TableBody>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>{formatInUserTimezone(selectedGps.timestamp)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Lat</TableCell>
                <TableCell>{Number(selectedGps.latitude).toFixed(6)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Lng</TableCell>
                <TableCell>{Number(selectedGps.longitude).toFixed(6)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Speed</TableCell>
                <TableCell>{selectedGps.speed != null ? String(selectedGps.speed) : '—'}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
        {snapshotLoading && <CircularProgress size={22} />}
        {sensorSnapshot?.readings?.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary">
              Nearest sensor readings (± window)
            </Typography>
            <Table size="small">
              <TableBody>
                {sensorSnapshot.readings.map((r) => (
                  <TableRow key={r.sensor_type}>
                    <TableCell>{r.sensor_type}</TableCell>
                    <TableCell align="right">
                      {r.value != null ? r.value : '—'} {r.unit || ''}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{formatInUserTimezone(r.timestamp)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        {sensorSnapshot?.error && <Alert severity="info">No sensor rows in window.</Alert>}
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
