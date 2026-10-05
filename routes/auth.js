const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, areaId } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Find in users table
    const result = await db.query(`
      SELECT id, name, role, assigned_area as "assignedArea", phone 
      FROM users 
      WHERE LOWER(id) = $1 OR LOWER(name) = $1
    `, [cleanUsername]);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      return res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          assignedArea: areaId || user.assignedArea,
          phone: user.phone,
        },
      });
    }

    // If user not yet in DB, create on the fly as supply_boy or admin
    const isNewAdmin = cleanUsername === 'admin';
    const newUserId = `${cleanUsername}_sb`;
    const newName = isNewAdmin ? 'Admin User' : `Staff (${username.trim()})`;
    const newRole = isNewAdmin ? 'admin' : 'supply_boy';
    const newArea = areaId || 'area-1';

    const insertResult = await db.query(`
      INSERT INTO users (id, name, role, assigned_area, phone)
      VALUES ($1, $2, $3, $4, '')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, role, assigned_area as "assignedArea", phone
    `, [newUserId, newName, newRole, newArea]);

    res.json({
      success: true,
      user: insertResult.rows[0],
    });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

module.exports = router;
