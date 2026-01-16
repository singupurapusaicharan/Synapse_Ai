// Google OAuth routes
// Routes: /auth/google and /auth/google/callback
import express from 'express';
import pool from '../config/database.js';
import { verifySession } from '../middleware/sessionAuth.js';
import { getAuthUrl, getTokensFromCode, storeOAuthTokens } from '../lib/googleOAuthReal.js';

const router = express.Router();

/**
 * GET /auth/google
 * Initiates Google OAuth flow
 * Query params:
 *   - sourceType: 'gmail' or 'drive'
 *   - token: session token (if not in header/cookie)
 * 
 * Requires: Session token (from header, cookie, or query param)
 * Redirects: To Google OAuth consent screen
 */
router.get('/google', verifySession, async (req, res) => {
  try {
    console.log(`[OAuth] GET /auth/google - Request received`);
    console.log(`[OAuth] Query params:`, req.query);
    console.log(`[OAuth] Headers:`, { authorization: req.headers['authorization'] ? 'present' : 'missing', cookie: req.cookies ? 'present' : 'missing' });
    
    const { sourceType } = req.query;
    const userId = req.user?.userId;
    
    if (!userId) {
      console.error('[OAuth] No userId found in request');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
      return res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=no_user_id`);
    }

    console.log(`[OAuth] GET /auth/google - user_id: ${userId}, sourceType: ${sourceType}`);

    if (sourceType && sourceType !== 'gmail' && sourceType !== 'drive') {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
      return res.redirect(`${frontendUrl}/sources?error=invalid_source_type`);
    }

    // Create state parameter with userId and sourceType
    // Use Base64 encoding instead of JSON.stringify + encodeURIComponent for better compatibility
    const stateObj = {
      userId: userId,
      sourceType: sourceType || 'gmail',
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');

    // Get OAuth URL with state
    const authUrl = getAuthUrl(state);
    console.log(`[OAuth] Redirecting to Google OAuth for user ${userId}, sourceType: ${sourceType || 'gmail'}`);
    console.log(`[OAuth] Google OAuth URL generated successfully`);

    // Redirect to Google OAuth
    res.redirect(authUrl);
  } catch (error) {
    console.error('[OAuth] Google OAuth initiation error:', error);
    console.error('[OAuth] Error stack:', error.stack);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    res.redirect(`${frontendUrl}/sources?error=oauth_init_failed&reason=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /auth/google/callback
 * Handles Google OAuth callback
 * Query params:
 *   - code: Authorization code from Google
 *   - state: State parameter (contains userId and sourceType)
 * 
 * Flow:
 *   1. Exchange code for tokens
 *   2. Encrypt and store tokens in oauth_tokens table
 *   3. Update sources.status='connected' for the sourceType
 *   4. Redirect to frontend: /sources?connected={sourceType}
 */
router.get('/google/callback', async (req, res) => {
  try {
    console.log(`[OAuth] GET /auth/google/callback - Request received`);
    const { code, state, error: oauthError, error_description: oauthErrorDescription } = req.query;
    console.log(`[OAuth] Callback params:`, { hasCode: !!code, hasState: !!state, oauthError: oauthError || null });

    // If Google returned an OAuth error (user denied / app blocked / etc), surface it to the UI.
    if (oauthError) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
      const desc = typeof oauthErrorDescription === 'string' ? oauthErrorDescription : '';
      const reason = desc ? `${oauthError}:${desc}` : String(oauthError);
      return res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=${encodeURIComponent(reason)}`);
    }

    if (!code) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
      return res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=no_code`);
    }

    // Parse state to get userId and sourceType
    let userId = null;
    let sourceType = 'gmail';
    
    if (state) {
      try {
        // Decode Base64 state parameter
        const stateJson = Buffer.from(state, 'base64').toString('utf-8');
        const stateData = JSON.parse(stateJson);
        userId = stateData.userId;
        sourceType = stateData.sourceType || 'gmail';
        console.log(`[OAuth] Decoded state:`, { userId, sourceType });
      } catch (error) {
        console.error('[OAuth] Error parsing state:', error);
        console.error('[OAuth] State value:', state);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
        return res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=invalid_state`);
      }
    }

    if (!userId) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
      return res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=no_user_id`);
    }

    // Verify user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
      return res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=user_not_found`);
    }

    console.log(`[OAuth] Processing OAuth callback for user ${userId}, sourceType: ${sourceType}`);

    // Exchange code for tokens
    console.log(`[OAuth] Exchanging authorization code for tokens...`);
    const { accessToken, refreshToken, expiryDate, scope } = await getTokensFromCode(code);
    console.log(`[OAuth] Tokens received successfully`);

    // Encrypt and store tokens in oauth_tokens table
    console.log(`[OAuth] Storing encrypted tokens in oauth_tokens table...`);
    await storeOAuthTokens(userId, accessToken, refreshToken, expiryDate, scope);
    console.log(`[OAuth] Tokens stored successfully`);

    // Update sources table: set status='connected' for the sourceType
    const sourceName = sourceType === 'gmail' ? 'Gmail' : 'Google Drive';
    
    // Check if source exists
    const sourceCheck = await pool.query(
      'SELECT id FROM sources WHERE user_id = $1 AND source_type = $2',
      [userId, sourceType]
    );

    if (sourceCheck.rows.length > 0) {
      // Update existing source
      console.log(`[OAuth] Updating existing source record...`);
      await pool.query(
        `UPDATE sources 
         SET status = 'connected',
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND source_type = $2`,
        [userId, sourceType]
      );
    } else {
      // Insert new source
      console.log(`[OAuth] Creating new source record...`);
      await pool.query(
        `INSERT INTO sources (user_id, source_type, source_name, status)
         VALUES ($1, $2, $3, 'connected')`,
        [userId, sourceType, sourceName]
      );
    }

    console.log(`[OAuth] Source ${sourceType} connected successfully for user ${userId}`);

    // Redirect to frontend success page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    console.log(`[OAuth] Redirecting to frontend: ${frontendUrl}/sources?connected=${sourceType}`);
    res.redirect(`${frontendUrl}/sources?connected=${sourceType}`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    res.redirect(`${frontendUrl}/sources?error=oauth_failed&reason=${encodeURIComponent(error.message)}`);
  }
});

export default router;
