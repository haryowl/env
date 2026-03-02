import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Divider,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import SmartColorPicker from './SmartColorPicker';
import {
  Palette as PaletteIcon,
  TextFields as TextFieldsIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';

const FontColorCustomizer = () => {
  const [fontColors, setFontColors] = useState({
    primary: '#1F2937',
    secondary: '#6B7280',
    accent: '#3B82F6',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#06B6D4',
  });

  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF');

  const [fontSizes, setFontSizes] = useState({
    h1: '2.5rem',
    h2: '2rem',
    h3: '1.75rem',
    h4: '1.5rem',
    h5: '1.25rem',
    h6: '1rem',
    body1: '1rem',
    body2: '0.875rem',
    caption: '0.75rem',
  });

  // Load saved colors from localStorage
  useEffect(() => {
    const savedFontColors = localStorage.getItem('font_colors');
    const savedFontSizes = localStorage.getItem('font_sizes');
    
    if (savedFontColors) {
      setFontColors(JSON.parse(savedFontColors));
    }
    if (savedFontSizes) {
      setFontSizes(JSON.parse(savedFontSizes));
    }
  }, []);

  // Save colors to localStorage
  const saveFontColors = () => {
    localStorage.setItem('font_colors', JSON.stringify(fontColors));
    localStorage.setItem('font_sizes', JSON.stringify(fontSizes));
    
    // Trigger a custom event to notify other components
    window.dispatchEvent(new CustomEvent('fontColorsChanged', { 
      detail: { fontColors, fontSizes } 
    }));
  };

  // Reset to defaults
  const resetToDefaults = () => {
    const defaultFontColors = {
      primary: '#1F2937',
      secondary: '#6B7280',
      accent: '#3B82F6',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#06B6D4',
    };
    
    const defaultFontSizes = {
      h1: '2.5rem',
      h2: '2rem',
      h3: '1.75rem',
      h4: '1.5rem',
      h5: '1.25rem',
      h6: '1rem',
      body1: '1rem',
      body2: '0.875rem',
      caption: '0.75rem',
    };
    
    setFontColors(defaultFontColors);
    setFontSizes(defaultFontSizes);
    localStorage.setItem('font_colors', JSON.stringify(defaultFontColors));
    localStorage.setItem('font_sizes', JSON.stringify(defaultFontSizes));
    
    window.dispatchEvent(new CustomEvent('fontColorsChanged', { 
      detail: { fontColors: defaultFontColors, fontSizes: defaultFontSizes } 
    }));
  };

  const handleColorChange = (colorType, color) => {
    setFontColors(prev => ({
      ...prev,
      [colorType]: color
    }));
  };

  const handleSizeChange = (sizeType, size) => {
    setFontSizes(prev => ({
      ...prev,
      [sizeType]: size
    }));
  };

  // Color presets
  const colorPresets = [
    {
      name: 'Default',
      colors: {
        primary: '#1F2937',
        secondary: '#6B7280',
        accent: '#3B82F6',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#06B6D4',
      }
    },
    {
      name: 'Dark Theme',
      colors: {
        primary: '#F9FAFB',
        secondary: '#D1D5DB',
        accent: '#60A5FA',
        success: '#34D399',
        warning: '#FBBF24',
        error: '#F87171',
        info: '#22D3EE',
      }
    },
    {
      name: 'Blue Theme',
      colors: {
        primary: '#1E40AF',
        secondary: '#64748B',
        accent: '#3B82F6',
        success: '#059669',
        warning: '#D97706',
        error: '#DC2626',
        info: '#0891B2',
      }
    },
    {
      name: 'Green Theme',
      colors: {
        primary: '#065F46',
        secondary: '#6B7280',
        accent: '#10B981',
        success: '#059669',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#06B6D4',
      }
    },
  ];

  const applyPreset = (preset) => {
    setFontColors(preset.colors);
    localStorage.setItem('font_colors', JSON.stringify(preset.colors));
    
    window.dispatchEvent(new CustomEvent('fontColorsChanged', { 
      detail: { fontColors: preset.colors, fontSizes } 
    }));
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <TextFieldsIcon sx={{ mr: 2, color: 'primary.main', fontSize: '2rem' }} />
        <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
          Font Color & Size Customization
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Customize font colors and sizes for all text elements across the application. 
        Changes will be applied immediately and saved automatically.
      </Alert>

      <Grid container spacing={3}>
        {/* Font Colors */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <PaletteIcon sx={{ mr: 1 }} />
                Font Colors
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Color Presets
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {colorPresets.map((preset) => (
                    <Chip
                      key={preset.name}
                      label={preset.name}
                      onClick={() => applyPreset(preset)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: 'primary.light',
                          color: 'white',
                        },
                      }}
                    />
                  ))}
                </Box>
              </Box>

              <Divider sx={{ mb: 2 }} />

              {/* Background Color Selection */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                  Background Color for Contrast Testing
                </Typography>
                <SmartColorPicker
                  label="Background"
                  value={backgroundColor}
                  onChange={setBackgroundColor}
                  showContrastCheck={false}
                  autoOptimize={false}
                />
              </Box>

              <Divider sx={{ mb: 2 }} />

              {Object.entries(fontColors).map(([colorType, color]) => (
                <Box key={colorType} sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, textTransform: 'capitalize' }}>
                    {colorType.replace(/([A-Z])/g, ' $1').trim()}
                  </Typography>
                  <SmartColorPicker
                    label={colorType.replace(/([A-Z])/g, ' $1').trim()}
                    value={color}
                    onChange={(newColor) => handleColorChange(colorType, newColor)}
                    backgroundColor={backgroundColor}
                    showContrastCheck={true}
                    autoOptimize={true}
                  />
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Font Sizes */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <TextFieldsIcon sx={{ mr: 1 }} />
                Font Sizes
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  Typography Scale
                </Typography>
                {Object.entries(fontSizes).map(([sizeType, size]) => (
                  <Box key={sizeType} sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, textTransform: 'capitalize' }}>
                      {sizeType.replace(/([A-Z])/g, ' $1').trim()}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <TextField
                        size="small"
                        value={size || ''}
                        onChange={(e) => handleSizeChange(sizeType, e.target.value)}
                        placeholder="1rem"
                        sx={{ flex: 1 }}
                      />
                      <Typography
                        variant={sizeType}
                        sx={{
                          fontSize: size,
                          fontWeight: sizeType.includes('h') ? 700 : 400,
                          color: 'primary.main',
                          minWidth: '100px',
                        }}
                      >
                        Sample
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={saveFontColors}
          size="large"
          sx={{ px: 4 }}
        >
          Save Changes
        </Button>
        
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={resetToDefaults}
          size="large"
          sx={{ px: 4 }}
        >
          Reset to Defaults
        </Button>
      </Box>

      {/* Preview Section */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
            <VisibilityIcon sx={{ mr: 1 }} />
            Preview
          </Typography>
          
          <Box sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 2 }}>
            <Typography variant="h1" sx={{ color: fontColors.primary, fontSize: fontSizes.h1 }}>
              Heading 1 - Primary Color
            </Typography>
            <Typography variant="h2" sx={{ color: fontColors.primary, fontSize: fontSizes.h2 }}>
              Heading 2 - Primary Color
            </Typography>
            <Typography variant="h3" sx={{ color: fontColors.primary, fontSize: fontSizes.h3 }}>
              Heading 3 - Primary Color
            </Typography>
            <Typography variant="body1" sx={{ color: fontColors.secondary, fontSize: fontSizes.body1 }}>
              Body text - Secondary Color
            </Typography>
            <Typography variant="body2" sx={{ color: fontColors.secondary, fontSize: fontSizes.body2 }}>
              Small body text - Secondary Color
            </Typography>
            <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Chip label="Success" sx={{ backgroundColor: fontColors.success, color: 'white' }} />
              <Chip label="Warning" sx={{ backgroundColor: fontColors.warning, color: 'white' }} />
              <Chip label="Error" sx={{ backgroundColor: fontColors.error, color: 'white' }} />
              <Chip label="Info" sx={{ backgroundColor: fontColors.info, color: 'white' }} />
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default FontColorCustomizer;
