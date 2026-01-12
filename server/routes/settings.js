// User settings routes (notification preferences, etc.)
import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

async function ensureRow(userId) {
  await pool.query(
    `INSERT INTO user_settings (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

/**
 * GET /api/settings
 * Returns persisted user settings.
 */
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  try {
    await ensureRow(userId);
    const result = await pool.query(
      `SELECT notifications_enabled, email_alerts_enabled
       FROM user_settings
       WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0] || {};
    return res.json({
      ok: true,
      settings: {
        notifications: !!row.notifications_enabled,
        emailAlerts: !!row.email_alerts_enabled,
      },
    });
  } catch (error) {
    console.error('[API] GET /api/settings error:', error);
    return res.status(500).json({ error: 'Unable to load settings' });
  }
});

/**
 * PUT /api/settings
 * Updates persisted user settings.
 */
router.put('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { notifications, emailAlerts, firstName, lastName } = req.body || {};

  const notificationsEnabled = typeof notifications === 'boolean' ? notifications : null;
  const emailAlertsEnabled = typeof emailAlerts === 'boolean' ? emailAlerts : null;

  const hasNameUpdate = typeof firstName === 'string' || typeof lastName === 'string';
  if (notificationsEnabled === null && emailAlertsEnabled === null && !hasNameUpdate) {
    return res.status(400).json({ error: 'No settings provided' });
  }

  try {
    await ensureRow(userId);

    // Update notification settings (if provided)
    if (notificationsEnabled !== null || emailAlertsEnabled !== null) {
      await pool.query(
        `UPDATE user_settings
         SET
           notifications_enabled = COALESCE($2, notifications_enabled),
           email_alerts_enabled = COALESCE($3, email_alerts_enabled),
           updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId, notificationsEnabled, emailAlertsEnabled]
      );
    }

    // Update user's full_name (if provided)
    if (hasNameUpdate) {
      const fn = typeof firstName === 'string' ? firstName.trim() : '';
      const ln = typeof lastName === 'string' ? lastName.trim() : '';
      const fullName = [fn, ln].filter(Boolean).join(' ') || null;

      await pool.query(
        `UPDATE users
         SET full_name = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId, fullName]
      );
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('[API] PUT /api/settings error:', error);
    return res.status(500).json({ error: 'Unable to save settings' });
  }
});

export default router;

