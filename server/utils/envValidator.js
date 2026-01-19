// Environment Variable Validator
// Ensures all required environment variables are set and secure
// Implements OWASP best practices for configuration management

import crypto from 'crypto';

// ============================================================================
// REQUIRED ENVIRONMENT VARIABLES
// ============================================================================

const REQUIRED_ENV_VARS = {
  // Critical security variables
  JWT_SECRET: {
    required: true,
    minLength: 32,
    description: 'JWT signing secret (must be strong random string)',
  },
  ENCRYPTION_KEY: {
    required: true,
    minLength: 32,
    description: 'Encryption key for sensitive data (must be strong random string)',
  },
  
  // Database configuration
  SUPABASE_URL: {
    required: true,
    pattern: /^https:\/\/.+\.supabase\.co$/,
    description: 'Supabase project URL',
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    required: true,
    minLength: 20,
    description: 'Supabase service role key',
    sensitive: true,
  },
  SUPABASE_DB_URL: {
    required: true,
    pattern: /^postgresql:\/\/.+/,
    description: 'Supabase database connection string',
    sensitive: true,
  },
  
  // Server configuration
  PORT: {
    required: false,
    default: '3001',
    pattern: /^\d+$/,
    description: 'Server port number',
  },
  NODE_ENV: {
    required: false,
    default: 'development',
    enum: ['development', 'production', 'test'],
    description: 'Node environment',
  },
  FRONTEND_URL: {
    required: true,
    pattern: /^https?:\/\/.+/,
    description: 'Frontend application URL',
  },
  BACKEND_URL: {
    required: true,
    pattern: /^https?:\/\/.+/,
    description: 'Backend API URL',
  },
  
  // OAuth configuration
  GOOGLE_CLIENT_ID: {
    required: true,
    minLength: 20,
    description: 'Google OAuth client ID',
  },
  GOOGLE_CLIENT_SECRET: {
    required: true,
    minLength: 20,
    description: 'Google OAuth client secret',
    sensitive: true,
  },
  
  // Optional: Email configuration
  EMAIL_USER: {
    required: false,
    description: 'Email service username',
  },
  EMAIL_PASSWORD: {
    required: false,
    description: 'Email service password',
    sensitive: true,
  },
  
  // Optional: Hugging Face API
  HUGGINGFACE_API_KEY: {
    required: false,
    description: 'Hugging Face API key (optional, for higher rate limits)',
    sensitive: true,
  },
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Check if a string is a weak/default value
 * @param {string} value - Value to check
 * @returns {boolean} True if weak
 */
function isWeakValue(value) {
  const weakPatterns = [
    /^(your|my|test|demo|example|change|replace|update|set|add)/i,
    /^(secret|password|key|token)$/i,
    /^(123|abc|qwerty|admin|root)/i,
    /^[a-z]{1,10}$/i, // Too simple
  ];
  
  return weakPatterns.some(pattern => pattern.test(value));
}

/**
 * Generate a secure random string
 * @param {number} length - Length of string
 * @returns {string} Random string
 */
function generateSecureRandom(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Validate a single environment variable
 * @param {string} name - Variable name
 * @param {Object} rules - Validation rules
 * @returns {Object} { valid: boolean, error: string, warning: string }
 */
function validateEnvVar(name, rules) {
  const value = process.env[name];
  
  // Check if required
  if (rules.required && !value) {
    return {
      valid: false,
      error: `${name} is required. ${rules.description}`,
    };
  }
  
  // If not required and not set, use default or skip
  if (!value) {
    if (rules.default) {
      process.env[name] = rules.default;
    }
    return { valid: true };
  }
  
  // Check minimum length
  if (rules.minLength && value.length < rules.minLength) {
    return {
      valid: false,
      error: `${name} must be at least ${rules.minLength} characters long`,
    };
  }
  
  // Check pattern
  if (rules.pattern && !rules.pattern.test(value)) {
    return {
      valid: false,
      error: `${name} has invalid format. ${rules.description}`,
    };
  }
  
  // Check enum
  if (rules.enum && !rules.enum.includes(value)) {
    return {
      valid: false,
      error: `${name} must be one of: ${rules.enum.join(', ')}`,
    };
  }
  
  // Check for weak values (security check)
  if (rules.sensitive && isWeakValue(value)) {
    return {
      valid: false,
      error: `${name} appears to be a weak/default value. Please use a strong random string.`,
      suggestion: `Generate a secure value: ${generateSecureRandom()}`,
    };
  }
  
  return { valid: true };
}

/**
 * Validate all environment variables
 * @returns {Object} { valid: boolean, errors: Array, warnings: Array }
 */
export function validateEnvironment() {
  const errors = [];
  const warnings = [];
  
  // Validate each required variable
  for (const [name, rules] of Object.entries(REQUIRED_ENV_VARS)) {
    const result = validateEnvVar(name, rules);
    
    if (!result.valid) {
      errors.push({
        variable: name,
        error: result.error,
        suggestion: result.suggestion,
      });
    }
    
    if (result.warning) {
      warnings.push({
        variable: name,
        warning: result.warning,
      });
    }
  }
  
  // Check for exposed secrets in production
  if (process.env.NODE_ENV === 'production') {
    // Ensure no development/test values in production
    const productionChecks = [
      { var: 'FRONTEND_URL', shouldNotContain: ['localhost', '127.0.0.1'] },
      { var: 'BACKEND_URL', shouldNotContain: ['localhost', '127.0.0.1'] },
    ];
    
    for (const check of productionChecks) {
      const value = process.env[check.var];
      if (value && check.shouldNotContain.some(pattern => value.includes(pattern))) {
        warnings.push({
          variable: check.var,
          warning: `${check.var} contains development URL in production environment`,
        });
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Print validation results
 * @param {Object} result - Validation result
 */
export function printValidationResults(result) {
  if (result.valid) {
    console.log('✅ Environment variables validated successfully');
  } else {
    console.error('❌ Environment validation failed:');
    result.errors.forEach(err => {
      console.error(`  - ${err.variable}: ${err.error}`);
      if (err.suggestion) {
        console.error(`    Suggestion: ${err.suggestion}`);
      }
    });
  }
  
  if (result.warnings.length > 0) {
    console.warn('⚠️  Environment warnings:');
    result.warnings.forEach(warn => {
      console.warn(`  - ${warn.variable}: ${warn.warning}`);
    });
  }
}

/**
 * Validate environment and exit if invalid
 */
export function validateEnvironmentOrExit() {
  const result = validateEnvironment();
  printValidationResults(result);
  
  if (!result.valid) {
    console.error('\n💡 Please fix the environment variables in your .env file');
    process.exit(1);
  }
}

/**
 * Mask sensitive environment variables for logging
 * @param {string} name - Variable name
 * @returns {string} Masked value
 */
export function maskSensitiveEnv(name) {
  const value = process.env[name];
  if (!value) return '[not set]';
  
  const rules = REQUIRED_ENV_VARS[name];
  if (rules?.sensitive) {
    // Show first 4 and last 4 characters
    if (value.length > 12) {
      return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
    }
    return '***';
  }
  
  return value;
}

/**
 * Get safe environment info for debugging (no sensitive data)
 * @returns {Object} Safe environment info
 */
export function getSafeEnvInfo() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    FRONTEND_URL: process.env.FRONTEND_URL,
    BACKEND_URL: process.env.BACKEND_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    // Sensitive values are masked
    JWT_SECRET: maskSensitiveEnv('JWT_SECRET'),
    ENCRYPTION_KEY: maskSensitiveEnv('ENCRYPTION_KEY'),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...',
    GOOGLE_CLIENT_SECRET: maskSensitiveEnv('GOOGLE_CLIENT_SECRET'),
  };
}
