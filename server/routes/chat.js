// Chat sessions routes
import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { getEmbedding, generateAnswer } from '../lib/ollama.js';
import { searchTopK, extractPersonName } from '../lib/vectorSearch.js';
import { getAuthenticatedClients } from '../lib/googleOAuthReal.js';

const router = express.Router();

// Speed/quality knobs (override via env without code changes)
const RAG_SEARCH_K = Math.max(5, Math.min(100, parseInt(process.env.RAG_SEARCH_K || '25', 10)));
const RAG_MAX_CHUNKS = Math.max(3, Math.min(15, parseInt(process.env.RAG_MAX_CHUNKS || '6', 10)));
const RAG_CHUNK_MAX_CHARS = Math.max(150, Math.min(1200, parseInt(process.env.RAG_CHUNK_MAX_CHARS || '350', 10)));
const GMAIL_LIVE_FALLBACK_MAX = Math.max(0, Math.min(10, parseInt(process.env.GMAIL_LIVE_FALLBACK_MAX || '5', 10)));

function extractFirstEmail(text) {
  const m = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : null;
}

function cleanPersonToken(s) {
  return String(s || '')
    .trim()
    .replace(/^[\s"']+|[\s"'.!?]+$/g, '')
    .trim();
}

function detectSenderIntent(question, personNameHint = null) {
  const q = String(question || '').trim();
  if (!q) return null;
  const lower = q.toLowerCase();

  // Strong signal: explicit email address
  const email = extractFirstEmail(q);
  if (email) return { type: 'email', value: email };

  // Sender intent phrases
  const hasSenderCue =
    lower.includes(' from ') ||
    lower.includes('sender') ||
    lower.includes('sent by') ||
    lower.includes('emails from') ||
    lower.includes('mails from');

  if (!hasSenderCue) return null;

  // Try to extract "from X" target
  const m = q.match(/\bfrom\b\s+(.+?)\s*$/i);
  const rawTarget = m && m[1] ? cleanPersonToken(m[1]) : null;

  const name = cleanPersonToken(rawTarget || personNameHint || '');
  if (!name) return null;

  // Avoid treating generic words as sender
  const bad = new Set(['me', 'you', 'today', 'yesterday', 'this', 'that', 'it', 'mail', 'email', 'emails', 'mails']);
  if (bad.has(name.toLowerCase())) return null;

  return { type: 'name', value: name };
}

function extractSearchKeywords(text) {
  const raw = String(text || '').toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9@\s_-]/g, ' ');
  const parts = cleaned.split(/\s+/g).map(s => s.trim()).filter(Boolean);
  const stop = new Set([
    'the','a','an','and','or','but','to','of','in','on','for','with','from','by','at','as','is','are','was','were',
    'i','me','my','you','your','we','our','they','them','their',
    'email','emails','mail','gmail','message','messages',
    'find','show','get','give','tell','about','regarding','related','please','latest','recent','last',
  ]);
  const uniq = [];
  const seen = new Set();
  for (const p of parts) {
    if (p.length < 3) continue;
    if (stop.has(p)) continue;
    if (!seen.has(p)) {
      seen.add(p);
      uniq.push(p);
    }
    if (uniq.length >= 6) break;
  }
  return uniq;
}

function inferSourceTypes(question) {
  const q = String(question || '').toLowerCase();
  const wantsEmail = q.includes('email') || q.includes('mail') || q.includes('inbox') || q.includes('gmail');
  const wantsDrive = q.includes('drive') || q.includes('document') || q.includes('file') || q.includes('pdf') || q.includes('spreadsheet') || q.includes('doc');
  if (wantsEmail && !wantsDrive) return ['gmail'];
  if (wantsDrive && !wantsEmail) return ['drive'];
  return ['gmail', 'drive']; // current app only supports these sources today
}

