// Migration: Make password_hash nullable for Google OAuth users
// This script alters the users table to allow NULL password_hash
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_DB_URL) {
  console.error('❌ SUPABASE_DB_URL not set!');
  process.exit(1);
}

async function migrate() {
  const client = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    console.log('📋 Altering users table to make password_hash nullable...');
    
    await client.query(`
      ALTER TABLE users 
      ALTER COLUMN password_hash DROP NOT NULL;
    `);

    console.log('✅ Migration complete! password_hash is now nullable');
    console.log('💡 Google OAuth users can now be created without a password');

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (client) {
      await client.end().catch(() => {});
    }
    process.exit(1);
  }
}

migrate();

