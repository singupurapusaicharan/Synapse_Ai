// Input Validation & Sanitization Middleware
// Implements OWASP best practices for input validation
// Protects against injection attacks, XSS, and malformed data

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Validation rules for different data types
 */
const VALIDATION_RULES = {
  // Email validation (RFC 5322 compliant)
  email: {
    pattern: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    maxLength: 254,
    minLength: 3,
  },
  
  // Password validation (strong password requirements)
  password: {
    minLength: 8,
    maxLength: 128,
    // At least one uppercase, one lowercase, one number
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
  },
  
  // UUID validation
  uuid: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  },
  
  // Name validation (letters, spaces, hyphens, apostrophes)
  name: {
    pattern: /^[a-zA-Z\s'-]{1,100}$/,
    maxLength: 100,
    minLength: 1,
  },
  
  // Text content (general text with reasonable limits)
  text: {
    maxLength: 10000,
    minLength: 1,
  },
  
  // Short text (titles, subjects, etc.)
  shortText: {
    maxLength: 500,
    minLength: 1,
  },
  
  // URL validation
  url: {
    pattern: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
    maxLength: 2048,
  },
  
  // Alphanumeric (IDs, tokens, etc.)
  alphanumeric: {
    pattern: /^[a-zA-Z0-9_-]+$/,
    maxLength: 255,
  },
  
  // Integer validation
  integer: {
    min: Number.MIN_SAFE_INTEGER,
    max: Number.MAX_SAFE_INTEGER,
  },
  
  // Positive integer
  positiveInteger: {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  },
};

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

/**
 * Sanitize string input (remove dangerous characters)
 * @param {string} input - Input string
 * @returns {string} Sanitized string
 */
function sanitizeString(input) {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters (except newline and tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Limit consecutive whitespace
    .replace(/\s+/g, ' ');
}

/**
 * Sanitize HTML (prevent XSS)
 * @param {string} input - Input string
 * @returns {string} Sanitized string
 */
function sanitizeHTML(input) {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize SQL input (prevent SQL injection)
 * Note: Always use parameterized queries, this is defense in depth
 * @param {string} input - Input string
 * @returns {string} Sanitized string
 */
function sanitizeSQL(input) {
  if (typeof input !== 'string') return '';
  
  return input
    // Remove SQL comment markers
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    // Remove semicolons (statement terminators)
    .replace(/;/g, '')
    // Remove common SQL keywords in dangerous positions
    .replace(/\b(DROP|DELETE|TRUNCATE|ALTER|EXEC|EXECUTE)\b/gi, '');
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  const sanitized = sanitizeString(email).toLowerCase();
  const rules = VALIDATION_RULES.email;
  
  if (sanitized.length < rules.minLength) {
    return { valid: false, error: 'Email is too short' };
  }
  
  if (sanitized.length > rules.maxLength) {
    return { valid: false, error: 'Email is too long' };
  }
  
  if (!rules.pattern.test(sanitized)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true, value: sanitized };
}

/**
 * Validate password
 * @param {string} password - Password to validate
 * @returns {Object} { valid: boolean, error: string }
 */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  
  const rules = VALIDATION_RULES.password;
  
  if (password.length < rules.minLength) {
    return { valid: false, error: `Password must be at least ${rules.minLength} characters` };
  }
  
  if (password.length > rules.maxLength) {
    return { valid: false, error: `Password must be less than ${rules.maxLength} characters` };
  }
  
  if (!rules.pattern.test(password)) {
    return { valid: false, error: 'Password must contain uppercase, lowercase, and number' };
  }
  
  return { valid: true, value: password };
}

/**
 * Validate UUID
 * @param {string} uuid - UUID to validate
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') {
    return { valid: false, error: 'UUID is required' };
  }
  
  const sanitized = sanitizeString(uuid).toLowerCase();
  
  if (!VALIDATION_RULES.uuid.pattern.test(sanitized)) {
    return { valid: false, error: 'Invalid UUID format' };
  }
  
  return { valid: true, value: sanitized };
}

/**
 * Validate text content
 * @param {string} text - Text to validate
 * @param {Object} options - Validation options
 * @returns {Object} { valid: boolean, error: string, value: string }
 */
export function validateText(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'Text is required' };
  }
  
  const {
    minLength = VALIDATION_RULES.text.minLength,
    maxLength = VALIDATION_RULES.text.maxLength,
    allowHTML = false,
  } = options;
  
  let sanitized = sanitizeString(text);
  
  if (!allowHTML) {
    sanitized = sanitizeHTML(sanitized);
  }
  
  if (sanitized.length < minLength) {
    return { valid: false, error: `Text must be at least ${minLength} characters` };
  }
  
  if (sanitized.length > maxLength) {
    return { valid: false, error: `Text must be less than ${maxLength} characters` };
  }
  
  return { valid: true, value: sanitized };
}

