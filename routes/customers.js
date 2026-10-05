const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// GET all customers (optional ?areaId=...)
router.get('/', async (req, res) => {
  try {
    const { areaId } = req.query;
    let query = `
      SELECT 
        id, 
        name, 
        phone, 
        area_id as "areaId", 
        default_morning_qty::float as "defaultMorningQty", 
        default_evening_qty::float as "defaultEveningQty", 
        price_per_liter::float as "pricePerLiter", 
        active,
        created_at as "createdAt"
      FROM customers 
      WHERE active = true
    `;
    const params = [];

    if (areaId && areaId !== 'all') {
      params.push(areaId);
      query += ` AND area_id = $${params.length}`;
    }

    query += ` ORDER BY name ASC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers', details: err.message });
  }
});

// GET single customer
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT 
        id, 
        name, 
        phone, 
        area_id as "areaId", 
        default_morning_qty::float as "defaultMorningQty", 
        default_evening_qty::float as "defaultEveningQty", 
        price_per_liter::float as "pricePerLiter", 
        active 
      FROM customers 
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching customer:', err);
    res.status(500).json({ error: 'Failed to fetch customer', details: err.message });
  }
});

// POST create customer
router.post('/', async (req, res) => {
  try {
    const {
      id,
      name,
      phone,
      areaId,
      defaultMorningQty,
      defaultEveningQty,
      pricePerLiter,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Valid 10-digit phone number is required' });
    }

    const formattedPhone = cleanPhone.startsWith('91') && cleanPhone.length === 12
      ? `+91 ${cleanPhone.slice(2)}`
      : `+91 ${cleanPhone.slice(-10)}`;

    const customerId = id || `cust-${Date.now()}`;
    const morningQty = parseFloat(defaultMorningQty) || 0;
    const eveningQty = parseFloat(defaultEveningQty) || 0;
    const rate = parseFloat(pricePerLiter) || 60.0;

    const result = await db.query(`
      INSERT INTO customers (
        id, name, phone, area_id, default_morning_qty, default_evening_qty, price_per_liter, active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        area_id = EXCLUDED.area_id,
        default_morning_qty = EXCLUDED.default_morning_qty,
        default_evening_qty = EXCLUDED.default_evening_qty,
        price_per_liter = EXCLUDED.price_per_liter,
        active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING 
        id, 
        name, 
        phone, 
        area_id as "areaId", 
        default_morning_qty::float as "defaultMorningQty", 
        default_evening_qty::float as "defaultEveningQty", 
        price_per_liter::float as "pricePerLiter", 
        active
    `, [
      customerId,
      name.trim(),
      formattedPhone,
      areaId || 'area-1',
      morningQty,
      eveningQty,
      rate,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating customer:', err);
    res.status(500).json({ error: 'Failed to create customer', details: err.message });
  }
});

// PUT update customer
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      areaId,
      defaultMorningQty,
      defaultEveningQty,
      pricePerLiter,
      active,
    } = req.body;

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Customer name cannot be empty' });
    }

    let formattedPhone = undefined;
    if (phone !== undefined) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      if (!cleanPhone || cleanPhone.length < 10) {
        return res.status(400).json({ error: 'Valid 10-digit phone number is required' });
      }
      formattedPhone = cleanPhone.startsWith('91') && cleanPhone.length === 12
        ? `+91 ${cleanPhone.slice(2)}`
        : `+91 ${cleanPhone.slice(-10)}`;
    }

    const result = await db.query(`
      UPDATE customers 
      SET 
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        area_id = COALESCE($3, area_id),
        default_morning_qty = COALESCE($4, default_morning_qty),
        default_evening_qty = COALESCE($5, default_evening_qty),
        price_per_liter = COALESCE($6, price_per_liter),
        active = COALESCE($7, active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING 
        id, 
        name, 
        phone, 
        area_id as "areaId", 
        default_morning_qty::float as "defaultMorningQty", 
        default_evening_qty::float as "defaultEveningQty", 
        price_per_liter::float as "pricePerLiter", 
        active
    `, [
      name ? name.trim() : null,
      formattedPhone !== undefined ? formattedPhone : phone,
      areaId,
      defaultMorningQty !== undefined ? parseFloat(defaultMorningQty) : null,
      defaultEveningQty !== undefined ? parseFloat(defaultEveningQty) : null,
      pricePerLiter !== undefined ? parseFloat(pricePerLiter) : null,
      active,
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating customer:', err);
    res.status(500).json({ error: 'Failed to update customer', details: err.message });
  }
});

// DELETE customer
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Hard delete or soft delete
    await db.query('DELETE FROM customers WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting customer:', err);
    res.status(500).json({ error: 'Failed to delete customer', details: err.message });
  }
});

module.exports = router;
