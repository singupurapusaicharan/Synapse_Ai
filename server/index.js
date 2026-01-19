// Main server file
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import compression from 'compression';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import googleLoginRoutes from './routes/googleLogin.js';
import sourceRoutes from './routes/sources.js';
import historyRoutes from './routes/history.js';
import chatRoutes from './routes/chat.js';
import feedbackRoutes from './routes/feedback.js';
import settingsRoutes from './routes/settings.js';
import pool from './config/database.js'; // Uses Supabase Postgres connection
import { validateEnvironmentOrExit } from './utils/envValidator.js';
import { publicRateLimiter } from './middleware/rateLimiter.js';
import { startPeriodicCleanup } from './utils/cleanup.js';

dotenv.config();

// ============================================================================
// SECURITY: Validate environment variables
// ============================================================================
validateEnvironmentOrExit();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Disable X-Powered-By header (don't reveal Express)
app.disable('x-powered-by');

// Security headers (applied to all environments)
app.use((req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Restrict feature access
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // XSS Protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy (basic)
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  
  next();
});

// HSTS (HTTPS Strict Transport Security) - production only
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    next();
  });
}

// Compression for better performance
if (process.env.NODE_ENV === 'production') {
  app.use(compression());
}

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser tools (curl/postman) with no Origin header
    if (!origin) return callback(null, true);

    const configuredFrontend = process.env.FRONTEND_URL || 'http://localhost:8080';

    // In development, allow common local/dev origins (localhost + LAN IPs)
    if (process.env.NODE_ENV !== 'production') {
      const allowlist = new Set([
        configuredFrontend,
        'http://localhost:8080',
        'http://127.0.0.1:8080',
      ]);

      // Allow typical LAN dev URLs like http://192.168.x.x:8080
      const isLanDev =
        /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:8080$/.test(origin) ||
        /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:8080$/.test(origin);

      if (allowlist.has(origin) || isLanDev) {
        return callback(null, true);
      }
    }

    // In production, only allow the configured frontend
    if (origin === configuredFrontend) {
      return callback(null, true);
    }

    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  // Limit exposed headers
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
}));

// ============================================================================
// BODY PARSING MIDDLEWARE (with size limits)
// ============================================================================

app.use(cookieParser());
// Limit JSON payload size to prevent DoS
app.use(express.json({ limit: '1mb' }));
// Limit URL-encoded payload size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============================================================================
// PUBLIC ROUTES (with rate limiting)
// ============================================================================

// Root route
app.get('/', publicRateLimiter, (req, res) => {
  res.json({
    message: 'Synapse AI Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      sources: '/api/sources'
    },
    documentation: 'API available at /api'
  });
});

// Health check (no rate limit for monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running', timestamp: new Date().toISOString() });
});

// API info endpoint
app.get('/api', publicRateLimiter, (req, res) => {
  res.json({
    message: 'Synapse AI API',
    version: '1.0.0',
    endpoints: {
      auth: {
        base: '/api/auth',
        signup: 'POST /api/auth/signup',
        signin: 'POST /api/auth/signin',
        signout: 'POST /api/auth/signout',
        me: 'GET /api/auth/me',
        'forgot-password': 'POST /api/auth/forgot-password',
        'reset-password': 'POST /api/auth/reset-password',
      },
      chat: {
        'new-session': 'POST /api/chat/session/new',
        'get-sessions': 'GET /api/chat/sessions',
        'get-session': 'GET /api/chat/session/:id',
        'post-message': 'POST /api/chat/message',
      },
      sources: {
        base: '/api/sources',
        get: 'GET /api/sources',
        sync: 'POST /api/sources/sync',
      }
    }
  });
});

// ============================================================================
// API ROUTES (with rate limiting applied in route files)
// ============================================================================

console.log('📋 Registering API routes...');

// Register OAuth routes BEFORE auth routes to ensure /auth/google is matched first
app.use('/auth/google', googleLoginRoutes);
console.log('✅ Google Login OAuth routes registered at /auth/google');

app.use('/auth', oauthRoutes);
console.log('✅ OAuth routes registered at /auth');

app.use('/api/auth', authRoutes);
console.log('✅ Auth routes registered at /api/auth');

app.use('/api/history', historyRoutes);
console.log('✅ History routes registered at /api/history');

app.use('/api/chat', chatRoutes);
console.log('✅ Chat sessions routes registered at /api/chat');

app.use('/api/sources', sourceRoutes);
console.log('✅ Source routes registered at /api/sources');

app.use('/api/feedback', feedbackRoutes);
console.log('✅ Feedback routes registered at /api/feedback');

app.use('/api/settings', settingsRoutes);
console.log('✅ Settings routes registered at /api/settings');

// ============================================================================
// ERROR HANDLERS
// ============================================================================

// Ignore favicon requests
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// 404 handler
app.use((req, res) => {
  // Don't log favicon or health check requests
  if (req.path !== '/favicon.ico' && req.path !== '/health') {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
  }
  res.status(404).json({ 
    error: 'Route not found', 
    path: req.path, 
    method: req.method 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Log error (but don't expose stack trace in production)
  console.error('Server error:', err.message);
  
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: err.message 
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ 
      error: 'Unauthorized' 
    });
  }
  
  // Generic error response (don't expose internal details)
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// Test database connection and start server
async function startServer() {
  // Test database connection
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection verified');
    
    // Check if required tables exist
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'sessions', 'queries', 'sources', 'document_chunks', 'query_history', 'chat_sessions', 'chat_messages', 'oauth_tokens', 'feedback', 'user_settings')
    `);
    
    const existingTables = tablesCheck.rows.map(row => row.table_name);
    const requiredTables = ['users', 'sessions', 'sources', 'document_chunks', 'query_history', 'chat_sessions', 'chat_messages', 'oauth_tokens', 'feedback', 'user_settings'];
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length > 0) {
      console.warn('⚠️  Missing database tables:', missingTables.join(', '));
      console.warn('💡 Run: npm run init:db to create the required tables');
    } else {
      console.log('✅ All required database tables exist');
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    if (process.env.SUPABASE_URL) {
      console.error('💡 Please check your Supabase configuration in .env file');
      console.error('💡 Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL');
    } else {
      console.error('💡 Please check your .env file and ensure PostgreSQL is running');
    }
    console.error('💡 Run: npm run init:db to initialize the database');
  }

  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log(`🧪 Test route: http://localhost:${PORT}/api/auth/test`);
    console.log(`📋 Available routes:`);
    console.log(`   GET  /`);
    console.log(`   GET  /health`);
    console.log(`   GET  /api/auth/test`);
    console.log(`   POST /api/auth/signup`);
    console.log(`   POST /api/auth/signin`);
    console.log(`   POST /api/auth/forgot-password`);
    
    // Start periodic cleanup tasks (sessions, old data, etc.)
    startPeriodicCleanup();
  });
}

startServer();

