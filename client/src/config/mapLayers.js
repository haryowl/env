/**
 * Base map tiles (Carto / Esri / OpenTopoMap). Used by Dashboard map and Live tracking.
 * @type {Array<{ value: string, label: string, swatch: string, url: string, attribution: string }>}
 */
export const MAP_BASE_LAYERS = [
  {
    value: 'dark',
    label: 'Dark',
    swatch: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e3a5f 100%)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  {
    value: 'modern',
    label: 'Light',
    swatch: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  {
    value: 'satellite',
    label: 'Satellite',
    swatch: 'linear-gradient(135deg, #14532d 0%, #365314 35%, #1e3a8a 100%)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
  {
    value: 'terrain',
    label: 'Terrain',
    swatch: 'linear-gradient(135deg, #78716c 0%, #4ade80 45%, #a8a29e 100%)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org/">OpenTopoMap</a> contributors',
  },
];
