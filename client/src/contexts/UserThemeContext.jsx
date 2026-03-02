import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { themes, createThemeWithFont } from '../themes';
import { createDynamicTheme } from '../themes/dynamicTheme';
import userPreferencesService from '../services/userPreferencesService';

const UserThemeContext = createContext();

export const useUserTheme = () => {
  const context = useContext(UserThemeContext);
  if (!context) {
    throw new Error('useUserTheme must be used within a UserThemeContextProvider');
  }
  return context;
};

export const UserThemeContextProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState('light');
  const [customColors, setCustomColors] = useState(null);
  const [fontColors, setFontColors] = useState(null);
  const [fontSizes, setFontSizes] = useState(null);
  const [fontType, setFontType] = useState('monospace');
  const [parameterColors, setParameterColors] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isServerSync, setIsServerSync] = useState(false);
  const [syncError, setSyncError] = useState(null);

  // Initialize theme from server or localStorage
  useEffect(() => {
    const initializeTheme = async () => {
      setIsLoading(true);
      setSyncError(null);

      try {
        // Check if user is authenticated
        if (userPreferencesService.isAuthenticated()) {
          // Try to sync with server first
          const synced = await userPreferencesService.syncWithServer();
          if (synced) {
            setIsServerSync(true);
            console.log('Theme synced with server');
          } else {
            // Fallback to localStorage
            console.warn('Server sync failed, using localStorage');
            setIsServerSync(false);
          }
        } else {
          // Not authenticated, use localStorage only
          setIsServerSync(false);
        }

        // Load from localStorage (either synced from server or local)
        const savedTheme = localStorage.getItem('aksadata-theme');
        const savedCustomColors = localStorage.getItem('kima_custom_colors');
        const savedFontColors = localStorage.getItem('font_colors');
        const savedFontSizes = localStorage.getItem('font_sizes');
        const savedFontType = localStorage.getItem('iot_font_preference');
        const savedParameterColors = localStorage.getItem('kima_parameter_colors');

        setCurrentTheme(savedTheme && themes[savedTheme] ? savedTheme : 'light');
        setCustomColors(savedCustomColors ? JSON.parse(savedCustomColors) : null);
        setFontColors(savedFontColors ? JSON.parse(savedFontColors) : null);
        setFontSizes(savedFontSizes ? JSON.parse(savedFontSizes) : null);
        setFontType(savedFontType || 'monospace');
        setParameterColors(savedParameterColors ? JSON.parse(savedParameterColors) : null);

      } catch (error) {
        console.error('Error initializing theme:', error);
        setSyncError('Failed to load theme preferences');
        // Fallback to defaults
        setCurrentTheme('light');
        setCustomColors(null);
        setFontColors(null);
        setFontSizes(null);
        setFontType('monospace');
        setParameterColors(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeTheme();
  }, []);

  // Save theme changes
  const changeTheme = async (themeName) => {
    if (themes[themeName]) {
      setCurrentTheme(themeName);
      localStorage.setItem('aksadata-theme', themeName);
      
      // Save to server if authenticated
      if (userPreferencesService.isAuthenticated()) {
        try {
          await userPreferencesService.saveCurrentToServer();
        } catch (error) {
          console.error('Error saving theme to server:', error);
        }
      }
    }
  };

  // Save custom colors
  const updateCustomColors = async (colors) => {
    setCustomColors(colors);
    localStorage.setItem('kima_custom_colors', JSON.stringify(colors));
    
    // Save to server if authenticated
    if (userPreferencesService.isAuthenticated()) {
      try {
        await userPreferencesService.saveCurrentToServer();
      } catch (error) {
        console.error('Error saving custom colors to server:', error);
      }
    }
  };

  // Save font colors
  const updateFontColors = async (colors) => {
    setFontColors(colors);
    localStorage.setItem('font_colors', JSON.stringify(colors));
    
    // Save to server if authenticated
    if (userPreferencesService.isAuthenticated()) {
      try {
        await userPreferencesService.saveCurrentToServer();
      } catch (error) {
        console.error('Error saving font colors to server:', error);
      }
    }
  };

  // Save font sizes
  const updateFontSizes = async (sizes) => {
    setFontSizes(sizes);
    localStorage.setItem('font_sizes', JSON.stringify(sizes));
    
    // Save to server if authenticated
    if (userPreferencesService.isAuthenticated()) {
      try {
        await userPreferencesService.saveCurrentToServer();
      } catch (error) {
        console.error('Error saving font sizes to server:', error);
      }
    }
  };

  // Save parameter colors
  const updateParameterColors = async (colors) => {
    setParameterColors(colors);
    localStorage.setItem('kima_parameter_colors', JSON.stringify(colors));
    
    // Save to server if authenticated
    if (userPreferencesService.isAuthenticated()) {
      try {
        await userPreferencesService.saveCurrentToServer();
      } catch (error) {
        console.error('Error saving parameter colors to server:', error);
      }
    }
  };

  // Manual sync with server
  const syncWithServer = async () => {
    if (!userPreferencesService.isAuthenticated()) {
      setSyncError('User not authenticated');
      return false;
    }

    try {
      const synced = await userPreferencesService.syncWithServer();
      if (synced) {
        setIsServerSync(true);
        setSyncError(null);
        
        // Reload theme data
        const savedTheme = localStorage.getItem('aksadata-theme');
        const savedCustomColors = localStorage.getItem('kima_custom_colors');
        const savedFontColors = localStorage.getItem('font_colors');
        const savedFontSizes = localStorage.getItem('font_sizes');
        const savedParameterColors = localStorage.getItem('kima_parameter_colors');

        setCurrentTheme(savedTheme && themes[savedTheme] ? savedTheme : 'light');
        setCustomColors(savedCustomColors ? JSON.parse(savedCustomColors) : null);
        setFontColors(savedFontColors ? JSON.parse(savedFontColors) : null);
        setFontSizes(savedFontSizes ? JSON.parse(savedFontSizes) : null);
        setParameterColors(savedParameterColors ? JSON.parse(savedParameterColors) : null);

        return true;
      } else {
        setSyncError('Failed to sync with server');
        return false;
      }
    } catch (error) {
      console.error('Error syncing with server:', error);
      setSyncError('Sync failed: ' + error.message);
      return false;
    }
  };

  // Change font type
  const changeFontType = async (newFontType) => {
    setFontType(newFontType);
    localStorage.setItem('iot_font_preference', newFontType);
    
    // Save to server if authenticated
    if (userPreferencesService.isAuthenticated()) {
      try {
        await userPreferencesService.saveCurrentToServer();
      } catch (error) {
        console.error('Error saving font type to server:', error);
      }
    }
  };

  // Get the current theme object
  const getCurrentTheme = () => {
    if (currentTheme === 'kima' && customColors) {
      return createDynamicTheme(customColors, fontType);
    }
    return createThemeWithFont(themes[currentTheme], fontType);
  };

  const value = {
    // Theme state
    currentTheme,
    customColors,
    fontColors,
    fontSizes,
    fontType,
    parameterColors,
    
    // Theme actions
    changeTheme,
    changeFontType,
    updateCustomColors,
    updateFontColors,
    updateFontSizes,
    updateParameterColors,
    
    // Server sync
    isServerSync,
    syncWithServer,
    syncError,
    isLoading,
    
    // Available themes
    availableThemes: Object.keys(themes),
  };

  return (
    <UserThemeContext.Provider value={value}>
      <ThemeProvider theme={getCurrentTheme()}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </UserThemeContext.Provider>
  );
};



