// Supabase Database connection configuration
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create Supabase client for query builder (optional, for future use)
export const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Create Postgres connection pool using Supabase connection string
// Supabase provides a direct Postgres connection string
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

let pool;

if (SUPABASE_DB_URL) {
  // Use Supabase Postgres connection string
  // Optimized for high concurrency (1000+ users)
  pool = new Pool({
    connectionString: SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false // Supabase requires SSL
    },
    max: 100, // Increased for high concurrency (1000+ users)
    min: 10, // Keep minimum connections ready
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
    allowExitOnIdle: false,
    // Queue requests when pool is full (graceful degradation)
    maxUses: 7500, // Recycle connections after 7500 uses
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  console.log('✅ Using Supabase database connection (optimized for high concurrency)');
} else if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  // Construct connection string from Supabase credentials
  // Extract project ref from URL: https://xxxxx.supabase.co -> xxxxx
  const projectRef = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
  
  if (projectRef) {
    // Supabase direct Postgres connection
    // Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
    const dbPassword = process.env.SUPABASE_DB_PASSWORD || SUPABASE_SERVICE_ROLE_KEY.substring(0, 20);
    const dbHost = `aws-0-${process.env.SUPABASE_REGION || 'us-east-1'}.pooler.supabase.com`;
    
    pool = new Pool({
      host: dbHost,
      port: 6543, // Supabase connection pooler port
      database: 'postgres',
      user: `postgres.${projectRef}`,
      password: dbPassword,
      ssl: {
        rejectUnauthorized: false
      },
      max: 100, // Increased for high concurrency (1000+ users)
      min: 10, // Keep minimum connections ready
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 20000,
      allowExitOnIdle: false,
      maxUses: 7500,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
    console.log('✅ Using Supabase database connection (constructed, optimized for high concurrency)');
  } else {
    console.warn('⚠️  Could not extract project ref from SUPABASE_URL');
    console.warn('💡 Please set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD in .env');
  }
}

// Fallback to local PostgreSQL if Supabase not configured
if (!pool) {
  console.warn('⚠️  Supabase not configured, falling back to local PostgreSQL');
  const DB_HOST = process.env.DB_HOST;
  const DB_PORT = process.env.DB_PORT;
  const DB_NAME = process.env.DB_NAME;
  const DB_USER = process.env.DB_USER;
  const DB_PASSWORD = process.env.DB_PASSWORD;
  
  if (!DB_HOST || !DB_PORT || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    throw new Error('Missing required database environment variables. Please set DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD in .env file');
  }
  
  pool = new Pool({
    host: DB_HOST,
    port: parseInt(DB_PORT),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    max: 100, // Increased for high concurrency (1000+ users)
    min: 10, // Keep minimum connections ready
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
    allowExitOnIdle: false,
    maxUses: 7500,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
}

// Test connection on startup
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    if (SUPABASE_URL) {
      console.log(`📊 Connected to Supabase: ${SUPABASE_URL}`);
    } else {
      console.log(`📊 Connected to database: ${process.env.DB_NAME || '[configured database]'}`);
    }
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    if (SUPABASE_URL) {
      console.error('💡 Please check your Supabase configuration in .env file');
      console.error('💡 Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_DB_URL');
    } else {
      console.error('💡 Please check your database configuration in .env file');
    }
    return false;
  }
}

// Test connection immediately
testConnection();

// Connection event handlers
pool.on('connect', () => {
  // Silently handle new connections (reduce log noise)
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

pool.on('remove', () => {
  // Normal behavior - clients removed after idle timeout
});

// ============================================================================
// CONNECTION POOL MONITORING (for high concurrency)
// ============================================================================

let poolStats = {
  totalConnections: 0,
  idleConnections: 0,
  waitingClients: 0,
  lastCheck: Date.now(),
};

// Monitor pool health every 30 seconds
setInterval(() => {
  poolStats = {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
    lastCheck: Date.now(),
  };
  
  // Log warning if pool is under heavy load
  if (pool.waitingCount > 10) {
    console.warn(`⚠️  Database pool under heavy load: ${pool.waitingCount} clients waiting`);
  }
  
  // Log warning if pool is near capacity
  if (pool.totalCount >= pool.options.max * 0.9) {
    console.warn(`⚠️  Database pool near capacity: ${pool.totalCount}/${pool.options.max} connections`);
  }
}, 30000);

/**
 * Get current pool statistics
 * @returns {Object} Pool statistics
 */
export function getPoolStats() {
  return {
    ...poolStats,
    maxConnections: pool.options.max,
    minConnections: pool.options.min || 0,
    currentTotal: pool.totalCount,
    currentIdle: pool.idleCount,
    currentWaiting: pool.waitingCount,
  };
}

/**
 * Health check for connection pool
 * @returns {Object} Health status
 */
export async function checkPoolHealth() {
  try {
    const stats = getPoolStats();
    const utilizationPercent = (stats.currentTotal / stats.maxConnections) * 100;
    
    return {
      healthy: stats.currentWaiting < 20 && utilizationPercent < 95,
      stats,
      utilizationPercent: utilizationPercent.toFixed(1),
      status: stats.currentWaiting > 20 ? 'overloaded' : 
              utilizationPercent > 90 ? 'high-load' :
              utilizationPercent > 70 ? 'moderate-load' : 'healthy',
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      status: 'error',
    };
  }
}

export default pool;
// supabase is already exported above on line 16
