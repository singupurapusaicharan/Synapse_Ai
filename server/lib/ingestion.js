// Gmail and Drive ingestion functions
import { getAuthenticatedClients } from './googleOAuthReal.js';
import { cleanText } from './textClean.js';
import { chunkText } from './chunkText.js';
import { getEmbedding, checkOllama } from './ollama.js';
import { upsertChunksFlexible } from './vectorStore.js';
import pool from '../config/database.js';

/**
 * Ingest Google Drive files
 * @param {string} userId - User ID (UUID)
 * @returns {Promise<{processed: number, skipped: number}>}
 */
export async function ingestDrive(userId) {
  try {
    // Check Ollama before starting ingestion
    console.log(`[Drive Ingestion] Starting ingestion for user ${userId}`);
    console.log(`[Drive Ingestion] Checking Ollama connection...`);
    let embeddingsEnabled = true;
    try {
      await checkOllama();
      console.log(`[Drive Ingestion] Ollama is reachable, proceeding with ingestion`);
    } catch (error) {
      embeddingsEnabled = false;
      console.warn(`[Drive Ingestion] Ollama check failed (continuing without embeddings):`, error.message);
    }

    const { drive } = await getAuthenticatedClients(userId);

    // Incremental-ish sync:
    // - If we've synced before, use last_synced_at as a lower bound
    // - Otherwise, pull a wider window to avoid missing older docs
    let dateFilter = null;
    try {
      const lastSync = await pool.query(
        `SELECT last_synced_at FROM sources WHERE user_id = $1 AND source_type = 'drive'`,
        [userId]
      );
      const lastSyncedAt = lastSync.rows?.[0]?.last_synced_at || null;
      const since = lastSyncedAt ? new Date(lastSyncedAt) : null;
      const fallbackDays = 180;
      const sinceDate = since && !isNaN(since.getTime())
        ? since
        : new Date(Date.now() - fallbackDays * 24 * 60 * 60 * 1000);
      dateFilter = sinceDate.toISOString().split('T')[0];
    } catch (e) {
      // Safe fallback
      const fallbackDays = 180;
      dateFilter = new Date(Date.now() - fallbackDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    console.log(`[Drive Ingestion] Fetching Drive files since ${dateFilter}...`);
    const files = [];
    let pageToken = undefined;
    const maxFiles = 200;
    do {
      const response = await drive.files.list({
        pageSize: 100,
        pageToken,
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime)',
        orderBy: 'modifiedTime desc',
        q: `trashed=false and modifiedTime >= '${dateFilter}' and (mimeType='application/vnd.google-apps.document' or mimeType='text/plain' or mimeType='application/pdf')`,
      });
      files.push(...(response.data.files || []));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken && files.length < maxFiles);

    if (files.length > maxFiles) files.length = maxFiles;
    console.log(`[Drive Ingestion] Fetched ${files.length} Drive files`);
    
    let processed = 0;
    let skipped = 0;
    let totalChunksCreated = 0;
    let totalChunksEmbedded = 0;
    let totalChunksInserted = 0;
    const warnings = [];
    if (!embeddingsEnabled) {
      warnings.push('Embeddings unavailable (Ollama not reachable). Stored content without embeddings; keyword search will still work.');
    }

    for (const file of files) {
      try {
        let textContent = '';

        // Handle Google Docs (export to text)
        if (file.mimeType === 'application/vnd.google-apps.document') {
          const exportResponse = await drive.files.export({
            fileId: file.id,
            mimeType: 'text/plain',
          });
          textContent = exportResponse.data;
        } else if (file.mimeType === 'text/plain' || file.mimeType === 'application/pdf') {
          // Download file content
          try {
            const fileResponse = await drive.files.get(
              { fileId: file.id, alt: 'media' },
              { responseType: 'text' }
            );
            textContent = fileResponse.data;
          } catch (error) {
            console.error(`Error downloading file ${file.id}:`, error);
            skipped++;
            continue;
          }
        } else {
          skipped++;
          continue;
        }

        if (!textContent || textContent.trim().length === 0) {
          skipped++;
          continue;
        }

        // Clean and chunk (300-500 words with ~50 word overlap)
        const cleaned = cleanText(textContent);
        const chunks = chunkText(cleaned, {
          targetWords: 400,
          minWords: 300,
          maxWords: 500,
          overlapWords: 50,
        });

        if (chunks.length === 0) {
          skipped++;
          continue;
        }

        totalChunksCreated += chunks.length;

        // Generate embeddings (best-effort). If unavailable, store NULL embeddings.
        const embeddings = new Array(chunks.length).fill(null);
        if (embeddingsEnabled) {
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const embedding = await getEmbedding(chunk.text, file.id, chunk.chunkIndex);
            if (embedding && Array.isArray(embedding) && embedding.length === 768) {
              embeddings[i] = embedding;
              totalChunksEmbedded++;
            }
          }
        }

        // Store all chunks (user_id must be UUID)
        console.log(`[Drive Ingestion] BEFORE insertion: File ${file.id} - ${chunks.length} chunks (embedded: ${embeddings.filter(Boolean).length})`);
        await upsertChunksFlexible({
          userId: userId, // UUID
          sourceType: 'drive',
          sourceItemId: file.id,
          title: file.name,
          url: file.webViewLink,
          chunks,
          embeddings,
          metadata: {
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime,
          },
        });
        console.log(`[Drive Ingestion] AFTER insertion: File ${file.id} - Inserted ${chunks.length} chunks into document_chunks table`);
        
        totalChunksInserted += chunks.length;
        processed++;
      } catch (error) {
        console.error(`Error processing file ${file.id}:`, error);
        skipped++;
      }
    }

    // Update sources.last_synced_at (not updated_at)
    await pool.query(
      `UPDATE sources 
       SET last_synced_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND source_type = 'drive'`,
      [userId]
    );

    console.log(`[Drive Ingestion] Ingestion completed for user ${userId}:`);
    console.log(`[Drive Ingestion]   - Files fetched: ${files.length}`);
    console.log(`[Drive Ingestion]   - Files processed: ${processed}`);
    console.log(`[Drive Ingestion]   - Files skipped: ${skipped}`);
    console.log(`[Drive Ingestion]   - Total chunks created: ${totalChunksCreated}`);
    console.log(`[Drive Ingestion]   - Chunks successfully embedded: ${totalChunksEmbedded}`);
    console.log(`[Drive Ingestion]   - Chunks inserted into DB: ${totalChunksInserted}`);

    return { processed, skipped, embedded: totalChunksEmbedded, inserted: totalChunksInserted, warnings, since: dateFilter };
  } catch (error) {
    console.error(`[Drive Ingestion] Error during ingestion for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Ingest Gmail messages
 * @param {string} userId - User ID (UUID)
 * @returns {Promise<{processed: number, skipped: number}>}
 */
export async function ingestGmail(userId) {
  try {
    // Check Ollama before starting ingestion
    console.log(`[Gmail Ingestion] Starting ingestion for user ${userId}`);
    console.log(`[Gmail Ingestion] Checking Ollama connection...`);
    let embeddingsEnabled = true;
    try {
      await checkOllama();
      console.log(`[Gmail Ingestion] Ollama is reachable, proceeding with ingestion`);
    } catch (error) {
      embeddingsEnabled = false;
      console.warn(`[Gmail Ingestion] Ollama check failed (continuing without embeddings):`, error.message);
    }

    const { gmail } = await getAuthenticatedClients(userId);

    // Get account email for precise Gmail deep links
    let ownerEmail = null;
    try {
      const profileRes = await gmail.users.getProfile({ userId: 'me' });
      ownerEmail = profileRes.data?.emailAddress || null;
      if (ownerEmail) {
        console.log(`[Gmail Ingestion] Using owner email for links: ${ownerEmail}`);
      }
    } catch (e) {
      console.warn('[Gmail Ingestion] Failed to fetch Gmail profile email for deep links:', e.message);
    }

    // Incremental-ish sync:
    // - If we've synced before, use last_synced_at as a lower bound
    // - Otherwise, pull a wider window to avoid missing older inbox emails
    let dateFilter = null;
    try {
      const lastSync = await pool.query(
        `SELECT last_synced_at FROM sources WHERE user_id = $1 AND source_type = 'gmail'`,
        [userId]
      );
      const lastSyncedAt = lastSync.rows?.[0]?.last_synced_at || null;
      const since = lastSyncedAt ? new Date(lastSyncedAt) : null;
      const fallbackDays = 180;
      const sinceDate = since && !isNaN(since.getTime())
        ? since
        : new Date(Date.now() - fallbackDays * 24 * 60 * 60 * 1000);
      dateFilter = sinceDate.toISOString().split('T')[0].replace(/-/g, '/');
    } catch (e) {
      const fallbackDays = 180;
      dateFilter = new Date(Date.now() - fallbackDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, '/');
    }

    console.log(`[Gmail Ingestion] Fetching Gmail messages since ${dateFilter}...`);
    const messages = [];
    let pageToken = undefined;
    const maxMessages = 500;
    do {
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 200,
        pageToken,
        q: `in:inbox after:${dateFilter}`,
      });
      messages.push(...(response.data.messages || []));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken && messages.length < maxMessages);

    if (messages.length > maxMessages) messages.length = maxMessages;
    console.log(`[Gmail Ingestion] Fetched ${messages.length} Gmail messages`);
    
    let processed = 0;
    let skipped = 0;
    let totalChunksCreated = 0;
    let totalChunksEmbedded = 0;
    let totalChunksInserted = 0;
    const warnings = [];
    if (!embeddingsEnabled) {
      warnings.push('Embeddings unavailable (Ollama not reachable). Stored emails without embeddings; keyword search will still work.');
    }

    for (const message of messages) {
      try {
        // Get full message
        const msgResponse = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full',
        });

        const msg = msgResponse.data;
        const headers = msg.payload.headers;

        // Extract metadata
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const fromHeader = headers.find(h => h.name === 'From')?.value || 'Unknown';
        const dateHeader = headers.find(h => h.name === 'Date')?.value || '';
        
        // Parse From header to extract name and email
        // Format: "Name <email@domain.com>" or "email@domain.com"
        let fromName = '';
        let fromEmail = '';
        if (fromHeader) {
          const emailMatch = fromHeader.match(/<([^>]+)>/);
          if (emailMatch) {
            fromEmail = emailMatch[1];
            fromName = fromHeader.replace(/<[^>]+>/, '').trim().replace(/"/g, '');
          } else {
            // No angle brackets, might be just email
            if (fromHeader.includes('@')) {
              fromEmail = fromHeader.trim();
              fromName = '';
            } else {
              fromName = fromHeader.trim();
            }
          }
        }
        
        // Parse date to ISO format
        let dateISO = '';
        if (dateHeader) {
          try {
            const dateObj = new Date(dateHeader);
            if (!isNaN(dateObj.getTime())) {
              dateISO = dateObj.toISOString();
            }
          } catch (e) {
            // Keep original date string if parsing fails
            dateISO = dateHeader;
          }
        }

        // Extract body text
        let bodyText = '';
        
        const extractText = (part) => {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
          if (part.mimeType === 'text/html' && part.body?.data) {
            const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
            return cleanText(html); // Strip HTML
          }
          if (part.parts) {
            for (const subPart of part.parts) {
              const text = extractText(subPart);
              if (text) return text;
            }
          }
          return '';
        };

        bodyText = extractText(msg.payload);

        if (!bodyText || bodyText.trim().length === 0) {
          skipped++;
          continue;
        }

        // Build full text with metadata (keep original format for chunking)
        const fullText = `Subject: ${subject}\nFrom: ${fromHeader}\nDate: ${dateHeader}\n\n${bodyText}`;

        // Clean and chunk (300-500 words with ~50 word overlap)
        const cleaned = cleanText(fullText);
        const chunks = chunkText(cleaned, {
          targetWords: 400,
          minWords: 300,
          maxWords: 500,
          overlapWords: 50,
        });

        if (chunks.length === 0) {
          skipped++;
          continue;
        }

        totalChunksCreated += chunks.length;

        // Generate embeddings (best-effort). If unavailable, store NULL embeddings.
        const embeddings = new Array(chunks.length).fill(null);
        if (embeddingsEnabled) {
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const embedding = await getEmbedding(chunk.text, message.id, chunk.chunkIndex);
            if (embedding && Array.isArray(embedding) && embedding.length === 768) {
              embeddings[i] = embedding;
              totalChunksEmbedded++;
            }
          }
        }

        // Store all chunks (user_id must be UUID)
        console.log(`[Gmail Ingestion] BEFORE insertion: Message ${message.id} - ${chunks.length} chunks (embedded: ${embeddings.filter(Boolean).length})`);
        
        // Build Gmail URL - prioritize thread ID (opens email directly), fallback to search
        let gmailUrl;
        if (msg.threadId && ownerEmail) {
          // Use thread ID with account email - opens the email directly
          gmailUrl = `https://mail.google.com/mail/?authuser=${encodeURIComponent(ownerEmail)}#all/${msg.threadId}`;
        } else if (msg.threadId) {
          // Use thread ID without account email
          gmailUrl = `https://mail.google.com/mail/u/0/#all/${msg.threadId}`;
        } else if (subject && ownerEmail) {
          // Fallback: subject search with account email
          gmailUrl = `https://mail.google.com/mail/?authuser=${encodeURIComponent(ownerEmail)}#search/${encodeURIComponent('"' + subject + '"')}`;
        } else if (subject) {
          // Fallback: subject search without account email
          gmailUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent('"' + subject + '"')}`;
        } else {
          // Last resort: message ID search
          gmailUrl = `https://mail.google.com/mail/u/0/#search/rfc822msgid:${message.id}`;
        }
        
        await upsertChunksFlexible({
          userId: userId, // UUID
          sourceType: 'gmail',
          sourceItemId: message.id,
          title: subject,
          url: gmailUrl,
          chunks,
          embeddings,
          metadata: {
            fromName: fromName || fromHeader,
            fromEmail: fromEmail || fromHeader,
            subject: subject,
            dateISO: dateISO || dateHeader,
            threadId: msg.threadId,
            gmailMessageId: message.id, // Store message.id explicitly for citation links
            ownerEmail: ownerEmail,
            // Keep original for backward compatibility
            from: fromHeader,
            date: dateHeader,
          },
        });
        console.log(`[Gmail Ingestion] AFTER insertion: Message ${message.id} - Inserted ${chunks.length} chunks into document_chunks table`);
        
        totalChunksInserted += chunks.length;
        processed++;
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
        skipped++;
      }
    }

    // Update sources.last_synced_at (not updated_at)
    await pool.query(
      `UPDATE sources 
       SET last_synced_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND source_type = 'gmail'`,
      [userId]
    );

    console.log(`[Gmail Ingestion] Ingestion completed for user ${userId}:`);
    console.log(`[Gmail Ingestion]   - Messages fetched: ${messages.length}`);
    console.log(`[Gmail Ingestion]   - Messages processed: ${processed}`);
    console.log(`[Gmail Ingestion]   - Messages skipped: ${skipped}`);
    console.log(`[Gmail Ingestion]   - Total chunks created: ${totalChunksCreated}`);
    console.log(`[Gmail Ingestion]   - Chunks successfully embedded: ${totalChunksEmbedded}`);
    console.log(`[Gmail Ingestion]   - Chunks inserted into DB: ${totalChunksInserted}`);

    return { processed, skipped, embedded: totalChunksEmbedded, inserted: totalChunksInserted, warnings, since: dateFilter };
  } catch (error) {
    console.error(`[Gmail Ingestion] Error during ingestion for user ${userId}:`, error);
    throw error;
  }
}
