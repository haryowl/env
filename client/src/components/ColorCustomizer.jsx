import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Palette as PaletteIcon,
  ColorLens as ColorLensIcon,
  Brightness4 as DarkIcon,
  Brightness7 as LightIcon,
  Science as ScienceIcon,
} from '@mui/icons-material';
import ParameterColorCustomizer from './ParameterColorCustomizer';

const ColorCustomizer = ({ onColorChange, currentTheme = 'kima' }) => {
  const [sidebarColor, setSidebarColor] = useState('#007BA7');
  const [accentColor, setAccentColor] = useState('#F59E0B');
  const [backgroundColor, setBackgroundColor] = useState('#F8FAFC');
  const [cardBackground, setCardBackground] = useState('#FFFFFF');
  const [textColor, setTextColor] = useState('#1F2937');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // Predefined color combinations
  const colorPresets = [
    {
      name: 'KIMA Professional',
      sidebar: '#007BA7',
      accent: '#F59E0B',
      background: '#F8FAFC',
      card: '#FFFFFF',
      text: '#1F2937',
    },
    {
      name: 'Ocean Blue',
      sidebar: '#0EA5E9',
      accent: '#F97316',
      background: '#F0F9FF',
      card: '#FFFFFF',
      text: '#0F172A',
    },
    {
      name: 'Forest Green',
      sidebar: '#059669',
      accent: '#DC2626',
      background: '#F0FDF4',
      card: '#FFFFFF',
      text: '#064E3B',
    },
    {
      name: 'Sunset Orange',
      sidebar: '#EA580C',
      accent: '#006B9A',
      background: '#FFF7ED',
      card: '#FFFFFF',
      text: '#9A3412',
    },
    {
      name: 'Midnight Purple',
      sidebar: '#7C2D12',
      accent: '#F59E0B',
      background: '#1F2937',
      card: '#374151',
      text: '#F9FAFB',
    },
    {
      name: 'Rose Gold',
      sidebar: '#BE185D',
      accent: '#F59E0B',
      background: '#FDF2F8',
      card: '#FFFFFF',
      text: '#831843',
    },
  ];

  // Dark mode presets
  const darkModePresets = [
    {
      name: 'Dark Professional',
      sidebar: '#1F2937',
      accent: '#F59E0B',
      background: '#111827',
      card: '#1F2937',
      text: '#F9FAFB',
    },
    {
      name: 'Dark Purple',
      sidebar: '#4C1D95',
      accent: '#F59E0B',
      background: '#0F0F23',
      card: '#1E1B4B',
      text: '#E0E7FF',
    },
    {
      name: 'Dark Blue',
      sidebar: '#1E3A8A',
      accent: '#F59E0B',
      background: '#0F172A',
      card: '#1E40AF',
      text: '#DBEAFE',
    },
  ];

  const allPresets = isDarkMode ? darkModePresets : colorPresets;

  useEffect(() => {
    // Load saved colors from localStorage
    const savedColors = localStorage.getItem('kima_custom_colors');
    if (savedColors) {
      const colors = JSON.parse(savedColors);
      setSidebarColor(colors.sidebar || '#007BA7');
      setAccentColor(colors.accent || '#F59E0B');
      setBackgroundColor(colors.background || '#F8FAFC');
      setCardBackground(colors.card || '#FFFFFF');
      setTextColor(colors.text || '#1F2937');
      setIsDarkMode(colors.isDarkMode || false);
    }
  }, []);

  const handleColorChange = (colorType, value) => {
    const newColors = {
      sidebar: colorType === 'sidebar' ? value : sidebarColor,
      accent: colorType === 'accent' ? value : accentColor,
      background: colorType === 'background' ? value : backgroundColor,
      card: colorType === 'card' ? value : cardBackground,
      text: colorType === 'text' ? value : textColor,
      isDarkMode,
    };

    // Update state
    switch (colorType) {
      case 'sidebar':
        setSidebarColor(value);
        break;
      case 'accent':
        setAccentColor(value);
        break;
      case 'background':
        setBackgroundColor(value);
        break;
      case 'card':
        setCardBackground(value);
        break;
      case 'text':
        setTextColor(value);
        break;
    }

    // Save to localStorage
    localStorage.setItem('kima_custom_colors', JSON.stringify(newColors));

    // Notify parent component
    if (onColorChange) {
      onColorChange(newColors);
    }
  };

  const applyPreset = (preset) => {
    setSidebarColor(preset.sidebar);
    setAccentColor(preset.accent);
    setBackgroundColor(preset.background);
    setCardBackground(preset.card);
    setTextColor(preset.text);
    setIsDarkMode(preset.isDarkMode || false);

    const newColors = {
      sidebar: preset.sidebar,
      accent: preset.accent,
      background: preset.background,
      card: preset.card,
      text: preset.text,
      isDarkMode: preset.isDarkMode || false,
    };

    localStorage.setItem('kima_custom_colors', JSON.stringify(newColors));

    if (onColorChange) {
      onColorChange(newColors);
    }
  };

  const resetToDefault = () => {
    applyPreset(colorPresets[0]); // KIMA Professional
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ColorLensIcon />
        Color Customization
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab 
            label="Theme Colors" 
            icon={<PaletteIcon />} 
            iconPosition="start"
          />
          <Tab 
            label="Parameter Colors" 
            icon={<ScienceIcon />} 
            iconPosition="start"
            sx={{ 
              backgroundColor: activeTab === 1 ? 'primary.main' : 'transparent',
              color: activeTab === 1 ? 'white' : 'inherit',
              '&:hover': {
                backgroundColor: activeTab === 1 ? 'primary.dark' : 'action.hover',
              }
            }}
          />
        </Tabs>
      </Box>

      {activeTab === 0 && (
        <Box>

      {/* Dark Mode Toggle */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <FormControlLabel
            control={
              <Switch
                checked={isDarkMode}
                onChange={(e) => {
                  setIsDarkMode(e.target.checked);
                  const newColors = {
                    sidebar,
                    accent: accentColor,
                    background: backgroundColor,
                    card: cardBackground,
                    text: textColor,
                    isDarkMode: e.target.checked,
                  };
                  localStorage.setItem('kima_custom_colors', JSON.stringify(newColors));
                  if (onColorChange) onColorChange(newColors);
                }}
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {isDarkMode ? <DarkIcon /> : <LightIcon />}
                <Typography variant="body1">
                  {isDarkMode ? 'Dark Mode' : 'Light Mode'}
                </Typography>
              </Box>
            }
          />
        </CardContent>
      </Card>

      {/* Color Presets */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Color Presets
          </Typography>
          <Grid container spacing={2}>
            {allPresets.map((preset, index) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={index}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    border: '2px solid transparent',
                    '&:hover': {
                      border: '2px solid',
                      borderColor: 'primary.main',
                    },
                  }}
                  onClick={() => applyPreset(preset)}
                >
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: '4px',
                          backgroundColor: preset.sidebar,
                        }}
                      />
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: '4px',
                          backgroundColor: preset.accent,
                        }}
                      />
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: '4px',
                          backgroundColor: preset.background,
                        }}
                      />
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {preset.name}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Custom Color Controls */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Custom Colors
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            {/* Sidebar Color */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
                Sidebar Color
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  type="color"
                  value={sidebarColor}
                  onChange={(e) => handleColorChange('sidebar', e.target.value)}
                  sx={{ width: 60, height: 40 }}
                  size="small"
                />
                <TextField
                  value={sidebarColor}
                  onChange={(e) => handleColorChange('sidebar', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                />
              </Box>
            </Grid>

            {/* Accent Color */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
                Accent Color
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  type="color"
                  value={accentColor}
                  onChange={(e) => handleColorChange('accent', e.target.value)}
                  sx={{ width: 60, height: 40 }}
                  size="small"
                />
                <TextField
                  value={accentColor}
                  onChange={(e) => handleColorChange('accent', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                />
              </Box>
            </Grid>

            {/* Background Color */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
                Background Color
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => handleColorChange('background', e.target.value)}
                  sx={{ width: 60, height: 40 }}
                  size="small"
                />
                <TextField
                  value={backgroundColor}
                  onChange={(e) => handleColorChange('background', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                />
              </Box>
            </Grid>

            {/* Card Background Color */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
                Card Background Color
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  type="color"
                  value={cardBackground}
                  onChange={(e) => handleColorChange('card', e.target.value)}
                  sx={{ width: 60, height: 40 }}
                  size="small"
                />
                <TextField
                  value={cardBackground}
                  onChange={(e) => handleColorChange('card', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                />
              </Box>
            </Grid>

            {/* Text Color */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
                Text Color
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  type="color"
                  value={textColor}
                  onChange={(e) => handleColorChange('text', e.target.value)}
                  sx={{ width: 60, height: 40 }}
                  size="small"
                />
                <TextField
                  value={textColor}
                  onChange={(e) => handleColorChange('text', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                />
              </Box>
            </Grid>
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
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Chip
              label={`Sidebar: ${sidebarColor}`}
              sx={{ backgroundColor: sidebarColor, color: 'white' }}
            />
            <Chip
              label={`Accent: ${accentColor}`}
              sx={{ backgroundColor: accentColor, color: 'white' }}
            />
            <Chip
              label={`Background: ${backgroundColor}`}
              sx={{ backgroundColor: backgroundColor, color: textColor }}
            />
            <Chip
              label={`Card: ${cardBackground}`}
              sx={{ backgroundColor: cardBackground, color: textColor, border: '1px solid #ccc' }}
            />
          </Box>
        </CardContent>
      </Card>
        </Box>
      )}

      {activeTab === 1 && (
        <ParameterColorCustomizer 
          onParameterColorsChange={(colors) => {
            // Parameter colors are automatically saved to localStorage
            // Force a re-render by updating a dummy state
            setActiveTab(prev => prev);
          }}
        />
      )}
    </Box>
  );
};

export default ColorCustomizer;
