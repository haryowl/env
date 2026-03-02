import { createTheme } from '@mui/material/styles';

const createAppTheme = (fontType = 'monospace') => {
  const getFontFamily = (type) => {
    switch (type) {
      case 'monospace':
        return "'Roboto Mono', 'Courier New', 'Monaco', 'Consolas', 'Fira Code', 'Source Code Pro', monospace";
      case 'sans-serif':
        return "'Inter', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif";
      case 'serif':
        return "'Times New Roman', 'Georgia', 'Palatino', serif";
      case 'system':
        return "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif";
      case 'condensed':
        return "'Roboto Condensed', 'Arial Narrow', sans-serif";
      case 'rounded':
        return "'Comic Sans MS', 'Varela Round', 'Quicksand', sans-serif";
      default:
        return "'Courier New', 'Monaco', 'Consolas', 'Roboto Mono', 'Fira Code', 'Source Code Pro', monospace";
    }
  };

  return createTheme({
  palette: {
    primary: {
      main: '#2563EB',
      light: '#3B82F6',
      dark: '#1D4ED8',
      contrastText: '#fff',
    },
    secondary: {
      main: '#64748B',
      light: '#94A3B8',
      dark: '#475569',
      contrastText: '#fff',
    },
    background: {
      default: '#F8FAFC',
      paper: '#ffffff',
    },
    text: {
      primary: '#0F172A',
      secondary: '#64748B',
    },
    divider: 'rgba(0, 0, 0, 0.08)',
  },
  typography: {
    fontFamily: getFontFamily(fontType),
    h1: {
      fontSize: '1.8rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h3: {
      fontSize: '1.3rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h4: {
      fontSize: '1.1rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h5: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h6: {
      fontSize: '0.9rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    body1: {
      fontSize: '0.875rem',
      lineHeight: 1.4,
    },
    body2: {
      fontSize: '0.8rem',
      lineHeight: 1.4,
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.4,
    },
    button: {
      fontSize: '0.8rem',
      textTransform: 'none',
      fontWeight: 500,
    },
    subtitle1: {
      fontSize: '0.875rem',
      fontWeight: 500,
    },
    subtitle2: {
      fontSize: '0.8rem',
      fontWeight: 500,
    },
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: '0.8rem',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(224, 224, 224, 1)',
        },
        head: {
          fontSize: '0.8rem',
          fontWeight: 600,
          backgroundColor: '#fafafa',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          padding: '8px 16px',
          borderRadius: '8px',
          textTransform: 'none',
          fontWeight: 500,
          boxShadow: 'none',
          transition: 'all 0.2s ease',
          '&:hover': {
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
          },
        },
        sizeSmall: {
          fontSize: '0.8125rem',
          padding: '6px 12px',
          borderRadius: '6px',
        },
        sizeLarge: {
          fontSize: '0.9375rem',
          padding: '10px 20px',
          borderRadius: '8px',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-root': {
            fontSize: '0.875rem',
          },
          '& .MuiInputBase-input': {
            padding: '8px 12px',
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.8rem',
        },
        shrink: {
          fontSize: '0.75rem',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontSize: '0.75rem',
          height: '28px',
          borderRadius: '8px',
        },
        label: {
          padding: '0 8px',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.06)',
          transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
            borderColor: 'rgba(0,0,0,0.08)',
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
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1.1rem',
          padding: '16px 20px 8px 20px',
          fontWeight: 600,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '8px 20px 16px 20px',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          padding: '6px 16px',
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: {
          fontSize: '0.875rem',
        },
        secondary: {
          fontSize: '0.75rem',
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: '56px',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          backdropFilter: 'blur(8px)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          fontSize: '0.875rem',
          borderRight: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
        },
      },
    },
    MuiSvgIcon: {
      styleOverrides: {
        root: {
          fontSize: '1.1rem',
        },
        fontSizeSmall: {
          fontSize: '0.9rem',
        },
        fontSizeLarge: {
          fontSize: '1.3rem',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          borderRadius: '4px',
        },
        message: {
          fontSize: '0.875rem',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontSize: '0.8rem',
          minHeight: '40px',
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontSize: '0.7rem',
          height: '18px',
          minWidth: '18px',
          borderRadius: '4px',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          padding: '8px 16px',
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
        },
      },
    },
    MuiFormControl: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          '&:before': {
            display: 'none',
          },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          fontWeight: 500,
        },
      },
    },
    MuiAccordionDetails: {
      styleOverrides: {
        root: {
          fontSize: '0.8rem',
          padding: '8px 16px 16px 16px',
        },
      },
    },
  },
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
  transitions: {
    duration: { shortest: 150, shorter: 200, short: 250, standard: 300 },
  },
  });
};

export default createAppTheme; 