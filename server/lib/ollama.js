// Ollama client utilities
// Handles embeddings and chat generation using Ollama API with auto-detection

const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

function normalizeModelName(name) {
  if (!name) return name;
  const trimmed = String(name).trim();
  if (!trimmed) return trimmed;
  // Ollama models are typically referenced with a tag, e.g. "phi:latest".
  // If user provided "phi" or "mistral", normalize to ":latest" to avoid "model not found".
  if (!trimmed.includes(':')) return `${trimmed}:latest`;
  return trimmed;
}

const CHAT_MODEL = normalizeModelName(process.env.OLLAMA_CHAT_MODEL || 'phi');
const CHAT_FALLBACK_MODEL = normalizeModelName(process.env.OLLAMA_CHAT_FALLBACK_MODEL || 'phi');
const EMBEDDING_TIMEOUT = 15000; // 15 seconds
const GENERATE_TIMEOUT = 45000; // 45 seconds (increased for better reliability)
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds

// Speed knobs (can be tuned via env)
const CHAT_MAX_PROMPT_CHARS = parseInt(process.env.OLLAMA_MAX_PROMPT_CHARS || '2200', 10);
const CHAT_NUM_PREDICT = parseInt(process.env.OLLAMA_NUM_PREDICT || '256', 10);
const CHAT_TEMPERATURE = process.env.OLLAMA_TEMPERATURE ? Number(process.env.OLLAMA_TEMPERATURE) : 0.2;

// Simple in-memory cache for embeddings with TTL
const embeddingCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Simple hash function for cache keys
function getCacheKey(text) {
  return text.length <= 100 ? text : 
    text.substring(0, 50) + text.length.toString(36) + text.slice(-50);
}

// Clean up old cache entries
function cleanupCache() {
  const now = Date.now();
  for (const [key, { timestamp }] of embeddingCache.entries()) {
    if (now - timestamp > CACHE_TTL) {
      embeddingCache.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupCache, 60000);

// Candidate URLs to try (in order)
const CANDIDATE_URLS = [
  process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  'http://localhost:11434',
  'http://127.0.0.1:11434',
  'http://[::1]:11434',
].filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates

// Cache for working base URL (detected once, reused)
let workingBaseUrl = null;
let lastHealthCheck = null;
const HEALTH_CHECK_CACHE_MS = 60000; // Cache health check for 1 minute

/**
 * Try to connect to a specific Ollama URL with retry logic
 * @param {string} baseUrl - Base URL to try
 * @param {number} retries - Number of retries (default: 3)
 * @param {number} backoffMs - Backoff delay in ms (default: 500)
 * @returns {Promise<{ok: boolean, models?: string[], error?: string}>}
 */
async function tryConnect(baseUrl, retries = 3, backoffMs = 500) {
  const url = `${baseUrl}/api/tags`;
  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const models = (data.models || []).map(m => m.name || m);
        return { ok: true, models };
      } else {
        lastError = `HTTP ${response.status} ${response.statusText}`;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        lastError = 'Timeout';
      } else if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        lastError = 'Connection refused';
      } else {
        lastError = error.message || 'Unknown error';
      }
    }

    // Wait before retry (except on last attempt)
    if (attempt < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, backoffMs * (attempt + 1)));
    }
  }

  return { ok: false, error: lastError };
}

/**
 * Auto-detect working Ollama URL
 * @returns {Promise<string>} Working base URL
 * @throws {Error} If no working URL found
 */
async function detectWorkingUrl() {
  const triedUrls = [];
  const errors = [];

  for (const url of CANDIDATE_URLS) {
    triedUrls.push(url);
    const result = await tryConnect(url);
    
    if (result.ok) {
      console.log(`[Ollama] ✅ Connected to: ${url}`);
      console.log(`[Ollama] Available models: ${result.models?.join(', ') || 'unknown'}`);
      return url;
    } else {
      errors.push(`${url}: ${result.error}`);
    }
  }

  // All URLs failed
  const errorMsg = `Ollama reachable check failed. Tried URLs:\n${triedUrls.map((url, i) => `  ${i + 1}. ${url} - ${errors[i]}`).join('\n')}\n\nSet OLLAMA_BASE_URL in .env to the correct URL.`;
  throw new Error(errorMsg);
}

/**
 * Check if Ollama is running and accessible
 * Uses cached result if available, otherwise auto-detects working URL
 * @throws {Error} If Ollama is not reachable
 */
