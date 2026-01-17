// Real Google OAuth 2.0 implementation
// Stores encrypted tokens in oauth_tokens table
import { google } from 'googleapis';
import pool from '../config/database.js';
import { encrypt, decrypt } from './encryption.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Auto-detect redirect URI based on environment
// In production, BACKEND_URL should be set to your Render URL
// If not set, we'll try to detect it from the request
let REDIRECT_URI = `${BACKEND_URL}/auth/google/callback`;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  Google OAuth credentials not set. Gmail/Drive integration will not work.');
}

console.log(`[OAuth Init] BACKEND_URL: ${BACKEND_URL}`);
console.log(`[OAuth Init] REDIRECT_URI: ${REDIRECT_URI}`);

// OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

/**
 * Get the correct redirect URI based on the request
 * This helps handle cases where BACKEND_URL is not properly configured
 */
function getRedirectUri(req) {
  // If BACKEND_URL is explicitly set and not localhost in production, use it
  if (process.env.BACKEND_URL && !process.env.BACKEND_URL.includes('localhost') && process.env.NODE_ENV === 'production') {
    return `${process.env.BACKEND_URL}/auth/google/callback`;
  }
  
  // Otherwise, try to detect from request
  if (req) {
    // Render and most cloud providers use x-forwarded-proto header
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host');
    if (host) {
      const detectedUrl = `${protocol}://${host}/auth/google/callback`;
      console.log(`[OAuth] Auto-detected redirect URI: ${detectedUrl}`);
      return detectedUrl;
    }
  }
  
  // Fallback to configured REDIRECT_URI
  return REDIRECT_URI;
}

// Scopes for Gmail and Drive (read-only)
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Get Google OAuth authorization URL
 * @param {string} state - State parameter (for tracking user/sourceType)
 * @param {object} req - Express request object (optional, for auto-detecting redirect URI)
 * @returns {string} Authorization URL
 */
export function getAuthUrl(state = '', req = null) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  const redirectUri = getRedirectUri(req);
  
  // Create a new OAuth2 client with the correct redirect URI
  const client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  console.log(`[OAuth] Using redirect URI: ${redirectUri}`);
  console.log(`[OAuth] BACKEND_URL: ${BACKEND_URL}`);
  console.log(`[OAuth] State parameter length: ${state.length}`);

  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: state,
    include_granted_scopes: true,
  });
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from Google
 * @returns {Promise<{accessToken: string, refreshToken: string, expiryDate: number, scope: string}>}
 */
export async function getTokensFromCode(code) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  const { tokens } = await oauth2Client.getToken(code);
  
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date || Date.now() + 3600000, // Default 1 hour
    scope: tokens.scope || SCOPES.join(' '),
  };
}

/**
 * Store encrypted tokens in oauth_tokens table
 * @param {string} userId - User ID (UUID)
 * @param {string} accessToken - Access token
 * @param {string} refreshToken - Refresh token
 * @param {number} expiryDate - Expiry timestamp
 * @param {string} scope - OAuth scopes
 */
