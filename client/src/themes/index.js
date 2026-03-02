import { createTheme } from '@mui/material/styles';

// Font families mapping
const fontFamilies = {
  monospace: "'Courier New', 'Monaco', 'Consolas', 'Roboto Mono', 'Fira Code', 'Source Code Pro', monospace",
  'sans-serif': "'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif",
  serif: "'Times New Roman', 'Georgia', 'Palatino', serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif",
  condensed: "'Roboto Condensed', 'Arial Narrow', sans-serif",
  rounded: "'Comic Sans MS', 'Varela Round', 'Quicksand', sans-serif"
};

// Helper function to create a theme with custom font
export const createThemeWithFont = (baseTheme, fontType = 'monospace') => {
  return createTheme({
    ...baseTheme,
    typography: {
      ...baseTheme.typography,
      fontFamily: fontFamilies[fontType] || fontFamilies.monospace,
    }
  });
};

// Light Theme (Original)
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
      contrastText: '#fff',
    },
    secondary: {
      main: '#dc004e',
      light: '#ff5983',
      dark: '#9a0036',
      contrastText: '#fff',
    },
    background: {
      default: '#f5f5f5',
      paper: '#fff',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.6)',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14, // User prefers smaller, more compact font sizes
    h1: { fontSize: '2rem', fontWeight: 600 },
    h2: { fontSize: '1.75rem', fontWeight: 600 },
    h3: { fontSize: '1.5rem', fontWeight: 600 },
    h4: { fontSize: '1.25rem', fontWeight: 600 },
    h5: { fontSize: '1.1rem', fontWeight: 600 },
    h6: { fontSize: '1rem', fontWeight: 600 },
    body1: { fontSize: '0.875rem' },
    body2: { fontSize: '0.75rem' },
    caption: { fontSize: '0.7rem' },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontSize: '0.875rem',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: '0.8rem',
          padding: '8px 16px',
        },
      },
    },
  },
});

// Dark Theme
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
      light: '#bbdefb',
      dark: '#42a5f5',
      contrastText: '#000',
    },
    secondary: {
      main: '#f48fb1',
      light: '#ffc1cc',
      dark: '#c2185b',
      contrastText: '#000',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.7)',
    },
    divider: 'rgba(255, 255, 255, 0.12)',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    h1: { fontSize: '2rem', fontWeight: 600, color: '#ffffff' },
    h2: { fontSize: '1.75rem', fontWeight: 600, color: '#ffffff' },
    h3: { fontSize: '1.5rem', fontWeight: 600, color: '#ffffff' },
    h4: { fontSize: '1.25rem', fontWeight: 600, color: '#ffffff' },
    h5: { fontSize: '1.1rem', fontWeight: 600, color: '#ffffff' },
    h6: { fontSize: '1rem', fontWeight: 600, color: '#ffffff' },
    body1: { fontSize: '0.875rem', color: '#ffffff' },
    body2: { fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.7)' },
    caption: { fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.6)' },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontSize: '0.875rem',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: '0.8rem',
          padding: '8px 16px',
          borderColor: 'rgba(255, 255, 255, 0.12)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))',
        },
      },
    },
  },
});

// Green Environmental Theme
export const greenTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2e7d32', // Deep forest green
      light: '#4caf50', // Bright green
      dark: '#1b5e20', // Dark forest green
      contrastText: '#fff',
    },
    secondary: {
      main: '#8bc34a', // Light green
      light: '#c8e6c9', // Very light green
      dark: '#689f38', // Medium green
      contrastText: '#000',
    },
    success: {
      main: '#66bb6a',
      light: '#81c784',
      dark: '#388e3c',
    },
    background: {
      default: '#f1f8e9', // Very light green background
      paper: '#ffffff',
    },
    text: {
      primary: '#1b5e20', // Dark forest green text
      secondary: '#2e7d32', // Medium green text
    },
    divider: '#c8e6c9',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    h1: { fontSize: '2rem', fontWeight: 600, color: '#1b5e20' },
    h2: { fontSize: '1.75rem', fontWeight: 600, color: '#1b5e20' },
    h3: { fontSize: '1.5rem', fontWeight: 600, color: '#2e7d32' },
    h4: { fontSize: '1.25rem', fontWeight: 600, color: '#2e7d32' },
    h5: { fontSize: '1.1rem', fontWeight: 600, color: '#2e7d32' },
    h6: { fontSize: '1rem', fontWeight: 600, color: '#388e3c' },
    body1: { fontSize: '0.875rem', color: '#1b5e20' },
    body2: { fontSize: '0.75rem', color: '#2e7d32' },
    caption: { fontSize: '0.7rem', color: '#388e3c' },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontSize: '0.875rem',
        },
        contained: {
          background: 'linear-gradient(45deg, #2e7d32 30%, #4caf50 90%)',
          '&:hover': {
            background: 'linear-gradient(45deg, #1b5e20 30%, #388e3c 90%)',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: '0.8rem',
          padding: '8px 16px',
          borderColor: '#c8e6c9',
        },
        head: {
          backgroundColor: '#e8f5e8',
          color: '#1b5e20',
          fontWeight: 600,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(rgba(76, 175, 80, 0.02), rgba(76, 175, 80, 0.02))',
          border: '1px solid #e8f5e8',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #4caf50 100%)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #c8e6c9',
          '&:hover': {
            boxShadow: '0 4px 20px rgba(76, 175, 80, 0.15)',
          },
        },
      },
    },
  },
});

