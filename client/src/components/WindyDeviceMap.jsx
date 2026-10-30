import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, Box } from '@mui/material';
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
    win.postMessage(message, window.location.origin);
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
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};
      if (data.type === 'windy-iframe-ready') {
        sendInit();
      } else if (data.type === 'windy-ready') {
        readyRef.current = true;
        post({ type: 'windy-markers', devices: markerPayloadRef.current });
      } else if (data.type === 'windy-marker-click' && data.deviceId) {
        const device = devicesRef.current.find((d) => d.device_id === data.deviceId);
        if (device) onMarkerClickRef.current?.(device);
      } else if (data.type === 'windy-popup-open' && data.deviceId) {
        onPopupOpenRef.current?.(data.deviceId);
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
    <Box
      component="iframe"
      ref={iframeRef}
      title="Windy weather map"
      src="/windy-embed.html"
      onLoad={sendInit}
      sx={{
        display: 'block',
        width: '100%',
        height: '100%',
        border: 0,
        bgcolor: '#0b1220',
      }}
    />
  );
}
