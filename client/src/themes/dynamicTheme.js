import { createTheme } from '@mui/material/styles';

// Default colors
const defaultColors = {
  sidebar: '#007BA7',
  accent: '#F59E0B',
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: '#1F2937',
  isDarkMode: false,
};

// Font families mapping
const fontFamilies = {
  monospace: "'Courier New', 'Monaco', 'Consolas', 'Roboto Mono', 'Fira Code', 'Source Code Pro', monospace",
  'sans-serif': "'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif",
  serif: "'Times New Roman', 'Georgia', 'Palatino', serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif",
  condensed: "'Roboto Condensed', 'Arial Narrow', sans-serif",
  rounded: "'Comic Sans MS', 'Varela Round', 'Quicksand', sans-serif"
};

// Create dynamic theme based on custom colors
export const createDynamicTheme = (customColors = defaultColors, fontType = 'monospace') => {
  const colors = { ...defaultColors, ...customColors };
  
  // Calculate text colors based on background
  const getContrastText = (backgroundColor) => {
    // Simple contrast calculation - in production, use a proper contrast library
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#FFFFFF';
  };

  const sidebarTextColor = getContrastText(colors.sidebar);
  const cardTextColor = getContrastText(colors.card);
  const backgroundTextColor = getContrastText(colors.background);

  return createTheme({
    palette: {
      mode: colors.isDarkMode ? 'dark' : 'light',
      primary: {
        main: colors.sidebar,
        light: colors.sidebar + '80', // Add transparency
        dark: colors.sidebar + 'CC',
        contrastText: sidebarTextColor,
      },
      secondary: {
        main: colors.accent,
        light: colors.accent + '80',
        dark: colors.accent + 'CC',
        contrastText: getContrastText(colors.accent),
      },
      success: {
        main: '#10B981',
        light: '#34D399',
        dark: '#059669',
      },
      warning: {
        main: colors.accent,
        light: colors.accent + '80',
        dark: colors.accent + 'CC',
      },
      error: {
        main: '#EF4444',
        light: '#F87171',
        dark: '#DC2626',
      },
      info: {
        main: '#3B82F6',
        light: '#60A5FA',
        dark: '#2563EB',
      },
      background: {
        default: colors.background,
        paper: colors.card,
        sidebar: colors.sidebar,
      },
      text: {
        primary: colors.text,
        secondary: colors.text + '80',
        disabled: colors.text + '40',
      },
      divider: colors.isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
    },
    typography: {
      fontFamily: fontFamilies[fontType] || fontFamilies.monospace,
      fontSize: 14,
      h1: { 
        fontSize: '2rem', 
        fontWeight: 700, 
        color: colors.text,
        lineHeight: 1.2 
      },
      h2: { 
        fontSize: '1.75rem', 
        fontWeight: 600, 
        color: colors.text,
        lineHeight: 1.2 
      },
      h3: { 
        fontSize: '1.5rem', 
        fontWeight: 600, 
        color: colors.text,
        lineHeight: 1.3 
      },
      h4: { 
        fontSize: '1.25rem', 
        fontWeight: 600, 
        color: colors.text,
        lineHeight: 1.3 
      },
      h5: { 
        fontSize: '1.1rem', 
        fontWeight: 600, 
        color: colors.text,
        lineHeight: 1.4 
      },
      h6: { 
        fontSize: '1rem', 
        fontWeight: 600, 
        color: colors.text,
        lineHeight: 1.4 
      },
      body1: { 
        fontSize: '0.875rem', 
        color: colors.text,
        lineHeight: 1.5 
      },
      body2: { 
        fontSize: '0.8rem', 
        color: colors.text + '80',
        lineHeight: 1.5 
      },
      caption: { 
        fontSize: '0.75rem', 
        color: colors.text + '60',
        lineHeight: 1.4 
      },
      button: {
        fontSize: '0.875rem',
        fontWeight: 500,
        textTransform: 'none',
      },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            borderRadius: '4px',
            padding: '8px 16px',
            boxShadow: 'none',
            '&:hover': {
              boxShadow: `0 4px 12px ${colors.sidebar}25`,
            },
          },
          contained: {
            background: `linear-gradient(135deg, ${colors.sidebar} 0%, ${colors.sidebar}CC 100%)`,
            '&:hover': {
              background: `linear-gradient(135deg, ${colors.sidebar}CC 0%, ${colors.sidebar} 100%)`,
            },
          },
          outlined: {
            borderColor: colors.sidebar,
            color: colors.sidebar,
            '&:hover': {
              backgroundColor: colors.sidebar + '10',
              borderColor: colors.sidebar,
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: '4px',
            boxShadow: colors.isDarkMode 
              ? '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)'
              : '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
            border: `1px solid ${colors.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
            backgroundColor: colors.card,
            '&:hover': {
              boxShadow: colors.isDarkMode
                ? '0 4px 6px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)'
                : '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
            },
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            padding: '20px',
            '&:last-child': {
              paddingBottom: '20px',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            fontSize: '0.8rem',
            padding: '12px 16px',
            borderColor: colors.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            color: colors.text,
          },
          head: {
            backgroundColor: colors.isDarkMode ? colors.sidebar + '20' : colors.background,
            color: colors.text,
            fontWeight: 600,
            fontSize: '0.8rem',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: colors.isDarkMode ? colors.sidebar + '10' : colors.background,
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontSize: '0.75rem',
            height: '28px',
            borderRadius: '4px',
            fontWeight: 500,
          },
          colorPrimary: {
            backgroundColor: colors.sidebar,
            color: sidebarTextColor,
          },
          colorSecondary: {
            backgroundColor: colors.accent,
            color: getContrastText(colors.accent),
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            '&.Mui-checked': {
              color: colors.sidebar,
              '& + .MuiSwitch-track': {
                backgroundColor: colors.sidebar,
              },
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: '4px',
              backgroundColor: colors.card,
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: colors.sidebar,
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: colors.sidebar,
                borderWidth: '2px',
              },
            },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            borderRadius: '4px',
            backgroundColor: colors.card,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: colors.card,
          },
          elevation1: {
            boxShadow: colors.isDarkMode
              ? '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)'
              : '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
          },
          elevation2: {
            boxShadow: colors.isDarkMode
              ? '0 4px 6px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)'
              : '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: colors.card,
            color: colors.text,
            boxShadow: colors.isDarkMode
              ? '0 1px 3px rgba(0, 0, 0, 0.3)'
              : '0 1px 3px rgba(0, 0, 0, 0.1)',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: colors.sidebar,
            color: sidebarTextColor,
            borderRight: 'none',
          },
        },
      },
      MuiListItem: {
        styleOverrides: {
          root: {
            borderRadius: '4px',
            margin: '4px 8px',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
            },
            '&.Mui-selected': {
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
              },
            },
          },
        },
      },
      MuiListItemText: {
        styleOverrides: {
          primary: {
            fontSize: '0.875rem',
            fontWeight: 500,
            color: sidebarTextColor,
          },
          secondary: {
            fontSize: '0.75rem',
            color: sidebarTextColor + '80',
          },
        },
      },
      MuiBreadcrumbs: {
        styleOverrides: {
          root: {
            fontSize: '0.8rem',
            color: colors.text + '80',
          },
          separator: {
            color: colors.text + '60',
          },
        },
      },
    },
    shape: {
      borderRadius: 4,
    },
    spacing: 8,
  });
};

export default createDynamicTheme;