// KIMA Professional Theme (Inspired by the images)
export const kimaTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#007BA7', // Purple from the images
      light: '#0099CC',
      dark: '#005577',
      contrastText: '#fff',
    },
    secondary: {
      main: '#F59E0B', // Orange accent from images
      light: '#FBBF24',
      dark: '#D97706',
      contrastText: '#fff',
    },
    success: {
      main: '#10B981', // Green for success states
      light: '#34D399',
      dark: '#059669',
    },
    warning: {
      main: '#F59E0B',
      light: '#FBBF24',
      dark: '#D97706',
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
      default: '#F8FAFC', // Light gray background
      paper: '#FFFFFF',
      sidebar: '#007BA7', // Purple sidebar
    },
    text: {
      primary: '#1F2937',
      secondary: '#6B7280',
      disabled: '#9CA3AF',
    },
    divider: '#E5E7EB',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    h1: { 
      fontSize: '2rem', 
      fontWeight: 700, 
      color: '#1F2937',
      lineHeight: 1.2 
    },
    h2: { 
      fontSize: '1.75rem', 
      fontWeight: 600, 
      color: '#1F2937',
      lineHeight: 1.2 
    },
    h3: { 
      fontSize: '1.5rem', 
      fontWeight: 600, 
      color: '#374151',
      lineHeight: 1.3 
    },
    h4: { 
      fontSize: '1.25rem', 
      fontWeight: 600, 
      color: '#374151',
      lineHeight: 1.3 
    },
    h5: { 
      fontSize: '1.1rem', 
      fontWeight: 600, 
      color: '#4B5563',
      lineHeight: 1.4 
    },
    h6: { 
      fontSize: '1rem', 
      fontWeight: 600, 
      color: '#4B5563',
      lineHeight: 1.4 
    },
    body1: { 
      fontSize: '0.875rem', 
      color: '#374151',
      lineHeight: 1.5 
    },
    body2: { 
      fontSize: '0.8rem', 
      color: '#6B7280',
      lineHeight: 1.5 
    },
    caption: { 
      fontSize: '0.75rem', 
      color: '#9CA3AF',
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
            boxShadow: '0 4px 12px rgba(107, 70, 193, 0.15)',
          },
        },
        contained: {
          background: 'linear-gradient(135deg, #007BA7 0%, #0099CC 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #005577 0%, #006B9A 100%)',
          },
        },
        outlined: {
          borderColor: '#007BA7',
          color: '#007BA7',
          '&:hover': {
            backgroundColor: 'rgba(107, 70, 193, 0.04)',
            borderColor: '#005577',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '4px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
          border: '1px solid #E5E7EB',
          '&:hover': {
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
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
          borderColor: '#E5E7EB',
        },
        head: {
          backgroundColor: '#F9FAFB',
          color: '#374151',
          fontWeight: 600,
          fontSize: '0.8rem',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: '#F9FAFB',
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
          backgroundColor: '#007BA7',
          color: '#fff',
        },
        colorSecondary: {
          backgroundColor: '#F59E0B',
          color: '#fff',
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: '#007BA7',
            '& + .MuiSwitch-track': {
              backgroundColor: '#007BA7',
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
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: '#007BA7',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#007BA7',
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
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
        },
        elevation2: {
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          color: '#1F2937',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#007BA7',
          color: '#FFFFFF',
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
          color: '#FFFFFF',
        },
        secondary: {
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.7)',
        },
      },
    },
    MuiBreadcrumbs: {
      styleOverrides: {
        root: {
          fontSize: '0.8rem',
          color: '#6B7280',
        },
        separator: {
          color: '#9CA3AF',
        },
      },
    },
  },
  shape: {
    borderRadius: 4,
  },
  spacing: 8,
});

export const themes = {
  light: lightTheme,
  dark: darkTheme,
  green: greenTheme,
  kima: kimaTheme,
};

export const themeNames = {
  light: 'Light',
  dark: 'Dark',
  green: 'Green Environment',
  kima: 'KIMA Professional',
};



