/** Normalize alert → list of device ids (supports legacy single device_id). */
function getAlertDeviceIds(alert) {
  if (!alert) return [];
  if (Array.isArray(alert.device_ids) && alert.device_ids.length > 0) {
    return alert.device_ids.map(String);
  }
  if (alert.device_id) return [String(alert.device_id)];
  return [];
}

function alertAppliesToDevice(alert, deviceId) {
  if (!deviceId) return false;
  return getAlertDeviceIds(alert).includes(String(deviceId));
}

/** Normalize request body into { primaryDeviceId, deviceIds }. */
function normalizeDeviceIdsInput(body = {}) {
  let deviceIds = [];
  if (Array.isArray(body.device_ids) && body.device_ids.length > 0) {
    deviceIds = body.device_ids.map(String).filter(Boolean);
  } else if (body.device_id) {
    deviceIds = [String(body.device_id)];
  }
  // de-dupe while preserving order
  const seen = new Set();
  deviceIds = deviceIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return {
    deviceIds,
    primaryDeviceId: deviceIds[0] || null,
  };
}

module.exports = {
  getAlertDeviceIds,
  alertAppliesToDevice,
  normalizeDeviceIdsInput,
};
