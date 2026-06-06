const express = require('express');
const Joi = require('joi');
const { 
  generateToken, 
  hashPassword, 
  comparePassword, 
  updateLastLogin,
  createRateLimiter,
  authenticateToken,
  authenticateTokenOptional
} = require('../middleware/auth');
const { getRow, query } = require('../config/database');
const { ensureTenantsSchema } = require('../utils/ensureTenantsSchema');
const { resolveLogoutRedirectFromUserRow } = require('../utils/postLogoutRedirect');
const { ensurePasswordResetSchema } = require('../utils/ensurePasswordResetSchema');
const {
  requestPasswordReset,
  validateResetToken,
  resetPasswordWithToken,
} = require('../utils/passwordResetService');
const moment = require('moment-timezone'); // Added missing import

const router = express.Router();

// Rate limiting for auth endpoints
// Development: More permissive, Production: Stricter
const isDevelopment = process.env.NODE_ENV !== 'production';
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes window
  isDevelopment ? 50 : 5 // 50 attempts for dev, 5 for production
);

// Development endpoint to reset rate limiter
if (isDevelopment) {
  router.post('/reset-rate-limit', (req, res) => {
    // Access the internal requests Map from the rate limiter
    authLimiter.requests?.clear?.();
    res.json({ message: 'Rate limiter reset successfully' });
  });
}

// Validation schemas
const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required()
});

const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid('admin', 'operator', 'viewer').default('viewer')
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required()
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().required(),
  newPassword: Joi.string().min(8).required(),
});

// Login endpoint
router.post('/login', authLimiter, async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input data',
        code: 'VALIDATION_ERROR',
        details: error.details
      });
    }

    const { username, password } = value;

    // Find user by username or email
    const user = await getRow(
      'SELECT user_id, username, email, password_hash, role, status, timezone, profile_picture FROM users WHERE username = $1 OR email = $1',
      [username]
    );

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    if (user.status !== 'active') {
      return res.status(401).json({
        error: 'Account is not active',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login
    await updateLastLogin(user.user_id);

    // Generate JWT token
    const token = generateToken(user.user_id);

    // Return user data (without password)
    const { password_hash, ...userData } = user;
    
    res.json({
      message: 'Login successful',
      token,
      user: userData,
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

// Register endpoint (only for super admins)
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input data',
        code: 'VALIDATION_ERROR',
        details: error.details
      });
    }

    const { username, email, password, role } = value;

    // Check if username or email already exists
    const existingUser = await getRow(
      'SELECT user_id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser) {
      return res.status(409).json({
        error: 'Username or email already exists',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const result = await query(`
      INSERT INTO users (username, email, password_hash, role, status, created_at)
      VALUES ($1, $2, $3, $4, 'active', NOW())
      RETURNING user_id, username, email, role, status, timezone, created_at
    `, [username, email, passwordHash, role]);

    const newUser = result.rows[0];

    res.status(201).json({
      message: 'User created successfully',
      user: newUser
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
});

// Request password reset email (public)
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    await ensurePasswordResetSchema();

    const { error, value } = forgotPasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Email or username is required',
        code: 'VALIDATION_ERROR',
      });
    }

    try {
      await requestPasswordReset(value.email, req);
    } catch (emailError) {
      console.error('Forgot password email error:', emailError);
    }

    res.json({
      message:
        'If an account with that email or username exists, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      error: 'Failed to process password reset request',
      code: 'FORGOT_PASSWORD_ERROR',
    });
  }
});

// Validate reset token (public; used by reset-password page)
router.get('/reset-password/validate', async (req, res) => {
  try {
    await ensurePasswordResetSchema();
    const token = req.query.token;
    const result = await validateResetToken(token);
    if (!result.valid) {
      return res.status(400).json({
        valid: false,
        error: 'Invalid or expired reset link',
        code: 'INVALID_RESET_TOKEN',
      });
    }
    res.json({
      valid: true,
      username: result.username,
      email: result.email,
    });
  } catch (error) {
    console.error('Validate reset token error:', error);
    res.status(500).json({
      error: 'Failed to validate reset link',
      code: 'VALIDATE_RESET_TOKEN_ERROR',
    });
  }
});

