import { useEffect, useMemo } from 'react';

function normalizeDeviceIds(deviceIdOrIds) {
  if (!deviceIdOrIds) return [];
  const list = Array.isArray(deviceIdOrIds) ? deviceIdOrIds : [deviceIdOrIds];
  return [...new Set(list.filter(Boolean))];
}

/**
 * Join socket.io device room(s) so room-scoped device_data events are received.
 */
export function useDeviceSocketSubscription(socket, deviceIdOrIds) {
  const deviceKey = useMemo(() => normalizeDeviceIds(deviceIdOrIds).join(','), [deviceIdOrIds]);

  useEffect(() => {
    if (!socket || typeof socket.subscribeDevice !== 'function' || !deviceKey) {
      return undefined;
    }

    const ids = deviceKey.split(',');
    ids.forEach((id) => socket.subscribeDevice(id));

    return () => {
      if (typeof socket.unsubscribeDevice !== 'function') return;
      ids.forEach((id) => socket.unsubscribeDevice(id));
    };
  }, [socket, deviceKey]);
}
