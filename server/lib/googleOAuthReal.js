// Real Google OAuth 2.0 implementation
// Stores encrypted tokens in oauth_tokens table
import { google } from 'googleapis';
import pool from '../config/database.js';
import { encrypt, decrypt } from './encryption.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const REDIRECT_URI = `${BACKEND_URL}/auth/google/callback`;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  Google OAuth credentials not set. Gmail/Drive integration will not work.');
}

// OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

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
 * @returns {string} Authorization URL
 */
export function getAuthUrl(state = '') {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  console.log(`[OAuth] Using redirect URI: ${REDIRECT_URI}`);
  console.log(`[OAuth] Make sure this EXACT URI is added in Google Cloud Console`);

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
    state: state, // Include state for tracking
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
  // Get encrypted tokens from oauth_tokens table
  const result = await pool.query(
    'SELECT access_token_enc, refresh_token_enc, expires_at FROM oauth_tokens WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('No OAuth tokens found for user');
  }

  const row = result.rows[0];
  
  // Decrypt access token
  let accessToken = decrypt(row.access_token_enc);
  
  // Check if token needs refresh (refresh 1 minute before expiry)
  const expiresAt = new Date(row.expires_at);
  const now = new Date();
  const timeUntilExpiry = expiresAt.getTime() - now.getTime();
  
  if (timeUntilExpiry <= 60000) { // 1 minute
    // Refresh token
    const refreshToken = decrypt(row.refresh_token_enc);
    
    if (!refreshToken) {
      throw new Error('Refresh token not available');
    }

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    let credentials;
    try {
      ({ credentials } = await oauth2Client.refreshAccessToken());
    } catch (err) {
      const msg = String(err?.message || '');
      const apiError = err?.response?.data?.error;
      const isInvalidGrant = msg.includes('invalid_grant') || apiError === 'invalid_grant';
      if (isInvalidGrant) {
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
        } catch (cleanupErr) {
          // Best-effort cleanup; still throw the reconnect signal.
          console.warn('[OAuth] Failed to cleanup tokens after invalid_grant:', cleanupErr?.message || cleanupErr);
        }
        const e = new Error('OAUTH_INVALID_GRANT');
        e.code = 'OAUTH_INVALID_GRANT';
        throw e;
      }
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

    return newAccessToken;
  }

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
