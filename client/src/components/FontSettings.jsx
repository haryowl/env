import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Button,
  Alert,
  Divider,
  Chip,
} from '@mui/material';
import {
  FormatSize as FormatSizeIcon,
  Preview as PreviewIcon,
} from '@mui/icons-material';
import { useUserTheme } from '../contexts/UserThemeContext';

const FontSettings = ({ onFontChange }) => {
  const { fontType, changeFontType } = useUserTheme();
  const [selectedFont, setSelectedFont] = useState(fontType);
  const [previewText, setPreviewText] = useState('Sample Text');

  const fontOptions = [
    {
      value: 'monospace',
      label: 'Monospace (Engineering)',
      description: 'Courier New, Monaco, Consolas - Technical, code-like appearance',
      preview: "'Courier New', 'Monaco', 'Consolas', 'Roboto Mono', 'Fira Code', 'Source Code Pro', monospace"
    },
    {
      value: 'sans-serif',
      label: 'Sans Serif (Modern)',
      description: 'Segoe UI, Roboto - Clean, modern interface',
      preview: "'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif"
    },
    {
      value: 'serif',
      label: 'Serif (Traditional)',
      description: 'Times New Roman, Georgia - Classic, readable text',
      preview: "'Times New Roman', 'Georgia', 'Palatino', serif"
    },
    {
      value: 'system',
      label: 'System Default',
      description: 'Uses your operating system default font',
      preview: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif"
    },
    {
      value: 'condensed',
      label: 'Condensed (Compact)',
      description: 'Roboto Condensed - Space-efficient, modern',
      preview: "'Roboto Condensed', 'Arial Narrow', sans-serif"
    },
    {
      value: 'rounded',
      label: 'Rounded (Friendly)',
      description: 'Comic Sans MS, Varela Round - Friendly, approachable',
      preview: "'Comic Sans MS', 'Varela Round', 'Quicksand', sans-serif"
    }
  ];

  useEffect(() => {
    // Update selected font when fontType changes
    setSelectedFont(fontType);
  }, [fontType]);

  const handleFontChange = (event) => {
    const newFont = event.target.value;
    setSelectedFont(newFont);
    
    // Use UserThemeContext to change font
    changeFontType(newFont);
    
    // Notify parent component (for compatibility)
    if (onFontChange) {
      onFontChange(newFont);
    }
  };

  const getFontPreviewStyle = (fontValue) => {
    const fontOption = fontOptions.find(option => option.value === fontValue);
    return {
      fontFamily: fontOption ? fontOption.preview : 'monospace',
      fontSize: '1rem',
      lineHeight: 1.4,
      padding: '8px',
      border: '1px solid #e0e0e0',
      borderRadius: '4px',
      backgroundColor: '#fafafa',
      minHeight: '60px',
      display: 'flex',
      alignItems: 'center',
    };
  };

  const applyFontToDocument = (fontValue) => {
    const fontOption = fontOptions.find(option => option.value === fontValue);
    if (fontOption) {
      document.body.style.fontFamily = fontOption.preview;
      
      // Also update CSS custom property for components that use it
      document.documentElement.style.setProperty('--app-font-family', fontOption.preview);
    }
  };

  const handleApplyFont = () => {
    // Font is already applied through UserThemeContext
    // This function is kept for UI consistency
  };

  const handlePreviewFont = () => {
    applyFontToDocument(selectedFont);
    // Revert after 3 seconds
    setTimeout(() => {
      applyFontToDocument(fontType);
    }, 3000);
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <FormatSizeIcon sx={{ mr: 1 }} />
        <Typography variant="h5">Font Settings</Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Choose your preferred font type for the application interface. Changes will be applied immediately.
      </Alert>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Font Selection
              </Typography>
              
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Font Type</InputLabel>
                <Select
                  value={selectedFont}
                  label="Font Type"
                  onChange={handleFontChange}
                >
                  {fontOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Box>
                        <Typography variant="body1" fontWeight="medium">
                          {option.label}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {option.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box display="flex" gap={2}>
                <Button
                  variant="outlined"
                  startIcon={<PreviewIcon />}
                  onClick={handlePreviewFont}
                >
                  Preview (3s)
                </Button>
                <Button
                  variant="contained"
                  onClick={handleApplyFont}
                >
                  Apply Font
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Font Preview
              </Typography>
              
              <Box sx={getFontPreviewStyle(selectedFont)}>
                <Typography variant="body1">
                  {previewText}
                </Typography>
              </Box>
              
              <Box mt={2}>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  Sample text with the selected font:
                </Typography>
                <Box sx={getFontPreviewStyle(selectedFont)}>
                  <Typography variant="body2">
                    The quick brown fox jumps over the lazy dog. 0123456789
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />
              
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Current Font Family:
              </Typography>
              <Chip
                label={fontOptions.find(opt => opt.value === selectedFont)?.preview || 'monospace'}
                variant="outlined"
                size="small"
                sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Font Information
          </Typography>
          
          <Grid container spacing={2}>
            {fontOptions.map((option) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={option.value}>
                <Box
                  sx={{
                    p: 2,
                    border: selectedFont === option.value ? '2px solid #1976d2' : '1px solid #e0e0e0',
                    borderRadius: 1,
                    backgroundColor: selectedFont === option.value ? '#f3f8ff' : 'transparent',
                  }}
                >
                  <Typography variant="subtitle2" fontWeight="medium" gutterBottom>
                    {option.label}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" display="block" gutterBottom>
                    {option.description}
                  </Typography>
                  <Box
                    sx={{
                      ...getFontPreviewStyle(option.value),
                      fontSize: '0.8rem',
                      minHeight: '40px',
                      mt: 1,
                    }}
                  >
                    <Typography variant="caption">
                      ABC abc 123
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
};

export default FontSettings; 