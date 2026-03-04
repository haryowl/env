import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Paper,
  Fade,
  Backdrop,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  PhotoCamera,
  Refresh,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { useUserTheme } from '../contexts/UserThemeContext';

// Login background: use local image from public folder first (place login-background.jpg in client/public/)
const LOCAL_LOGIN_BACKGROUND = '/login-background.jpg';
const DEFAULT_BACKGROUNDS = [
  LOCAL_LOGIN_BACKGROUND,
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?ixlib=rb-4.0.3&auto=format&fit=crop&w=2071&q=80',
  'https://images.unsplash.com/photo-1473773508845-188df298d2d1?ixlib=rb-4.0.3&auto=format&fit=crop&w=2074&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  'https://images.unsplash.com/photo-1518837695005-2083093ee35b?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?ixlib=rb-4.0.3&auto=format&fit=crop&w=2074&q=80',
];

const LoginContainer = styled(Box)(({ theme, backgroundImage }) => ({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  padding: theme.spacing(2),
  backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'linear-gradient(145deg, #0F172A 0%, #1E293B 40%, #334155 100%)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: backgroundImage 
      ? (theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(15, 23, 42, 0.4)')
      : 'transparent',
    backdropFilter: backgroundImage ? 'blur(2px)' : 'none',
  },
}));

const LoginCard = styled(Card)(({ theme }) => ({
  width: '100%',
  maxWidth: 420,
  position: 'relative',
  zIndex: 1,
  backgroundColor: theme.palette.mode === 'dark' 
    ? 'rgba(30, 41, 59, 0.98)' 
    : 'rgba(255, 255, 255, 0.98)',
  backdropFilter: 'blur(20px)',
  borderRadius: 4,
  boxShadow: theme.palette.mode === 'dark'
    ? '0 24px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.06)'
    : '0 24px 48px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)',
  border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
}));

const BackgroundControls = styled(Paper)(({ theme }) => ({
  position: 'absolute',
  top: theme.spacing(2),
  right: theme.spacing(2),
  padding: theme.spacing(1),
  backgroundColor: theme.palette.mode === 'dark' 
    ? 'rgba(30, 30, 30, 0.9)' 
    : 'rgba(255, 255, 255, 0.9)',
  backdropFilter: 'blur(10px)',
  borderRadius: theme.spacing(1),
  display: 'flex',
  gap: theme.spacing(0.5),
  zIndex: 2,
}));