export async function checkOllama() {
  // Use cached working URL if available and recent
  if (workingBaseUrl && lastHealthCheck && (Date.now() - lastHealthCheck < HEALTH_CHECK_CACHE_MS)) {
    // Quick verification
    const result = await tryConnect(workingBaseUrl, 1, 0);
    if (result.ok) {
      return true;
    }
    // Cache invalid, reset
    workingBaseUrl = null;
    lastHealthCheck = null;
  }

  // Auto-detect working URL
  workingBaseUrl = await detectWorkingUrl();
  lastHealthCheck = Date.now();

  console.log(`[Ollama] Health check passed. Using embedding model: ${EMBEDDING_MODEL}, chat model: ${CHAT_MODEL}`);
  return true;
}

/**
 * Get the working base URL (ensure it's detected first)
 * @returns {Promise<string>} Working base URL
 */
async function getWorkingBaseUrl() {
  if (!workingBaseUrl) {
    await checkOllama();
  }
  return workingBaseUrl;
}

// Track logged errors per messageId to avoid spam
const loggedErrors = new Set();

/**
 * Get embedding vector for text using Ollama
 * @param {string} text - Text to embed
 * @param {string} messageId - Optional message ID for logging
 * @param {number} chunkIndex - Optional chunk index for logging
 * @returns {Promise<number[]|null>} - Embedding vector (length 768) or null if failed
 */
export async function getEmbedding(text, messageId = null, chunkIndex = null) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }

  // Limit input length to prevent timeouts
  const maxLength = 8000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;

  try {
    // Check cache first
    const cacheKey = getCacheKey(truncatedText);
    const cached = embeddingCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return cached.embedding;
    }

    const baseUrl = await getWorkingBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT);

    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: truncatedText,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      const errorKey = messageId ? `embedding-${messageId}` : 'embedding';
      if (!loggedErrors.has(errorKey)) {
        if (messageId && chunkIndex !== null) {
          console.error(`[Ollama] Embedding failed for message ${messageId}, chunk ${chunkIndex}: ${response.status} ${response.statusText}`);
        } else {
          console.error(`[Ollama] Embedding failed: ${response.status} ${response.statusText}`);
        }
        loggedErrors.add(errorKey);
        // Clear after 5 minutes
        setTimeout(() => loggedErrors.delete(errorKey), 300000);
      }
      return null;
    }

    const data = await response.json();
    
    if (!data.embedding || !Array.isArray(data.embedding)) {
      const errorKey = messageId ? `embedding-${messageId}` : 'embedding';
      if (!loggedErrors.has(errorKey)) {
        if (messageId && chunkIndex !== null) {
          console.error(`[Ollama] Invalid embedding response for message ${messageId}, chunk ${chunkIndex}`);
        } else {
          console.error(`[Ollama] Invalid embedding response`);
        }
        loggedErrors.add(errorKey);
        setTimeout(() => loggedErrors.delete(errorKey), 300000);
      }
      return null;
    }

    const embedding = data.embedding;
    
    // Validate embedding dimensions (should be 768 for nomic-embed-text)
    if (embedding.length !== 768) {
      console.warn(`⚠️  Expected embedding dimension 768, got ${embedding.length}`);
      return null;
    }
    
    // Cache the result
    embeddingCache.set(cacheKey, {
      embedding,
      timestamp: Date.now()
    });

    return embedding;
  } catch (error) {
    const errorKey = messageId ? `embedding-${messageId}` : 'embedding';
    if (!loggedErrors.has(errorKey)) {
      if (error.name === 'AbortError') {
        if (messageId && chunkIndex !== null) {
          console.error(`[Ollama] Embedding timeout for message ${messageId}, chunk ${chunkIndex} (${EMBEDDING_TIMEOUT}ms)`);
        } else {
          console.error(`[Ollama] Embedding timeout (${EMBEDDING_TIMEOUT}ms)`);
        }
      } else {
        if (messageId && chunkIndex !== null) {
          console.error(`[Ollama] Embedding error for message ${messageId}, chunk ${chunkIndex}:`, error.message);
        } else {
          console.error(`[Ollama] Embedding error:`, error.message);
        }
      }
      loggedErrors.add(errorKey);
      setTimeout(() => loggedErrors.delete(errorKey), 300000);
    }
    return null;
  }
}

/**
 * Generate answer using Ollama chat API (faster than /api/generate for non-streaming)
 * @param {string} prompt - User prompt/question
 * @param {string} systemPrompt - Optional system prompt
 * @returns {Promise<string>} - Generated answer text
 */
