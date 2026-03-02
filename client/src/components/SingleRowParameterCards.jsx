import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { useFont } from '../contexts/FontContext';
import { getOptimalTextColor, checkContrast, getContrastRatio } from '../utils/colorUtils';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import {
  Science as ScienceIcon,
  Water as WaterIcon,
  FilterAlt as FilterIcon,
  Warning as WarningIcon,
  Waves as WavesIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';

const SingleRowParameterCards = ({ data = {}, parameterColors = {}, realtimeParams = [] }) => {
  const theme = useTheme();
  const muiTheme = useMuiTheme();
  const { getFontColor, getFontSize } = useFont();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  // Default parameter colors and metadata
  const parameterMetadata = {
    pH: {
      color: '#8B46C1',
      icon: <ScienceIcon />,
      unit: 'pH (unit)',
      description: 'Acidity/Alkalinity Level',
    },
    COD: {
      color: '#F59E0B',
      icon: <WaterIcon />,
      unit: 'COD (mg/Liter)',
      description: 'Chemical Oxygen Demand',
    },
    TSS: {
      color: '#10B981',
      icon: <FilterIcon />,
      unit: 'TSS (mg/Liter)',
      description: 'Total Suspended Solids',
    },
    NH3N: {
      color: '#EC4899',
      icon: <WarningIcon />,
      unit: 'NH3N (mg/Liter)',
      description: 'Ammonia Nitrogen',
    },
    Debit: {
      color: '#3B82F6',
      icon: <WavesIcon />,
      unit: 'Debit (m3/menit)',
      description: 'Flow Rate',
    },
    Speed: {
      color: '#6B7280',
      icon: <SpeedIcon />,
      unit: 'Speed (m/s)',
      description: 'Velocity',
    },
    soil_temp: {
      color: '#F59E0B',
      icon: <ScienceIcon />,
      unit: '°C',
      description: 'Soil Temperature',
    },
    soil_moisture: {
      color: '#3B82F6',
      icon: <WaterIcon />,
      unit: '%',
      description: 'Soil Moisture',
    },
    air_humidity: {
      color: '#10B981',
      icon: <WaterIcon />,
      unit: '%',
      description: 'Air Humidity',
    },
    level_cm: {
      color: '#8B46C1',
      icon: <WavesIcon />,
      unit: 'cm',
      description: 'Water Level',
    },
    Rainfall_cm: {
      color: '#3B82F6',
      icon: <WaterIcon />,
      unit: 'cm',
      description: 'Rainfall',
    },
  };

  // Get parameters to display
  const paramsToShow = realtimeParams.length > 0 
    ? realtimeParams.filter(p => p !== 'datetime' && p !== 'timestamp')
    : Object.keys(data).filter(p => p !== 'datetime' && p !== 'timestamp');

  // Generate KPI data from actual parameters
  const kpiData = paramsToShow.map(param => {
    const metadata = parameterMetadata[param] || {
      color: '#6B7280',
      icon: <ScienceIcon />,
      unit: '',
      description: param.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    };
    
    const customColor = parameterColors[param];
    const color = customColor || metadata.color;
    
    // Calculate effective background color for contrast detection
    // The cards have a gradient background, so we need to calculate the actual effective color
    const calculateEffectiveBackground = (baseColor) => {
      // Convert hex to RGB
      const hex = baseColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      
      // Get the theme's paper background color
      const themeBg = muiTheme.palette.background.paper;
      const bgHex = themeBg.replace('#', '');
      const bgR = parseInt(bgHex.substring(0, 2), 16);
      const bgG = parseInt(bgHex.substring(2, 4), 16);
      const bgB = parseInt(bgHex.substring(4, 6), 16);
      
      // The gradient goes from color20 to color10 to color05 on the theme background
      // Calculate the weighted average: (20% * 0.5 + 10% * 0.3 + 5% * 0.2) = 12%
      const avgOpacity = 0.12;
      
      // Apply the opacity to theme background for theme-aware colors
      const effectiveR = Math.round(bgR + (r - bgR) * avgOpacity);
      const effectiveG = Math.round(bgG + (g - bgG) * avgOpacity);
      const effectiveB = Math.round(bgB + (b - bgB) * avgOpacity);
      
      return `#${effectiveR.toString(16).padStart(2, '0')}${effectiveG.toString(16).padStart(2, '0')}${effectiveB.toString(16).padStart(2, '0')}`;
    };
    
    const effectiveBgColor = calculateEffectiveBackground(color);
    
    return {
      title: param,
      value: data[param] !== undefined ? data[param] : '-',
      unit: metadata.unit,
      color: color,
      icon: metadata.icon,
      trend: '0.0',
      description: metadata.description,
      backgroundColor: effectiveBgColor,
    };
  });

  // Calculate card width based on number of parameters
  const getCardWidth = () => {
    if (isMobile) {
      return '100%'; // Single column on mobile
    } else if (isTablet) {
      if (kpiData.length <= 2) return '50%';
      if (kpiData.length <= 4) return '50%';
      return '33.33%';
    } else {
      // Desktop: equal width for all cards in single row
      return `${100 / kpiData.length}%`;
    }
  };

  const cardWidth = getCardWidth();

  return (
    <Box sx={{ width: '100%', mb: 3 }}>
      {/* Debug info - Hidden for production */}
      {false && process.env.NODE_ENV === 'development' && (
        <Box sx={{ mb: 2, p: 1, backgroundColor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <strong>Single Row Layout:</strong> {kpiData.length} parameters | 
            Screen: {isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'} | 
            Card Width: {cardWidth}
          </Typography>
          <Box sx={{ mt: 1 }}>
            {kpiData.map((kpi, index) => {
              const textColor = getOptimalTextColor(kpi.backgroundColor, 'AA');
              const contrastRatio = getContrastRatio(textColor, kpi.backgroundColor);
              return (
                <Typography key={index} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {kpi.title}: Color={kpi.color}, Bg={kpi.backgroundColor}, Text={textColor}, Ratio={contrastRatio.toFixed(2)}
                </Typography>
              );
            })}
          </Box>
        </Box>
      )}

      <Box 
        sx={{ 
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 2,
          width: '100%',
          alignItems: 'stretch'
        }}
      >
        {kpiData.map((kpi, index) => (
          <Card
            key={index}
            sx={{
              height: 160,
              width: cardWidth,
              flex: isMobile ? 'none' : '1 1 0',
              borderRadius: 2,
              border: `1px solid ${kpi.color}30`,
              background: `linear-gradient(135deg, ${kpi.color}12 0%, ${kpi.color}08 100%)`,
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.2s ease',
              '&:hover': { boxShadow: `0 4px 12px ${kpi.color}25` },
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: `linear-gradient(90deg, ${kpi.color} 0%, ${kpi.color}cc 100%)`,
              },
            }}
          >
            <CardContent sx={{ p: 2, position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ p: 1, borderRadius: 1.5, backgroundColor: `${kpi.color}20`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, minHeight: 32 }}>
                  {kpi.icon}
                </Box>
                <Chip
                  label={kpi.trend}
                  size="small"
                  sx={{
                    backgroundColor: kpi.trend.startsWith('+') ? '#059669' : kpi.trend.startsWith('-') ? '#DC2626' : '#64748B',
                    color: '#fff',
                    fontSize: '0.6rem',
                    height: 20,
                    fontWeight: 600,
                    borderRadius: 1,
                  }}
                />
              </Box>
              
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <Typography
                  variant="h3"
                  sx={{
                    fontWeight: 800,
                    color: kpi.color,
                    fontSize: isMobile ? '2.2rem' : '2.8rem',
                    lineHeight: 1,
                    mb: 0.5,
                    textShadow: `0 1px 2px ${kpi.color}20`,
                  }}
                >
                  {kpi.value}
                </Typography>
                
                <Typography
                  variant="body2"
                  sx={{
                    color: getOptimalTextColor(kpi.backgroundColor, 'AA') + ' !important',
                    fontSize: isMobile ? '0.8rem' : '0.85rem',
                    fontWeight: 600,
                    mb: 0.3,
                    lineHeight: 1.1,
                  }}
                >
                  {kpi.unit}
                </Typography>

                <Typography
                  variant="caption"
                  sx={{
                    color: getOptimalTextColor(kpi.backgroundColor, 'AA') + ' !important',
                    fontSize: isMobile ? '0.7rem' : '0.75rem',
                    fontWeight: 500,
                    opacity: 0.9,
                    lineHeight: 1.1,
                    textAlign: 'center',
                  }}
                >
                  {kpi.description}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
};

export default SingleRowParameterCards;


