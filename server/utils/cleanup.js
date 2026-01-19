// Database cleanup utilities
// Removes expired sessions and old data
import pool from '../config/database.js';

/**
 * Clean up expired sessions from the database
 * @returns {Promise<number>} Number of sessions deleted
 */
export async function cleanupExpiredSessions() {
  try {
    const result = await pool.query(
      'DELETE FROM sessions WHERE expires_at < NOW()'
    );
    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
      console.log(`[Cleanup] Deleted ${deletedCount} expired session(s)`);
    }
    return deletedCount;
  } catch (error) {
    console.error('[Cleanup] Error cleaning up sessions:', error.message);
    return 0;
  }
}

/**
 * Clean up old query history (older than 90 days)
 * @returns {Promise<number>} Number of records deleted
 */
export async function cleanupOldQueryHistory() {
  try {
    const result = await pool.query(
      `DELETE FROM query_history 
       WHERE created_at < NOW() - INTERVAL '90 days'`
    );
    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
      console.log(`[Cleanup] Deleted ${deletedCount} old query history record(s)`);
    }
    return deletedCount;
  } catch (error) {
    console.error('[Cleanup] Error cleaning up query history:', error.message);
    return 0;
  }
}

/**
 * Clean up expired password reset tokens
 * @returns {Promise<number>} Number of tokens cleared
 */
export async function cleanupExpiredResetTokens() {
  try {
    const result = await pool.query(
      `UPDATE users 
       SET reset_token = NULL, reset_token_expiry = NULL 
       WHERE reset_token_expiry < NOW() AND reset_token IS NOT NULL`
    );
    const clearedCount = result.rowCount || 0;
    if (clearedCount > 0) {
      console.log(`[Cleanup] Cleared ${clearedCount} expired reset token(s)`);
    }
    return clearedCount;
  } catch (error) {
    console.error('[Cleanup] Error cleaning up reset tokens:', error.message);
    return 0;
  }
}

/**
 * Run all cleanup tasks
 * @returns {Promise<{sessions: number, queryHistory: number, resetTokens: number}>}
 */
export async function runAllCleanupTasks() {
  console.log('[Cleanup] Running database cleanup tasks...');
  
  const sessions = await cleanupExpiredSessions();
  const queryHistory = await cleanupOldQueryHistory();
  const resetTokens = await cleanupExpiredResetTokens();
  
  console.log('[Cleanup] Cleanup tasks completed');
  
  return {
    sessions,
    queryHistory,
    resetTokens
  };
}

/**
 * Start periodic cleanup (runs every 6 hours)
 */
export function startPeriodicCleanup() {
  // Run immediately on startup
  runAllCleanupTasks();
  
  // Then run every 6 hours
  const sixHours = 6 * 60 * 60 * 1000;
  setInterval(runAllCleanupTasks, sixHours);
  
  console.log('[Cleanup] Periodic cleanup scheduled (every 6 hours)');
}