export async function generateAnswer(prompt, systemPrompt = null) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt must be a non-empty string');
  }

  // Limit context length to keep generation fast (model time grows with prompt length)
  const maxContextLength = Number.isFinite(CHAT_MAX_PROMPT_CHARS) ? CHAT_MAX_PROMPT_CHARS : 2200;
  const truncatedPrompt = prompt.length > maxContextLength 
    ? prompt.substring(0, maxContextLength) + '\n\n[Context truncated for performance]'
    : prompt;

  try {
    const baseUrl = await getWorkingBaseUrl();
    let model = CHAT_MODEL;
    let response;
    let primaryError = null;
    let useFallback = false;

    // Try primary model first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GENERATE_TIMEOUT);

      const messages = [];
      if (systemPrompt) {
        messages.push({
          role: 'system',
          content: systemPrompt,
        });
      }
      messages.push({
        role: 'user',
        content: truncatedPrompt,
      });

      console.log(`[Ollama] Calling /api/chat with model: ${model}, prompt length: ${truncatedPrompt.length} chars`);
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: false,
          options: {
            num_predict: Number.isFinite(CHAT_NUM_PREDICT) ? CHAT_NUM_PREDICT : 256,
            temperature: Number.isFinite(CHAT_TEMPERATURE) ? CHAT_TEMPERATURE : 0.2,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Success with primary model
      const data = await response.json();
      if (!data.message || typeof data.message.content !== 'string') {
        console.error('[Ollama] Invalid response format:', JSON.stringify(data).substring(0, 200));
        throw new Error('Invalid response format: message content not found');
      }

      const answer = data.message.content.trim();
      console.log(`[Ollama] Generated answer with ${model} (${answer.length} chars)`);
      return answer;
    } catch (error) {
      primaryError = error;
      
      // Determine if we should try fallback
      const isTimeout = error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('timed out');
      const isModelNotFound = error.message.includes('model') || error.message.includes('not found');
      
      // Use fallback if: timeout occurred OR model not found (and fallback is different)
      if (CHAT_FALLBACK_MODEL !== CHAT_MODEL && (isTimeout || isModelNotFound)) {
        useFallback = true;
        if (isTimeout) {
          console.warn(`⚠️  Primary model ${CHAT_MODEL} timed out, trying fallback ${CHAT_FALLBACK_MODEL}`);
        } else {
          console.warn(`⚠️  Primary model ${CHAT_MODEL} not found, trying fallback ${CHAT_FALLBACK_MODEL}`);
        }
      } else {
        // No fallback available or error doesn't warrant fallback
        throw error;
      }
    }

    // Try fallback model if primary failed
    if (useFallback) {
      model = CHAT_FALLBACK_MODEL;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GENERATE_TIMEOUT);

        const messages = [];
        if (systemPrompt) {
          messages.push({
            role: 'system',
            content: systemPrompt,
          });
        }
        messages.push({
          role: 'user',
          content: truncatedPrompt,
        });

        console.log(`[Ollama] Calling /api/chat with fallback model: ${model}, prompt length: ${truncatedPrompt.length} chars`);
        response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            stream: false,
            options: {
              num_predict: Number.isFinite(CHAT_NUM_PREDICT) ? CHAT_NUM_PREDICT : 256,
              temperature: Number.isFinite(CHAT_TEMPERATURE) ? CHAT_TEMPERATURE : 0.2,
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ollama API error (fallback): ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        if (!data.message || typeof data.message.content !== 'string') {
          console.error('[Ollama] Invalid response format (fallback):', JSON.stringify(data).substring(0, 200));
          throw new Error('Invalid response format: message content not found');
        }

        const answer = data.message.content.trim();
        console.log(`[Ollama] Generated answer with fallback ${model} (${answer.length} chars)`);
        return answer;
      } catch (fallbackError) {
        // Both models failed - return clean error message
        console.error(`[Ollama] Both primary (${CHAT_MODEL}) and fallback (${CHAT_FALLBACK_MODEL}) models failed`);
        throw new Error('I couldn\'t generate an answer from your emails right now. Please try again.');
      }
    }
  } catch (error) {
    // Clean up error messages for user-facing display
    if (error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('timed out')) {
      throw new Error('Request timed out. Please try again with a shorter question.');
    }
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      throw new Error('Cannot connect to Ollama. Please ensure Ollama is running.');
    }
    // Re-throw with cleaned message
    throw error;
  }
}

/**
 * Check if Ollama is available (legacy function, use checkOllama() instead)
 * @returns {Promise<boolean>}
 */
export async function checkOllamaHealth() {
  try {
    await checkOllama();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get debug info about Ollama connection
 * @returns {Promise<{ok: boolean, workingBaseUrl?: string, models?: string[], error?: string}>}
 */
export async function getOllamaDebugInfo() {
  try {
    const baseUrl = await getWorkingBaseUrl();
    const result = await tryConnect(baseUrl, 1, 0);
    if (result.ok) {
      return {
        ok: true,
        workingBaseUrl: baseUrl,
        models: result.models || [],
      };
    } else {
      return {
        ok: false,
        error: result.error || 'Connection failed',
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error.message || 'Ollama not reachable',
    };
  }
}
