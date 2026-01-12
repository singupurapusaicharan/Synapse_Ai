// Session-based authentication middleware
// Verifies session token from cookie, header, or query parameter
import pool from '../config/database.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required. Please set JWT_SECRET in .env file');
}

/**
 * Verify session token and get user_id
 * Supports token from:
 * - Authorization header: Bearer <token>
 * - Cookie: session_token=<token>
 * - Query parameter: token=<token>
 */
export const verifySession = async (req, res, next) => {
  try {
    // Try to get token from multiple sources
    let token = null;

    // 1. Check Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // 2. Check cookie
    if (!token && req.cookies && req.cookies.session_token) {
      token = req.cookies.session_token;
    }

    // 3. Check query parameter
    if (!token && req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      // For OAuth routes, redirect to frontend with error instead of JSON
      if (req.path && req.path.includes('/auth/google')) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
        return res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=no_token`);
      }
      return res.status(401).json({ error: 'Session token required' });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // For OAuth routes, redirect to frontend with error instead of JSON
      if (req.path && req.path.includes('/auth/google')) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
        return res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=invalid_token`);
      }
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Verify token exists in sessions table and is not expired
    const sessionResult = await pool.query(
      'SELECT user_id, expires_at FROM sessions WHERE token = $1',
      [token]
    );

    if (sessionResult.rows.length === 0) {
      // For OAuth routes, redirect to frontend with error instead of JSON
      if (req.path && req.path.includes('/auth/google')) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
        return res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=session_not_found`);
      }
      return res.status(403).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      // For OAuth routes, redirect to frontend with error instead of JSON
      if (req.path && req.path.includes('/auth/google')) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
        return res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=session_expired`);
      }
      return res.status(403).json({ error: 'Session expired' });
    }

    // Attach user info to request
    req.user = {
      userId: session.user_id,
      email: decoded.email,
    };
    req.sessionToken = token;

    next();
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default verifySession;
