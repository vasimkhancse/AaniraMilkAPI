const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// GET all users
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, role, assigned_area as "assignedArea", phone 
      FROM users 
      ORDER BY role ASC, name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

// POST create/update user
router.post('/', async (req, res) => {
  try {
    const { id, username, name, role, assignedArea, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const trimmedName = name.trim();
    const cleanSlug = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const userRole = role || (trimmedName.toLowerCase().includes('admin') ? 'admin' : 'supply_boy');
    const userArea = assignedArea || 'all';
    
    const userId = id || `user_${cleanSlug}_${Date.now().toString().slice(-4)}`;

    const result = await db.query(
      `INSERT INTO users (id, name, role, assigned_area, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE 
         SET name = EXCLUDED.name,
             role = EXCLUDED.role,
             assigned_area = EXCLUDED.assigned_area,
             phone = EXCLUDED.phone
       RETURNING id, name, role, assigned_area as "assignedArea", phone`,
      [userId, trimmedName, userRole, userArea, phone || '']
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving user:', err);
    res.status(500).json({ error: 'Failed to save user', details: err.message });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user', details: err.message });
  }
});

module.exports = router;
