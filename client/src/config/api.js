// API Configuration - uses env for portability (set VITE_API_BASE_URL / VITE_WS_BASE_URL when building or in .env)
// When browser forces HTTPS upgrade (Chrome "Always use secure connections", HSTS), set VITE_API_BASE_URL=http://YOUR_IP:3000
const getApiBaseUrl = () => {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (base) {
    const url = base.replace(/\/$/, '');
    return url.endsWith('/api') ? url : `${url}/api`;
  }
  return '/api';
};

const getWsBaseUrl = () => {
  if (import.meta.env.VITE_WS_BASE_URL) {
    return import.meta.env.VITE_WS_BASE_URL.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return window.location.origin; // dev server origin; Socket.IO will connect to same host - for proxy you may need VITE_WS_BASE_URL=http://localhost:3000
  }
  return window.location.origin;
};

export const API_BASE_URL = getApiBaseUrl();
export const WS_BASE_URL = getWsBaseUrl();

export const IS_DEVELOPMENT = import.meta.env.DEV;
export const IS_PRODUCTION = import.meta.env.PROD;