/**
 * Validate integer
 * @param {any} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} { valid: boolean, error: string, value: number }
 */
export function validateInteger(value, options = {}) {
  const {
    min = VALIDATION_RULES.integer.min,
    max = VALIDATION_RULES.integer.max,
    required = true,
  } = options;
  
  if (value === null || value === undefined) {
    if (required) {
      return { valid: false, error: 'Value is required' };
    }
    return { valid: true, value: null };
  }
  
  const num = parseInt(value, 10);
  
  if (isNaN(num)) {
    return { valid: false, error: 'Value must be a number' };
  }
  
  if (num < min) {
    return { valid: false, error: `Value must be at least ${min}` };
  }
  
  if (num > max) {
    return { valid: false, error: `Value must be at most ${max}` };
  }
  
  return { valid: true, value: num };
}

// ============================================================================
// MIDDLEWARE FACTORY
// ============================================================================

/**
 * Create validation middleware
 * @param {Object} schema - Validation schema
 * @returns {Function} Express middleware
 */
export function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];
    const sanitized = {};
    
    // Validate body fields
    if (schema.body) {
      for (const [field, rules] of Object.entries(schema.body)) {
        const value = req.body?.[field];
        
        // Check if field is required
        if (rules.required && (value === null || value === undefined || value === '')) {
          errors.push(`${field} is required`);
          continue;
        }
        
        // Skip validation if field is optional and not provided
        if (!rules.required && (value === null || value === undefined || value === '')) {
          continue;
        }
        
        // Validate based on type
        let result;
        switch (rules.type) {
          case 'email':
            result = validateEmail(value);
            break;
          case 'password':
            result = validatePassword(value);
            break;
          case 'uuid':
            result = validateUUID(value);
            break;
          case 'text':
            result = validateText(value, rules);
            break;
          case 'integer':
            result = validateInteger(value, rules);
            break;
          default:
            result = { valid: true, value };
        }
        
        if (!result.valid) {
          errors.push(`${field}: ${result.error}`);
        } else {
          sanitized[field] = result.value;
        }
      }
    }
    
    // Validate query parameters
    if (schema.query) {
      for (const [field, rules] of Object.entries(schema.query)) {
        const value = req.query?.[field];
        
        if (rules.required && !value) {
          errors.push(`Query parameter ${field} is required`);
          continue;
        }
        
        if (!rules.required && !value) {
          continue;
        }
        
        // Validate based on type
        let result;
        switch (rules.type) {
          case 'integer':
            result = validateInteger(value, rules);
            break;
          case 'uuid':
            result = validateUUID(value);
            break;
          default:
            result = { valid: true, value: sanitizeString(value) };
        }
        
        if (!result.valid) {
          errors.push(`Query ${field}: ${result.error}`);
        }
      }
    }
    
    // Validate URL parameters
    if (schema.params) {
      for (const [field, rules] of Object.entries(schema.params)) {
        const value = req.params?.[field];
        
        if (rules.required && !value) {
          errors.push(`URL parameter ${field} is required`);
          continue;
        }
        
        // Validate based on type
        let result;
        switch (rules.type) {
          case 'uuid':
            result = validateUUID(value);
            break;
          default:
            result = { valid: true, value: sanitizeString(value) };
        }
        
        if (!result.valid) {
          errors.push(`Parameter ${field}: ${result.error}`);
        }
      }
    }
    
    // Return errors if any
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }
    
    // Attach sanitized data to request
    req.sanitized = sanitized;
    
    next();
  };
}

// ============================================================================
// COMMON VALIDATION SCHEMAS
// ============================================================================

export const schemas = {
  // Authentication schemas
  signup: {
    body: {
      email: { type: 'email', required: true },
      password: { type: 'password', required: true },
      fullName: { type: 'text', required: false, maxLength: 100 },
    },
  },
  
  signin: {
    body: {
      email: { type: 'email', required: true },
      password: { type: 'text', required: true, minLength: 1, maxLength: 128 },
    },
  },
  
  forgotPassword: {
    body: {
      email: { type: 'email', required: true },
    },
  },
  
  resetPassword: {
    body: {
      token: { type: 'text', required: true, minLength: 32, maxLength: 128 },
      password: { type: 'password', required: true },
    },
  },
  
  // Chat schemas
  chatMessage: {
    body: {
      question: { type: 'text', required: true, minLength: 1, maxLength: 1000 },
      sessionId: { type: 'uuid', required: true },
    },
  },
  
  newSession: {
    body: {
      title: { type: 'text', required: false, maxLength: 200 },
    },
  },
  
  // Source schemas
  syncSource: {
    body: {
      sourceType: { type: 'text', required: true, maxLength: 50 },
    },
  },
};
