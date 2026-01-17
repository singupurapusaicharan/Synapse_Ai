// Hugging Face Inference API for embeddings (FREE)
// No installation needed, just API calls

const HF_API_URL = 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY || ''; // Optional, works without token but with rate limits

/**
 * Get embedding from Hugging Face (FREE)
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector (384 dimensions)
 */
export async function getHuggingFaceEmbedding(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  // Truncate text to 512 tokens (model limit)
  const truncated = text.slice(0, 2000);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const headers = {
      'Content-Type': 'application/json',
    };

    // Add token if available (increases rate limit)
    if (HF_TOKEN) {
      headers['Authorization'] = `Bearer ${HF_TOKEN}`;
    }

    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: truncated }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hugging Face API error: ${response.status} - ${error}`);
    }

    const embedding = await response.json();

    // Hugging Face returns array directly
    if (Array.isArray(embedding) && embedding.length === 384) {
      return embedding;
    }

    throw new Error('Invalid embedding format from Hugging Face');
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Hugging Face API timeout');
    }
    throw error;
  }
}

/**
 * Check if Hugging Face API is available
 * @returns {Promise<boolean>}
 */
export async function checkHuggingFace() {
  try {
    const testEmbedding = await getHuggingFaceEmbedding('test');
    return testEmbedding && testEmbedding.length === 384;
  } catch (error) {
    console.error('[Hugging Face] Health check failed:', error.message);
    return false;
  }
}
