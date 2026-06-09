const DEFAULT_LIMIT = 500;
const DISPLAY_MAX = 10000;
const EXPORT_MAX = 100000;

function parseDeviceIds(deviceIds) {
  if (!deviceIds) return [];
  if (Array.isArray(deviceIds)) {
    return deviceIds.map((id) => String(id).trim()).filter(Boolean);
  }
  return String(deviceIds)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function filterIdsByAccess(ids, req) {
  let filtered = ids;
  if (req.allowedDeviceIdsForData !== null) {
    filtered = filtered.filter(
      (id) => req.allowedDeviceIdsForData && req.allowedDeviceIdsForData.includes(id)
    );
  } else if (req.allowedDeviceIds !== null && req.allowedDeviceIds?.length > 0) {
    filtered = filtered.filter((id) => req.allowedDeviceIds.includes(id));
  }
  return filtered;
}

/**
 * Resolve device scope: explicit deviceIds, else allowed devices for restricted users.
 * Full-access users must pass deviceIds (prevents unscoped table scans).
 */
function resolveDataDashDeviceIds(req, rawDeviceIds) {
  let ids = filterIdsByAccess(parseDeviceIds(rawDeviceIds), req);

  if (ids.length === 0) {
    const hasFullAccess =
      req.allowedDeviceIds === null && req.allowedDeviceIdsForData === null;

    if (hasFullAccess) {
      return { ids: [], error: 'deviceIds is required for data queries' };
    }

    const fallback =
      req.allowedDeviceIdsForData !== null
        ? req.allowedDeviceIdsForData
        : req.allowedDeviceIds;

    if (Array.isArray(fallback) && fallback.length > 0) {
      ids = [...fallback];
    }
  }

  if (ids.length === 0) {
    return { ids: [], error: null, empty: true };
  }

  return { ids, error: null, empty: false };
}

function isExportRequest(exportParam) {
  const v = exportParam;
  return v === true || v === 'true' || v === '1';
}

function resolveDataDashLimit(limitParam, exportParam) {
  const parsed = parseInt(limitParam, 10);
  const requested = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
  const cap = isExportRequest(exportParam) ? EXPORT_MAX : DISPLAY_MAX;
  return Math.min(Math.max(1, requested), cap);
}

module.exports = {
  DEFAULT_LIMIT,
  DISPLAY_MAX,
  EXPORT_MAX,
  parseDeviceIds,
  resolveDataDashDeviceIds,
  resolveDataDashLimit,
  isExportRequest,
};
