import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { themes } from '../themes';
import { createDynamicTheme } from '../themes/dynamicTheme';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeContextProvider');
  }
  return context;
};

export const ThemeContextProvider = ({ children }) => {
  // Get saved theme from localStorage or default to light
  const [currentTheme, setCurrentTheme] = useState(() => {
    const savedTheme = localStorage.getItem('aksadata-theme');
    return savedTheme && themes[savedTheme] ? savedTheme : 'light';
  });

  // Get custom colors from localStorage
  const [customColors, setCustomColors] = useState(() => {
    const savedColors = localStorage.getItem('kima_custom_colors');
    return savedColors ? JSON.parse(savedColors) : null;
  });

  // Save theme to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('aksadata-theme', currentTheme);
  }, [currentTheme]);

  const changeTheme = (themeName) => {
    if (themes[themeName]) {
      setCurrentTheme(themeName);
    }
  };

  const updateCustomColors = (colors) => {
    setCustomColors(colors);
    localStorage.setItem('kima_custom_colors', JSON.stringify(colors));
  };

  // Get the current theme object
  const getCurrentTheme = () => {
    if (currentTheme === 'kima' && customColors) {
      return createDynamicTheme(customColors);
    }
    return themes[currentTheme];
  };

  const value = {
    currentTheme,
    changeTheme,
    availableThemes: Object.keys(themes),
    customColors,
    updateCustomColors,
  };

  return (
    <ThemeContext.Provider value={value}>
      <ThemeProvider theme={getCurrentTheme()}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};



