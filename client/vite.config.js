import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy target for /api in dev (set in client/.env as VITE_PROXY_TARGET or default localhost)
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
})
