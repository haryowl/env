import React, { useState, useEffect } from 'react';
import {
  Box,
  Alert,
  Typography,
  Button,
  Chip,
  Grid,
  Tooltip,
  IconButton,
} from '@mui/material';
import { keyframes } from '@mui/system';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
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

const ContrastValidator = ({ 
  foregroundColor, 
  backgroundColor, 
  onColorFix,
  showDetails = true,
  compact = false 
}) => {
  const [validation, setValidation] = useState(null);
  const [isFixing, setIsFixing] = useState(false);

  useEffect(() => {
    if (foregroundColor && backgroundColor) {
      const result = validateColorCombination(foregroundColor, backgroundColor);
      setValidation(result);
    }
  }, [foregroundColor, backgroundColor]);

  const handleAutoFix = () => {
    if (!foregroundColor || !backgroundColor || !onColorFix) return;
    
    setIsFixing(true);
    
    setTimeout(() => {
      const optimizedColor = getContrastOptimizedColor(foregroundColor, backgroundColor);
      onColorFix(optimizedColor);
      setIsFixing(false);
    }, 500);
  };

  if (!validation || compact) {
    return (
      <Tooltip title={`Contrast: ${validation?.contrast?.ratio || 0}:1 (${validation?.contrast?.level || 'N/A'})`}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {validation?.isAccessible ? (
            <CheckCircleIcon sx={{ color: 'success.main', fontSize: '1rem' }} />
          ) : (
            <WarningIcon sx={{ color: 'warning.main', fontSize: '1rem' }} />
          )}
          <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
            {validation?.contrast?.ratio || 0}:1
          </Typography>
        </Box>
      </Tooltip>
    );
  }

  const getSeverity = () => {
    if (!validation) return 'info';
    
    if (validation.contrast.ratio >= 7.0) return 'success';
    if (validation.contrast.ratio >= 4.5) return 'info';
    if (validation.contrast.ratio >= 3.0) return 'warning';
    return 'error';
  };

  const getIcon = () => {
    if (!validation) return <CheckCircleIcon />;
    
    if (validation.contrast.ratio >= 7.0) return <CheckCircleIcon />;
    if (validation.contrast.ratio >= 4.5) return <CheckCircleIcon />;
    if (validation.contrast.ratio >= 3.0) return <WarningIcon />;
    return <ErrorIcon />;
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Alert 
        severity={getSeverity()} 
        icon={getIcon()}
        action={
          !validation.isAccessible && onColorFix ? (
            <Tooltip title="Auto-fix contrast">
              <IconButton
                color="inherit"
                size="small"
                onClick={handleAutoFix}
                disabled={isFixing}
              >
                {isFixing ? (
                  <RefreshIcon sx={{ animation: `${spin} 1s linear infinite` }} />
                ) : (
                  <AutoFixIcon />
                )}
              </IconButton>
            </Tooltip>
          ) : null
        }
      >
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Contrast Ratio: {validation.contrast.ratio}:1
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {validation.recommendation}
          </Typography>
          
          {showDetails && (
            <Grid container spacing={1}>
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
          
          {!validation.isAccessible && onColorFix && (
            <Box sx={{ mt: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AutoFixIcon />}
                onClick={handleAutoFix}
                disabled={isFixing}
                sx={{ fontSize: '0.7rem' }}
              >
                {isFixing ? 'Fixing...' : 'Auto-fix Contrast'}
              </Button>
            </Box>
          )}
        </Box>
      </Alert>
    </Box>
  );
};

export default ContrastValidator;
