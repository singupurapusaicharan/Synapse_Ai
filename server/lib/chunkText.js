// Text chunking utilities
// Splits text into smaller searchable pieces with overlap

import { cleanText, countWords } from './textClean.js';

/**
 * Split text into chunks with overlap
 * @param {string} text - Text to chunk
 * @param {Object} options - Chunking options
 * @param {number} options.targetWords - Target words per chunk (default: 400)
 * @param {number} options.minWords - Minimum words per chunk (default: 300)
 * @param {number} options.maxWords - Maximum words per chunk (default: 500)
 * @param {number} options.overlapWords - Overlap words between chunks (default: 50)
 * @param {boolean} options.cleanText - Clean text before chunking (default: true)
 * @returns {Array<{chunkIndex: number, text: string}>} - Array of chunks
 */
export function chunkText(text, options = {}) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }

  const {
    targetWords = 400,
    minWords = 300,
    maxWords = 500,
    overlapWords = 50,
    cleanText: shouldClean = true,
  } = options;

  // Clean text if requested
  let processedText = shouldClean ? cleanText(text) : text.trim();
  
  if (processedText.length === 0) {
    return [];
  }

  // Split into sentences (basic sentence splitting)
  // Look for sentence endings: . ! ? followed by space or newline
  const sentences = processedText.split(/([.!?]\s+)/).filter(s => s.trim().length > 0);
  
  // Reconstruct sentences (rejoin with their punctuation)
  const sentenceList = [];
  for (let i = 0; i < sentences.length; i += 2) {
    if (i + 1 < sentences.length) {
      sentenceList.push(sentences[i] + sentences[i + 1]);
    } else {
      sentenceList.push(sentences[i]);
    }
  }

  if (sentenceList.length === 0) {
    // Fallback: split by paragraphs or large whitespace
    const paragraphs = processedText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    if (paragraphs.length === 0) {
      // Last resort: return entire text as single chunk
      return [{ chunkIndex: 0, text: processedText }];
    }
    sentenceList.push(...paragraphs);
  }

  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;
  let chunkIndex = 0;

  for (let i = 0; i < sentenceList.length; i++) {
    const sentence = sentenceList[i];
    const sentenceWordCount = countWords(sentence);

    // If adding this sentence would exceed maxWords, finalize current chunk
    if (currentWordCount + sentenceWordCount > maxWords && currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ').trim();
      if (countWords(chunkText) >= minWords) {
        chunks.push({
          chunkIndex: chunkIndex++,
          text: chunkText,
        });

        // Start new chunk with overlap
        // Take last few sentences for overlap
        const overlapSentences = [];
        let overlapCount = 0;
        for (let j = currentChunk.length - 1; j >= 0 && overlapCount < overlapWords; j--) {
          const sent = currentChunk[j];
          const sentWords = countWords(sent);
          if (overlapCount + sentWords <= overlapWords) {
            overlapSentences.unshift(sent);
            overlapCount += sentWords;
          } else {
            break;
          }
        }
        currentChunk = overlapSentences;
        currentWordCount = overlapCount;
      } else {
        // Chunk too small, keep building
        currentChunk.push(sentence);
        currentWordCount += sentenceWordCount;
      }
    } else {
      currentChunk.push(sentence);
      currentWordCount += sentenceWordCount;
    }

    // If we've reached target words, consider finalizing chunk
    if (currentWordCount >= targetWords && currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ').trim();
      if (countWords(chunkText) >= minWords) {
        chunks.push({
          chunkIndex: chunkIndex++,
          text: chunkText,
        });

        // Start new chunk with overlap
        const overlapSentences = [];
        let overlapCount = 0;
        for (let j = currentChunk.length - 1; j >= 0 && overlapCount < overlapWords; j--) {
          const sent = currentChunk[j];
          const sentWords = countWords(sent);
          if (overlapCount + sentWords <= overlapWords) {
            overlapSentences.unshift(sent);
            overlapCount += sentWords;
          } else {
            break;
          }
        }
        currentChunk = overlapSentences;
        currentWordCount = overlapCount;
      }
    }
  }

  // Add remaining text as final chunk if it meets minimum word count
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join(' ').trim();
    const wordCount = countWords(chunkText);
    if (wordCount >= minWords || chunks.length === 0) {
      chunks.push({
        chunkIndex: chunkIndex,
        text: chunkText,
      });
    } else if (chunks.length > 0) {
      // Merge small final chunk with previous chunk
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.text = lastChunk.text + ' ' + chunkText;
    }
  }

  return chunks;
}

/**
 * Test function for chunking (can be run as standalone script)
 */
export function testChunking() {
  const sampleText = `
    This is a sample document that we want to chunk into smaller pieces.
    Each chunk should be around 300-500 words with some overlap between chunks.
    This helps maintain context when searching through documents.
    
    The chunking algorithm splits text by sentences and tries to create chunks
    that are roughly the target size. When a chunk gets too large, it finalizes
    that chunk and starts a new one with some overlap from the previous chunk.
    
    This overlap is important because it ensures that information at chunk boundaries
    isn't lost. For example, if a sentence spans two chunks, the overlap ensures
    that context is preserved in both chunks.
    
    The algorithm also handles edge cases like very short documents, very long
    sentences, and documents with unusual formatting. It cleans the text first
    to remove HTML and normalize whitespace, then splits it intelligently.
  `.repeat(5); // Make it longer for testing

  console.log('Testing text chunking...\n');
  console.log(`Original text length: ${sampleText.length} characters`);
  console.log(`Original word count: ${countWords(sampleText)}\n`);

  const chunks = chunkText(sampleText, {
    targetWords: 400,
    minWords: 300,
    maxWords: 500,
    overlapWords: 50,
  });

  console.log(`Generated ${chunks.length} chunks:\n`);
  chunks.forEach((chunk, index) => {
    const wordCount = countWords(chunk.text);
    console.log(`Chunk ${chunk.chunkIndex}: ${wordCount} words`);
    console.log(`Preview: ${chunk.text.substring(0, 100)}...\n`);
  });

  return chunks;
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testChunking();
}
