import { API_BASE_URL } from '../config/api';

/** Turn stored path (e.g. /uploads/profile-pictures/...) into a full URL for <img src>. */
export function resolveProfilePictureUrl(storedPath) {
  if (!storedPath) return null;
  if (/^https?:\/\//i.test(storedPath)) return storedPath;
  const api = API_BASE_URL.replace(/\/$/, '');
  const origin = api.endsWith('/api') ? api.slice(0, -4) : api.replace(/\/api$/, '');
  const p = storedPath.startsWith('/') ? storedPath : `/${storedPath}`;
  return `${origin}${p}`;
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
