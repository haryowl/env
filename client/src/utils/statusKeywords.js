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
  for (const kw of list) {
    if (text.includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return null;
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
