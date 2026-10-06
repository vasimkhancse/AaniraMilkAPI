const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// GET all areas
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, short_name as "shortName" FROM areas ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching areas:', err);
    res.status(500).json({ error: 'Failed to fetch areas', details: err.message });
  }
});

// POST create/update area
router.post('/', async (req, res) => {
  try {
    const { id, name, shortName } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Area name is required' });
    }

    const areaId = id || `area-${Date.now()}`;
    const short = name;

    const result = await db.query(
      `INSERT INTO areas (id, name, short_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name
       RETURNING id, name, short_name as "shortName"`,
      [areaId, name, short]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving area:', err);
    res.status(500).json({ error: 'Failed to save area', details: err.message });
  }
});

// DELETE area
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM areas WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting area:', err);
    res.status(500).json({ error: 'Failed to delete area', details: err.message });
  }
});

module.exports = router;
