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
  priorityDeviceId,
  buildPopupEntries,
}) {
  const iframeRef = useRef(null);
  const devicesRef = useRef(devices);
  const markerPayloadRef = useRef([]);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onPopupOpenRef = useRef(onPopupOpen);
  const lastFocusRef = useRef(null);
  const center = useMemo(() => boundsCenter(devices), [devices]);
  const embedSrc = useMemo(
    () => `/windy-embed.html?v=4&key=${encodeURIComponent(WINDY_MAP_API_KEY)}`,
    []
  );

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

  const getBridge = useCallback(() => {
    try {
      return iframeRef.current?.contentWindow?.WindyBridge || null;
    } catch {
      return null;
    }
  }, []);

  const callBridge = useCallback(
    (method, ...args) => {
      let posted = false;
      const tryCall = (attempt) => {
        const bridge = getBridge();
        if (bridge && typeof bridge[method] === 'function') {
          bridge[method](...args);
          return;
        }
        const win = iframeRef.current?.contentWindow;
        if (win && !posted) {
          posted = true;
          const type =
            method === 'setDevices' ? 'windy-markers' : method === 'panTo' ? 'windy-pan' : 'windy-init';
          const payload =
            method === 'setDevices'
              ? { type, devices: args[0] }
              : method === 'panTo'
                ? { type, lat: args[0], lng: args[1], zoom: args[2] }
                : { type, ...(args[0] || {}) };
          win.postMessage(payload, '*');
        }
        if (attempt < 40) window.setTimeout(() => tryCall(attempt + 1), 150);
      };
      tryCall(0);
    },
    [getBridge]
  );

  const pushDevices = useCallback(() => {
    callBridge('init', {
      key: WINDY_MAP_API_KEY,
      lat: center.lat,
      lon: center.lon,
      zoom: center.zoom,
      devices: markerPayloadRef.current,
    });
  }, [callBridge, center.lat, center.lon, center.zoom]);

  useEffect(() => {
    const onMessage = (event) => {
      const data = event.data || {};
      if (typeof data.type !== 'string' || !data.type.startsWith('windy-')) return;
      if (data.type === 'windy-iframe-ready' || data.type === 'windy-ready') {
        pushDevices();
      } else if (data.type === 'windy-marker-click' && data.deviceId) {
        const device = devicesRef.current.find((d) => d.device_id === data.deviceId);
        if (device) onMarkerClickRef.current?.(device);
      } else if (data.type === 'windy-popup-open' && data.deviceId) {
        onPopupOpenRef.current?.(data.deviceId);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pushDevices]);

  useEffect(() => {
    callBridge('setDevices', markerPayload);
  }, [markerPayload, callBridge]);

  useEffect(() => {
    const selected = priorityDeviceId
      ? devices.find((d) => d.device_id === priorityDeviceId)
      : null;
    const lat = Number(centerCoords?.lat ?? selected?.latitude);
    const lng = Number(centerCoords?.lng ?? selected?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const focusId = priorityDeviceId || `${lat},${lng}`;
    const focusKey = `${focusId}:${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (lastFocusRef.current === focusKey) return;
    lastFocusRef.current = focusKey;
    callBridge('panTo', lat, lng, 14);
  }, [priorityDeviceId, centerCoords, devices, callBridge]);

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
      <iframe
        ref={iframeRef}
        title="Windy weather map"
        src={embedSrc}
        onLoad={pushDevices}
        style={{
          display: 'block',
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 0,
          background: '#0b1220',
        }}
      />
    </Box>
  );
}
