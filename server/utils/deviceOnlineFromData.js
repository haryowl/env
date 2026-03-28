/**
 * UI "online" is derived from the latest row in sensor_readings / gps_tracks, not only devices.status.
 * Env DEVICE_ONLINE_STALE_MINUTES (default 60): if newest data is older than this, show offline.
 * Status maintenance and error are kept as stored.
 */

function getDeviceOnlineStaleMinutes() {
  const m = parseInt(process.env.DEVICE_ONLINE_STALE_MINUTES || '60', 10);
  if (!Number.isFinite(m) || m < 1) return 60;
  return Math.min(m, 10080); // cap 7 days
}

/** LATERAL join: outer row alias must be `d` (devices). Adds eff.last_data_at */
function sqlLateralLastDataAt() {
  return `
  CROSS JOIN LATERAL (
    SELECT GREATEST(
      (SELECT MAX(timestamp) FROM sensor_readings WHERE device_id = d.device_id),
      (SELECT MAX(timestamp) FROM gps_tracks WHERE device_id = d.device_id)
    ) AS last_data_at
  ) AS eff`;
}

/** $staleParamIndex must be the query placeholder for integer minutes */
function sqlUiStatusCase(staleParamIndex) {
  return `
    CASE
      WHEN d.status IN ('maintenance', 'error') THEN d.status
      WHEN eff.last_data_at IS NULL THEN 'offline'
      WHEN eff.last_data_at < NOW() - ($${staleParamIndex}::int * INTERVAL '1 minute') THEN 'offline'
      ELSE 'online'
    END
  `;
}

module.exports = {
  getDeviceOnlineStaleMinutes,
  sqlLateralLastDataAt,
  sqlUiStatusCase,
};