// Complete password reset with token (public)
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    await ensurePasswordResetSchema();

    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Token and a new password (min 8 characters) are required',
        code: 'VALIDATION_ERROR',
      });
    }

    const result = await resetPasswordWithToken(value.token, value.newPassword);
    if (!result.ok) {
      return res.status(400).json({
        error: result.error || 'Invalid or expired reset link',
        code: 'INVALID_RESET_TOKEN',
      });
    }

    res.json({
      message: 'Password reset successfully. You can now sign in.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      error: 'Failed to reset password',
      code: 'RESET_PASSWORD_ERROR',
    });
  }
});

// Change password endpoint (current user; requires Bearer token)
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    // Validate input
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input data',
        code: 'VALIDATION_ERROR',
        details: error.details
      });
    }

    const { currentPassword, newPassword } = value;
    const userId = req.user.user_id;

    // Get current user
    const user = await getRow(
      'SELECT password_hash FROM users WHERE user_id = $1',
      [userId]
    );

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1 WHERE user_id = $2',
      [newPasswordHash, userId]
    );

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Password change failed',
      code: 'PASSWORD_CHANGE_ERROR'
    });
  }
});

// Get current user profile
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.user_id;

    const user = await getRow(`
      SELECT user_id, username, email, role, status, timezone, preferences, 
             created_at, last_login
      FROM users WHERE user_id = $1
    `, [userId]);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      user
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      code: 'PROFILE_ERROR'
    });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { timezone, preferences } = req.body;

    // Validate timezone if provided
    if (timezone && !moment.tz.zone(timezone)) {
      return res.status(400).json({
        error: 'Invalid timezone',
        code: 'INVALID_TIMEZONE'
      });
    }

    // Update profile
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (timezone !== undefined) {
      updateFields.push(`timezone = $${paramCount++}`);
      updateValues.push(timezone);
    }

    if (preferences !== undefined) {
      updateFields.push(`preferences = $${paramCount++}`);
      updateValues.push(JSON.stringify(preferences));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No fields to update',
        code: 'NO_FIELDS_TO_UPDATE'
      });
    }

    updateValues.push(userId);
    
    await query(`
      UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE user_id = $${paramCount}
    `, updateValues);

    res.json({
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      code: 'PROFILE_UPDATE_ERROR'
    });
  }
});

// Logout: optional Bearer token; returns redirectUrl from tenant default + user override (validated).
router.post('/logout', authenticateTokenOptional, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    let redirectUrl = null;

    if (userId) {
      await query(`
        INSERT INTO system_logs (level, message, metadata, user_id)
        VALUES ('info', 'User logged out', '{}', $1)
      `, [userId]);

      try {
        await ensureTenantsSchema();
        const row = await getRow(
          `
          SELECT u.post_logout_redirect_url,
                 t.post_logout_redirect_url AS tenant_post_logout_redirect_url
          FROM users u
          LEFT JOIN tenants t ON u.tenant_id = t.tenant_id
          WHERE u.user_id = $1
        `,
          [userId]
        );
        redirectUrl = resolveLogoutRedirectFromUserRow(row);
      } catch (schemaErr) {
        console.error('Logout redirect resolution skipped:', schemaErr.message);
      }
    }

    res.json({
      message: 'Logout successful',
      redirectUrl: redirectUrl || null,
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Verify user still exists and is active
    const user = await getRow(
      'SELECT user_id, status FROM users WHERE user_id = $1',
      [userId]
    );

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        error: 'User not found or inactive',
        code: 'USER_INACTIVE'
      });
    }

    // Generate new token
    const newToken = generateToken(userId);

    res.json({
      message: 'Token refreshed successfully',
      token: newToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      code: 'TOKEN_REFRESH_ERROR'
    });
  }
});

// Validate token endpoint
router.get('/validate', authenticateToken, async (req, res) => {
  try {
    // If we reach here, the token is valid (auth middleware passed)
    res.json({
      message: 'Token is valid',
      user: req.user
    });

  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({
      error: 'Token validation failed',
      code: 'TOKEN_VALIDATION_ERROR'
    });
  }
});

module.exports = router; 