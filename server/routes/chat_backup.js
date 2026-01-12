// History routes for query history
import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/history
 * Get last 50 queries for logged-in user (newest first)
 */
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  console.log(`[API] GET /api/history - user_id: ${userId}`);
  
  try {

    const result = await pool.query(
      `SELECT 
        id,
        query_text,
        answer_text,
        citations,
        created_at
       FROM query_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    // Parse citations JSON
    const queries = result.rows.map(row => ({
      id: row.id,
      query_text: row.query_text,
      answer_text: row.answer_text,
      citations: row.citations ? JSON.parse(row.citations) : [],
      created_at: row.created_at,
    }));

    res.json({
      queries,
      count: queries.length,
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/history/clear-session
 * Clears only current chat session (frontend state)
 * Does NOT delete from database
 */
router.delete('/clear-session', authenticateToken, async (req, res) => {
  // This is a frontend-only operation
  // The frontend should clear its local state
  res.json({
    message: 'Session cleared (frontend state only)',
    note: 'Database history is preserved',
  });
});

/**
 * DELETE /api/history/clear-all
 * Delete all history for user (with confirmation)
 */
router.delete('/clear-all', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  console.log(`[API] DELETE /api/history/clear-all - user_id: ${userId}`);
  
  try {
    const { confirm } = req.body;

    if (confirm !== true) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Set confirm: true in request body to delete all history',
      });
    }

    const result = await pool.query(
      'DELETE FROM query_history WHERE user_id = $1 RETURNING id',
      [userId]
    );

    res.json({
      message: 'All query history deleted',
      deletedCount: result.rowCount,
    });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
