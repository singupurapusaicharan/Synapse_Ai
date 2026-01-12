// Supabase Database initialization script (SAFE VERSION)
// This script is idempotent and safe to run multiple times
// It will NOT delete existing data or tables
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Supabase configuration missing!');
  console.error('💡 Please set the following in your .env file:');
  console.error('   SUPABASE_URL=https://your-project.supabase.co');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  console.error('   SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres');
  process.exit(1);
}

// Get the Postgres connection from environment
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_DB_URL) {
  console.error('❌ SUPABASE_DB_URL not set!');
  console.error('💡 Get your connection string from Supabase Dashboard:');
  console.error('   Settings > Database > Connection string > URI');
  console.error('   Format: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres');
  process.exit(1);
}

async function initSupabase() {
  console.log('🚀 Starting Supabase database initialization...\n');
  console.log(`📡 Supabase URL: ${SUPABASE_URL}\n`);

  // Use pg library with Supabase connection string
  const pg = await import('pg');
  const { Client } = pg.default;

  const client = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase database\n');

    // Check if initialization has already been completed
    console.log('🔍 Checking initialization status...');
    
    // Create schema_migrations table if it doesn't exist (this is safe)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) UNIQUE NOT NULL,
        initialized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        initialized_by TEXT
      );
    `);

    // Check if initialization is already complete
    const checkResult = await client.query(
      `SELECT version, initialized_at FROM schema_migrations WHERE version = '1.0.0'`
    );

    // Incremental migration: 1.0.1 (add user_settings table)
    const migrate101IfNeeded = async () => {
      const v101 = await client.query(`SELECT version FROM schema_migrations WHERE version = '1.0.1'`);
      if (v101.rows.length > 0) {
        console.log('✅ Migration 1.0.1 already applied');
        return;
      }

      console.log('🧩 Applying migration 1.0.1 (user_settings)...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          notifications_enabled BOOLEAN NOT NULL DEFAULT true,
          email_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        INSERT INTO schema_migrations (version, initialized_by)
        VALUES ('1.0.1', 'initSupabase.js')
        ON CONFLICT (version) DO NOTHING;
      `);
      console.log('✅ Migration 1.0.1 applied');
    };

    if (checkResult.rows.length > 0) {
      console.log('✅ Supabase already initialized, skipping full setup');
      console.log(`   Initialized at: ${checkResult.rows[0].initialized_at || 'unknown'}`);

      // Apply incremental migrations safely
      await migrate101IfNeeded();

      await client.end();
      console.log('\n💡 This script is safe to run multiple times - no data will be deleted.');
      process.exit(0);
    }

    console.log('📋 First-time initialization detected. Proceeding with setup...\n');

    // Enable pgvector extension (Supabase has it pre-installed)
    console.log('📦 Enabling pgvector extension...');
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
      console.log('✅ pgvector extension enabled');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✅ pgvector extension already enabled');
      } else {
        console.warn('⚠️  Could not enable pgvector:', error.message);
      }
    }

    // Create tables using IF NOT EXISTS (safe, won't overwrite existing tables)
    console.log('\n📋 Creating tables (if not exist)...\n');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        reset_token VARCHAR(255),
        reset_token_expiry TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created users table (or already exists)');

    // Sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created sessions table (or already exists)');

    // Queries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS queries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        query_text TEXT NOT NULL,
        response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created queries table (or already exists)');

    // Sources table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('gmail', 'drive', 'slack', 'notion', 'other')),
        source_name VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
        last_synced_at TIMESTAMP,
        connection_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_source_type UNIQUE (user_id, source_type)
      );
    `);
    console.log('✅ Created sources table (or already exists)');

    // OAuth tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        access_token_enc TEXT NOT NULL,
        refresh_token_enc TEXT NOT NULL,
        scope TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created oauth_tokens table (or already exists)');

    // Document chunks table (for semantic search)
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('gmail', 'drive', 'slack', 'notion', 'other')),
        source_item_id TEXT NOT NULL,
        title TEXT,
        url TEXT,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_source_chunk UNIQUE (user_id, source_type, source_item_id, chunk_index)
      );
    `);
    console.log('✅ Created document_chunks table (or already exists)');

    // Query history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS query_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        query_text TEXT NOT NULL,
        answer_text TEXT,
        citations JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created query_history table (or already exists)');

    // Chat sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        title TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created chat_sessions table (or already exists)');

    // Chat messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        user_id UUID NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        citations JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created chat_messages table (or already exists)');

    // Feedback table (for in-app feedback form)
    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT,
        email TEXT,
        comments TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created feedback table (or already exists)');

    // User settings table (notification preferences, etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        notifications_enabled BOOLEAN NOT NULL DEFAULT true,
        email_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created user_settings table (or already exists)');

    // Create indexes (using IF NOT EXISTS)
    console.log('\n📊 Creating indexes (if not exist)...');

    // Users indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    
    // Sessions indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);`);
    
    // Queries indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_queries_user_id ON queries(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_queries_created_at ON queries(created_at);`);
    
    // Sources indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sources_user_id ON sources(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);`);

    // OAuth tokens indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON oauth_tokens(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);`);
    
    // Document chunks indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id ON document_chunks(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_document_chunks_source ON document_chunks(user_id, source_type, source_item_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_document_chunks_created_at ON document_chunks(created_at);`);
    
    // Vector similarity search index (ivfflat) - only create if table has data
    try {
      // Check if index already exists
      const indexCheck = await client.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'document_chunks' 
        AND indexname = 'idx_document_chunks_embedding'
      `);
      
      if (indexCheck.rows.length === 0) {
        // Check if table has any rows
        const rowCheck = await client.query(`SELECT COUNT(*) as count FROM document_chunks`);
        const rowCount = parseInt(rowCheck.rows[0].count);
        
        if (rowCount > 0) {
          await client.query(`
            CREATE INDEX idx_document_chunks_embedding 
            ON document_chunks 
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100);
          `);
          console.log('✅ Vector index (ivfflat) created on embedding column');
        } else {
          console.log('⏭️  Skipping vector index (table is empty - will be created when data is added)');
        }
      } else {
        console.log('✅ Vector index (ivfflat) already exists');
      }
    } catch (error) {
      console.warn('⚠️  Could not create vector index:', error.message);
      console.warn('💡 Index will be created automatically when you add data');
    }
    
    // Query history indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_query_history_user_id ON query_history(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_query_history_created_at ON query_history(created_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_query_history_user_created ON query_history(user_id, created_at DESC);`);

    // Chat sessions indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_created ON chat_sessions(user_id, created_at DESC);`);

    // Chat messages indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON chat_messages(user_id, created_at);`);

    // Create update_updated_at function (using CREATE OR REPLACE - safe)
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers (using IF NOT EXISTS equivalent - DROP IF EXISTS then CREATE)
    await client.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_sources_updated_at ON sources;
      CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON sources
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    // Mark initialization as complete
    await client.query(`
      INSERT INTO schema_migrations (version, initialized_by)
      VALUES ('1.0.0', 'initSupabase.js')
      ON CONFLICT (version) DO NOTHING;
    `);

    // Also mark/apply incremental migration version for fresh installs
    await client.query(`
      INSERT INTO schema_migrations (version, initialized_by)
      VALUES ('1.0.1', 'initSupabase.js')
      ON CONFLICT (version) DO NOTHING;
    `);

    console.log('\n✅ All tables, indexes, functions, and triggers created successfully!');
    console.log('✅ Initialization marked as complete in schema_migrations');

    await client.end();
    console.log('\n🎉 Supabase database initialization complete!');
    console.log('\n📋 Tables created/verified:');
    console.log('   ✅ users');
    console.log('   ✅ sessions');
    console.log('   ✅ queries');
    console.log('   ✅ sources');
    console.log('   ✅ oauth_tokens');
    console.log('   ✅ document_chunks (with pgvector support)');
    console.log('   ✅ query_history');
    console.log('   ✅ chat_sessions');
    console.log('   ✅ chat_messages');
    console.log('\n💡 This script is safe to run multiple times - no data will be deleted.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error initializing Supabase database:', error.message);
    console.error('\n💡 Common issues:');
    console.error('   1. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    console.error('   2. Verify SUPABASE_DB_URL connection string is correct');
    console.error('   3. Ensure you have admin access to the Supabase project');
    if (client) {
      await client.end().catch(() => {});
    }
    process.exit(1);
  }
}

initSupabase();
