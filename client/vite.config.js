import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy target for /api in dev (set in client/.env as VITE_PROXY_TARGET or default localhost)
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // React core must stay in one chunk — isolating react-leaflet caused
          // "Cannot read properties of undefined (reading 'createContext')" at runtime.
          if (id.includes('react-dom') || /[/\\]react[/\\]/.test(id)) {
            return 'react-vendor';
          }
          if (id.includes('@mui/x-data-grid')) return 'mui-datagrid';
          if (id.includes('@mui')) return 'mui';
          if (id.includes('recharts') || id.includes('d3-')) return 'charts-recharts';
          if (id.includes('chart.js') || id.includes('react-chartjs-2') || id.includes('chartjs-')) {
            return 'charts-chartjs';
          }
          if (id.includes('xlsx') || id.includes('jspdf')) return 'export-tools';
          if (id.includes('socket.io-client')) return 'socket';
          return 'vendor';
        },
      },
    },
  },
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
      },
      // Needed if profile_picture still uses /uploads/... in DB or cache (legacy URLs)
      '/uploads': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
})
