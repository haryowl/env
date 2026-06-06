/** Used when a Status field has no custom keywords in Field Creator. */
export const DEFAULT_STATUS_DISTRIBUTION_KEYWORDS = 'sukses, success, false, true';

const normalizeFieldKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

/** Parse comma/semicolon/newline-separated status keywords from Field Creator. */
export function parseStatusKeywords(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter(Boolean);
  }
  return String(input)
    .split(/[,;|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasStatusValue(raw) {
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '–' || trimmed === '-') return false;
  }
  return true;
}

/** True when at least one mapped status parameter has a real value on this row. */
export function rowHasStatusValues(row, params = []) {
  return params.some((p) => hasStatusValue(row?.[p]));
}

/**
 * Match the first configured keyword found inside the status text (case-insensitive).
 * Returns the keyword label as configured, or null if none match.
 */
export function matchStatusKeyword(value, keywords) {
  const list = parseStatusKeywords(keywords);
  if (!list.length || !hasStatusValue(value)) return null;

  const text = String(value).toLowerCase();
  const sorted = [...list].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    if (text.includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return null;
}

/**
 * Resolve keywords for a mapped status parameter from field metadata.
 * Falls back to default Status keywords when category is Status and none are configured.
 */
export function resolveStatusKeywords(fieldMeta) {
  if (!fieldMeta) return '';
  const configured = String(fieldMeta.statusKeywords || fieldMeta.status_keywords || '').trim();
  if (configured) return configured;
  if (fieldMeta.category === 'Status') return DEFAULT_STATUS_DISTRIBUTION_KEYWORDS;
  return '';
}

export function getStatusKeywordsForParam(metadata, paramName) {
  if (!paramName) return '';

  if (metadata?.[paramName]) {
    return resolveStatusKeywords(metadata[paramName]);
  }

  if (metadata && typeof metadata === 'object') {
    const target = normalizeFieldKey(paramName);
    const entry = Object.values(metadata).find(
      (m) =>
        normalizeFieldKey(m?.fieldName) === target ||
        normalizeFieldKey(m?.displayName) === target
    );
    if (entry) return resolveStatusKeywords(entry);
  }

  return DEFAULT_STATUS_DISTRIBUTION_KEYWORDS;
}

export function usesDefaultStatusKeywords(metadata, paramName) {
  const direct = metadata?.[paramName];
  const entry =
    direct ||
    Object.values(metadata || {}).find(
      (m) =>
        normalizeFieldKey(m?.fieldName) === normalizeFieldKey(paramName) ||
        normalizeFieldKey(m?.displayName) === normalizeFieldKey(paramName)
    );
  const configured = String(entry?.statusKeywords || entry?.status_keywords || '').trim();
  return !configured && (entry?.category === 'Status' || !entry);
}

/**
 * Bucket label for distribution chart: keyword match, else "Other" when keywords exist,
 * else the full status text.
 */
export function classifyStatusValue(value, keywords) {
  const matched = matchStatusKeyword(value, keywords);
  if (matched) return matched;

  const list = parseStatusKeywords(keywords);
  if (list.length > 0) return 'Other';

  return String(value).trim();
}
