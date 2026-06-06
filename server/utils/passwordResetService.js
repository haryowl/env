const crypto = require('crypto');
const { query, getRow } = require('../config/database');
const { hashPassword } = require('../middleware/auth');
const { sendEmail } = require('../services/notificationService');

const TOKEN_TTL_MS = Number(process.env.PASSWORD_RESET_TTL_MS) || 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function getPasswordResetBaseUrl(req) {
  const configured = process.env.PASSWORD_RESET_BASE_URL || process.env.APP_PUBLIC_URL;
  if (configured) {
    return String(configured).replace(/\/$/, '');
  }
  const origin = req?.get?.('origin');
  if (origin) {
    return origin.replace(/\/$/, '');
  }
  const referer = req?.get?.('referer');
  if (referer) {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch {
      /* ignore */
    }
  }
  const cors = process.env.CORS_ORIGINS || '';
  const first = cors.split(',').map((s) => s.trim()).filter(Boolean)[0];
  if (first) {
    return first.replace(/\/$/, '');
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

async function invalidateActiveTokens(userId) {
  await query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
    [userId]
  );
}

async function createPasswordResetToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await invalidateActiveTokens(userId);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  return { token, expiresAt };
}

function buildResetEmailHtml({ username, resetUrl, expiresMinutes }) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">Reset your password</h2>
      <p>Hello <strong>${username}</strong>,</p>
      <p>We received a request to reset your AksaData Monitor password.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;text-decoration:none;border-radius:4px;">
          Reset password
        </a>
      </p>
      <p>Or copy this link into your browser:</p>
      <p style="word-break: break-all;"><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in ${expiresMinutes} minutes. If you did not request this, you can ignore this email.</p>
    </div>
  `;
}

async function sendPasswordResetEmail({ user, token, baseUrl }) {
  if (!user?.email) {
    throw new Error('User has no email address');
  }

  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const expiresMinutes = Math.round(TOKEN_TTL_MS / 60000);

  await sendEmail({
    to: user.email,
    subject: 'Reset your AksaData Monitor password',
    html: buildResetEmailHtml({
      username: user.username,
      resetUrl,
      expiresMinutes,
    }),
  });
}

async function findUserForPasswordReset(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  return getRow(
    `SELECT user_id, username, email, status
     FROM users
     WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)
     LIMIT 1`,
    [trimmed]
  );
}

async function requestPasswordResetForUser(user, req) {
  if (!user || user.status !== 'active' || !user.email) {
    return { sent: false };
  }

  const { token } = await createPasswordResetToken(user.user_id);
  const baseUrl = getPasswordResetBaseUrl(req);
  await sendPasswordResetEmail({ user, token, baseUrl });
  return { sent: true };
}

async function requestPasswordReset(identifier, req) {
  const user = await findUserForPasswordReset(identifier);
  if (!user) {
    return { sent: false };
  }
  return requestPasswordResetForUser(user, req);
}

async function validateResetToken(token) {
  if (!token) return { valid: false };
  const tokenHash = hashToken(token);
  const row = await getRow(
    `SELECT prt.token_id, u.username, u.email, u.status
     FROM password_reset_tokens prt
     JOIN users u ON u.user_id = prt.user_id
     WHERE prt.token_hash = $1
       AND prt.used_at IS NULL
       AND prt.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  if (!row || row.status !== 'active') {
    return { valid: false };
  }
  return { valid: true, username: row.username, email: row.email };
}

async function resetPasswordWithToken(token, newPassword) {
  if (!token) {
    return { ok: false, error: 'Invalid or expired reset link' };
  }

  const tokenHash = hashToken(token);
  const row = await getRow(
    `SELECT prt.token_id, prt.user_id, u.status
     FROM password_reset_tokens prt
     JOIN users u ON u.user_id = prt.user_id
     WHERE prt.token_hash = $1
       AND prt.used_at IS NULL
       AND prt.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  if (!row || row.status !== 'active') {
    return { ok: false, error: 'Invalid or expired reset link' };
  }

  const passwordHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [
    passwordHash,
    row.user_id,
  ]);
  await invalidateActiveTokens(row.user_id);

  return { ok: true };
}

async function setUserPassword(userId, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [
    passwordHash,
    userId,
  ]);
  await invalidateActiveTokens(userId);
}

module.exports = {
  TOKEN_TTL_MS,
  getPasswordResetBaseUrl,
  requestPasswordReset,
  requestPasswordResetForUser,
  validateResetToken,
  resetPasswordWithToken,
  setUserPassword,
  findUserForPasswordReset,
};
