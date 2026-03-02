import React from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Chip,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  Brightness4 as DarkIcon,
  Brightness7 as LightIcon,
  Colorize as EcoIcon,
  Palette as PaletteIcon,
  Dashboard as KimaIcon,
} from '@mui/icons-material';
import { useUserTheme } from '../contexts/UserThemeContext';
import { themeNames } from '../themes';

const ThemeSelector = ({ variant = 'select', size = 'small' }) => {
  const { currentTheme, changeTheme, availableThemes } = useUserTheme();

  const getThemeIcon = (themeName) => {
    switch (themeName) {
      case 'light':
        return <LightIcon fontSize="small" />;
      case 'dark':
        return <DarkIcon fontSize="small" />;
      case 'green':
        return <EcoIcon fontSize="small" />;
      case 'kima':
        return <KimaIcon fontSize="small" />;
      default:
        return <PaletteIcon fontSize="small" />;
    }
  };

  const getThemeColor = (themeName) => {
    switch (themeName) {
      case 'light':
        return '#1976d2';
      case 'dark':
        return '#90caf9';
      case 'green':
        return '#2e7d32';
      case 'kima':
        return '#007BA7';
      default:
        return '#1976d2';
    }
  };

  if (variant === 'chips') {
    return (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {availableThemes.map((themeName) => (
          <Tooltip key={themeName} title={`Switch to ${themeNames[themeName]} theme`}>
            <Chip
              icon={getThemeIcon(themeName)}
              label={themeNames[themeName]}
              onClick={() => changeTheme(themeName)}
              variant={currentTheme === themeName ? 'filled' : 'outlined'}
              size={size}
              sx={{
                cursor: 'pointer',
                backgroundColor: currentTheme === themeName ? getThemeColor(themeName) : 'transparent',
                color: currentTheme === themeName ? 'white' : 'inherit',
                '&:hover': {
                  backgroundColor: currentTheme === themeName 
                    ? getThemeColor(themeName) 
                    : `${getThemeColor(themeName)}15`,
                },
              }}
            />
          </Tooltip>
        ))}
      </Box>
    );
  }

  if (variant === 'icons') {
    return (
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {availableThemes.map((themeName) => (
          <Tooltip key={themeName} title={`Switch to ${themeNames[themeName]} theme`}>
            <IconButton
              onClick={() => changeTheme(themeName)}
              size={size}
              sx={{
                color: currentTheme === themeName ? getThemeColor(themeName) : 'inherit',
                backgroundColor: currentTheme === themeName ? `${getThemeColor(themeName)}15` : 'transparent',
                '&:hover': {
                  backgroundColor: `${getThemeColor(themeName)}20`,
                },
              }}
            >
              {getThemeIcon(themeName)}
            </IconButton>
          </Tooltip>
        ))}
      </Box>
    );
  }

  // Default select variant
  return (
    <FormControl size={size} sx={{ minWidth: 120 }}>
      <InputLabel id="theme-select-label">Theme</InputLabel>
      <Select
        labelId="theme-select-label"
        value={currentTheme}
        label="Theme"
        onChange={(e) => changeTheme(e.target.value)}
        startAdornment={getThemeIcon(currentTheme)}
      >
        {availableThemes.map((themeName) => (
          <MenuItem key={themeName} value={themeName}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {getThemeIcon(themeName)}
              {themeNames[themeName]}
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default ThemeSelector;
