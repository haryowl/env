/** Normalize alert → list of device ids (supports legacy single device_id). */
export function getAlertDeviceIds(alert) {
  if (!alert) return [];
  if (Array.isArray(alert.device_ids) && alert.device_ids.length > 0) {
    return alert.device_ids.map(String);
  }
  if (alert.device_id) return [String(alert.device_id)];
  return [];
}

/** True if this alert rule applies to the given device. */
export function alertAppliesToDevice(alert, deviceId) {
  if (!deviceId) return false;
  return getAlertDeviceIds(alert).includes(String(deviceId));
}
