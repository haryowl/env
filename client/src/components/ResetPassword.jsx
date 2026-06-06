import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Link,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [accountLabel, setAccountLabel] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      if (!token) {
        setValidating(false);
        setTokenValid(false);
        setError('Reset link is missing or invalid.');
        return;
      }

      try {
        const res = await fetch(
          `${API_BASE_URL}/auth/reset-password/validate?token=${encodeURIComponent(token)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && data.valid) {
          setTokenValid(true);
          setAccountLabel(data.username || data.email || '');
        } else {
          setTokenValid(false);
          setError(data.error || 'This reset link is invalid or has expired.');
        }
      } catch {
        if (!cancelled) {
          setTokenValid(false);
          setError('Failed to validate reset link.');
        }
      } finally {
        if (!cancelled) setValidating(false);
      }
    };

    validate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        return;
      }

      setSuccess(data.message || 'Password reset successfully. You can now sign in.');
    } catch {
      setError('Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        background: 'linear-gradient(145deg, #0F172A 0%, #1E293B 40%, #334155 100%)',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Reset password
          </Typography>

          {validating ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {accountLabel && tokenValid && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Account: <strong>{accountLabel}</strong>
                </Typography>
              )}

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              {success && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {success}
                </Alert>
              )}

              {tokenValid && !success && (
                <Box component="form" onSubmit={handleSubmit}>
                  <TextField
                    fullWidth
                    label="New password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={loading}
                    sx={{ mb: 2 }}
                    InputProps={{
                      endAdornment: (
                        <IconButton onClick={() => setShowPassword((v) => !v)} edge="end">
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      ),
                    }}
                  />
                  <TextField
                    fullWidth
                    label="Confirm new password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    sx={{ mb: 3 }}
                  />
                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    disabled={loading}
                    sx={{ mb: 2 }}
                  >
                    {loading ? <CircularProgress size={22} color="inherit" /> : 'Update password'}
                  </Button>
                </Box>
              )}

              <Typography variant="body2" textAlign="center">
                <Link component={RouterLink} to="/login" underline="hover">
                  Back to sign in
                </Link>
              </Typography>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
