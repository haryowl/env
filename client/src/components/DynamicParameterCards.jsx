import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Science as ScienceIcon,
  Water as WaterIcon,
  FilterAlt as FilterIcon,
  Warning as WarningIcon,
  Waves as WavesIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';

const DynamicParameterCards = ({ data = {}, parameterColors = {}, realtimeParams = [] }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));

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
    
    return {
      title: param,
      value: data[param] !== undefined ? data[param] : '-',
      unit: metadata.unit,
      color: color,
      icon: metadata.icon,
      trend: '0.0',
      description: metadata.description,
    };
  });

  // Advanced dynamic sizing calculation - optimized for full width usage
  const getOptimalLayout = (paramCount, screenSize) => {
    const layouts = {
      mobile: {
        1: { cols: 1, cardWidth: '100%' },
        2: { cols: 1, cardWidth: '100%' },
        3: { cols: 1, cardWidth: '100%' },
        4: { cols: 2, cardWidth: '50%' },
        5: { cols: 2, cardWidth: '50%' },
        6: { cols: 2, cardWidth: '50%' },
        default: { cols: 2, cardWidth: '50%' }
      },
      tablet: {
        1: { cols: 1, cardWidth: '100%' },
        2: { cols: 2, cardWidth: '50%' },
        3: { cols: 3, cardWidth: '33.33%' },
        4: { cols: 4, cardWidth: '25%' },
        5: { cols: 3, cardWidth: '33.33%' },
        6: { cols: 3, cardWidth: '33.33%' },
        default: { cols: 3, cardWidth: '33.33%' }
      },
      desktop: {
        1: { cols: 1, cardWidth: '100%' },
        2: { cols: 2, cardWidth: '50%' },
        3: { cols: 3, cardWidth: '33.33%' },
        4: { cols: 4, cardWidth: '25%' },
        5: { cols: 5, cardWidth: '20%' },
        6: { cols: 6, cardWidth: '16.67%' },
        7: { cols: 4, cardWidth: '25%' },
        8: { cols: 4, cardWidth: '25%' },
        9: { cols: 3, cardWidth: '33.33%' },
        10: { cols: 5, cardWidth: '20%' },
        11: { cols: 4, cardWidth: '25%' },
        12: { cols: 6, cardWidth: '16.67%' },
        default: { cols: 5, cardWidth: '20%' }
      }
    };

    const currentLayout = layouts[screenSize] || layouts.desktop;
    return currentLayout[paramCount] || currentLayout.default;
  };

  // Determine screen size
  const getScreenSize = () => {
    if (isMobile) return 'mobile';
    if (isTablet) return 'tablet';
    return 'desktop';
  };

  const screenSize = getScreenSize();
  const layout = getOptimalLayout(kpiData.length, screenSize);

  // Calculate grid size for Material-UI Grid - optimized for full width
  const getGridSize = () => {
    const cols = layout.cols;
    const gridSize = Math.floor(12 / cols);
    
    return {
      xs: 12, // Always full width on mobile
      sm: isMobile ? 12 : Math.max(4, gridSize),
      md: gridSize,
      lg: gridSize,
    };
  };

  const gridSize = getGridSize();

  return (
    <Box sx={{ width: '100%', mb: 3 }}>
      {/* Layout info for debugging */}
      {process.env.NODE_ENV === 'development' && (
        <Box sx={{ mb: 2, p: 1, backgroundColor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <strong>Dynamic Layout:</strong> {kpiData.length} parameters | 
            Screen: {screenSize} | 
            Layout: {layout.cols} columns | 
            Grid: {JSON.stringify(gridSize)}
          </Typography>
        </Box>
      )}

      <Grid container spacing={2} sx={{ width: '100%' }}>
        {kpiData.map((kpi, index) => (
          <Grid 
            item 
            {...gridSize} 
            key={index} 
            sx={{ 
              display: 'flex',
              width: '100%'
            }}
          >
            <Card
              sx={{
                height: '100%',
                width: '100%',
                minHeight: isMobile ? '120px' : '140px',
                background: `linear-gradient(135deg, ${kpi.color}20 0%, ${kpi.color}10 50%, ${kpi.color}05 100%)`,
                border: `2px solid ${kpi.color}40`,
                borderRadius: '4px',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: `0 12px 30px ${kpi.color}30`,
                  border: `2px solid ${kpi.color}60`,
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '4px',
                  background: `linear-gradient(90deg, ${kpi.color} 0%, ${kpi.color}CC 100%)`,
                },
              }}
            >
              <CardContent sx={{ p: isMobile ? 2 : 2.5, position: 'relative', zIndex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box
                    sx={{
                      p: isMobile ? 1 : 1.2,
                      borderRadius: '4px',
                      backgroundColor: `${kpi.color}30`,
                      color: kpi.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 2px 8px ${kpi.color}20`,
                      border: `1px solid ${kpi.color}40`,
                    }}
                  >
                    {kpi.icon}
                  </Box>
                  <Chip
                    label={kpi.trend}
                    size="small"
                    sx={{
                      backgroundColor: kpi.trend.startsWith('+') ? '#10B981' : kpi.trend.startsWith('-') ? '#EF4444' : '#6B7280',
                      color: 'white',
                      fontSize: '0.7rem',
                      height: '22px',
                      fontWeight: 600,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}
                  />
                </Box>
                
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    color: kpi.color,
                    fontSize: isMobile ? '1.5rem' : '1.8rem',
                    lineHeight: 1.2,
                    mb: 0.5,
                    textShadow: `0 1px 2px ${kpi.color}20`,
                  }}
                >
                  {kpi.value}
                </Typography>
                
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    fontSize: isMobile ? '0.7rem' : '0.75rem',
                    fontWeight: 500,
                    mb: 0.5,
                  }}
                >
                  {kpi.unit}
                </Typography>

                <Typography
                  variant="caption"
                  sx={{
                    color: kpi.color,
                    fontSize: isMobile ? '0.65rem' : '0.7rem',
                    fontWeight: 500,
                    opacity: 0.8,
                  }}
                >
                  {kpi.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default DynamicParameterCards;
