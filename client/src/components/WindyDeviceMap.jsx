import React, { forwardRef } from 'react';
import { WINDY_MAP_API_KEY } from '../config/mapLayers';

/** Windy weather backdrop. Device pins stay on the parent Leaflet map. */
const WindyWeatherBackdrop = forwardRef(function WindyWeatherBackdrop({ onLoad }, ref) {
  if (!WINDY_MAP_API_KEY) return null;
  return (
    <iframe
      ref={ref}
      title="Windy weather"
      src={`/windy-embed.html?v=5&key=${encodeURIComponent(WINDY_MAP_API_KEY)}`}
      onLoad={onLoad}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background: '#0b1220',
      }}
    />
  );
});

export default WindyWeatherBackdrop;
