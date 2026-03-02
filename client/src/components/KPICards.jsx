import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  IconButton,
} from '@mui/material';
import {
  Science as ScienceIcon,
  Water as WaterIcon,
  FilterAlt as FilterIcon,
  Warning as WarningIcon,
  Waves as WavesIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';

const KPICards = ({ data = {}, parameterColors = {}, realtimeParams = [] }) => {
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
    // Add more common parameters
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
    datetime: {
      color: '#6B7280',
      icon: <ScienceIcon />,
      unit: '',
      description: 'Timestamp',
    },
  };

  // Get parameters to display (use realtimeParams if provided, otherwise use all data keys)
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
      trend: '0.0', // Could be calculated from historical data
      description: metadata.description,
    };
  });

  // Calculate dynamic grid sizing based on number of parameters
  const getDynamicGridSize = (totalParams) => {
    // More aggressive full-width utilization
    if (totalParams <= 1) {
      return { xs: 12, sm: 12, md: 12, lg: 12 }; // Single card takes full width
    } else if (totalParams <= 2) {
      return { xs: 12, sm: 6, md: 6, lg: 6 }; // 2 cards per row
    } else if (totalParams <= 3) {
      return { xs: 12, sm: 6, md: 4, lg: 4 }; // 3 cards per row
    } else if (totalParams <= 4) {
      return { xs: 12, sm: 6, md: 3, lg: 3 }; // 4 cards per row
    } else if (totalParams <= 5) {
      return { xs: 12, sm: 6, md: 2, lg: 2 }; // 5 cards per row (2.4 each)
    } else if (totalParams <= 6) {
      return { xs: 12, sm: 6, md: 2, lg: 2 }; // 6 cards per row (2 each)
    } else if (totalParams <= 8) {
      return { xs: 12, sm: 4, md: 2, lg: 1 }; // 8 cards per row (1.5 each)
    } else if (totalParams <= 10) {
      return { xs: 12, sm: 4, md: 1, lg: 1 }; // 10 cards per row (1.2 each)
    } else {
      return { xs: 12, sm: 3, md: 1, lg: 1 }; // 12+ cards per row (1 each)
    }
  };

  const gridSize = getDynamicGridSize(kpiData.length);

  return (
    <Box sx={{ width: '100%', mb: 3 }}>
      {/* Debug info - can be removed in production */}
      {process.env.NODE_ENV === 'development' && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Showing {kpiData.length} parameters with dynamic sizing: {JSON.stringify(gridSize)}
        </Typography>
      )}
      
      <Grid container spacing={2} sx={{ width: '100%' }}>
        {kpiData.map((kpi, index) => (
          <Grid item {...gridSize} key={index} sx={{ display: 'flex', width: '100%' }}>
            <Card
              sx={{
                height: '100%',
                width: '100%',
                minHeight: '140px',
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
            <CardContent sx={{ p: 2.5, position: 'relative', zIndex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box
                  sx={{
                    p: 1.2,
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
                    color: '#FFFFFF',
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
                  fontSize: '1.8rem',
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
                  fontSize: '0.75rem',
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
                  fontSize: '0.7rem',
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

export default KPICards;
