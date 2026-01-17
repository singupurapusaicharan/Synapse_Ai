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
  pool = new Pool({
    connectionString: SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false // Supabase requires SSL
    },
    max: 10, // Reduced from 20 for free tier
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000, // Increased from 5000 to 20000 (20 seconds)
    allowExitOnIdle: false,
  });
  console.log('✅ Using Supabase database connection');
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
      max: 10, // Reduced from 20 for free tier
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 20000, // Increased from 5000 to 20000 (20 seconds)
      allowExitOnIdle: false,
    });
    console.log('✅ Using Supabase database connection (constructed)');
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
    max: 10, // Reduced from 20 for free tier
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000, // Increased from 5000 to 20000 (20 seconds)
    allowExitOnIdle: false,
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
  // Uncomment below if you want to see connection logs:
  // console.log('✅ New database client connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

// Suppress "client removed from pool" warnings (normal behavior for idle timeout)
pool.on('remove', () => {
  // This is normal - clients are removed after idleTimeoutMillis
  // No need to log this as it happens frequently
});

export default pool;
// supabase is already exported above on line 16
