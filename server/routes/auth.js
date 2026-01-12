// Authentication routes
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/database.js'; // Uses Supabase Postgres connection
// OAuth routes moved to server/routes/oauth.js

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Validate JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required. Please set JWT_SECRET in .env file');
}

console.log('🔧 Auth router initialized');

// Test route to verify auth routes are working
router.get('/test', (req, res) => {
  console.log('✅ Test route hit!');
  res.json({ 
    message: 'Auth routes are working!', 
    timestamp: new Date().toISOString(),
    routes: ['/signup', '/signin', '/signout', '/me', '/forgot-password', '/reset-password']
  });
});

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, created_at',
      [email.toLowerCase(), passwordHash, fullName || null]
    );

    const user = result.rows[0];
    console.log(' User created:', user);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      },
      token,
    });
  } catch (error) {
    console.error('Signup error:', error);
    // Return detailed error message in development, generic in production
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Sign in
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid login credentials' });
    }

    const user = result.rows[0];

    // Check if user has a password (Google OAuth users don't)
    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account uses Google Sign-In. Please use "Continue with Google" button.' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid login credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      },
      token,
    });
  } catch (error) {
    console.error('Signin error:', error);
    // Return detailed error message in development, generic in production
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;
    console.log(`[API] GET /api/auth/me - user_id: ${userId}`);
    
    const result = await pool.query(
      'SELECT id, email, full_name, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign out
router.post('/signout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    }

    res.json({ message: 'Signed out successfully' });
  } catch (error) {
    console.error('Signout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google OAuth (placeholder - implement based on your OAuth setup)
router.post('/google', async (req, res) => {
  res.status(501).json({ error: 'Google OAuth not implemented yet' });
});

// Simple in-memory rate limiting for forgot password
const resetRequestCounts = new Map();
const RESET_REQUEST_LIMIT = 3; // Max 3 requests per hour per IP
const RESET_REQUEST_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

// IMPORTANT: Forgot password route must come BEFORE reset-password routes
// Forgot password - generate reset token
router.post('/forgot-password', async (req, res) => {
  console.log('📧 Forgot password request received:', { email: req.body?.email, ip: req.ip });
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Rate limiting - check IP address
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const userRequests = resetRequestCounts.get(clientIp) || [];

    // Remove old requests outside the time window
    const recentRequests = userRequests.filter(timestamp => now - timestamp < RESET_REQUEST_WINDOW);

    if (recentRequests.length >= RESET_REQUEST_LIMIT) {
      return res.status(429).json({ 
        error: 'Too many reset requests. Please try again later.' 
      });
    }

    // Add current request
    recentRequests.push(now);
    resetRequestCounts.set(clientIp, recentRequests);

    // Find user by email
    const result = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Always return success to prevent email enumeration
    // But only send email if user exists
    if (result.rows.length > 0) {
      const user = result.rows[0];
      
      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(resetToken, 10);
      
      // Set expiry to 15 minutes from now
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      // Store hashed token and expiry in database
      await pool.query(
        'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3',
        [hashedToken, expiresAt, user.id]
      );

      // Generate reset link
      const FRONTEND_URL = process.env.FRONTEND_URL;
      if (!FRONTEND_URL) {
        throw new Error('FRONTEND_URL is required. Please set FRONTEND_URL in .env file');
      }
      const resetLink = `${FRONTEND_URL}/reset-password/${resetToken}`;

      // Send email to user
      const { sendResetPasswordEmail } = await import('../utils/email.js');
      await sendResetPasswordEmail(user.email, resetLink);
    }

    // Always return success message (security: don't reveal if email exists)
    res.json({ 
      message: 'If an account with that email exists, a password reset link has been sent.' 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Reset password - validate token and update password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    // Find user with matching reset token
    const result = await pool.query(
      'SELECT id, email, reset_token, reset_token_expiry FROM users WHERE reset_token IS NOT NULL'
    );

    let user = null;
    for (const row of result.rows) {
      if (row.reset_token_expiry && new Date(row.reset_token_expiry) > new Date()) {
        const isValid = await bcrypt.compare(token, row.reset_token);
        if (isValid) {
          user = row;
          break;
        }
      }
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Update password and clear reset token
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
      [passwordHash, user.id]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message || 'Internal server error';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Validate reset token
router.get('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Find user with matching reset token
    const result = await pool.query(
      'SELECT id, reset_token, reset_token_expiry FROM users WHERE reset_token IS NOT NULL'
    );

    let isValid = false;
    for (const row of result.rows) {
      if (row.reset_token_expiry && new Date(row.reset_token_expiry) > new Date()) {
        const tokenValid = await bcrypt.compare(token, row.reset_token);
        if (tokenValid) {
          isValid = true;
          break;
        }
      }
    }

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    res.json({ valid: true });
  } catch (error) {
    console.error('Validate token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google OAuth routes

// OAuth routes moved to server/routes/oauth.js
// Use /auth/google and /auth/google/callback instead

export default router;

