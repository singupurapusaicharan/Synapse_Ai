// Feedback routes
import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

function isAdminEmail(email) {
  const configured = process.env.ADMIN_EMAILS || '';
  const allow = configured
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return false;
  return allow.includes(String(email || '').trim().toLowerCase());
}

/**
 * POST /api/feedback
 * Save feedback to database (no email/env required)
 */
router.post('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { name, email, comments } = req.body || {};

  if (!comments || typeof comments !== 'string' || !comments.trim()) {
    return res.status(400).json({ error: 'Comments are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO feedback (user_id, name, email, comments)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [
        userId,
        typeof name === 'string' ? name.trim() : null,
        typeof email === 'string' ? email.trim() : null,
        comments.trim(),
      ]
    );

    return res.json({
      ok: true,
      id: result.rows[0]?.id,
      created_at: result.rows[0]?.created_at,
    });
  } catch (error) {
    console.error('[API] POST /api/feedback error:', error);
    return res.status(500).json({ error: 'Unable to save feedback' });
  }
});

/**
 * GET /api/feedback
 * Admin-only: list recent feedback
 */
router.get('/', authenticateToken, async (req, res) => {
  const email = req.user?.email;
  if (!isAdminEmail(email)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await pool.query(
      `SELECT id, user_id, name, email, comments, created_at
       FROM feedback
       ORDER BY created_at DESC
       LIMIT 200`
    );
    return res.json({ ok: true, feedback: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[API] GET /api/feedback error:', error);
    return res.status(500).json({ error: 'Unable to fetch feedback' });
  }
});

export default router;

