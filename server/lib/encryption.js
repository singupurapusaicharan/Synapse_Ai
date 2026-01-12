// Encryption utilities for OAuth tokens
// Uses AES-256-GCM encryption

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

if (!ENCRYPTION_KEY) {
  console.warn('⚠️  ENCRYPTION_KEY not set. OAuth tokens will not be encrypted!');
}

/**
 * Encrypt data using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted data (base64 encoded: iv:authTag:encrypted)
 */
export function encrypt(text) {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is required for encryption');
  }

  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }

  // Derive key from ENCRYPTION_KEY (must be 32 bytes for AES-256)
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  
  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // Get auth tag
  const authTag = cipher.getAuthTag();
  
  // Return format: iv:authTag:encrypted (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedData - Encrypted data (format: iv:authTag:encrypted)
 * @returns {string} - Decrypted plain text
 */
export function decrypt(encryptedData) {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is required for decryption');
  }

  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Encrypted data must be a non-empty string');
  }

  // Parse format: iv:authTag:encrypted
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivBase64, authTagBase64, encrypted] = parts;
  
  // Derive key
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  
  // Decode IV and auth tag
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
