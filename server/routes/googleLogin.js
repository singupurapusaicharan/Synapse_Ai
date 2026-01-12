// Google Login-only OAuth (NO overlap with sources/Gmail/Drive OAuth)
import express from 'express';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import pool from '../config/database.js';

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const REDIRECT_URI = `${BACKEND_URL}/auth/google/login/callback`;

// Google Login (authentication ONLY) scopes
const LOGIN_SCOPES = [
  'openid',
  'profile',
  'email',
];

// Dedicated OAuth2 client for Google Login only
function getLoginOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

/**
 * GET /auth/google/login
 * Redirects to Google consent for authentication (not data sources)
 */
router.get('/login', (req, res) => {
  console.log('[Google Login] /login endpoint hit');
  console.log('[Google Login] REDIRECT_URI:', REDIRECT_URI);
  console.log('[Google Login] CLIENT_ID:', GOOGLE_CLIENT_ID ? 'Set' : 'NOT SET');
  console.log('[Google Login] CLIENT_SECRET:', GOOGLE_CLIENT_SECRET ? 'Set' : 'NOT SET');
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('[Google Login] Missing Google OAuth credentials!');
    return res.redirect(`${FRONTEND_URL}/auth?error=oauth_not_configured`);
  }
  
  const oauth2Client = getLoginOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: LOGIN_SCOPES,
    prompt: 'select_account',
  });
  console.log('[Google Login] Redirecting to Google OAuth URL');
  return res.redirect(authUrl);
});

/**
 * GET /auth/google/login/callback
 * Handles Google login callback ONLY for authentication
 */
router.get('/login/callback', async (req, res) => {
  try {
    console.log('[Google Login] Callback received');
    const { code } = req.query;
    if (!code) {
      console.error('[Google Login] No authorization code received');
      return res.redirect(`${FRONTEND_URL}/auth?error=google_login_failed`);
    }
    console.log('[Google Login] Authorization code received, exchanging for tokens...');
    const oauth2Client = getLoginOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.id_token) {
      return res.redirect(`${FRONTEND_URL}/auth?error=google_login_failed`);
    }
    // Decode ID token
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const userEmail = payload?.email;
    const fullName = payload?.name || null;
    console.log('[Google Login] User info extracted:', { email: userEmail, name: fullName });
    
    if (!userEmail) {
      console.error('[Google Login] No email in token payload');
      return res.redirect(`${FRONTEND_URL}/auth?error=google_login_failed`);
    }
    // Find or create user
    console.log('[Google Login] Looking up user in database...');
    let userResult = await pool.query('SELECT id, email, full_name FROM users WHERE email = $1',
      [userEmail.toLowerCase()]);
    let user;
    if (userResult.rows.length > 0) {
      user = userResult.rows[0];
      console.log('[Google Login] Existing user found:', user.id);
    } else {
      // Create user: password_hash = NULL
      console.log('[Google Login] Creating new user...');
      const insertResult = await pool.query(
        'INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, NULL) RETURNING id, email, full_name',
        [userEmail.toLowerCase(), fullName]
      );
      user = insertResult.rows[0];
      console.log('[Google Login] New user created:', user.id);
    }
    // Session/JWT logic (reuses email login logic)
    console.log('[Google Login] Creating JWT token and session...');
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    // Set session expiry (7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );
    console.log('[Google Login] Session created successfully');
    
    // Set token as HTTP-only cookie (optional)
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    // Redirect to Sources auto-connect flow with token (frontend captures token early on boot).
    const redirectUrl = `${FRONTEND_URL}/sources?autoconnect=gmail&returnTo=%2F&token=${encodeURIComponent(token)}`;
    console.log('[Google Login] Redirecting to:', redirectUrl);
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error('[Google Login] ERROR:', err.message);
    console.error('[Google Login] Stack:', err.stack);
    return res.redirect(`${FRONTEND_URL}/auth?error=google_login_failed`);
  }
});

export default router;

