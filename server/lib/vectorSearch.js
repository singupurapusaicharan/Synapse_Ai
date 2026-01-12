// Vector search utilities for Supabase
// Performs similarity search using pgvector with hybrid retrieval support

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

/**
 * Extract person name from query (simple heuristic)
 * @param {string} query - User query
 * @returns {string|null} - Extracted name or null
 */
function extractPersonName(query) {
  // Patterns for name extraction
  const patterns = [
    /(?:from|by|sent by|emails? from|emails? by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z\.]+)*)/i,
    /(?:emails? )?(?:regarding|about|related to|concerning|re:)?.+?\b([A-Z][a-z]+(?:\s+[A-Z][a-z\.]+)*)(?:'s)?\s+(?:emails?|messages?|correspondence)/i,
    /(?:show|find|search for|get|list|display|see)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:recent\s+)?(?:emails?|messages?|correspondence)\s+(?:from|by|sent by|authored by|written by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z\.]+)*)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z\.]+)*)(?:'s)?\s+(?:emails?|messages?|correspondence)/i,
    /(?:emails?|messages?)\s+(?:from|by|sent by|authored by|written by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z\.]+)*)/i,
  ];

  // Common words to exclude
  const commonWords = new Set(['the', 'and', 'for', 'are', 'but', 'with', 'about', 'your', 'from', 'have', 'this', 'that']);

  // Try each pattern
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      
      // Clean up the name (remove any trailing punctuation or common words)
      name = name.replace(/[^\w\s]|_/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Check if the extracted name is valid
      const nameParts = name.split(' ').filter(part => part.length > 0);
      
      if (nameParts.length > 0) {
        // Filter out common words and check name validity
        const filteredParts = nameParts.filter(part => {
          const lowerPart = part.toLowerCase();
          return part.length > 1 && !commonWords.has(lowerPart) && !/^(mr|mrs|ms|dr|prof)\.?$/i.test(lowerPart);
        });
        
        if (filteredParts.length > 0) {
          const finalName = filteredParts.join(' ');
          console.log(`[Name Extraction] Extracted name: "${finalName}" from query: "${query}"`);
          return finalName;
        }
      }
    }
  }

  // If no name found with patterns, try to find a name-like pattern
  const nameLikePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z\.]+)+)\b/g;
  let nameMatch;
  while ((nameMatch = nameLikePattern.exec(query)) !== null) {
    const potentialName = nameMatch[1].trim();
    if (potentialName.split(' ').length >= 2 && !commonWords.has(potentialName.split(' ')[0].toLowerCase())) {
      console.log(`[Name Extraction] Found potential name: "${potentialName}" from query: "${query}"`);
      return potentialName;
    }
  }

  console.log(`[Name Extraction] No name found in query: "${query}"`);
  return null;
}

/**
 * Calculate additional relevance scores for a chunk
 */
function calculateRelevanceScores(chunk, { boostName = null, boostRecent = false }) {
  let score = 1.0;
  const boosts = [];
  
  // Boost for name matches in metadata
  if (boostName) {
    const nameLower = boostName.toLowerCase();
    const metadata = chunk.metadata || {};
    
    // Check name in various metadata fields
    const nameFields = ['fromName', 'author', 'sender', 'to', 'cc'];
    for (const field of nameFields) {
      const fieldValue = String(metadata[field] || '').toLowerCase();
      if (fieldValue.includes(nameLower)) {
        score *= 1.3; // Boost for name match
        boosts.push(`name:${field}`);
        break;
      }
    }
  }
  
  // Boost for recent content (exponential decay over 90 days)
  if (boostRecent) {
    const docDate = chunk.metadata?.date || chunk.metadata?.createdAt;
    if (docDate) {
      const docTime = new Date(docDate).getTime();
      if (!isNaN(docTime)) {
        const daysOld = (Date.now() - docTime) / (1000 * 60 * 60 * 24);
        // Boost decreases from 1.5x to 1.0x over 90 days
        const recencyBoost = 1.5 * Math.exp(-daysOld / 90);
        score *= recencyBoost;
        boosts.push('recent');
      }
    }
  }
  
  return { score, boosts };
}

/**
 * Search for top K most similar chunks with hybrid retrieval
 * @param {Object} params - Search parameters
 * @param {string} params.userId - User ID to filter results
 * @param {number[]} params.queryEmbedding - Query embedding vector (length 768)
 * @param {number} params.k - Number of results to return (default: 20)
 * @param {string} params.boostName - Optional name to boost relevance
 * @param {boolean} params.boostRecent - Whether to boost recent content
 * @param {number} params.minSimilarity - Minimum similarity threshold (0-1)
 * @returns {Promise<Array>}
 */