const BrandContainer = styled(Box)(({ theme }) => ({
  textAlign: 'center',
  marginBottom: theme.spacing(3),
  '& .brand-icon': {
    fontSize: '2.5rem',
    marginBottom: theme.spacing(1),
    background: theme.palette.mode === 'dark' 
      ? 'linear-gradient(135deg, #38BDF8 0%, #818CF8 100%)' 
      : 'linear-gradient(135deg, #2563EB 0%, #0EA5E9 100%)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
}));

const Login = ({ onLogin }) => {
  const { currentTheme } = useUserTheme();
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState(() => {
    const saved = localStorage.getItem('login-background');
    // Prefer local image: ignore old Unsplash URLs so server image is used after deploy
    if (!saved || saved.trim() === '') return LOCAL_LOGIN_BACKGROUND;
    if (saved.includes('unsplash.com')) return LOCAL_LOGIN_BACKGROUND;
    return saved;
  });
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);

  useEffect(() => {
    localStorage.setItem('login-background', backgroundImage);
  }, [backgroundImage]);

  const handleChange = (field) => (event) => {
    setCredentials(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
    setError(''); // Clear error when user types
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await onLogin(credentials);
      if (!result.success) {
        setError(result.error);
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRandomBackground = () => {
    const randomIndex = Math.floor(Math.random() * DEFAULT_BACKGROUNDS.length);
    setBackgroundImage(DEFAULT_BACKGROUNDS[randomIndex]);
  };

  const handleCustomImageSubmit = () => {
    if (customImageUrl.trim()) {
      setBackgroundImage(customImageUrl.trim());
      setCustomImageUrl('');
      setShowImageInput(false);
    }
  };

  const handleImageError = () => {
    // Fallback to default if custom image fails to load
    setBackgroundImage(DEFAULT_BACKGROUNDS[0]);
  };

  return (
    <LoginContainer backgroundImage={backgroundImage}>
      {/* Background Controls */}
      <BackgroundControls elevation={3}>
        <Tooltip title="Random Environment Image">
          <IconButton size="small" onClick={handleRandomBackground}>
            <Refresh />
          </IconButton>
        </Tooltip>
        <Tooltip title="Custom Image URL">
          <IconButton size="small" onClick={() => setShowImageInput(!showImageInput)}>
            <PhotoCamera />
          </IconButton>
        </Tooltip>
      </BackgroundControls>

      {/* Custom Image URL Input */}
      {showImageInput && (
        <Fade in={showImageInput}>
          <Paper
            sx={{
              position: 'absolute',
              top: 70,
              right: 16,
              p: 2,
              zIndex: 3,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              borderRadius: 1,
              minWidth: 300,
            }}
          >
            <Typography variant="body2" gutterBottom>
              Enter Image URL:
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="/login-background.jpg or https://..."
              value={customImageUrl}
              onChange={(e) => setCustomImageUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCustomImageSubmit()}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => setShowImageInput(false)}>
                Cancel
              </Button>
              <Button 
                size="small" 
                variant="contained" 
                onClick={handleCustomImageSubmit}
                disabled={!customImageUrl.trim()}
              >
                Apply
              </Button>
            </Box>
          </Paper>
        </Fade>
      )}

      <LoginCard>
        <CardContent sx={{ p: 5 }}>
          <BrandContainer>
            <Typography variant="h2" component="div" className="brand-icon">
              🌱
            </Typography>
            <Typography variant="h4" component="h1" gutterBottom sx={{ 
              fontWeight: 600,
              background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)',
              backgroundClip: 'text',
              textFillColor: 'transparent',
              mb: 1
            }}>
              AksaData Monitor
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Environmental Monitoring & IoT Analytics
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Professional monitoring solutions for a sustainable future
            </Typography>
          </BrandContainer>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 1 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Username"
              variant="outlined"
              margin="normal"
              value={credentials.username}
              onChange={handleChange('username')}
              required
              disabled={loading}
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1,
                },
              }}
            />

            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              margin="normal"
              value={credentials.password}
              onChange={handleChange('password')}
              required
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    disabled={loading}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                ),
              }}
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1,
                },
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                mt: 2,
                mb: 2,
                py: 1.5,
                borderRadius: 3,
                fontSize: '1.1rem',
                fontWeight: 600,
                background: currentTheme === 'green' 
                  ? 'linear-gradient(135deg, #2e7d32 0%, #4caf50 100%)'
                  : undefined,
                '&:hover': {
                  background: currentTheme === 'green'
                    ? 'linear-gradient(135deg, #1b5e20 0%, #388e3c 100%)'
                    : undefined,
                },
              }}
            >
              {loading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={20} color="inherit" />
                  <Typography>Authenticating...</Typography>
                </Box>
              ) : (
                'Sign In to AksaData'
              )}
            </Button>

            <Typography 
              variant="caption" 
              color="text.secondary" 
              sx={{ 
                display: 'block', 
                textAlign: 'center', 
                mt: 2,
                opacity: 0.8 
              }}
            >
              Secure access to environmental monitoring systems
            </Typography>
          </Box>
        </CardContent>
      </LoginCard>
      
      {/* Hidden image for preloading/error handling */}
      <img 
        src={backgroundImage} 
        alt="" 
        style={{ display: 'none' }} 
        onError={handleImageError}
      />
    </LoginContainer>
  );
};

export default Login; 