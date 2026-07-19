import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  Link,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  Chip,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  PersonOutline,
  LockOutlined,
  ArrowForward,
} from '@mui/icons-material';

const BRAND_BLUE = '#0a84c7';
const BRAND_BLUE_DARK = '#0868a0';

/** Decorative line/area chart for the left hero panel (pure SVG, no chart lib). */
function HeroChart() {
  const line = 'M0,86 C30,80 55,74 85,70 C118,65 138,72 168,62 C200,52 222,58 252,48 C285,38 310,42 340,30 C368,20 388,24 410,16';
  const area = `${line} L410,120 L0,120 Z`;
  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 3,
        p: 2,
        pt: 1.5,
        bgcolor: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.18)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
        <Chip
          size="small"
          icon={<Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#4ADE80', ml: 0.5 }} />}
          label="Live"
          sx={{
            height: 20,
            fontSize: '0.62rem',
            fontWeight: 700,
            color: '#BBF7D0',
            bgcolor: 'rgba(16,185,129,0.22)',
            '& .MuiChip-label': { px: 0.6 },
          }}
        />
      </Box>
      <Box component="svg" viewBox="0 0 410 120" sx={{ width: '100%', height: { xs: 110, md: 130 }, display: 'block' }}>
        <defs>
          <linearGradient id="login-hero-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#login-hero-fill)" />
        <path d={line} fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="410" cy="16" r="5" fill="#ffffff" />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.65)' }}>7am</Typography>
        <Typography sx={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.65)' }}>Now</Typography>
      </Box>
    </Box>
  );
}

const Login = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  const handleChange = (field) => (event) => {
    setCredentials((prev) => ({ ...prev, [field]: event.target.value }));
    setError('');
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
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      bgcolor: '#fff',
      fontSize: '0.875rem',
      '& fieldset': { borderColor: 'rgba(15,23,42,0.12)' },
      '&:hover fieldset': { borderColor: BRAND_BLUE },
      '&.Mui-focused fieldset': { borderColor: BRAND_BLUE },
    },
    '& .MuiInputBase-input': { py: 1.1 },
  };

  const fieldLabel = (text) => (
    <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', mb: 0.5 }}>
      {text}
    </Typography>
  );

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#EEF2F6' }}>
      {/* ---- Left hero panel ---- */}
      <Box
        sx={{
          flex: '0 0 52%',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          px: { md: 5, lg: 8 },
          py: 5,
          color: '#fff',
          background: `linear-gradient(160deg, ${BRAND_BLUE} 0%, ${BRAND_BLUE_DARK} 100%)`,
          overflow: 'hidden',
        }}
      >
        <Typography
          sx={{
            position: 'absolute',
            top: 28,
            left: { md: 40, lg: 64 },
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.92)',
          }}
        >
          Aksadata Monitoring Solution
        </Typography>

        <Box sx={{ maxWidth: 560, width: '100%', mx: 'auto' }}>
          <Typography sx={{ fontSize: { md: '1.9rem', lg: '2.2rem' }, fontWeight: 800, lineHeight: 1.2, mb: 1 }}>
            Environment Quality Monitoring
          </Typography>
          <Typography sx={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', mb: 4 }}>
            Real-time environment data across all your monitoring sites
          </Typography>
          <HeroChart />
        </Box>
      </Box>

      {/* ---- Right form panel ---- */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
          py: 4,
        }}
      >
        <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%', maxWidth: 360 }}>
          {/* Mobile-only brand */}
          <Typography
            sx={{
              display: { xs: 'block', md: 'none' },
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: BRAND_BLUE,
              mb: 2,
              textAlign: 'center',
            }}
          >
            Aksadata Monitoring Solution
          </Typography>

          <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
            Welcome back
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#94A3B8', mb: 2.5 }}>
            Sign in to your monitoring account
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2, fontSize: '0.78rem' }}>
              {error}
            </Alert>
          )}

          {fieldLabel('Username')}
          <TextField
            fullWidth
            placeholder="your.username"
            value={credentials.username}
            onChange={handleChange('username')}
            required
            disabled={loading}
            autoComplete="username"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PersonOutline sx={{ fontSize: 18, color: '#94A3B8' }} />
                </InputAdornment>
              ),
            }}
            sx={{ ...fieldSx, mb: 2 }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            {fieldLabel('Password')}
            <Link
              component={RouterLink}
              to="/forgot-password"
              underline="hover"
              sx={{ fontSize: '0.7rem', fontWeight: 600, color: BRAND_BLUE }}
            >
              Forgot password?
            </Link>
          </Box>
          <TextField
            fullWidth
            placeholder="••••••••"
            type={showPassword ? 'text' : 'password'}
            value={credentials.password}
            onChange={handleChange('password')}
            required
            disabled={loading}
            autoComplete="current-password"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlined sx={{ fontSize: 18, color: '#94A3B8' }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    disabled={loading}
                    size="small"
                  >
                    {showPassword ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ ...fieldSx, mb: 1 }}
          />

          <FormControlLabel
            control={(
              <Checkbox
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
                size="small"
                sx={{ py: 0.5, color: BRAND_BLUE, '&.Mui-checked': { color: BRAND_BLUE } }}
              />
            )}
            label={(
              <Typography sx={{ fontSize: '0.72rem', color: '#64748B' }}>
                Keep me signed in for 30 days
              </Typography>
            )}
            sx={{ mb: 1.5, ml: -1 }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading}
            endIcon={!loading ? <ArrowForward sx={{ fontSize: 16 }} /> : null}
            sx={{
              py: 1.1,
              borderRadius: 5,
              fontSize: '0.85rem',
              fontWeight: 700,
              textTransform: 'none',
              bgcolor: BRAND_BLUE,
              boxShadow: '0 6px 16px rgba(10,132,199,0.35)',
              '&:hover': { bgcolor: BRAND_BLUE_DARK },
            }}
          >
            {loading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={18} color="inherit" />
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>Signing in…</Typography>
              </Box>
            ) : (
              'Sign in'
            )}
          </Button>

          <Typography sx={{ fontSize: '0.72rem', color: '#94A3B8', textAlign: 'center', mt: 4 }}>
            Need access?{' '}
            <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, color: BRAND_BLUE }}>
              Contact your administrator
            </Typography>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default Login;
