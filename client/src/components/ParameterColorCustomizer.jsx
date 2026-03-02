import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Science as ScienceIcon,
  Water as WaterIcon,
  FilterAlt as FilterIcon,
  Warning as WarningIcon,
  Waves as WavesIcon,
  Speed as SpeedIcon,
  Palette as PaletteIcon,
} from '@mui/icons-material';

const ParameterColorCustomizer = ({ onParameterColorsChange, currentParameterColors = {} }) => {
  const [parameterColors, setParameterColors] = useState({
    pH: '#0099CC',
    COD: '#F59E0B',
    TSS: '#10B981',
    NH3N: '#EC4899',
    Debit: '#3B82F6',
    Speed: '#6B7280',
    ...currentParameterColors,
  });

  const parameterInfo = [
    {
      key: 'pH',
      name: 'pH Level',
      description: 'Acidity/Alkalinity Level',
      icon: <ScienceIcon />,
      defaultColor: '#0099CC',
    },
    {
      key: 'COD',
      name: 'COD',
      description: 'Chemical Oxygen Demand',
      icon: <WaterIcon />,
      defaultColor: '#F59E0B',
    },
    {
      key: 'TSS',
      name: 'TSS',
      description: 'Total Suspended Solids',
      icon: <FilterIcon />,
      defaultColor: '#10B981',
    },
    {
      key: 'NH3N',
      name: 'NH3N',
      description: 'Ammonia Nitrogen',
      icon: <WarningIcon />,
      defaultColor: '#EC4899',
    },
    {
      key: 'Debit',
      name: 'Debit',
      description: 'Flow Rate',
      icon: <WavesIcon />,
      defaultColor: '#3B82F6',
    },
    {
      key: 'Speed',
      name: 'Speed',
      description: 'Velocity',
      icon: <SpeedIcon />,
      defaultColor: '#6B7280',
    },
    {
      key: 'soil_temp',
      name: 'Soil Temperature',
      description: 'Soil Temperature',
      icon: <ScienceIcon />,
      defaultColor: '#F59E0B',
    },
    {
      key: 'soil_moisture',
      name: 'Soil Moisture',
      description: 'Soil Moisture',
      icon: <WaterIcon />,
      defaultColor: '#3B82F6',
    },
    {
      key: 'air_humidity',
      name: 'Air Humidity',
      description: 'Air Humidity',
      icon: <WaterIcon />,
      defaultColor: '#10B981',
    },
    {
      key: 'level_cm',
      name: 'Water Level',
      description: 'Water Level',
      icon: <WavesIcon />,
      defaultColor: '#0099CC',
    },
    {
      key: 'Rainfall_cm',
      name: 'Rainfall',
      description: 'Rainfall',
      icon: <WaterIcon />,
      defaultColor: '#3B82F6',
    },
  ];

  // Predefined color schemes for parameters
  const colorSchemes = [
    {
      name: 'Default Professional',
      colors: {
        pH: '#0099CC',
        COD: '#F59E0B',
        TSS: '#10B981',
        NH3N: '#EC4899',
        Debit: '#3B82F6',
        Speed: '#6B7280',
        soil_temp: '#F59E0B',
        soil_moisture: '#3B82F6',
        air_humidity: '#10B981',
        level_cm: '#0099CC',
        Rainfall_cm: '#3B82F6',
      },
    },
    {
      name: 'Ocean Theme',
      colors: {
        pH: '#0EA5E9',
        COD: '#F97316',
        TSS: '#10B981',
        NH3N: '#EF4444',
        Debit: '#3B82F6',
        Speed: '#64748B',
        soil_temp: '#F97316',
        soil_moisture: '#0EA5E9',
        air_humidity: '#10B981',
        level_cm: '#0EA5E9',
        Rainfall_cm: '#3B82F6',
      },
    },
    {
      name: 'Forest Theme',
      colors: {
        pH: '#059669',
        COD: '#DC2626',
        TSS: '#10B981',
        NH3N: '#F59E0B',
        Debit: '#0EA5E9',
        Speed: '#6B7280',
        soil_temp: '#F59E0B',
        soil_moisture: '#059669',
        air_humidity: '#10B981',
        level_cm: '#059669',
        Rainfall_cm: '#0EA5E9',
      },
    },
    {
      name: 'Sunset Theme',
      colors: {
        pH: '#EA580C',
        COD: '#F59E0B',
        TSS: '#10B981',
        NH3N: '#EC4899',
        Debit: '#006B9A',
        Speed: '#6B7280',
        soil_temp: '#F59E0B',
        soil_moisture: '#EA580C',
        air_humidity: '#10B981',
        level_cm: '#EA580C',
        Rainfall_cm: '#006B9A',
      },
    },
    {
      name: 'Monochrome',
      colors: {
        pH: '#374151',
        COD: '#6B7280',
        TSS: '#9CA3AF',
        NH3N: '#D1D5DB',
        Debit: '#F3F4F6',
        Speed: '#111827',
        soil_temp: '#6B7280',
        soil_moisture: '#374151',
        air_humidity: '#9CA3AF',
        level_cm: '#374151',
        Rainfall_cm: '#6B7280',
      },
    },
  ];

  useEffect(() => {
    // Load saved parameter colors from localStorage
    const savedColors = localStorage.getItem('kima_parameter_colors');
    if (savedColors) {
      const colors = JSON.parse(savedColors);
      setParameterColors(colors);
    }
  }, []);

  const handleColorChange = (parameter, color) => {
    const newColors = { ...parameterColors, [parameter]: color };
    setParameterColors(newColors);
    
    // Save to localStorage
    localStorage.setItem('kima_parameter_colors', JSON.stringify(newColors));
    
    // Notify parent component
    if (onParameterColorsChange) {
      onParameterColorsChange(newColors);
    }
  };

  const applyColorScheme = (scheme) => {
    setParameterColors(scheme.colors);
    localStorage.setItem('kima_parameter_colors', JSON.stringify(scheme.colors));
    
    if (onParameterColorsChange) {
      onParameterColorsChange(scheme.colors);
    }
  };

  const resetToDefault = () => {
    const defaultColors = parameterInfo.reduce((acc, param) => {
      acc[param.key] = param.defaultColor;
      return acc;
    }, {});
    
    setParameterColors(defaultColors);
    localStorage.setItem('kima_parameter_colors', JSON.stringify(defaultColors));
    
    if (onParameterColorsChange) {
      onParameterColorsChange(defaultColors);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
        <PaletteIcon />
        Parameter Color Customization
      </Typography>

      {/* Color Schemes */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Color Schemes
          </Typography>
          <Grid container spacing={2}>
            {colorSchemes.map((scheme, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    border: '2px solid transparent',
                    '&:hover': {
                      border: '2px solid',
                      borderColor: 'primary.main',
                    },
                  }}
                  onClick={() => applyColorScheme(scheme)}
                >
                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                      {scheme.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {Object.entries(scheme.colors).map(([param, color]) => (
                        <Box
                          key={param}
                          sx={{
                            width: 20,
                            height: 20,
                            borderRadius: '4px',
                            backgroundColor: color,
                            border: '1px solid rgba(0,0,0,0.1)',
                          }}
                          title={`${param}: ${color}`}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Individual Parameter Colors */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Individual Parameter Colors
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            {parameterInfo.map((param) => (
              <Grid item xs={12} sm={6} md={4} key={param.key}>
                <Card sx={{ border: `2px solid ${parameterColors[param.key]}40` }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Box
                        sx={{
                          p: 1,
                          borderRadius: '4px',
                          backgroundColor: `${parameterColors[param.key]}20`,
                          color: parameterColors[param.key],
                        }}
                      >
                        {param.icon}
                      </Box>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {param.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {param.description}
                        </Typography>
                      </Box>
                    </Box>
                    
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField
                        type="color"
                        value={parameterColors[param.key]}
                        onChange={(e) => handleColorChange(param.key, e.target.value)}
                        sx={{ width: 50, height: 40 }}
                        size="small"
                      />
                      <TextField
                        value={parameterColors[param.key]}
                        onChange={(e) => handleColorChange(param.key, e.target.value)}
                        size="small"
                        sx={{ flex: 1 }}
                        placeholder="#000000"
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              variant="outlined"
              onClick={resetToDefault}
              startIcon={<PaletteIcon />}
            >
              Reset to Default
            </Button>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Preview */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Color Preview
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {Object.entries(parameterColors).map(([param, color]) => (
              <Chip
                key={param}
                label={`${param}: ${color}`}
                sx={{ 
                  backgroundColor: color, 
                  color: 'white',
                  fontWeight: 500,
                }}
              />
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ParameterColorCustomizer;
