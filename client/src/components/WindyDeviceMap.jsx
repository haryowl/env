import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, IconButton, Paper, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { WINDY_MAP_API_KEY, hasWindyMapApiKey } from '../config/mapLayers';
import { formatInUserTimezone } from '../utils/timezoneUtils';

const FALLBACK_CENTER = { lat: -2.5, lon: 118, zoom: 5 };

function boundsCenter(devices) {
  if (!devices?.length) return FALLBACK_CENTER;
  if (devices.length === 1) {
    return {
      lat: Number(devices[0].latitude),
      lon: Number(devices[0].longitude),
      zoom: 9,
    };
  }
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  devices.forEach((d) => {
    const lat = Number(d.latitude);
    const lng = Number(d.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  });
  return {
    lat: (minLat + maxLat) / 2,
    lon: (minLng + maxLng) / 2,
    zoom: 6,
  };
}

function pinColor(status, hasAlert) {
  if (hasAlert) return '#EF4444';
  if (status === 'offline') return '#6B7280';
  if (status !== 'online') return '#F59E0B';
  return '#10B981';
}

function truncateLabel(str, maxChars) {
  const s = String(str || '').trim();
  if (!s) return '';
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(1, maxChars - 1))}…`;
}

export default function WindyDeviceMap({
  devices = [],
  deviceAlerts = {},
  deviceData = {},
  deviceMappedParams = {},
  deviceLastUpdated = {},
  deviceDataLoading = {},
  formatLabelForPopup,
  formatValueForPopup,
  onMarkerClick,
  onPopupOpen,
  centerCoords,
  buildPopupEntries,
}) {
  const iframeRef = useRef(null);
  const readyRef = useRef(false);
  const devicesRef = useRef(devices);
  const markerPayloadRef = useRef([]);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onPopupOpenRef = useRef(onPopupOpen);
  const [projectedPins, setProjectedPins] = useState([]);
  const [openDeviceId, setOpenDeviceId] = useState(null);
  const center = useMemo(() => boundsCenter(devices), [devices]);

  const markerPayload = useMemo(
    () =>
      (devices || [])
        .map((device) => {
          const lat = Number(device.latitude);
          const lng = Number(device.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const allowed = deviceMappedParams[device.device_id] || [];
          const entries = buildPopupEntries
            ? buildPopupEntries(deviceData[device.device_id], allowed, formatLabelForPopup, formatValueForPopup)
            : [];
          const lastUpdated = deviceLastUpdated[device.device_id];
          return {
            id: device.device_id,
            lat,
            lng,
            name: device.name,
            status: device.status,
            hasAlert: !!deviceAlerts[device.device_id],
            isLoading: !!deviceDataLoading[device.device_id],
            lastUpdatedLabel: lastUpdated ? formatInUserTimezone(lastUpdated) : '',
            entries,
          };
        })
        .filter(Boolean),
    [
      devices,
      deviceAlerts,
      deviceData,
      deviceMappedParams,
      deviceLastUpdated,
      deviceDataLoading,
      formatLabelForPopup,
      formatValueForPopup,
      buildPopupEntries,
    ]
  );

  devicesRef.current = devices;
  markerPayloadRef.current = markerPayload;
  onMarkerClickRef.current = onMarkerClick;
  onPopupOpenRef.current = onPopupOpen;

  const post = useCallback((message) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(message, '*');
  }, []);

  const sendInit = useCallback(() => {
    post({
      type: 'windy-init',
      key: WINDY_MAP_API_KEY,
      lat: center.lat,
      lon: center.lon,
      zoom: center.zoom,
      devices: markerPayloadRef.current,
    });
  }, [post, center.lat, center.lon, center.zoom]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data || {};
      if (data.type === 'windy-iframe-ready') {
        sendInit();
      } else if (data.type === 'windy-ready') {
        readyRef.current = true;
        post({ type: 'windy-markers', devices: markerPayloadRef.current });
        setTimeout(() => post({ type: 'windy-project' }), 400);
        setTimeout(() => post({ type: 'windy-project' }), 1200);
      } else if (data.type === 'windy-pin-positions' && Array.isArray(data.pins)) {
        setProjectedPins(data.pins);
      } else if (data.type === 'windy-map-click') {
        setOpenDeviceId(null);
      } else if (data.type === 'windy-marker-click' && data.deviceId) {
        const device = devicesRef.current.find((d) => d.device_id === data.deviceId);
        if (device) onMarkerClickRef.current?.(device);
        setOpenDeviceId(data.deviceId);
      } else if (data.type === 'windy-popup-open' && data.deviceId) {
        onPopupOpenRef.current?.(data.deviceId);
        setOpenDeviceId(data.deviceId);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post, sendInit]);

  useEffect(() => {
    if (!readyRef.current) return;
    post({ type: 'windy-markers', devices: markerPayload });
  }, [markerPayload, post]);

  useEffect(() => {
    if (!readyRef.current || !centerCoords) return;
    post({ type: 'windy-pan', lat: centerCoords.lat, lng: centerCoords.lng });
  }, [centerCoords, post]);

  const handlePinClick = useCallback((pinId) => {
    const device = devicesRef.current.find((d) => d.device_id === pinId);
    if (device) onMarkerClickRef.current?.(device);
    onPopupOpenRef.current?.(pinId);
    setOpenDeviceId(pinId);
  }, []);

  const openPin = projectedPins.find((p) => p.id === openDeviceId);
  const openDevice = markerPayload.find((d) => d.id === openDeviceId);

  if (!hasWindyMapApiKey) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', p: 2 }}>
        <Alert severity="info">
          Set VITE_WINDY_MAP_API_KEY in client/.env (Map Forecast key from api.windy.com), then restart Vite or rebuild.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', bgcolor: '#0b1220' }}>
      <Box
        component="iframe"
        ref={iframeRef}
        title="Windy weather map"
        src="/windy-embed.html"
        onLoad={sendInit}
        sx={{
          display: 'block',
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 0,
          bgcolor: '#0b1220',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
          overflow: 'hidden',
        }}
      >
        {projectedPins
          .filter((pin) => pin.visible !== false)
          .map((pin) => {
            const color = pinColor(pin.status, pin.hasAlert);
            const label = truncateLabel(pin.name, 14);
            return (
              <Box
                key={pin.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePinClick(pin.id);
                }}
                title={pin.name || pin.id}
                sx={{
                  position: 'absolute',
                  left: pin.x,
                  top: pin.y,
                  transform: 'translate(-50%, -80%)',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  zIndex: openDeviceId === pin.id ? 3 : 1,
                }}
              >
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    bgcolor: color,
                    border: '2.5px solid #fff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                  }}
                />
                {label ? (
                  <Box
                    sx={{
                      mt: 0.4,
                      px: 0.6,
                      py: 0.15,
                      bgcolor: '#fff',
                      color: '#1f2937',
                      fontSize: 10,
                      fontWeight: 600,
                      borderRadius: 0.5,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      maxWidth: 96,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </Box>
                ) : null}
              </Box>
            );
          })}
        {openDevice && openPin ? (
          <Paper
            elevation={6}
            onClick={(e) => e.stopPropagation()}
            sx={{
              position: 'absolute',
              left: openPin.x,
              top: openPin.y,
              transform: 'translate(-50%, calc(-100% - 36px))',
              pointerEvents: 'auto',
              p: 1.25,
              minWidth: 180,
              maxWidth: 260,
              zIndex: 4,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
                {openDevice.name || openDevice.id}
              </Typography>
              <IconButton size="small" onClick={() => setOpenDeviceId(null)} sx={{ p: 0.25, mt: -0.4, mr: -0.4 }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.75, mb: 0.75 }}>
              <Box
                component="span"
                sx={{
                  bgcolor: openDevice.status === 'online' ? '#16a34a' : '#dc2626',
                  color: '#fff',
                  borderRadius: 999,
                  px: 1,
                  fontSize: 11,
                  lineHeight: '18px',
                }}
              >
                {openDevice.status || ''}
              </Box>
              {openDevice.hasAlert ? (
                <Box
                  component="span"
                  sx={{
                    bgcolor: '#ef4444',
                    color: '#fff',
                    borderRadius: 999,
                    px: 1,
                    fontSize: 11,
                    lineHeight: '18px',
                  }}
                >
                  ALERT
                </Box>
              ) : null}
            </Box>
            <Typography sx={{ color: '#64748b', fontSize: 12, mb: 0.75 }}>
              Last update: {openDevice.lastUpdatedLabel || 'no data yet'}
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 0.5 }}>Latest Parameters:</Typography>
            {openDevice.entries?.length ? (
              openDevice.entries.map((entry) => (
                <Box key={entry.label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, fontSize: 12 }}>
                  <Box component="span" sx={{ color: '#64748b' }}>
                    {entry.label}:
                  </Box>
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {entry.displayValue}
                  </Box>
                </Box>
              ))
            ) : (
              <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                {openDevice.isLoading ? 'Loading latest values...' : 'No recent data available'}
              </Typography>
            )}
          </Paper>
        ) : null}
      </Box>
    </Box>
  );
}