async function keywordFallbackSearch({ pool, userId, question, limit = 30, sender = null }) {
  // If the user is asking "emails from X", don't match subject/body mentions of X.
  // Only match sender fields to avoid irrelevant emails.
  if (sender && sender.value) {
    const like = `%${sender.value}%`;
    const sourceTypes = ['gmail'];
    const result = await pool.query(
      `SELECT
         chunk_text,
         title,
         url,
         source_type,
         source_item_id,
         chunk_index,
         metadata,
         created_at
       FROM document_chunks
       WHERE user_id = $1::text
         AND source_type = ANY($2)
         AND (
           COALESCE(metadata->>'fromName', '') ILIKE $3
           OR COALESCE(metadata->>'fromEmail', '') ILIKE $3
           OR COALESCE(metadata->>'from', '') ILIKE $3
         )
       ORDER BY created_at DESC
       LIMIT $4`,
      [userId.toString(), sourceTypes, like, limit]
    );

    return result.rows.map(row => ({
      chunk_text: row.chunk_text,
      title: row.title,
      url: row.url,
      source_type: row.source_type,
      source_item_id: row.source_item_id,
      chunk_index: row.chunk_index,
      similarity: null,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
      created_at: row.created_at,
      _retrieval: 'keyword_sender'
    }));
  }

  const keywords = extractSearchKeywords(question);
  if (keywords.length === 0) return [];

  const patterns = keywords.map(k => `%${k}%`);
  const sourceTypes = inferSourceTypes(question);

  const result = await pool.query(
    `SELECT
       chunk_text,
       title,
       url,
       source_type,
       source_item_id,
       chunk_index,
       metadata,
       created_at
     FROM document_chunks
     WHERE user_id = $1::text
       AND source_type = ANY($2)
       AND (
         chunk_text ILIKE ANY($3)
         OR COALESCE(title, '') ILIKE ANY($3)
         OR COALESCE(metadata->>'subject', '') ILIKE ANY($3)
         OR COALESCE(metadata->>'fromName', '') ILIKE ANY($3)
       )
     ORDER BY created_at DESC
     LIMIT $4`,
    [userId.toString(), sourceTypes, patterns, limit]
  );

  return result.rows.map(row => ({
    chunk_text: row.chunk_text,
    title: row.title,
    url: row.url,
    source_type: row.source_type,
    source_item_id: row.source_item_id,
    chunk_index: row.chunk_index,
    similarity: null, // not a semantic score; keep null so later filters don't drop it
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    created_at: row.created_at,
    _retrieval: 'keyword'
  }));
}

function buildGmailQuery(question, sender = null) {
  if (sender?.value) {
    const v = sender.value.includes(' ') ? `"${sender.value}"` : sender.value;
    return `from:${v}`;
  }
  const keywords = extractSearchKeywords(question);
  return keywords.length > 0 ? keywords.join(' ') : String(question || '').trim();
}

async function gmailLiveFallbackSearch({ userId, question, limit = 5, sender = null }) {
  if (!limit || limit <= 0) return [];

  const q = buildGmailQuery(question, sender);
  if (!q) return [];

  const { gmail } = await getAuthenticatedClients(userId);

  // Fetch owner email once for correct citation deep links
  let ownerEmail = null;
  try {
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    ownerEmail = profileRes.data?.emailAddress || null;
  } catch (e) {
    // ignore
  }

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: limit,
    // Gmail search syntax; do not over-constrain by date here.
    q,
  });

  const msgs = listRes.data?.messages || [];
  const out = [];

  for (const m of msgs) {
    if (!m?.id) continue;
    try {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      });
      const msg = msgRes.data;
      const headers = msg.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const fromHeader = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const dateHeader = headers.find(h => h.name === 'Date')?.value || '';

      // Create a compact text chunk to answer from
      const chunkText = `Subject: ${subject}\nFrom: ${fromHeader}\nDate: ${dateHeader}\n\n${msg.snippet || ''}`.trim();

      out.push({
        chunk_text: chunkText,
        title: subject,
        url: null,
        source_type: 'gmail',
        source_item_id: msg.id,
        chunk_index: 0,
        similarity: null,
        metadata: {
          subject,
          fromName: fromHeader,
          date: dateHeader,
          dateISO: dateHeader,
          threadId: msg.threadId || null,
          gmailMessageId: msg.id,
          ownerEmail,
        },
        created_at: new Date().toISOString(),
        _retrieval: 'gmail_live'
      });
    } catch (e) {
      // Ignore per-message failure; continue
    }
  }

  return out;
}