export async function searchTopK({ 
  userId, 
  queryEmbedding, 
  k = 20, 
  boostName = null,
  boostRecent = true, // Enabled by default for better recency
  minSimilarity = 0.25, // Slightly lower threshold to catch more potential matches
  sourceTypes = null, // Filter by source types (e.g., ['gmail', 'drive'])
  metadataFilters = [] // Array of {key, value, operator} filters
}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
    throw new Error('queryEmbedding must be an array of length 768');
  }

  if (!Number.isInteger(k) || k < 1 || k > 100) {
    throw new Error('k must be an integer between 1 and 100');
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

    // Convert embedding array to PostgreSQL vector format
    const vectorString = '[' + queryEmbedding.join(',') + ']';
    const userIdStr = userId.toString();

    // Enhanced query with better ranking and filtering
    const query = `
      WITH ranked_chunks AS (
        SELECT 
          id,
          chunk_text,
          title,
          url,
          source_type,
          source_item_id,
          chunk_index,
          metadata,
          created_at,
          embedding,
          -- Combine semantic similarity with recency boost
          (1 - (embedding <=> $1::vector)) * 
          CASE 
            WHEN $5 = true THEN 1.0 + (0.5 * EXP(-EXTRACT(EPOCH FROM (NOW() - created_at)) / (60 * 60 * 24 * 30)))
            ELSE 1.0 
          END as combined_score,
          1 - (embedding <=> $1::vector) as similarity
        FROM document_chunks
        WHERE user_id = $2
          AND embedding IS NOT NULL
          AND ($4::text IS NULL OR 
               metadata->>'fromName' ILIKE '%' || $4 || '%' OR
               metadata->>'subject' ILIKE '%' || $4 || '%' OR
               metadata->>'to' ILIKE '%' || $4 || '%' OR
               metadata->>'cc' ILIKE '%' || $4 || '%')
        ORDER BY combined_score DESC
        LIMIT $3 * 3  -- Get more results for better filtering
      )
      SELECT * FROM ranked_chunks
      WHERE similarity >= $6
      ORDER BY 
        -- Boost exact matches in from/to/subject fields
        CASE 
          WHEN metadata->>'fromName' ILIKE '%' || $4 || '%' THEN 1.3
          WHEN metadata->>'subject' ILIKE '%' || $4 || '%' THEN 1.2
          WHEN metadata->>'to' ILIKE '%' || $4 || '%' THEN 1.1
          ELSE 1.0 
        END * combined_score DESC
      LIMIT $3
    `;
    
    const params = [
      vectorString, // $1
      userIdStr,    // $2
      k,            // $3
      boostName,    // $4
      boostRecent,  // $5
      minSimilarity // $6
    ];

    const result = await client.query(query, params);
    
    // Process and score results
    const scoredResults = result.rows.map(row => {
      const chunk = {
        chunk_text: row.chunk_text,
        title: row.title,
        url: row.url,
        source_type: row.source_type,
        source_item_id: row.source_item_id,
        chunk_index: row.chunk_index,
        similarity: parseFloat(row.similarity),
        metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
        created_at: row.created_at
      };
      
      // Calculate additional relevance scores
      const { score: relevanceScore, boosts } = calculateRelevanceScores(chunk, {
        boostName,
        boostRecent
      });
      
      // Combine semantic similarity with relevance score
      const combinedScore = chunk.similarity * relevanceScore;
      
      return {
        ...chunk,
        _score: combinedScore,
        _boosts: boosts,
        _relevance: relevanceScore
      };
    });
    
    // Sort by combined score
    scoredResults.sort((a, b) => b._score - a._score);
    
    // Return top k results
    return scoredResults.slice(0, k).map(({ _score, _boosts, _relevance, ...chunk }) => ({
      ...chunk,
      similarity: _score, // Override similarity with combined score
      metadata: {
        ...chunk.metadata,
        _boosts,
        _relevance
      }
    }));
  } catch (error) {
    if (error.message.includes('relation "document_chunks" does not exist')) {
      throw new Error('document_chunks table does not exist. Run: npm run init:db');
    }
    if (error.message.includes('operator does not exist') && error.message.includes('<=>')) {
      throw new Error('pgvector extension not enabled or embedding column not vector type. Run: npm run init:db');
    }
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Search with additional filters
 * @param {Object} params - Search parameters
 * @param {string} params.userId - User ID
 * @param {number[]} params.queryEmbedding - Query embedding vector
 * @param {number} params.k - Number of results
 * @param {string[]} params.sourceTypes - Filter by source types (optional)
 * @param {number} params.minSimilarity - Minimum similarity threshold (0-1, optional)
 * @returns {Promise<Array>}
 */
export async function searchWithFilters({
  userId,
  queryEmbedding,
  k = 10,
  sourceTypes = null,
  minSimilarity = null,
}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
    throw new Error('queryEmbedding must be an array of length 768');
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

    const vectorString = '[' + queryEmbedding.join(',') + ']';

    let query = `
      SELECT 
        chunk_text,
        title,
        url,
        source_type,
        source_item_id,
        chunk_index,
        metadata,
        1 - (embedding <=> $1::vector) as similarity
      FROM document_chunks
      WHERE user_id = $2
        AND embedding IS NOT NULL
    `;

    const params = [vectorString, userId];
    let paramIndex = 3;

    // Add source type filter
    if (sourceTypes && Array.isArray(sourceTypes) && sourceTypes.length > 0) {
      query += ` AND source_type = ANY($${paramIndex})`;
      params.push(sourceTypes);
      paramIndex++;
    }

    query += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
    params.push(k);

    const result = await client.query(query, params);

    let results = result.rows.map(row => ({
      chunk_text: row.chunk_text,
      title: row.title,
      url: row.url,
      source_type: row.source_type,
      source_item_id: row.source_item_id,
      chunk_index: row.chunk_index,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    }));

    // Filter by minimum similarity if specified
    if (minSimilarity !== null && typeof minSimilarity === 'number') {
      results = results.filter(r => r.similarity >= minSimilarity);
    }

    return results;
  } catch (error) {
    if (error.message.includes('relation "document_chunks" does not exist')) {
      throw new Error('document_chunks table does not exist. Run: npm run init:db');
    }
    if (error.message.includes('operator does not exist') && error.message.includes('<=>')) {
      throw new Error('pgvector extension not enabled or embedding column not vector type. Run: npm run init:db');
    }
    throw error;
  } finally {
    await client.end();
  }
}

// Export extractPersonName for use in query route
export { extractPersonName };
