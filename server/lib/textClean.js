// Text cleaning utilities
// Strips HTML, normalizes whitespace, and cleans text for processing

/**
 * Strip HTML tags from text
 * @param {string} text - Text that may contain HTML
 * @returns {string} - Plain text without HTML tags
 */
function stripHtmlTags(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove HTML tags
  let cleaned = text.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  
  // Decode numeric entities (basic ones)
  cleaned = cleaned.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });
  
  return cleaned;
}

/**
 * Normalize whitespace - remove extra spaces, tabs, newlines
 * @param {string} text - Text with potentially messy whitespace
 * @returns {string} - Text with normalized whitespace
 */
function normalizeWhitespace(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Replace all types of whitespace (spaces, tabs, newlines) with single space
  let normalized = text.replace(/[\s\t\n\r]+/g, ' ');
  
  // Trim leading/trailing whitespace
  normalized = normalized.trim();
  
  return normalized;
}

/**
 * Normalize newlines - convert all newline types to single newline
 * @param {string} text - Text with mixed newline types
 * @returns {string} - Text with normalized newlines
 */
function normalizeNewlines(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Convert all newline types (\r\n, \r, \n) to single \n
  let normalized = text.replace(/\r\n/g, '\n');
  normalized = normalized.replace(/\r/g, '\n');
  
  // Remove multiple consecutive newlines (more than 2)
  normalized = normalized.replace(/\n{3,}/g, '\n\n');
  
  return normalized;
}

/**
 * Clean text: strip HTML, normalize whitespace and newlines
 * @param {string} text - Raw text to clean
 * @param {Object} options - Cleaning options
 * @param {boolean} options.stripHtml - Strip HTML tags (default: true)
 * @param {boolean} options.normalizeWhitespace - Normalize whitespace (default: true)
 * @param {boolean} options.normalizeNewlines - Normalize newlines (default: true)
 * @returns {string} - Cleaned text
 */
export function cleanText(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const {
    stripHtml: shouldStripHtml = true,
    normalizeWhitespace: shouldNormalizeWhitespace = true,
    normalizeNewlines: shouldNormalizeNewlines = true,
  } = options;

  let cleaned = text;

  if (shouldStripHtml) {
    cleaned = stripHtmlTags(cleaned);
  }

  if (shouldNormalizeNewlines) {
    cleaned = normalizeNewlines(cleaned);
  }

  if (shouldNormalizeWhitespace) {
    cleaned = normalizeWhitespace(cleaned);
  }

  return cleaned.trim();
}

/**
 * Count words in text
 * @param {string} text - Text to count words in
 * @returns {number} - Word count
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  
  const words = text.trim().split(/\s+/);
  return words.filter(word => word.length > 0).length;
}

// Export individual functions for advanced usage
export { stripHtmlTags, normalizeWhitespace, normalizeNewlines };
