// Secure OAuth state parameter generation and validation
// Uses HMAC to prevent CSRF attacks
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required for OAuth state validation');
}

/**
 * Generate a secure OAuth state parameter with HMAC signature
 * @param {string} userId - User ID
 * @param {string} sourceType - Source type (gmail/drive)
 * @returns {string} Signed state parameter
 */
export function generateOAuthState(userId, sourceType) {
  const timestamp = Date.now();
  const data = JSON.stringify({
    u: userId,
    s: sourceType || 'gmail',
    t: timestamp
  });
  
  // Create HMAC signature
  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  hmac.update(data);
  const signature = hmac.digest('hex');
  
  // Combine data and signature
  const stateObj = {
    d: data,
    sig: signature
  };
  
  // URL-safe Base64 encoding
  const state = Buffer.from(JSON.stringify(stateObj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return state;
}

/**
 * Validate and parse OAuth state parameter
 * @param {string} state - State parameter from OAuth callback
 * @returns {{userId: string, sourceType: string, timestamp: number}} Parsed state data
 * @throws {Error} If state is invalid or signature doesn't match
 */
export function validateOAuthState(state) {
  if (!state || typeof state !== 'string') {
    throw new Error('Invalid state parameter');
  }
  
  try {
    // Decode URL-safe Base64
    const base64 = state
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    
    const stateJson = Buffer.from(padded, 'base64').toString('utf-8');
    const stateObj = JSON.parse(stateJson);
    
    // Extract data and signature
    const { d: data, sig: signature } = stateObj;
    
    if (!data || !signature) {
      throw new Error('State missing data or signature');
    }
    
    // Verify HMAC signature
    const hmac = crypto.createHmac('sha256', JWT_SECRET);
    hmac.update(data);
    const expectedSignature = hmac.digest('hex');
    
    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      throw new Error('State signature validation failed');
    }
    
    // Parse the data
    const parsedData = JSON.parse(data);
    const userId = parsedData.u || parsedData.userId;
    const sourceType = parsedData.s || parsedData.sourceType || 'gmail';
    const timestamp = parsedData.t || 0;
    
    // Check if state is not too old (10 minutes max)
    const maxAge = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - timestamp > maxAge) {
      throw new Error('State parameter expired');
    }
    
    return {
      userId,
      sourceType,
      timestamp
    };
  } catch (error) {
    throw new Error(`State validation failed: ${error.message}`);
  }
}
