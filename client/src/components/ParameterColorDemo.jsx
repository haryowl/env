import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Divider,
  Alert,
  Paper,
} from '@mui/material';
import {
  Science as ScienceIcon,
  Palette as PaletteIcon,
  ColorLens as ColorLensIcon,
} from '@mui/icons-material';
import KPICards from './KPICards';

const ParameterColorDemo = () => {
  const [parameterColors, setParameterColors] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);

  // Load parameter colors from localStorage
  useEffect(() => {
    const loadParameterColors = () => {
      const savedColors = localStorage.getItem('kima_parameter_colors');
      if (savedColors) {
        setParameterColors(JSON.parse(savedColors));
        setLastUpdated(new Date().toLocaleTimeString());
      }
    };

    loadParameterColors();

    // Listen for changes in localStorage
    const handleStorageChange = (e) => {
      if (e.key === 'kima_parameter_colors') {
        loadParameterColors();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for changes within the same tab
    const interval = setInterval(loadParameterColors, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const sampleData = {
    pH: '8.20',
    COD: '41.84',
    TSS: '103.12',
    NH3N: '1.61',
    Debit: '0.00',
    Speed: '0.0',
  };

  const defaultColors = {
    pH: '#0099CC',
    COD: '#F59E0B',
    TSS: '#10B981',
    NH3N: '#EC4899',
    Debit: '#3B82F6',
    Speed: '#6B7280',
  };

  const currentColors = { ...defaultColors, ...parameterColors };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ScienceIcon />
        Individual Parameter Color Demo
      </Typography>

      <Typography variant="body1" sx={{ mb: 4, color: 'text.secondary' }}>
        This demo shows how each parameter card can have its own distinct color scheme. 
        Customize the colors using the Parameter Color Customizer to see real-time changes.
      </Typography>

      {/* Current Color Status */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>Current Parameter Colors:</strong> {Object.keys(parameterColors).length > 0 ? 'Custom colors loaded' : 'Using default colors'}
          {lastUpdated && ` (Last updated: ${lastUpdated})`}
        </Typography>
      </Alert>

      {/* Color Preview */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ColorLensIcon />
            Current Color Scheme
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {Object.entries(currentColors).map(([param, color]) => (
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
          <Typography variant="body2" color="text.secondary">
            These colors are applied to the parameter cards below. Each card uses its assigned color 
            for the background gradient, border, icon, and value text.
          </Typography>
        </CardContent>
      </Card>

      {/* KPI Cards with Individual Colors */}
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Parameter Cards with Individual Colors
      </Typography>
      <KPICards data={sampleData} parameterColors={parameterColors} />

      {/* Features Explanation */}
      <Grid container spacing={3} sx={{ mt: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                <PaletteIcon />
                Color Features
              </Typography>
              <Box component="ul" sx={{ pl: 2, m: 0 }}>
                <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                  <strong>Individual Card Colors:</strong> Each parameter has its own color scheme
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                  <strong>Gradient Backgrounds:</strong> Cards use color-based gradients for visual appeal
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                  <strong>Color-Coded Icons:</strong> Icons match the parameter's assigned color
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                  <strong>Dynamic Borders:</strong> Card borders change color on hover
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                  <strong>Text Shadows:</strong> Values have subtle color-based text shadows
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                How to Customize
              </Typography>
              <Box component="ol" sx={{ pl: 2, m: 0 }}>
                <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                  Go to <strong>Data → Parameter Colors</strong> or <strong>Color Customizer → Parameter Colors</strong>
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                  Choose from predefined color schemes or create custom colors
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                  Use color pickers to fine-tune individual parameter colors
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                  Changes are applied instantly and saved automatically
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                  Colors persist across browser sessions
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'center' }}>
        <Button
          variant="contained"
          startIcon={<PaletteIcon />}
          onClick={() => window.location.href = '/parameter-colors'}
        >
          Open Parameter Color Customizer
        </Button>
        <Button
          variant="outlined"
          startIcon={<ColorLensIcon />}
          onClick={() => window.location.href = '/color-customizer'}
        >
          Open Full Color Customizer
        </Button>
      </Box>

      <Divider sx={{ my: 4 }} />

      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        This demo automatically updates when you change parameter colors in the customizer. 
        The individual parameter colors provide better visual distinction and data categorization 
        while maintaining the overall theme consistency.
      </Typography>
    </Box>
  );
};

export default ParameterColorDemo;





