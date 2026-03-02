import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Typography,
  Alert,
  Chip,
  Button,
  Tooltip,
  IconButton,
  Grid,
} from '@mui/material';
import { keyframes } from '@mui/system';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  AutoFixHigh as AutoFixIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;
import { 
  checkContrast, 
  getOptimalTextColor, 
  validateColorCombination,
  getContrastOptimizedColor 
} from '../utils/colorUtils';

const SmartColorPicker = ({ 
  label, 
  value, 
  onChange, 
  backgroundColor = '#FFFFFF',
  showContrastCheck = true,
  autoOptimize = true 
}) => {
  const [validation, setValidation] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Validate color combination whenever value or background changes
  useEffect(() => {
    if (value && backgroundColor && showContrastCheck) {
      const result = validateColorCombination(value, backgroundColor);
      setValidation(result);
    }
  }, [value, backgroundColor, showContrastCheck]);

  const handleColorChange = (newColor) => {
    onChange(newColor);
  };

  const handleAutoOptimize = () => {
    if (!value || !backgroundColor) return;
    
    setIsOptimizing(true);
    
    // Simulate processing time for better UX
    setTimeout(() => {
      const optimizedColor = getContrastOptimizedColor(value, backgroundColor);
      onChange(optimizedColor);
      setIsOptimizing(false);
    }, 500);
  };

  const getContrastIcon = () => {
    if (!validation) return null;
    
    if (validation.isAccessible) {
      return <CheckCircleIcon sx={{ color: 'success.main', fontSize: '1rem' }} />;
    } else {
      return <WarningIcon sx={{ color: 'warning.main', fontSize: '1rem' }} />;
    }
  };

  const getContrastSeverity = () => {
    if (!validation) return 'info';
    
    if (validation.contrast.ratio >= 7.0) return 'success';
    if (validation.contrast.ratio >= 4.5) return 'info';
    if (validation.contrast.ratio >= 3.0) return 'warning';
    return 'error';
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <TextField
          type="color"
          value={value}
          onChange={(e) => handleColorChange(e.target.value)}
          sx={{
            width: '60px',
            height: '40px',
            '& .MuiInputBase-input': {
              padding: '8px',
              cursor: 'pointer',
            },
          }}
        />
        
        <TextField
          size="small"
          label={label}
          value={value}
          onChange={(e) => handleColorChange(e.target.value)}
          placeholder="#000000"
          sx={{ flex: 1 }}
        />

        {autoOptimize && (
          <Tooltip title="Auto-optimize for better contrast">
            <IconButton
              onClick={handleAutoOptimize}
              disabled={isOptimizing || !value || !backgroundColor}
              size="small"
              sx={{
                backgroundColor: 'primary.light',
                color: 'white',
                '&:hover': {
                  backgroundColor: 'primary.main',
                },
                '&:disabled': {
                  backgroundColor: 'grey.300',
                  color: 'grey.500',
                },
              }}
            >
              {isOptimizing ? <RefreshIcon sx={{ animation: `${spin} 1s linear infinite` }} /> : <AutoFixIcon />}
            </IconButton>
          </Tooltip>
        )}

        {showContrastCheck && validation && (
          <Tooltip title={`Contrast ratio: ${validation.contrast.ratio}:1 (${validation.contrast.level})`}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {getContrastIcon()}
              <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                {validation.contrast.ratio}:1
              </Typography>
            </Box>
          </Tooltip>
        )}
      </Box>

      {/* Color Preview */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box
          sx={{
            width: '30px',
            height: '30px',
            backgroundColor: value,
            border: '2px solid #e0e0e0',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: backgroundColor,
              fontWeight: 'bold',
              fontSize: '0.6rem',
            }}
          >
            A
          </Typography>
        </Box>
        
        <Typography variant="caption" color="text.secondary">
          Preview with background: {backgroundColor}
        </Typography>
      </Box>

      {/* Contrast Validation */}
      {showContrastCheck && validation && (
        <Alert 
          severity={getContrastSeverity()} 
          sx={{ mb: 1 }}
          icon={getContrastIcon()}
        >
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Contrast: {validation.contrast.ratio}:1 ({validation.contrast.level})
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {validation.recommendation}
            </Typography>
            {!validation.isAccessible && (
              <Box sx={{ mt: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AutoFixIcon />}
                  onClick={handleAutoOptimize}
                  disabled={isOptimizing}
                  sx={{ fontSize: '0.7rem' }}
                >
                  Auto-fix
                </Button>
              </Box>
            )}
          </Box>
        </Alert>
      )}

      {/* Accessibility Standards */}
      {showContrastCheck && validation && (
        <Grid container spacing={1} sx={{ mt: 1 }}>
          <Grid item xs={6}>
            <Chip
              label={`AA: ${validation.contrast.passes.normal ? 'PASS' : 'FAIL'}`}
              size="small"
              color={validation.contrast.passes.normal ? 'success' : 'error'}
              sx={{ fontSize: '0.6rem', height: '20px' }}
            />
          </Grid>
          <Grid item xs={6}>
            <Chip
              label={`AAA: ${validation.contrast.passes.large ? 'PASS' : 'FAIL'}`}
              size="small"
              color={validation.contrast.passes.large ? 'success' : 'error'}
              sx={{ fontSize: '0.6rem', height: '20px' }}
            />
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default SmartColorPicker;