router.post('/session/new', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  console.log(`[API] POST /api/chat/session/new - user_id: ${userId}`);
  
  try {
    const { title } = req.body;
    
    const result = await pool.query(
      `INSERT INTO chat_sessions (user_id, title)
       VALUES ($1, $2)
       RETURNING id, user_id, title, created_at`,
      [userId, title || null]
    );

    res.status(201).json({
      session: result.rows[0],
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/sessions', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  console.log(`[API] GET /api/chat/sessions - user_id: ${userId}`);
  
  try {
    const result = await pool.query(
      `WITH latest_messages AS (
        SELECT 
          session_id,
          content,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC) as rn
        FROM chat_messages
        WHERE user_id = $1
      )
      SELECT 
        cs.id,
        cs.user_id,
        COALESCE(cs.title, 'New Chat') as title,
        cs.created_at,
        (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id) as message_count,
        lm.content as last_message_preview
      FROM chat_sessions cs
      LEFT JOIN latest_messages lm ON cs.id = lm.session_id AND lm.rn = 1
      WHERE cs.user_id = $1
      ORDER BY cs.created_at DESC`,
      [userId]
    );

    res.json({
      sessions: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/session/:id', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const sessionId = req.params.id;
  console.log(`[API] GET /api/chat/session/${sessionId} - user_id: ${userId}`);
  
  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messagesResult = await pool.query(
      `SELECT 
        id,
        session_id,
        user_id,
        role,
        content,
        citations,
        created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    const messages = messagesResult.rows.map(row => ({
      id: row.id,
      session_id: row.session_id,
      role: row.role,
      content: row.content,
      citations: row.citations ? (typeof row.citations === 'string' ? JSON.parse(row.citations) : row.citations) : [],
      timestamp: row.created_at,
    }));

    res.json({
      sessionId,
      messages,
      count: messages.length,
    });
  } catch (error) {
    console.error('Get session messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/message', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const question = req.body.question?.trim();
  const sessionId = req.body.sessionId;
  
  console.log(`[Query] POST /api/chat/message - user_id: ${userId}`);
  
  try {
    if (!sessionId || !question || question.length === 0) {
      return res.status(400).json({ 
        ok: false,
        error: 'sessionId and question (non-empty string) are required',
        stage: 'validation'
      });
    }

    const sessionCheck = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ 
        ok: false,
        error: 'Session not found',
        stage: 'validation'
      });
    }

    const userMessageResult = await pool.query(
      `INSERT INTO chat_messages (session_id, user_id, role, content)
       VALUES ($1, $2, 'user', $3)
       RETURNING id, role, content, created_at`,
      [sessionId, userId, question]
    );

    const userMessage = userMessageResult.rows[0];

    const sourcesCheck = await pool.query(
      `SELECT COUNT(*) as count FROM sources 
       WHERE user_id = $1 AND status = 'connected'`,
      [userId]
    );

    const chunksCheck = await pool.query(
      `SELECT COUNT(*) as count FROM document_chunks 
       WHERE user_id = $1::text`,
      [userId]
    );

    const hasSources = parseInt(sourcesCheck.rows[0].count) > 0;
    const hasChunks = parseInt(chunksCheck.rows[0].count) > 0;

    let answer = !hasSources
      ? "No sources are connected yet. Please connect Gmail/Drive from Sources."
      : !hasChunks
        ? "Your source is connected, but nothing is synced/indexed yet. Go to Sources and click “Sync Gmail” (or Sync Drive)."
        : "I could not find relevant info in your connected sources yet.";
    let citations = [];
    let noResultsMessage = null;

    if (hasSources && hasChunks) {
      try {
        const personName = extractPersonName(question);
        if (personName) {
          console.log(`[Query] Detected person name: "${personName}" - using hybrid retrieval`);
        }
        const senderIntent = detectSenderIntent(question, personName);
        if (senderIntent) {
          console.log(`[Query] Sender intent detected: ${senderIntent.type}=${senderIntent.value}`);
        }

        console.log(`[Query] userId: ${userId}`);
        console.log(`[Query] Creating embedding for query...`);
        
        let queryEmbedding = null;
        try {
          queryEmbedding = await getEmbedding(question);
          if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
            throw new Error('Embedding generation returned null or invalid result');
          }
          console.log(`[Query] embedding OK (dimension: ${queryEmbedding.length})`);
        } catch (error) {
          // Degrade gracefully: if embeddings are unavailable, fall back to keyword retrieval.
          console.warn(`[Query] embedding unavailable (continuing with keyword fallback):`, error?.message || error);
          queryEmbedding = null;
        }

        console.log(`[Query] Searching top 20 chunks${personName ? ` with name boost for: ${personName}` : ''}...`);
        
        let matchedChunks;
        try {
          // Enhanced search with better parameters for email search
          const searchParams = {
            userId: userId.toString(),
            queryEmbedding,
            k: RAG_SEARCH_K, // Pull candidates; tuned for speed via env
            minSimilarity: 0.35, // INCREASED from 0.22 - only return highly relevant results
            boostRecent: true
          };

          // If we have a person name, add name-based boosting
          if (queryEmbedding && personName) {
            searchParams.boostName = personName;
            console.log(`[Query] Using name boost for: ${personName}`);
            
            // Also try to find emails directly from this person
            const directEmailChunks = await searchTopK({
              ...searchParams,
              k: 10,
              boostName: personName,
              minSimilarity: 0.2, // Even more lenient for direct name matches
              sourceTypes: ['gmail'],
              metadataFilters: [
                { key: 'fromName', value: personName, operator: 'ilike' }
              ]
            });
            
            // Get regular semantic search results
            const semanticChunks = await searchTopK(searchParams);
            
            // Combine and deduplicate results
            const combined = [...directEmailChunks, ...semanticChunks];
            const seen = new Set();
            matchedChunks = [];
            
            for (const chunk of combined) {
              const key = `${chunk.source_type}_${chunk.source_item_id}_${chunk.chunk_index}`;
              if (!seen.has(key)) {
                seen.add(key);
                matchedChunks.push(chunk);
                if (matchedChunks.length >= 20) break;
              }
            }
          } else if (queryEmbedding) {
            // Regular search without name filtering
            matchedChunks = await searchTopK(searchParams);
          } else {
            // No embedding available: start empty and let keyword fallback handle it below.
            matchedChunks = [];
          }
          console.log(`[Query] Retrieved ${matchedChunks.length} chunks after initial search`);
        } catch (error) {
          // Degrade gracefully: if vector search fails, fall back to keyword retrieval.
          console.warn(`[Query] vector search failed (continuing with keyword fallback):`, error?.message || error);
          matchedChunks = [];
        }

        // Filter out very short or low-similarity chunks to reduce noisy answers
        matchedChunks = matchedChunks.filter(chunk => {
          const textOk = chunk.chunk_text && chunk.chunk_text.trim().length >= 40;
          const similarityOk = typeof chunk.similarity === 'number' ? chunk.similarity >= 0.35 : true; // INCREASED from 0.22
          return textOk && similarityOk;
        });

        // If semantic retrieval yields nothing, do a keyword fallback search (subject/from/body/title).
        if (matchedChunks.length === 0) {
          try {
            const fallback = await keywordFallbackSearch({ pool, userId, question, limit: 50, sender: senderIntent });
            if (fallback.length > 0) {
              console.log(`[Query] Keyword fallback retrieved ${fallback.length} chunks`);
              matchedChunks = fallback;
            } else {
              console.log(`[Query] Keyword fallback retrieved 0 chunks`);
            }
          } catch (fallbackError) {
            console.error(`[Query] keyword fallback FAILED:`, fallbackError);
          }
        }

        // If we still have nothing, try live Gmail search (last resort before "not found")
        if (matchedChunks.length === 0 && GMAIL_LIVE_FALLBACK_MAX > 0) {
          try {
            const live = await gmailLiveFallbackSearch({ userId, question, limit: GMAIL_LIVE_FALLBACK_MAX, sender: senderIntent });
            if (live.length > 0) {
              console.log(`[Query] Live Gmail fallback retrieved ${live.length} messages`);
              matchedChunks = live;
            } else {
              console.log(`[Query] Live Gmail fallback retrieved 0 messages`);
            }
          } catch (liveErr) {
            console.warn(`[Query] Live Gmail fallback FAILED:`, liveErr?.message || liveErr);
          }
        }

        if (matchedChunks.length === 0) {
          const questionLower = question.toLowerCase();
          if (personName) {
            noResultsMessage = `No emails found from ${personName} in your synced emails.`;
          } else if (questionLower.includes('email') || questionLower.includes('mail')) {
            if (questionLower.includes('approval') || questionLower.includes('approve')) {
              noResultsMessage = "No emails requesting approval were found in your synced emails.";
            } else if (questionLower.includes('meeting') || questionLower.includes('meet')) {
              noResultsMessage = "No emails about meetings were found in your synced emails.";
            } else if (questionLower.includes('interview')) {
              noResultsMessage = "No interview-related emails were found in your synced emails.";
            } else {
              noResultsMessage = "No relevant emails were found in your synced emails to answer this question.";
            }
          } else if (questionLower.includes('interview') || questionLower.includes('meeting') || questionLower.includes('meet')) {
            noResultsMessage = "No interview or meeting-related emails were found in your synced emails.";
          } else if (questionLower.includes('document') || questionLower.includes('file')) {
            noResultsMessage = "No relevant documents were found in your synced files to answer this question.";
          } else {
            noResultsMessage = "I couldn't find any relevant information in your synced sources to answer this question.";
          }
          answer = noResultsMessage;
        } else {
          // Process and deduplicate chunks
          const processedChunks = [];
          const seenTexts = new Set();
          
          for (const chunk of matchedChunks) {
            // Skip empty or very short chunks
            if (!chunk.chunk_text || chunk.chunk_text.trim().length < 20) continue;
            
            // Simple deduplication by text content
            const normalizedText = chunk.chunk_text.trim().toLowerCase();
            if (seenTexts.has(normalizedText)) continue;
            
            seenTexts.add(normalizedText);
            processedChunks.push({
              ...chunk,
              // Keep full text for processing, we'll trim later
              processed_text: chunk.chunk_text
            });
            
            // Limit chunks to keep model context small (faster responses)
            if (processedChunks.length >= RAG_MAX_CHUNKS) break;
          }
          
          console.log(`[Query] Using ${processedChunks.length} chunks after deduplication`);
          
          // Build context with citations and metadata
          const contextParts = processedChunks.map((chunk, index) => {
            const citationNum = index + 1;
            const maxLength = RAG_CHUNK_MAX_CHARS;
            const chunkText = chunk.chunk_text.length > maxLength
              ? chunk.chunk_text.substring(0, maxLength) + '...'
              : chunk.chunk_text;
            
            // Include metadata for better context
            const metadata = [];
            if (chunk.metadata?.fromName) metadata.push(`From: ${chunk.metadata.fromName}`);
            if (chunk.metadata?.subject) metadata.push(`Subject: ${chunk.metadata.subject}`);
            if (chunk.metadata?.date) metadata.push(`Date: ${chunk.metadata.date}`);
            
            return `[Document ${citationNum}]
${metadata.length > 0 ? metadata.join(' | ') + '\n' : ''}${chunkText}`;
          });

          const context = contextParts.join('\n\n---\n\n');

          const systemPrompt = `You are Synapse, a professional AI memory assistant. You must answer ONLY using the provided CONTEXT (emails/documents). Do not invent details.

OUTPUT STYLE (must follow exactly):
1) Use clear Markdown headings and short paragraphs.
2) Every factual claim MUST end with a citation like [1], [2].
3) If the user asks for "emails from X" (sender intent), prioritize listing the matching emails, and do NOT include unrelated emails.
4) Be concise but complete: answer the question first, then show evidence.

REQUIRED RESPONSE TEMPLATE:
### Answer
<1–3 sentences directly answering the question. Include citations.>

### Evidence (what I found)
- <bullet with key evidence and citations>
- <bullet with key evidence and citations>

### Relevant items
For each relevant email/document, list:
- **Title/Subject**: ...
  - **From**: ...
  - **Date**: ...
  - **Why it’s relevant**: ...
  - **Citation**: [n]

### Next steps (optional)
<Only if helpful: what to search/ask next, or what is missing.>

If nothing relevant exists in CONTEXT, say so clearly and suggest a better query.`;

          const userPrompt = `QUESTION: ${question}

CONTEXT:
${context}

Please provide a detailed answer based on the context above.`;

          // Helper function to generate structured response from chunks when Ollama fails
          const generateFallbackAnswer = (question, chunks) => {
            const questionLower = question.toLowerCase();
            let summary = '';
            const points = [];
            
            // Extract key information from chunks
            chunks.forEach((chunk, index) => {
              const citationNum = index + 1;
              const metadata = chunk.metadata || {};
              const chunkText = chunk.chunk_text || '';
              
              // Extract relevant sentences from chunk
              const sentences = chunkText.split(/[.!?]+/).filter(s => s.trim().length > 20);
              
              // Find sentences that relate to the question
              sentences.forEach(sentence => {
                const sentLower = sentence.toLowerCase();
                if (questionLower.split(' ').some(word => word.length > 3 && sentLower.includes(word))) {
                  const cleanSent = sentence.trim();
                  if (cleanSent && !points.some(p => p.includes(cleanSent.substring(0, 50)))) {
                    points.push(`• ${cleanSent.trim()} [${citationNum}]`);
                  }
                }
              });
              
              // Add metadata-based points
              if (metadata.subject && questionLower.includes('subject')) {
                points.push(`• Subject: ${metadata.subject} [${citationNum}]`);
              }
              if (metadata.fromName && questionLower.includes('from') || questionLower.includes('who')) {
                points.push(`• From: ${metadata.fromName} [${citationNum}]`);
              }
              if (metadata.date && questionLower.includes('when') || questionLower.includes('date')) {
                points.push(`• Date: ${metadata.date} [${citationNum}]`);
              }
            });
            
            // Generate summary based on question type
            if (questionLower.includes('who') || questionLower.includes('from')) {
              const fromNames = [...new Set(chunks.map(c => c.metadata?.fromName).filter(Boolean))];
              summary = fromNames.length > 0 
                ? `Based on your emails, here are the relevant messages from: ${fromNames.join(', ')}.`
                : `Here is information related to your question:`;
            } else if (questionLower.includes('what') || questionLower.includes('about')) {
              summary = `Based on your emails and documents, here's what I found:`;
            } else if (questionLower.includes('when')) {
              summary = `Here are the dates and timing information from your sources:`;
            } else {
              summary = `Based on the available information from your emails and documents:`;
            }
            
            // If no specific points found, use chunk summaries
            if (points.length === 0) {
              chunks.slice(0, 5).forEach((chunk, index) => {
                const citationNum = index + 1;
                const preview = (chunk.chunk_text || '').substring(0, 150).trim();
                if (preview) {
                  points.push(`• ${preview}${preview.length >= 150 ? '...' : ''} [${citationNum}]`);
                }
              });
            }
            
            if (points.length === 0) {
              return `I found ${chunks.length} relevant document(s), but couldn't extract specific details. Please try rephrasing your question or check the citations below for more information.`;
            }
            
            return `${summary}\n\n${points.join('\n')}\n\n[Note: This is a summary based on available sources. Click the citations for full details.]`;
          };

          console.log(`[Query] Calling Ollama chat API with ${processedChunks.length} chunks (context length: ${context.length} chars)...`);
          const generateStartTime = Date.now();
          try {
            answer = await generateAnswer(userPrompt, systemPrompt);
            const generateDuration = Date.now() - generateStartTime;
            console.log(`[Query] ollama generate OK (took ${generateDuration}ms)`);
          } catch (error) {
            console.error(`[Query] ollama generate FAILED:`, error);
            console.log(`[Query] Generating fallback structured response from ${processedChunks.length} chunks...`);
            
            // Generate structured fallback answer from chunks
            answer = generateFallbackAnswer(question, processedChunks);
            console.log(`[Query] Fallback answer generated (${answer.length} chars)`);
          }

          // Process citations with proper metadata and deep links
          const citationMap = new Map();
          
          processedChunks.forEach((chunk, index) => {
            const citationNum = index + 1;
            const metadata = chunk.metadata || {};
            
            // Generate deep links based on source type
            let deepLink = null;
            // Gmail-specific identifiers (keep defined for all branches to avoid ReferenceErrors)
            let messageId = null;
            let threadId = null;
            let ownerEmail = null;
          if (chunk.source_type === 'gmail') {
            // Use Gmail Message ID format: #inbox/<MESSAGE_ID>
            // MESSAGE_ID comes from Gmail API (message.id) stored in source_item_id
            messageId = chunk.source_item_id || metadata.gmailMessageId || metadata.messageId || null;
            threadId = metadata.threadId || metadata.thread_id || null;
            ownerEmail =
              metadata.ownerEmail ||
              metadata.owner_email ||
              metadata.gmailOwnerEmail ||
              null;
            
            // Gmail web deep link formats:
            // - Message: https://mail.google.com/mail/u/{accountIndex}/#inbox/{messageId}
            // - Thread:  https://mail.google.com/mail/u/{accountIndex}/#all/{threadId}
            // We avoid guessing accountIndex here.
            // For correct multi-account routing, prefer `?authuser={email}` (no `/u/` needed).
            const base = ownerEmail
              ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(ownerEmail)}`
              : 'https://mail.google.com/mail/';
            if (threadId) {
              deepLink = `${base}#all/${threadId}`;
            } else if (messageId) {
              deepLink = `${base}#inbox/${messageId}`;
            } else {
              deepLink = null;
            }
          } 
            else if (chunk.source_type === 'drive' && chunk.source_item_id) {
              deepLink = `https://drive.google.com/file/d/${chunk.source_item_id}/view`;
              
              // Add additional parameters for Google Drive
              if (metadata.mimeType && metadata.mimeType.includes('google-apps.document')) {
                deepLink = `https://docs.google.com/document/d/${chunk.source_item_id}/edit`;
              } else if (metadata.mimeType && metadata.mimeType.includes('google-apps.spreadsheet')) {
                deepLink = `https://docs.google.com/spreadsheets/d/${chunk.source_item_id}/edit`;
              } else if (metadata.mimeType && metadata.mimeType.includes('google-apps.presentation')) {
                deepLink = `https://docs.google.com/presentation/d/${chunk.source_item_id}/edit`;
              }
            } 
            else if (chunk.url) {
              deepLink = chunk.url;
            }
            
            // Format title based on available metadata
            let title = chunk.title || 'Untitled';
            if (metadata.subject) {
              title = metadata.subject;
            } else if (metadata.fromName) {
              title = `${metadata.fromName}'s ${chunk.source_type === 'gmail' ? 'email' : 'document'}`;
            }
            
            const citation = {
              number: citationNum,
              sourceType: chunk.source_type,
              title: title,
              url: deepLink,
              // Back-compat field (existing clients)
              messageId: chunk.source_item_id || null,
              // New structured fields for secure, reusable deep linking
              providerMessageId: messageId || null,
              threadId: threadId || null,
              accountEmail: ownerEmail || null,
              score: chunk.similarity,
              fromName: metadata.fromName || metadata.from || null,
              dateISO: metadata.dateISO || metadata.date || null,
              snippet: chunk.chunk_text?.substring(0, 150) + (chunk.chunk_text?.length > 150 ? '...' : '')
            };
            
            const uniqueKey = deepLink || chunk.source_item_id || `${chunk.source_type}-${chunk.chunk_index}`;
            if (!citationMap.has(uniqueKey) || (citationMap.get(uniqueKey).score || 0) < (citation.score || 0)) {
              citationMap.set(uniqueKey, citation);
            }
          });
          
          citations = Array.from(citationMap.values())
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .map((citation, index) => ({
              ...citation,
              number: index + 1
            }));
        }
      } catch (error) {
        // IMPORTANT: never fail the whole request here.
        // We still want to store the question + a helpful error answer in chat/history.
        console.error(`[Query] RAG query error (continuing with safe answer):`, error);
        citations = [];
        noResultsMessage = null;
        answer =
          'I hit an internal error while searching your sources. Your message was saved. Please try again, or rephrase with more specific keywords (sender, subject, date range).';
      }
    } else {
      answer = !hasSources
        ? "No sources are connected yet. Please connect Gmail/Drive from Sources."
        : !hasChunks
          ? "Your source is connected, but nothing is synced/indexed yet. Go to Sources and click “Sync Gmail” (or Sync Drive)."
          : "I could not find relevant info in your connected sources yet.";
    }

    console.log(`[Query] Saving to chat_messages...`);
    try {
      const assistantMessageResult = await pool.query(
        `INSERT INTO chat_messages (session_id, user_id, role, content, citations)
         VALUES ($1, $2, 'assistant', $3, $4)
         RETURNING id, role, content, citations, created_at`,
        [sessionId, userId, answer, JSON.stringify(citations)]
      );

      const assistantMessage = assistantMessageResult.rows[0];
      console.log(`[Query] saved history OK`);

      // Persist simplified history for /api/history consumers
      try {
        await pool.query(
          `INSERT INTO query_history (user_id, query_text, answer_text, citations)
           VALUES ($1, $2, $3, $4)`,
          [userId.toString(), question, answer, JSON.stringify(citations)]
        );
      } catch (historyError) {
        console.error(`[Query] failed to write query_history:`, historyError);
      }

      const titleCheck = await pool.query(
        'SELECT title FROM chat_sessions WHERE id = $1',
        [sessionId]
      );
      
      if (!titleCheck.rows[0].title) {
        const newTitle = question.length > 50 ? question.substring(0, 50) + '...' : question;
        await pool.query(
          'UPDATE chat_sessions SET title = $1 WHERE id = $2',
          [newTitle, sessionId]
        );
      }

      res.json({
        ok: true,
        userMessage: {
          id: userMessage.id,
          role: userMessage.role,
          content: userMessage.content,
          timestamp: userMessage.created_at,
        },
        assistantMessage: {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          citations: assistantMessage.citations ? (typeof assistantMessage.citations === 'string' ? JSON.parse(assistantMessage.citations) : assistantMessage.citations) : [],
          timestamp: assistantMessage.created_at,
        },
        noResultsMessage: noResultsMessage || null,
      });
    } catch (error) {
      console.error(`[Query] save history FAILED:`, error);
      return res.status(500).json({
        ok: false,
        error: `Failed to save message: ${error.message}`,
        stage: 'db'
      });
    }
  } catch (error) {
    console.error(`[Query] Post message error:`, error);
    res.status(500).json({ 
      ok: false,
      error: error.message || 'Internal server error',
      stage: 'unknown'
    });
  }
});

router.delete('/session/:id', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const sessionId = req.params.id;
  console.log(`[API] DELETE /api/chat/session/${sessionId} - user_id: ${userId}`);
  
  try {
    const sessionCheck = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await pool.query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    res.json({
      message: 'Session deleted successfully',
    });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

