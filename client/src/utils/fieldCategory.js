/** Field definition category for device health / telemetry split (Phase 1+) */
export const STATUS_CATEGORY = 'Status';

const ALWAYS_VISIBLE_PARAMS = new Set([
  'datetime',
  'timestamp',
  'device_id',
  'device_name',
  'server_received_at',
]);

let fieldVisibilityCache = { mode: 'all', fields: [] };

export function setFieldVisibilityCache(visibility) {
  if (!visibility || typeof visibility !== 'object') {
    fieldVisibilityCache = { mode: 'all', fields: [] };
    return fieldVisibilityCache;
  }
  fieldVisibilityCache = {
    mode: visibility.mode === 'selected' ? 'selected' : 'all',
    fields: Array.isArray(visibility.fields) ? visibility.fields : [],
  };
  return fieldVisibilityCache;
}

export function getFieldVisibilityCache() {
  return fieldVisibilityCache;
}

export function fieldIsAllowedByRole(fieldName, visibility = fieldVisibilityCache) {
  if (fieldName == null || fieldName === '') return false;
  if (!visibility || visibility.mode !== 'selected') return true;
  const key = String(fieldName);
  if (ALWAYS_VISIBLE_PARAMS.has(key)) return true;
  const allowed = visibility.fields || [];
  const lower = key.toLowerCase();
  return allowed.some((f) => f === key || String(f).toLowerCase() === lower);
}

/** Query string for data-dash / latest-data: hide Status fields from data dashboards */
export const EXCLUDE_STATUS_QUERY = 'excludeCategories=Status';

/** Query string for Status-only views (Phase 2+) */
export const STATUS_ONLY_QUERY = 'categories=Status';

export function getFieldCategory(metadata, fieldName) {
  if (!fieldName || !metadata) return '';
  return metadata[fieldName]?.category || '';
}

export function isStatusField(metadata, fieldName) {
  return getFieldCategory(metadata, fieldName) === STATUS_CATEGORY;
}

/** Parameters shown on Dashboard, U-Dashboard, Data Dash, map popup, etc. */
export function filterDataViewParams(params, metadata, visibility = fieldVisibilityCache) {
  if (!params?.length) return [];
  return params.filter((p) => {
    if (!fieldIsAllowedByRole(p, visibility)) return false;
    if (p === 'datetime' || p === 'timestamp') return true;
    if (!metadata || Object.keys(metadata).length === 0) return true;
    return !isStatusField(metadata, p);
  });
}

/** Parameters shown on Status menu only */
export function filterStatusParams(params, metadata, visibility = fieldVisibilityCache) {
  if (!params?.length) return [];
  if (!metadata || Object.keys(metadata).length === 0) {
    return [];
  }
  return params.filter((p) => fieldIsAllowedByRole(p, visibility) && isStatusField(metadata, p));
}

export function appendCategoryQuery(url, query = EXCLUDE_STATUS_QUERY) {
  if (!query) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${query}`;
}
