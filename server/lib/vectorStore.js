// Vector storage utilities for Supabase
// Handles upserting document chunks with embeddings

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

/**
 * Upsert document chunks with embeddings into Supabase
 * @param {Object} params - Parameters
 * @param {string} params.userId - User ID
 * @param {string} params.sourceType - Source type ('gmail', 'drive', 'slack', 'notion', 'other')
 * @param {string} params.sourceItemId - Source item ID (messageId, fileId, etc.)
 * @param {string} params.title - Document title
 * @param {string} params.url - Document URL (optional)
 * @param {Array<{chunkIndex: number, text: string}>} params.chunks - Chunk data
 * @param {Array<number[]>} params.embeddings - Embedding vectors (must match chunks length)
 * @param {Object} params.metadata - Additional metadata (optional)
 * @returns {Promise<void>}
 */
export async function upsertChunks({
  userId,
  sourceType,
  sourceItemId,
  title,
  url,
  chunks,
  embeddings,
  metadata,
}) {
  // Validate inputs
  if (!userId || !sourceType || !sourceItemId) {
    throw new Error('userId, sourceType, and sourceItemId are required');
  }

  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('chunks must be a non-empty array');
  }

  if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
    throw new Error('embeddings must be a non-empty array');
  }

  if (chunks.length !== embeddings.length) {
    throw new Error(`chunks (${chunks.length}) and embeddings (${embeddings.length}) must have the same length`);
  }

  // Validate embeddings are 768-dimensional
  for (let i = 0; i < embeddings.length; i++) {
    if (!Array.isArray(embeddings[i]) || embeddings[i].length !== 768) {
      throw new Error(`Embedding at index ${i} must be an array of length 768, got ${embeddings[i]?.length || 'undefined'}`);
    }
  }

  if (!SUPABASE_DB_URL) {
    throw new Error('SUPABASE_DB_URL is required. Please set it in .env file');
  }

  const client = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();

    // Start transaction
    await client.query('BEGIN');

    try {
      // Convert userId to string (document_chunks.user_id is TEXT, but users.id is UUID)
      const userIdStr = userId.toString();

      // Delete existing chunks for this user, source type, and source item
      await client.query(
        `DELETE FROM document_chunks 
         WHERE user_id = $1 AND source_type = $2 AND source_item_id = $3`,
        [userIdStr, sourceType, sourceItemId]
      );

      // Insert new chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        // Convert embedding array to PostgreSQL vector format: '[0.1,0.2,...]'
        const vectorString = '[' + embedding.join(',') + ']';

        await client.query(
          `INSERT INTO document_chunks 
           (user_id, source_type, source_item_id, title, url, chunk_index, chunk_text, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9)`,
          [
            userIdStr, // Use string version
            sourceType,
            sourceItemId,
            title || null,
            url || null,
            chunk.chunkIndex,
            chunk.text,
            vectorString,
            metadata ? JSON.stringify(metadata) : null,
          ]
        );
      }

      // Commit transaction
      await client.query('COMMIT');
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error.message.includes('relation "document_chunks" does not exist')) {
      throw new Error('document_chunks table does not exist. Run: npm run init:db');
    }
    if (error.message.includes('column "embedding" is of type vector')) {
      throw new Error('Embedding column type mismatch. Ensure pgvector extension is enabled.');
    }
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Upsert document chunks where embeddings are optional per chunk.
 * This allows ingestion to succeed even when the embedding provider (Ollama) is unavailable.
 *
 * - If an embedding is null/undefined, we store NULL in the `embedding` column.
 * - If embeddings are provided, they must match chunks length.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.sourceType
 * @param {string} params.sourceItemId
 * @param {string} params.title
 * @param {string} params.url
 * @param {Array<{chunkIndex: number, text: string}>} params.chunks
 * @param {Array<number[] | null> | null} params.embeddings
 * @param {Object} params.metadata
 */
export async function upsertChunksFlexible({
  userId,
  sourceType,
  sourceItemId,
  title,
  url,
  chunks,
  embeddings = null,
  metadata,
}) {
  if (!userId || !sourceType || !sourceItemId) {
    throw new Error('userId, sourceType, and sourceItemId are required');
  }
  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('chunks must be a non-empty array');
  }

  let resolvedEmbeddings = null;
  if (embeddings == null) {
    resolvedEmbeddings = new Array(chunks.length).fill(null);
  } else {
    if (!Array.isArray(embeddings)) {
      throw new Error('embeddings must be an array when provided');
    }
    if (embeddings.length !== chunks.length) {
      throw new Error(`chunks (${chunks.length}) and embeddings (${embeddings.length}) must have the same length`);
    }
    resolvedEmbeddings = embeddings;
  }

  // Validate any non-null embeddings are 768-dimensional
  for (let i = 0; i < resolvedEmbeddings.length; i++) {
    const emb = resolvedEmbeddings[i];
    if (emb == null) continue;
    if (!Array.isArray(emb) || emb.length !== 768) {
      throw new Error(`Embedding at index ${i} must be an array of length 768 (or null), got ${emb?.length || 'undefined'}`);
    }
  }

  if (!SUPABASE_DB_URL) {
    throw new Error('SUPABASE_DB_URL is required. Please set it in .env file');
  }

  const client = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    await client.query('BEGIN');

    try {
      const userIdStr = userId.toString();

      await client.query(
        `DELETE FROM document_chunks
         WHERE user_id = $1 AND source_type = $2 AND source_item_id = $3`,
        [userIdStr, sourceType, sourceItemId]
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = resolvedEmbeddings[i];
        const vectorString = embedding ? '[' + embedding.join(',') + ']' : null;

        await client.query(
          `INSERT INTO document_chunks
           (user_id, source_type, source_item_id, title, url, chunk_index, chunk_text, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9)`,
          [
            userIdStr,
            sourceType,
            sourceItemId,
            title || null,
            url || null,
            chunk.chunkIndex,
            chunk.text,
            vectorString,
            metadata ? JSON.stringify(metadata) : null,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error.message.includes('relation "document_chunks" does not exist')) {
      throw new Error('document_chunks table does not exist. Run: npm run init:db');
    }
    if (error.message.includes('column "embedding" is of type vector')) {
      throw new Error('Embedding column type mismatch. Ensure pgvector extension is enabled.');
    }
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Delete chunks for a specific source item
 * @param {string} userId - User ID
 * @param {string} sourceType - Source type
 * @param {string} sourceItemId - Source item ID
 * @returns {Promise<void>}
 */
export async function deleteChunks(userId, sourceType, sourceItemId) {
  if (!userId || !sourceType || !sourceItemId) {
    throw new Error('userId, sourceType, and sourceItemId are required');
  }

  if (!SUPABASE_DB_URL) {
    throw new Error('SUPABASE_DB_URL is required. Please set it in .env file');
  }

  const client = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    await client.query(
      `DELETE FROM document_chunks 
       WHERE user_id = $1 AND source_type = $2 AND source_item_id = $3`,
      [userId, sourceType, sourceItemId]
    );
  } finally {
    await client.end();
  }
}
