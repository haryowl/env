import { createTheme } from '@mui/material/styles';

const createAppTheme = (fontType = 'monospace') => {
  const getFontFamily = (type) => {
    switch (type) {
      case 'monospace':
        return "'Courier New', 'Monaco', 'Consolas', 'Roboto Mono', 'Fira Code', 'Source Code Pro', monospace";
      case 'sans-serif':
        return "'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif";
      case 'serif':
        return "'Times New Roman', 'Georgia', 'Palatino', serif";
      case 'system':
        return "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif";
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
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
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
          fontSize: '0.8rem',
          padding: '6px 12px',
          borderRadius: '4px',
        },
        sizeSmall: {
          fontSize: '0.75rem',
          padding: '4px 8px',
        },
        sizeLarge: {
          fontSize: '0.875rem',
          padding: '8px 16px',
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
          height: '24px',
          borderRadius: '4px',
        },
        label: {
          padding: '0 8px',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: '12px',
          '&:last-child': {
            paddingBottom: '12px',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: '4px',
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
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          fontSize: '0.875rem',
          borderRight: '1px solid rgba(224, 224, 224, 1)',
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
          borderRadius: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
          borderRadius: '4px',
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
    borderRadius: 4,
  },
  spacing: 8,
  });
};

export default createAppTheme; 