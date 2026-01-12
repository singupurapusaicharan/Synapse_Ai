// Supabase Database diagnostic script
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

async function checkSupabase() {
  console.log('🔍 Supabase Database Diagnostic Tool\n');
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Supabase configuration missing!');
    console.error('💡 Required environment variables:');
    console.error('   SUPABASE_URL=https://your-project.supabase.co');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    console.error('   SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  Service Role Key: ${SUPABASE_SERVICE_ROLE_KEY ? '***' : '(missing)'}`);
  console.log(`  Database URL: ${SUPABASE_DB_URL ? 'Set' : '(missing)'}\n`);

  if (!SUPABASE_DB_URL) {
    console.error('❌ SUPABASE_DB_URL not set!');
    console.error('💡 Get your connection string from Supabase Dashboard:');
    console.error('   Settings > Database > Connection string > URI');
    process.exit(1);
  }

  const client = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Attempting to connect...');
    await client.connect();
    console.log('✅ Connection successful!\n');

    // Check pgvector extension
    const extCheck = await client.query(`
      SELECT * FROM pg_extension WHERE extname = 'vector'
    `);
    
    if (extCheck.rows.length > 0) {
      console.log('✅ pgvector extension is enabled');
    } else {
      console.log('⚠️  pgvector extension not enabled');
      console.log('💡 Run: CREATE EXTENSION vector;');
    }

    // Check tables
    console.log('\nChecking tables...');
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'sessions', 'queries', 'sources', 'document_chunks', 'query_history', 'chat_sessions', 'chat_messages')
      ORDER BY table_name
    `);

    const existingTables = tablesCheck.rows.map(row => row.table_name);
    const requiredTables = ['users', 'sessions', 'queries', 'sources', 'document_chunks', 'query_history', 'chat_sessions', 'chat_messages'];
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));

    if (existingTables.length > 0) {
      console.log('✅ Existing tables:');
      existingTables.forEach(table => console.log(`   - ${table}`));
    }

    if (missingTables.length > 0) {
      console.log('\n⚠️  Missing tables:');
      missingTables.forEach(table => console.log(`   - ${table}`));
      console.log('\n💡 Run: npm run init:db to create missing tables');
    } else {
      console.log('\n✅ All required tables exist');
    }

    // Check document_chunks embedding column type
    if (existingTables.includes('document_chunks')) {
      const embeddingCheck = await client.query(`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'document_chunks' 
        AND column_name = 'embedding'
      `);
      
      if (embeddingCheck.rows.length > 0) {
        const dataType = embeddingCheck.rows[0].data_type;
        if (dataType === 'USER-DEFINED') {
          console.log('\n✅ document_chunks.embedding is vector type');
        } else {
          console.log(`\n⚠️  document_chunks.embedding is ${dataType} (should be vector)`);
          console.log('💡 Run: npm run upgrade:vector to upgrade');
        }
      }
    }

    await client.end();
    console.log('\n✅ Diagnostic complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nCommon issues:');
    console.error('  1. Invalid SUPABASE_DB_URL connection string');
    console.error('  2. Network/firewall blocking connection');
    console.error('  3. Supabase project paused or deleted');
    console.error('  4. Incorrect credentials');
    await client.end();
    process.exit(1);
  }
}

checkSupabase();
