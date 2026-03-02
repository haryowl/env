/**
 * Utility functions for color manipulation and contrast detection
 */

/**
 * Convert hex color to RGB
 * @param {string} hex - Hex color string (e.g., "#FF0000" or "FF0000")
 * @returns {object} RGB object with r, g, b properties
 */
export const hexToRgb = (hex) => {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  
  // Handle 3-character hex codes
  if (cleanHex.length === 3) {
    return {
      r: parseInt(cleanHex[0] + cleanHex[0], 16),
      g: parseInt(cleanHex[1] + cleanHex[1], 16),
      b: parseInt(cleanHex[2] + cleanHex[2], 16)
    };
  }
  
  // Handle 6-character hex codes
  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16)
  };
};

/**
 * Calculate relative luminance of a color
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number} Relative luminance (0-1)
 */
export const getLuminance = (r, g, b) => {
  // Convert to relative luminance
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

/**
 * Calculate contrast ratio between two colors
 * @param {string} color1 - First color (hex)
 * @param {string} color2 - Second color (hex)
 * @returns {number} Contrast ratio (1-21)
 */
export const getContrastRatio = (color1, color2) => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  
  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  
  return (brightest + 0.05) / (darkest + 0.05);
};

/**
 * Check if contrast meets WCAG standards
 * @param {string} foreground - Foreground color (hex)
 * @param {string} background - Background color (hex)
 * @param {string} level - WCAG level ('AA' or 'AAA')
 * @returns {object} Contrast analysis result
 */
export const checkContrast = (foreground, background, level = 'AA') => {
  const ratio = getContrastRatio(foreground, background);
  
  const standards = {
    AA: { normal: 4.5, large: 3.0 },
    AAA: { normal: 7.0, large: 4.5 }
  };
  
  const standard = standards[level];
  
  return {
    ratio: Math.round(ratio * 100) / 100,
    passes: {
      normal: ratio >= standard.normal,
      large: ratio >= standard.large
    },
    level: ratio >= standard.normal ? level : 'FAIL',
    recommendation: ratio < standard.normal ? 'Increase contrast' : 'Good contrast'
  };
};

/**
 * Get optimal text color for a background
 * @param {string} backgroundColor - Background color (hex)
 * @param {string} level - WCAG level ('AA' or 'AAA')
 * @returns {string} Optimal text color (hex)
 */
export const getOptimalTextColor = (backgroundColor, level = 'AA') => {
  const white = '#FFFFFF';
  const black = '#000000';
  
  // Get background luminance to determine if it's light or dark
  const bgRgb = hexToRgb(backgroundColor);
  const bgLuminance = getLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
  
  // Simple and effective: use white for dark backgrounds, black for light backgrounds
  // This matches the rest of the dashboard which uses white text
  if (bgLuminance < 0.5) {
    return white; // Dark background -> white text (consistent with dashboard)
  } else {
    return black; // Light background -> black text
  }
};

/**
 * Adjust color brightness
 * @param {string} color - Hex color
 * @param {number} amount - Amount to adjust (-100 to 100)
 * @returns {string} Adjusted hex color
 */
export const adjustBrightness = (color, amount) => {
  const rgb = hexToRgb(color);
  
  const newR = Math.max(0, Math.min(255, rgb.r + amount));
  const newG = Math.max(0, Math.min(255, rgb.g + amount));
  const newB = Math.max(0, Math.min(255, rgb.b + amount));
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
};

/**
 * Get color with optimal contrast for text
 * @param {string} baseColor - Base color to adjust
 * @param {string} backgroundColor - Background color
 * @param {string} level - WCAG level
 * @returns {string} Adjusted color with good contrast
 */
export const getContrastOptimizedColor = (baseColor, backgroundColor, level = 'AA') => {
  const optimalColor = getOptimalTextColor(backgroundColor, level);
  
  // If the optimal color is very different from base color, try to adjust base color
  const contrast = getContrastRatio(baseColor, backgroundColor);
  const optimalContrast = getContrastRatio(optimalColor, backgroundColor);
  
  if (contrast < 3.0) {
    // Try to make base color darker or lighter for better contrast
    const rgb = hexToRgb(baseColor);
    const bgRgb = hexToRgb(backgroundColor);
    const bgLuminance = getLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
    
    let adjustedColor = baseColor;
    
    if (bgLuminance > 0.5) {
      // Light background - make text darker
      adjustedColor = adjustBrightness(baseColor, -50);
    } else {
      // Dark background - make text lighter
      adjustedColor = adjustBrightness(baseColor, 50);
    }
    
    const adjustedContrast = getContrastRatio(adjustedColor, backgroundColor);
    if (adjustedContrast > contrast) {
      return adjustedColor;
    }
  }
  
  return baseColor;
};

/**
 * Validate color combination for accessibility
 * @param {string} foreground - Foreground color
 * @param {string} background - Background color
 * @returns {object} Validation result with recommendations
 */
export const validateColorCombination = (foreground, background) => {
  const contrast = checkContrast(foreground, background);
  const optimalColor = getOptimalTextColor(background);
  
  return {
    contrast,
    optimalColor,
    isAccessible: contrast.passes.normal,
    recommendation: contrast.passes.normal 
      ? 'Good contrast' 
      : `Consider using ${optimalColor} for better readability`,
    severity: contrast.passes.normal ? 'success' : 'warning'
  };
};

/**
 * Get color scheme with guaranteed contrast
 * @param {string} primaryColor - Primary color
 * @param {string} backgroundColor - Background color
 * @returns {object} Color scheme with optimal contrast
 */
export const getAccessibleColorScheme = (primaryColor, backgroundColor) => {
  const primaryContrast = getContrastOptimizedColor(primaryColor, backgroundColor);
  const secondaryContrast = getOptimalTextColor(backgroundColor);
  
  return {
    primary: primaryContrast,
    secondary: secondaryContrast,
    background: backgroundColor,
    contrast: checkContrast(primaryContrast, backgroundColor)
  };
};
