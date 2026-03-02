import React, { createContext, useContext, useState, useEffect } from 'react';

const FontContext = createContext();

export const useFont = () => {
  const context = useContext(FontContext);
  if (!context) {
    throw new Error('useFont must be used within a FontProvider');
  }
  return context;
};

export const FontProvider = ({ children }) => {
  const [fontColors, setFontColors] = useState({
    primary: '#1F2937',
    secondary: '#6B7280',
    accent: '#3B82F6',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#06B6D4',
  });

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

  // Load font settings from localStorage on mount
  useEffect(() => {
    const savedFontColors = localStorage.getItem('font_colors');
    const savedFontSizes = localStorage.getItem('font_sizes');
    
    if (savedFontColors) {
      try {
        setFontColors(JSON.parse(savedFontColors));
      } catch (error) {
        console.error('Error parsing saved font colors:', error);
      }
    }
    
    if (savedFontSizes) {
      try {
        setFontSizes(JSON.parse(savedFontSizes));
      } catch (error) {
        console.error('Error parsing saved font sizes:', error);
      }
    }
  }, []);

  // Listen for font color changes from the customizer
  useEffect(() => {
    const handleFontColorsChanged = (event) => {
      setFontColors(event.detail.fontColors);
      setFontSizes(event.detail.fontSizes);
    };

    window.addEventListener('fontColorsChanged', handleFontColorsChanged);
    
    return () => {
      window.removeEventListener('fontColorsChanged', handleFontColorsChanged);
    };
  }, []);

  const updateFontColors = (newFontColors) => {
    setFontColors(newFontColors);
    localStorage.setItem('font_colors', JSON.stringify(newFontColors));
  };

  const updateFontSizes = (newFontSizes) => {
    setFontSizes(newFontSizes);
    localStorage.setItem('font_sizes', JSON.stringify(newFontSizes));
  };

  const getFontColor = (colorType) => {
    return fontColors[colorType] || fontColors.primary;
  };

  const getFontSize = (sizeType) => {
    return fontSizes[sizeType] || fontSizes.body1;
  };

  const value = {
    fontColors,
    fontSizes,
    updateFontColors,
    updateFontSizes,
    getFontColor,
    getFontSize,
  };

  return (
    <FontContext.Provider value={value}>
      {children}
    </FontContext.Provider>
  );
};



