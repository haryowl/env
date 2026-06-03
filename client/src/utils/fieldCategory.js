/** Field definition category for device health / telemetry split (Phase 1+) */
export const STATUS_CATEGORY = 'Status';

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
export function filterDataViewParams(params, metadata) {
  if (!params?.length) return [];
  return params.filter((p) => {
    if (p === 'datetime' || p === 'timestamp') return true;
    if (!metadata || Object.keys(metadata).length === 0) return true;
    return !isStatusField(metadata, p);
  });
}

/** Parameters shown on Status menu only */
export function filterStatusParams(params, metadata) {
  if (!params?.length) return [];
  if (!metadata || Object.keys(metadata).length === 0) {
    return [];
  }
  return params.filter((p) => isStatusField(metadata, p));
}

export function appendCategoryQuery(url, query = EXCLUDE_STATUS_QUERY) {
  if (!query) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${query}`;
}
