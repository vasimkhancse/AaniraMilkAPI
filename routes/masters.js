const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// GET all masters data combined (for instant app loading)
router.get('/', async (req, res) => {
  try {
    // 1. Settings
    const settingsRes = await db.query('SELECT key, value FROM settings');
    const settingsMap = {};
    settingsRes.rows.forEach(row => {
      settingsMap[row.key] = row.value;
    });

    // 2. Areas
    const areasRes = await db.query('SELECT id, name, short_name as "shortName" FROM areas ORDER BY id ASC');

    // 3. Users
    const usersRes = await db.query('SELECT id, name, role, assigned_area as "assignedArea", phone FROM users ORDER BY role ASC, name ASC');

    // 4. Customers
    const customersRes = await db.query(`
      SELECT 
        id, 
        name, 
        phone, 
        area_id as "areaId", 
        default_morning_qty::float as "defaultMorningQty", 
        default_evening_qty::float as "defaultEveningQty", 
        price_per_liter::float as "pricePerLiter", 
        COALESCE(sequence, 0)::int as "sequence",
        active 
      FROM customers 
      WHERE active = true 
      ORDER BY COALESCE(sequence, 0) ASC, name ASC
    `);

    res.json({
      milkRatePerLiter: Number(settingsMap.milkRatePerLiter || 60),
      quantityPresets: settingsMap.quantityPresets || [
        { label: '1/4 L', value: 0.25, display: '0.25' },
        { label: '1/2 L', value: 0.5, display: '0.5' },
        { label: '1 L', value: 1.0, display: '1' },
        { label: '1.5 L', value: 1.5, display: '1.5' },
        { label: '2 L', value: 2.0, display: '2' },
      ],
      shifts: settingsMap.shifts || [
        { id: 'morning', name: 'Morning', icon: 'sunny-outline', timeRange: '6:00 AM - 8:30 AM' },
        { id: 'evening', name: 'Evening', icon: 'moon-outline', timeRange: '5:00 PM - 7:30 PM' },
      ],
      areas: areasRes.rows,
      users: usersRes.rows,
      customers: customersRes.rows,
    });
  } catch (err) {
    console.error('Error fetching masters:', err);
    res.status(500).json({ error: 'Failed to fetch masters', details: err.message });
  }
});

// Update Rate Master
router.post('/rate', async (req, res) => {
  try {
    const { milkRatePerLiter } = req.body;
    if (milkRatePerLiter === undefined || isNaN(Number(milkRatePerLiter))) {
      return res.status(400).json({ error: 'Valid milkRatePerLiter is required' });
    }

    const rateNum = Number(milkRatePerLiter);

    await db.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('milkRatePerLiter', $1::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(rateNum)]
    );

    // Automatically update all customers' price_per_liter
    await db.query('UPDATE customers SET price_per_liter = $1, updated_at = CURRENT_TIMESTAMP', [rateNum]);

    res.json({ success: true, milkRatePerLiter: rateNum });
  } catch (err) {
    console.error('Error saving rate:', err);
    res.status(500).json({ error: 'Failed to save rate', details: err.message });
  }
});

// Update Settings Generic
router.post('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }

    await db.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)]
    );

    res.json({ success: true, key, value });
  } catch (err) {
    console.error('Error saving setting:', err);
    res.status(500).json({ error: 'Failed to save setting', details: err.message });
  }
});

module.exports = router;
