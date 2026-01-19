// Rate Limiting Middleware
// Implements OWASP best practices for API rate limiting
// Protects against brute force, DDoS, and abuse

import { LRUCache } from 'lru-cache';

// ============================================================================
// RATE LIMIT CONFIGURATIONS
// ============================================================================

// Default rate limits (requests per window)
const RATE_LIMITS = {
  // Authentication endpoints - strict limits to prevent brute force
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
  
  // Password reset - prevent abuse
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3, // 3 attempts per hour
    message: 'Too many password reset requests. Please try again in 1 hour.',
  },
  
  // OAuth endpoints - moderate limits
  oauth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10, // 10 attempts per 15 minutes
    message: 'Too many OAuth requests. Please try again later.',
  },
  
  // API endpoints (authenticated) - generous limits for normal use
  api: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
    message: 'Too many requests. Please slow down.',
  },
  
  // Chat/AI endpoints - moderate limits (AI operations are expensive)
  chat: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 10, // 10 messages per minute
    message: 'Too many chat requests. Please wait a moment.',
  },
  
  // Sync operations - strict limits (resource intensive)
  sync: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 3, // 3 syncs per 5 minutes
    message: 'Too many sync requests. Please wait before syncing again.',
  },
  
  // Public endpoints - moderate limits
  public: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
    message: 'Too many requests. Please try again later.',
  },
};

// ============================================================================
// IN-MEMORY CACHE FOR RATE LIMITING
// ============================================================================

// Using LRU cache to automatically evict old entries
// Max 10,000 entries to prevent memory exhaustion
const rateLimitCache = new LRUCache({
  max: 10000,
  ttl: 60 * 60 * 1000, // 1 hour TTL
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get client identifier (IP address + user ID if authenticated)
 * @param {Object} req - Express request object
 * @returns {string} Client identifier
 */
function getClientId(req) {
  // Get IP address (handle proxies)
  const ip = req.ip || 
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.connection.remoteAddress ||
             'unknown';
  
  // If user is authenticated, include user ID for per-user limits
  const userId = req.user?.userId || '';
  
  return `${ip}:${userId}`;
}

/**
 * Get rate limit key for caching
 * @param {string} clientId - Client identifier
 * @param {string} endpoint - Endpoint identifier
 * @returns {string} Cache key
 */
function getRateLimitKey(clientId, endpoint) {
  return `ratelimit:${endpoint}:${clientId}`;
}

/**
 * Check if client has exceeded rate limit
 * @param {string} clientId - Client identifier
 * @param {Object} config - Rate limit configuration
 * @param {string} endpoint - Endpoint identifier
 * @returns {Object} { allowed: boolean, remaining: number, resetTime: number }
 */
function checkRateLimit(clientId, config, endpoint) {
  const key = getRateLimitKey(clientId, endpoint);
  const now = Date.now();
  
  // Get existing record
  let record = rateLimitCache.get(key);
  
  if (!record) {
    // First request - create new record
    record = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitCache.set(key, record);
    
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: record.resetTime,
    };
  }
  
  // Check if window has expired
  if (now > record.resetTime) {
    // Reset window
    record = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitCache.set(key, record);
    
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: record.resetTime,
    };
  }
  
  // Within window - check if limit exceeded
  if (record.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    };
  }
  
  // Increment count
  record.count++;
  rateLimitCache.set(key, record);
  
  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

// ============================================================================
// RATE LIMITER MIDDLEWARE FACTORY
// ============================================================================

/**
 * Create rate limiter middleware
 * @param {string} limitType - Type of rate limit (auth, api, chat, etc.)
 * @returns {Function} Express middleware
 */
export function createRateLimiter(limitType = 'api') {
  const config = RATE_LIMITS[limitType] || RATE_LIMITS.api;
  
  return (req, res, next) => {
    const clientId = getClientId(req);
    const endpoint = limitType;
    
    const result = checkRateLimit(clientId, config, endpoint);
    
    // Set rate limit headers (standard headers)
    res.setHeader('X-RateLimit-Limit', config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
    
    if (!result.allowed) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfter);
      
      console.warn(`[Rate Limit] Blocked ${clientId} on ${endpoint} endpoint`);
      
      return res.status(429).json({
        error: config.message,
        retryAfter: retryAfter,
        limit: config.maxRequests,
        windowMs: config.windowMs,
      });
    }
    
    next();
  };
}

// ============================================================================
// EXPORTED RATE LIMITERS
// ============================================================================

export const authRateLimiter = createRateLimiter('auth');
export const passwordResetRateLimiter = createRateLimiter('passwordReset');
export const oauthRateLimiter = createRateLimiter('oauth');
export const apiRateLimiter = createRateLimiter('api');
export const chatRateLimiter = createRateLimiter('chat');
export const syncRateLimiter = createRateLimiter('sync');
export const publicRateLimiter = createRateLimiter('public');

// ============================================================================
// CLEANUP FUNCTION
// ============================================================================

/**
 * Clear rate limit cache (useful for testing)
 */
export function clearRateLimitCache() {
  rateLimitCache.clear();
  console.log('[Rate Limit] Cache cleared');
}

/**
 * Get rate limit stats (useful for monitoring)
 */
export function getRateLimitStats() {
  return {
    cacheSize: rateLimitCache.size,
    maxSize: rateLimitCache.max,
  };
}
