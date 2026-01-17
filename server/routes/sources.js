// Sources routes
import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { ingestDrive, ingestGmail } from '../lib/ingestion.js';
import { deleteOAuthTokens } from '../lib/googleOAuthReal.js';
import { google } from 'googleapis';

const router = express.Router();

function toUtcISOString(value) {
  if (!value) return null;
  // pg can return TIMESTAMP columns as strings without timezone info.
  // Those should be treated as UTC (Supabase commonly runs in UTC),
  // so we normalize them to an ISO string with a trailing 'Z'.
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    // If it already includes timezone info, leave it as-is.
    if (/[zZ]$/.test(s) || /[+-]\d\d:\d\d$/.test(s)) return s;
    // Normalize "YYYY-MM-DD HH:mm:ss(.sss)" -> "YYYY-MM-DDTHH:mm:ss(.sss)Z"
    return s.replace(' ', 'T') + 'Z';
  }
  return null;
}

// Rate limit sync: allow more retries during setup (still protected)
// NOTE: sync can be slow and users may click multiple times.
const syncRateLimit = rateLimit({ windowMs: 3600000, max: 30 });

/**
 * GET /api/sources
 * Returns gmail & drive status for current user
 */
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  console.log(`[API] GET /api/sources - user_id: ${userId}`);
  
  try {
    // Get or create source records for gmail and drive
    const result = await pool.query(
      `SELECT 
        id, 
        source_type, 
        source_name, 
        status,
        last_synced_at::text as last_synced_at,
        connection_data, 
        created_at, 
        updated_at
       FROM sources 
       WHERE user_id = $1 AND source_type IN ('gmail', 'drive')
       ORDER BY source_type`,
      [userId]
    );

    // Ensure we have entries for both gmail and drive
    const existingTypes = result.rows.map(row => row.source_type);
    const sources = [];

    // Process existing sources
    for (const row of result.rows) {
      const connectionData = row.connection_data ? (typeof row.connection_data === 'string' ? JSON.parse(row.connection_data) : row.connection_data) : null;
      sources.push({
        id: row.id,
        source_type: row.source_type,
        source_name: row.source_name || (row.source_type === 'gmail' ? 'Gmail' : 'Google Drive'),
        status: row.status || 'disconnected',
        last_synced_at: toUtcISOString(row.last_synced_at),
        connected_at: connectionData?.connectedAt || null,
      });
    }

    // Create missing entries
    if (!existingTypes.includes('gmail')) {
      try {
        const insertResult = await pool.query(
          `INSERT INTO sources (user_id, source_type, source_name, status)
           VALUES ($1, 'gmail', 'Gmail', 'disconnected')
           RETURNING id, source_type, source_name, status, last_synced_at, connection_data, created_at, updated_at`,
          [userId]
    );
        sources.push({
          id: insertResult.rows[0].id,
          source_type: 'gmail',
          source_name: 'Gmail',
          status: 'disconnected',
          last_synced_at: null,
          connected_at: null,
        });
      } catch (error) {
        console.error('Error creating gmail source:', error);
      }
    }

    if (!existingTypes.includes('drive')) {
      try {
        const insertResult = await pool.query(
          `INSERT INTO sources (user_id, source_type, source_name, status)
           VALUES ($1, 'drive', 'Google Drive', 'disconnected')
           RETURNING id, source_type, source_name, status, last_synced_at, connection_data, created_at, updated_at`,
          [userId]
        );
        sources.push({
          id: insertResult.rows[0].id,
          source_type: 'drive',
          source_name: 'Google Drive',
          status: 'disconnected',
          last_synced_at: null,
          connected_at: null,
        });
      } catch (error) {
        console.error('Error creating drive source:', error);
      }
    }

    // Sort by source_type
    sources.sort((a, b) => a.source_type.localeCompare(b.source_type));

    res.json({ sources });
  } catch (error) {
    console.error('Get sources error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sources/connect
 * Initiate Google OAuth connection
 * Returns the OAuth URL for frontend to redirect to
 * Does NOT flip status - status is only set when OAuth completes
 */
router.post('/connect', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { sourceType } = req.body;
  console.log(`[API] POST /api/sources/connect - user_id: ${userId}, sourceType: ${sourceType}`);

  try {
    if (sourceType !== 'gmail' && sourceType !== 'drive') {
      return res.status(400).json({ error: 'Invalid source type. Must be "gmail" or "drive"' });
    }

    // Return OAuth URL - frontend will redirect to /auth/google?sourceType={type}&token={token}
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const token = req.headers['authorization']?.split(' ')[1] || req.query.token;
    const authUrl = `${backendUrl}/auth/google?sourceType=${sourceType}&token=${token}`;

    res.json({ authUrl });
  } catch (error) {
    console.error('Connect source error:', error);
    res.status(500).json({ error: 'Failed to initiate connection', details: error.message });
  }
});

/**
 * POST /api/sources/sync
 * Sync/ingest data from connected sources
 */
router.post('/sync', authenticateToken, syncRateLimit, async (req, res) => {
  const userId = req.user.userId;
  const { sourceType } = req.body;
  console.log(`[API] POST /api/sources/sync - user_id: ${userId}, sourceType: ${sourceType}`);
  
  try {
    if (!sourceType || (sourceType !== 'gmail' && sourceType !== 'drive' && sourceType !== 'all')) {
      return res.status(400).json({ error: 'sourceType must be "gmail", "drive", or "all"' });
    }

    // Check if source is connected
    if (sourceType !== 'all') {
      const sourceCheck = await pool.query(
        'SELECT status FROM sources WHERE user_id = $1 AND source_type = $2',
        [userId, sourceType]
    );

      if (sourceCheck.rows.length === 0 || sourceCheck.rows[0].status !== 'connected') {
        return res.status(400).json({ error: `${sourceType} is not connected` });
    }
    }

    let results = {};

    if (sourceType === 'gmail' || sourceType === 'all') {
      try {
        // Check gmail connection
        const gmailCheck = await pool.query(
          'SELECT status FROM sources WHERE user_id = $1 AND source_type = $2',
          [userId, 'gmail']
        );
        
        if (gmailCheck.rows.length > 0 && gmailCheck.rows[0].status === 'connected') {
          console.log(`[API] Starting Gmail sync for user ${userId}`);
          
          // Check if OAuth tokens exist
          const tokenCheck = await pool.query(
            'SELECT user_id FROM oauth_tokens WHERE user_id = $1',
            [userId]
          );
          
          if (tokenCheck.rows.length === 0) {
            console.error(`[API] No OAuth tokens found for user ${userId}`);
            results.gmail = { error: 'Gmail connection incomplete. Please reconnect Gmail from Sources.' };
          } else {
            try {
              results.gmail = await ingestGmail(userId);
              if (results.gmail?.error) {
                console.log(`[API] Gmail sync completed with error for user ${userId}: ${results.gmail.error}`);
              } else if (results.gmail?.warnings?.length) {
                console.log(`[API] Gmail sync completed with warnings for user ${userId}: ${results.gmail.warnings.join(' | ')}`);
              } else {
                console.log(`[API] Gmail sync completed successfully for user ${userId}`);
              }

              // Only mark "last_synced_at" after a successful ingestion (no error)
              if (!results.gmail?.error) {
                await pool.query(
                  `UPDATE sources
                   SET last_synced_at = CURRENT_TIMESTAMP,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE user_id = $1 AND source_type = 'gmail'`,
                  [userId]
                );
              }
            } catch (ingestionError) {
              console.error(`[API] Gmail ingestion error for user ${userId}:`, ingestionError);
              console.error(`[API] Error stack:`, ingestionError.stack);
              const msg = String(ingestionError?.message || '');
              if (msg.includes('OAUTH_INVALID_GRANT') || msg.includes('invalid_grant')) {
                results.gmail = { error: 'Gmail authorization expired. Please reconnect Gmail from Sources.' };
              } else if (msg.includes('No OAuth tokens found')) {
                results.gmail = { error: 'Gmail connection incomplete. Please reconnect Gmail from Sources.' };
              } else {
                results.gmail = { error: msg || 'Gmail sync failed' };
              }
            }
          }
        } else {
          results.gmail = { error: 'Gmail is not connected' };
        }
      } catch (error) {
        console.error(`[API] Gmail sync error for user ${userId}:`, error);
        console.error(`[API] Error stack:`, error.stack);
        const msg = String(error?.message || '');
        if (msg.includes('OAUTH_INVALID_GRANT') || msg.includes('invalid_grant')) {
          results.gmail = { error: 'Gmail authorization expired. Please reconnect Gmail from Sources.' };
        } else if (msg.includes('No OAuth tokens found')) {
          results.gmail = { error: 'Gmail connection incomplete. Please reconnect Gmail from Sources.' };
        } else {
          results.gmail = { error: msg || 'Gmail sync failed' };
        }
      }
    }

    if (sourceType === 'drive' || sourceType === 'all') {
      try {
        // Check drive connection
        const driveCheck = await pool.query(
          'SELECT status FROM sources WHERE user_id = $1 AND source_type = $2',
          [userId, 'drive']
        );
        
        if (driveCheck.rows.length > 0 && driveCheck.rows[0].status === 'connected') {
          console.log(`[API] Starting Drive sync for user ${userId}`);
          
          // Check if OAuth tokens exist
          const tokenCheck = await pool.query(
            'SELECT user_id FROM oauth_tokens WHERE user_id = $1',
            [userId]
          );
          
          if (tokenCheck.rows.length === 0) {
            console.error(`[API] No OAuth tokens found for user ${userId}`);
            results.drive = { error: 'Drive connection incomplete. Please reconnect Drive from Sources.' };
          } else {
            try {
              results.drive = await ingestDrive(userId);
              if (results.drive?.error) {
                console.log(`[API] Drive sync completed with error for user ${userId}: ${results.drive.error}`);
              } else if (results.drive?.warnings?.length) {
                console.log(`[API] Drive sync completed with warnings for user ${userId}: ${results.drive.warnings.join(' | ')}`);
              } else {
                console.log(`[API] Drive sync completed successfully for user ${userId}`);
              }

              // Only mark "last_synced_at" after a successful ingestion (no error)
              if (!results.drive?.error) {
                await pool.query(
                  `UPDATE sources
                   SET last_synced_at = CURRENT_TIMESTAMP,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE user_id = $1 AND source_type = 'drive'`,
                  [userId]
                );
              }
            } catch (ingestionError) {
              console.error(`[API] Drive ingestion error for user ${userId}:`, ingestionError);
              console.error(`[API] Error stack:`, ingestionError.stack);
              const msg = String(ingestionError?.message || '');
              if (msg.includes('OAUTH_INVALID_GRANT') || msg.includes('invalid_grant')) {
                results.drive = { error: 'Google Drive authorization expired. Please reconnect Drive from Sources.' };
              } else if (msg.includes('No OAuth tokens found')) {
                results.drive = { error: 'Drive connection incomplete. Please reconnect Drive from Sources.' };
              } else {
                results.drive = { error: msg || 'Drive sync failed' };
              }
            }
          }
        } else {
          results.drive = { error: 'Drive is not connected' };
        }
      } catch (error) {
        console.error(`[API] Drive sync error for user ${userId}:`, error);
        console.error(`[API] Error stack:`, error.stack);
        const msg = String(error?.message || '');
        if (msg.includes('OAUTH_INVALID_GRANT') || msg.includes('invalid_grant')) {
          results.drive = { error: 'Google Drive authorization expired. Please reconnect Drive from Sources.' };
        } else if (msg.includes('No OAuth tokens found')) {
          results.drive = { error: 'Drive connection incomplete. Please reconnect Drive from Sources.' };
        } else {
          results.drive = { error: msg || 'Drive sync failed' };
        }
      }
    }

    // Check if any sync had errors
    const hasErrors = Object.values(results).some(result => result && result.error);

    res.json({
      message: hasErrors ? 'Sync completed with errors' : 'Sync completed',
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

/**
 * POST /api/sources/disconnect
 * Disconnect a source: revoke tokens + delete indexed chunks + set disconnected
 */
router.post('/disconnect', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { sourceType } = req.body;
  console.log(`[API] POST /api/sources/disconnect - user_id: ${userId}, sourceType: ${sourceType}`);
  
  try {
    if (!sourceType || (sourceType !== 'gmail' && sourceType !== 'drive')) {
      return res.status(400).json({ error: 'sourceType must be "gmail" or "drive"' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Delete OAuth tokens from oauth_tokens table
      // Note: We delete tokens only if disconnecting the last source
      // Check if user has other connected sources
      const otherSources = await pool.query(
        `SELECT id FROM sources 
         WHERE user_id = $1 AND source_type != $2 AND status = 'connected'`,
        [userId, sourceType]
    );

      // If this is the last connected source, delete OAuth tokens
      if (otherSources.rows.length === 0) {
        try {
          await deleteOAuthTokens(userId);
          console.log(`Deleted OAuth tokens for user ${userId}`);
        } catch (error) {
          console.error('Error deleting OAuth tokens:', error);
          // Continue with disconnect even if token deletion fails
        }
      }

      // Delete document chunks
      await pool.query(
        `DELETE FROM document_chunks 
         WHERE user_id = $1 AND source_type = $2`,
        [userId, sourceType]
      );

      // Update source status and clear last_synced_at
      await pool.query(
        `UPDATE sources 
         SET status = 'disconnected',
             last_synced_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND source_type = $2`,
        [userId, sourceType]
      );

      await pool.query('COMMIT');

      res.json({
        message: `${sourceType} disconnected and data deleted`,
        sourceType,
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect source', details: error.message });
  }
});

export default router;
