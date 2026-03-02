/**
 * Shared chart styling for Recharts – professional, consistent look across Dashboard, QuickView, DataDash, DataViewer.
 */

// Professional palette (vibrant but not loud) – use for lines, areas, bars
export const CHART_COLORS = [
  '#2563EB', // blue
  '#0E7490', // teal
  '#059669', // emerald
  '#D97706', // amber
  '#DC2626', // red
  '#7C3AED', // violet
  '#DB2777', // pink
  '#0891B2', // cyan
  '#65A30D', // lime
  '#EA580C', // orange
  '#4F46E5', // indigo
  '#BE185D', // rose
  '#0D9488', // teal-2
  '#CA8A04', // yellow
  '#16A34A', // green
];

// For area fill (same order, with alpha)
export const CHART_AREA_COLORS = CHART_COLORS.map(c => `${c}18`);
export const CHART_LINE_COLORS = CHART_COLORS;

export const getChartColor = (index) => CHART_COLORS[index % CHART_COLORS.length];
export const getChartAreaColor = (index) => CHART_AREA_COLORS[index % CHART_AREA_COLORS.length];

// Hash parameter name to stable color index
export const getParameterColorIndex = (paramName) => {
  let hash = 0;
  for (let i = 0; i < paramName.length; i++) {
    const char = paramName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % CHART_COLORS.length;
};
export const getParameterColor = (paramName) => getChartColor(getParameterColorIndex(paramName));

// Recharts CartesianGrid – subtle, professional
export const CARTESIAN_GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'rgba(0, 0, 0, 0.06)',
  vertical: true,
  horizontal: true,
};

// Axis tick style – Inter, readable size
export const AXIS_TICK_STYLE = {
  fontSize: 11,
  fontFamily: '"Inter", "Roboto", sans-serif',
  fill: '#64748B',
};

// Recharts margin
export const CHART_MARGIN = { top: 16, right: 24, left: 16, bottom: 16 };

// Tooltip content style (for Recharts Tooltip contentStyle)
export const TOOLTIP_CONTENT_STYLE = {
  fontFamily: '"Inter", "Roboto", sans-serif',
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid rgba(0, 0, 0, 0.08)',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
  padding: '10px 14px',
  backgroundColor: 'rgba(255, 255, 255, 0.98)',
};

// Legend wrapper style
export const LEGEND_WRAPPER_STYLE = {
  fontSize: 12,
  fontFamily: '"Inter", "Roboto", sans-serif',
};

// Card-style container for chart (sx object)
export const CHART_CARD_SX = {
  borderRadius: 12,
  border: '1px solid rgba(0, 0, 0, 0.06)',
  background: 'linear-gradient(180deg, #ffffff 0%, #F8FAFC 100%)',
  p: 2,
};

// Section header gradient (sx) – primary blue/teal
export const SECTION_HEADER_SX = {
  background: 'linear-gradient(135deg, #2563EB 0%, #0E7490 100%)',
  color: '#fff',
  px: 2,
  py: 1.5,
  borderRadius: '12px 12px 0 0',
};