export async function storeOAuthTokens(userId, accessToken, refreshToken, expiryDate, scope) {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is required for token encryption');
  }

  // Encrypt tokens
  const accessTokenEnc = encrypt(accessToken);
  const refreshTokenEnc = encrypt(refreshToken);

  // Store or update in oauth_tokens table
  await pool.query(
    `INSERT INTO oauth_tokens (user_id, access_token_enc, refresh_token_enc, scope, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) 
     DO UPDATE SET 
       access_token_enc = $2,
       refresh_token_enc = $3,
       scope = $4,
       expires_at = $5,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, accessTokenEnc, refreshTokenEnc, scope, new Date(expiryDate)]
  );
}

/**
 * Get or refresh access token for user
 * @param {string} userId - User ID (UUID)
 * @returns {Promise<string>} Access token
 */
export async function getAccessToken(userId) {
  console.log(`[OAuth] Getting access token for user ${userId}`);
  
  // Get encrypted tokens from oauth_tokens table
  const result = await pool.query(
    'SELECT access_token_enc, refresh_token_enc, expires_at FROM oauth_tokens WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    console.error(`[OAuth] No OAuth tokens found in database for user ${userId}`);
    throw new Error('No OAuth tokens found for user');
  }

  console.log(`[OAuth] Found tokens in database for user ${userId}`);
  const row = result.rows[0];
  
  // Decrypt access token
  let accessToken = decrypt(row.access_token_enc);
  console.log(`[OAuth] Decrypted access token successfully`);
  
  // Check if token needs refresh (refresh 1 minute before expiry)
  const expiresAt = new Date(row.expires_at);
  const now = new Date();
  const timeUntilExpiry = expiresAt.getTime() - now.getTime();
  
  console.log(`[OAuth] Token expires at: ${expiresAt.toISOString()}`);
  console.log(`[OAuth] Time until expiry: ${Math.round(timeUntilExpiry / 1000)} seconds`);
  
  if (timeUntilExpiry <= 60000) { // 1 minute
    console.log(`[OAuth] Token expired or expiring soon, refreshing...`);
    // Refresh token
    const refreshToken = decrypt(row.refresh_token_enc);
    
    if (!refreshToken) {
      console.error(`[OAuth] No refresh token available for user ${userId}`);
      throw new Error('Refresh token not available');
    }

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    let credentials;
    try {
      ({ credentials } = await oauth2Client.refreshAccessToken());
      console.log(`[OAuth] Successfully refreshed access token`);
    } catch (err) {
      const msg = String(err?.message || '');
      const apiError = err?.response?.data?.error;
      const isInvalidGrant = msg.includes('invalid_grant') || apiError === 'invalid_grant';
      if (isInvalidGrant) {
        console.error(`[OAuth] Refresh token invalid/revoked for user ${userId}`);
        // Token was revoked/expired. Clean up so UI can prompt user to reconnect.
        try {
          await pool.query('DELETE FROM oauth_tokens WHERE user_id = $1', [userId]);
          await pool.query(
            `UPDATE sources
             SET status = 'disconnected',
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND source_type IN ('gmail', 'drive')`,
            [userId]
          );
          console.log(`[OAuth] Cleaned up invalid tokens for user ${userId}`);
        } catch (cleanupErr) {
          // Best-effort cleanup; still throw the reconnect signal.
          console.warn('[OAuth] Failed to cleanup tokens after invalid_grant:', cleanupErr?.message || cleanupErr);
        }
        const e = new Error('OAUTH_INVALID_GRANT');
        e.code = 'OAUTH_INVALID_GRANT';
        throw e;
      }
      console.error(`[OAuth] Error refreshing token:`, err);
      throw err;
    }
    
    // Update stored tokens
    const newAccessToken = credentials.access_token;
    const newExpiryDate = credentials.expiry_date || Date.now() + 3600000;
    
    // Encrypt and save
    const accessTokenEnc = encrypt(newAccessToken);
    
    await pool.query(
      `UPDATE oauth_tokens 
       SET access_token_enc = $1,
           expires_at = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $3`,
      [accessTokenEnc, new Date(newExpiryDate), userId]
    );

    console.log(`[OAuth] Updated tokens in database`);
    return newAccessToken;
  }

  console.log(`[OAuth] Using existing access token (still valid)`);
  return accessToken;
}

/**
 * Get authenticated Google clients
 * @param {string} userId - User ID (UUID)
 * @returns {Promise<{gmail: any, drive: any}>} Authenticated clients
 */
export async function getAuthenticatedClients(userId) {
  const accessToken = await getAccessToken(userId);

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    drive: google.drive({ version: 'v3', auth: oauth2Client }),
  };
}

/**
 * Delete OAuth tokens for user
 * @param {string} userId - User ID (UUID)
 */
export async function deleteOAuthTokens(userId) {
  await pool.query('DELETE FROM oauth_tokens WHERE user_id = $1', [userId]);
}
