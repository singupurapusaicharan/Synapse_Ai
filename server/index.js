// Main server file
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import googleLoginRoutes from './routes/googleLogin.js';
import sourceRoutes from './routes/sources.js';
import historyRoutes from './routes/history.js';
import chatRoutes from './routes/chat.js';
import feedbackRoutes from './routes/feedback.js';
import settingsRoutes from './routes/settings.js';
import pool from './config/database.js'; // Uses Supabase Postgres connection

dotenv.config();

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('❌ ERROR: JWT_SECRET is required. Please set JWT_SECRET in .env file');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Production-only security headers (minimal, avoids changing app behavior)
if (process.env.NODE_ENV === 'production') {
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // If you terminate TLS at a proxy (Render/Railway/etc.), HSTS is still valid for browsers.
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  });
}

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

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route
app.get('/', (req, res) => {
  console.log('✅ Root route hit');
  res.json({
    message: 'Synapse AI Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      'auth-test': '/api/auth/test',
      queries: '/api/queries',
      sources: '/api/sources'
    },
    documentation: 'API available at /api'
  });
});

// Health check
app.get('/health', (req, res) => {
  console.log('✅ Health check hit');
  res.json({ status: 'ok', message: 'Server is running' });
});

// API Routes - MUST be registered before 404 handler
console.log('📋 Registering API routes...');

// Add route listing endpoint before registering routes
app.get('/api', (req, res) => {
  console.log('✅ /api route hit');
  res.json({
    message: 'Synapse AI API',
    version: '1.0.0',
      endpoints: {
        auth: {
          base: '/api/auth',
          test: 'GET /api/auth/test',
          signup: 'POST /api/auth/signup',
          signin: 'POST /api/auth/signin',
          signout: 'POST /api/auth/signout',
          me: 'GET /api/auth/me',
          'forgot-password': 'POST /api/auth/forgot-password',
          'reset-password': 'POST /api/auth/reset-password',
          'validate-token': 'GET /api/auth/reset-password/:token'
        },
        chat: {
          'new-session': 'POST /api/chat/session/new',
          'get-sessions': 'GET /api/chat/sessions',
          'get-session': 'GET /api/chat/session/:id',
          'post-message': 'POST /api/chat/message',
          'delete-session': 'DELETE /api/chat/session/:id'
        },
        oauth: {
          'google-oauth': 'GET /auth/google',
          'google-callback': 'GET /auth/google/callback'
        },
        history: {
          base: '/api/history',
          get: 'GET /api/history',
          'clear-session': 'DELETE /api/history/clear-session',
          'clear-all': 'DELETE /api/history/clear-all'
        },
        sources: {
          base: '/api/sources',
          get: 'GET /api/sources',
          connect: 'POST /api/sources/connect',
          sync: 'POST /api/sources/sync',
          disconnect: 'POST /api/sources/disconnect'
        }
      }
  });
});

// Register OAuth routes BEFORE auth routes to ensure /auth/google is matched first
app.use('/auth/google', googleLoginRoutes); // Mounts at /auth/google/login & /auth/google/login/callback
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

// Debug route for Ollama connectivity
app.get('/api/debug/ollama', async (req, res) => {
  // Do not expose infra/debug info in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { getOllamaDebugInfo } = await import('./lib/ollama.js');
    const info = await getOllamaDebugInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get Ollama debug info',
    });
  }
});

// Ignore favicon requests
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// 404 handler
app.use((req, res) => {
  // Don't log favicon requests
  if (req.path !== '/favicon.ico') {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
  }
  res.status(404).json({ error: 'Route not found', path: req.path, method: req.method });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
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
  });
}

startServer();

