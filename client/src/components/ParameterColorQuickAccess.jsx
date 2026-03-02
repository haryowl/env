import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  Alert,
  Collapse,
} from '@mui/material';
import {
  Science as ScienceIcon,
  Palette as PaletteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';

const ParameterColorQuickAccess = () => {
  const [parameterColors, setParameterColors] = useState({});
  const [expanded, setExpanded] = useState(false);

  // Load parameter colors from localStorage
  useEffect(() => {
    const loadParameterColors = () => {
      const savedColors = localStorage.getItem('kima_parameter_colors');
      if (savedColors) {
        setParameterColors(JSON.parse(savedColors));
      }
    };

    loadParameterColors();
    
    // Listen for changes
    const interval = setInterval(loadParameterColors, 1000);
    return () => clearInterval(interval);
  }, []);

  const defaultColors = {
    pH: '#0099CC',
    COD: '#F59E0B',
    TSS: '#10B981',
    NH3N: '#EC4899',
    Debit: '#3B82F6',
    Speed: '#6B7280',
  };

  const currentColors = { ...defaultColors, ...parameterColors };
  const hasCustomColors = Object.keys(parameterColors).length > 0;

  const quickColorSchemes = [
    {
      name: 'Default',
      colors: defaultColors,
    },
    {
      name: 'Ocean',
      colors: {
        pH: '#0EA5E9',
        COD: '#F97316',
        TSS: '#10B981',
        NH3N: '#EF4444',
        Debit: '#3B82F6',
        Speed: '#64748B',
      },
    },
    {
      name: 'Forest',
      colors: {
        pH: '#059669',
        COD: '#DC2626',
        TSS: '#10B981',
        NH3N: '#F59E0B',
        Debit: '#0EA5E9',
        Speed: '#6B7280',
      },
    },
  ];

  const applyColorScheme = (scheme) => {
    setParameterColors(scheme.colors);
    localStorage.setItem('kima_parameter_colors', JSON.stringify(scheme.colors));
  };

  const resetToDefault = () => {
    setParameterColors({});
    localStorage.removeItem('kima_parameter_colors');
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScienceIcon />
            Parameter Colors
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setExpanded(!expanded)}
            endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          >
            {expanded ? 'Hide' : 'Customize'}
          </Button>
        </Box>

        {/* Current Colors Display */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Current Parameter Colors:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {Object.entries(currentColors).map(([param, color]) => (
              <Chip
                key={param}
                label={`${param}: ${color}`}
                size="small"
                sx={{ 
                  backgroundColor: color, 
                  color: 'white',
                  fontWeight: 500,
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Status Alert */}
        {hasCustomColors ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            Custom parameter colors are active. Each parameter card will use its assigned color.
          </Alert>
        ) : (
          <Alert severity="info" sx={{ mb: 2 }}>
            Using default parameter colors. Click "Customize" to change individual parameter colors.
          </Alert>
        )}

        {/* Expandable Customization */}
        <Collapse in={expanded}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Quick Color Schemes:
            </Typography>
            <Grid container spacing={1} sx={{ mb: 2 }}>
              {quickColorSchemes.map((scheme, index) => (
                <Grid key={index}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => applyColorScheme(scheme)}
                    sx={{ 
                      minWidth: 'auto',
                      px: 2,
                      py: 1,
                      textTransform: 'none',
                    }}
                  >
                    {scheme.name}
                  </Button>
                </Grid>
              ))}
            </Grid>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                For advanced customization, use the full Parameter Color Customizer.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={resetToDefault}
                  disabled={!hasCustomColors}
                >
                  Reset
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PaletteIcon />}
                  onClick={() => window.location.href = '/parameter-colors'}
                >
                  Advanced
                </Button>
              </Box>
            </Box>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default ParameterColorQuickAccess;


