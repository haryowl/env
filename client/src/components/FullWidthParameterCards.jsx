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
import {
  Science as ScienceIcon,
  Water as WaterIcon,
  FilterAlt as FilterIcon,
  Warning as WarningIcon,
  Waves as WavesIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';

const FullWidthParameterCards = ({ data = {}, parameterColors = {}, realtimeParams = [] }) => {
  const theme = useTheme();
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

  // Calculate optimal layout for full width usage
  const getOptimalLayout = (paramCount) => {
    if (paramCount <= 1) {
      return { cols: 1, cardWidth: '100%' };
    } else if (paramCount <= 2) {
      return { cols: 2, cardWidth: '50%' };
    } else if (paramCount <= 3) {
      return { cols: 3, cardWidth: '33.33%' };
    } else if (paramCount <= 4) {
      return { cols: 4, cardWidth: '25%' };
    } else if (paramCount <= 5) {
      return { cols: 5, cardWidth: '20%' };
    } else if (paramCount <= 6) {
      return { cols: 6, cardWidth: '16.67%' };
    } else if (paramCount <= 8) {
      return { cols: 4, cardWidth: '25%' }; // 2 rows of 4
    } else if (paramCount <= 10) {
      return { cols: 5, cardWidth: '20%' }; // 2 rows of 5
    } else {
      return { cols: 6, cardWidth: '16.67%' }; // Multiple rows of 6
    }
  };

  const layout = getOptimalLayout(kpiData.length);

  // Calculate responsive layout
  const getResponsiveLayout = () => {
    if (isMobile) {
      return { cols: 1, cardWidth: '100%' };
    } else if (isTablet) {
      if (kpiData.length <= 2) return { cols: 2, cardWidth: '50%' };
      if (kpiData.length <= 4) return { cols: 2, cardWidth: '50%' };
      return { cols: 3, cardWidth: '33.33%' };
    } else {
      // For desktop, always use single row with equal distribution
      return { cols: kpiData.length, cardWidth: `${100/kpiData.length}%` };
    }
  };

  const responsiveLayout = getResponsiveLayout();

  return (
    <Box sx={{ width: '100%', mb: 3 }}>
      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <Box sx={{ mb: 2, p: 1, backgroundColor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <strong>Full Width Layout:</strong> {kpiData.length} parameters | 
            Screen: {isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'} | 
            Layout: {responsiveLayout.cols} columns | 
            Card Width: {responsiveLayout.cardWidth}
          </Typography>
        </Box>
      )}

      <Box 
        sx={{ 
          display: 'flex',
          flexWrap: 'nowrap', // Force single row
          gap: 2,
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'stretch'
        }}
      >
        {kpiData.map((kpi, index) => (
          <Card
            key={index}
            sx={{
              height: 140,
              flex: '1 1 0',
              minWidth: isMobile ? '100%' : 180,
              maxWidth: isMobile ? '100%' : 'none',
              borderRadius: 1,
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
            <CardContent sx={{ p: 2.5, position: 'relative', zIndex: 1, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ p: 1.25, borderRadius: 1.5, backgroundColor: `${kpi.color}20`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {kpi.icon}
                </Box>
                <Chip
                  label={kpi.trend}
                  size="small"
                  sx={{
                    backgroundColor: kpi.trend.startsWith('+') ? '#059669' : kpi.trend.startsWith('-') ? '#DC2626' : '#64748B',
                    color: '#fff',
                    fontSize: '0.7rem',
                    height: 24,
                    fontWeight: 600,
                    borderRadius: 1,
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
        ))}
      </Box>
    </Box>
  );
};

export default FullWidthParameterCards;
