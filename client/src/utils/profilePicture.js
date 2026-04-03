import { API_BASE_URL } from '../config/api';

/**
 * Turn stored path into a full URL for <img src>.
 * New paths use /api/uploads/... so reverse proxies that only forward /api still serve images.
 * Legacy /uploads/... is rewritten to /api/uploads/... for the same reason.
 */
export function resolveProfilePictureUrl(storedPath) {
  if (!storedPath) return null;
  if (/^https?:\/\//i.test(storedPath)) return storedPath;
  let p = storedPath.startsWith('/') ? storedPath : `/${storedPath}`;
  if (p.startsWith('/uploads/')) {
    p = `/api${p}`;
  }
  const api = API_BASE_URL.replace(/\/$/, '');
  if (api.startsWith('http://') || api.startsWith('https://')) {
    const origin = api.endsWith('/api') ? api.slice(0, -4) : api.replace(/\/api$/, '');
    return `${origin}${p}`;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${p}`;
  }
  return p;
}

/** Update cached session user and notify App to refresh avatar. */
export function broadcastUserProfilePicture(profilePicturePath) {
  try {
    const raw = localStorage.getItem('iot_user');
    if (!raw) return;
    const u = JSON.parse(raw);
    const next = { ...u, profile_picture: profilePicturePath || null };
    localStorage.setItem('iot_user', JSON.stringify(next));
    window.dispatchEvent(new Event('iot-user-updated'));
  } catch {
    /* ignore */
  }
}
