// Rate limiting middleware
// Simple in-memory rate limiter (use Redis in production)

const rateLimitStore = new Map();

/**
 * Rate limit middleware
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @returns {Function} Express middleware
 */
export function rateLimit({ windowMs = 60000, max = 10 }) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    // Clean old entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean
      for (const [k, v] of rateLimitStore.entries()) {
        if (now - v.resetTime > windowMs) {
          rateLimitStore.delete(k);
        }
      }
    }

    const record = rateLimitStore.get(key);

    if (!record || now - record.resetTime > windowMs) {
      // New window
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now,
      });
      return next();
    }

    if (record.count >= max) {
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Maximum ${max} requests per ${windowMs / 1000} seconds.`,
        retryAfter: Math.ceil((record.resetTime + windowMs - now) / 1000),
      });
    }

    record.count++;
    next();
  };
}
