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
        COALESCE(sequence, 0)::int as "sequence",
        active,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM customers 
      WHERE active = true
    `;
    const params = [];

    if (areaId && areaId !== 'all') {
      params.push(areaId);
      query += ` AND area_id = $${params.length}`;
    }

    query += ` ORDER BY COALESCE(sequence, 0) ASC, name ASC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers', details: err.message });
  }
});

// POST reorder customers sequence
router.post('/reorder', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { items, customerIds, areaId } = req.body;
    await client.query('BEGIN');

    if (Array.isArray(customerIds) && customerIds.length > 0) {
      for (let i = 0; i < customerIds.length; i++) {
        const custId = customerIds[i];
        await client.query(
          `UPDATE customers SET sequence = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [i + 1, custId]
        );
      }
    } else if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (item.id) {
          await client.query(
            `UPDATE customers SET sequence = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [Number(item.sequence) || 0, item.id]
          );
        }
      }
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Valid customerIds array or items array is required' });
    }

    await client.query('COMMIT');

    // Return updated customer list
    let fetchQuery = `
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
    `;
    const fetchParams = [];
    if (areaId && areaId !== 'all') {
      fetchParams.push(areaId);
      fetchQuery += ` AND area_id = $1`;
    }
    fetchQuery += ` ORDER BY COALESCE(sequence, 0) ASC, name ASC`;

    const updatedRes = await db.query(fetchQuery, fetchParams);
    res.json({ success: true, customers: updatedRes.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error reordering customers:', err);
    res.status(500).json({ error: 'Failed to reorder customers', details: err.message });
  } finally {
    client.release();
  }
});

// PUT alias for reorder
router.put('/reorder', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { items, customerIds, areaId } = req.body;
    await client.query('BEGIN');

    if (Array.isArray(customerIds) && customerIds.length > 0) {
      for (let i = 0; i < customerIds.length; i++) {
        const custId = customerIds[i];
        await client.query(
          `UPDATE customers SET sequence = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [i + 1, custId]
        );
      }
    } else if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (item.id) {
          await client.query(
            `UPDATE customers SET sequence = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [Number(item.sequence) || 0, item.id]
          );
        }
      }
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Valid customerIds array or items array is required' });
    }

    await client.query('COMMIT');

    let fetchQuery = `
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
    `;
    const fetchParams = [];
    if (areaId && areaId !== 'all') {
      fetchParams.push(areaId);
      fetchQuery += ` AND area_id = $1`;
    }
    fetchQuery += ` ORDER BY COALESCE(sequence, 0) ASC, name ASC`;

    const updatedRes = await db.query(fetchQuery, fetchParams);
    res.json({ success: true, customers: updatedRes.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error reordering customers:', err);
    res.status(500).json({ error: 'Failed to reorder customers', details: err.message });
  } finally {
    client.release();
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
        COALESCE(sequence, 0)::int as "sequence",
        active,
        created_at as "createdAt",
        updated_at as "updatedAt"
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
      sequence,
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

    const customerId = (id && typeof id === 'string' && id.trim()) ? id.trim() : `cust-${Date.now()}`;
    const morningQty = parseFloat(defaultMorningQty) || 0;
    const eveningQty = parseFloat(defaultEveningQty) || 0;
    const rate = parseFloat(pricePerLiter) || 60.0;
    const targetArea = areaId || 'area-1';

    // If sequence is provided use it; otherwise auto-assign next sequence in that area
    let seqVal = sequence !== undefined && sequence !== null ? parseInt(sequence, 10) : null;
    if (seqVal === null || isNaN(seqVal)) {
      const maxRes = await db.query(
        'SELECT COALESCE(MAX(sequence), 0) + 1 as next_seq FROM customers WHERE area_id = $1',
        [targetArea]
      );
      seqVal = parseInt(maxRes.rows[0]?.next_seq, 10) || 1;
    }

    const result = await db.query(`
      INSERT INTO customers (
        id, name, phone, area_id, default_morning_qty, default_evening_qty, price_per_liter, sequence, active, created_at, updated_at
      )
      VALUES (
        COALESCE($1, 'cust-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || floor(random() * 1000)::int),
        $2, $3, $4, $5, $6, $7, $8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        area_id = EXCLUDED.area_id,
        default_morning_qty = EXCLUDED.default_morning_qty,
        default_evening_qty = EXCLUDED.default_evening_qty,
        price_per_liter = EXCLUDED.price_per_liter,
        sequence = EXCLUDED.sequence,
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
        COALESCE(sequence, 0)::int as "sequence",
        active,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      customerId,
      name.trim(),
      formattedPhone,
      targetArea,
      morningQty,
      eveningQty,
      rate,
      seqVal,
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
      sequence,
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

    const seqVal = sequence !== undefined && sequence !== null && !isNaN(parseInt(sequence, 10))
      ? parseInt(sequence, 10)
      : null;

    const result = await db.query(`
      UPDATE customers 
      SET 
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        area_id = COALESCE($3, area_id),
        default_morning_qty = COALESCE($4, default_morning_qty),
        default_evening_qty = COALESCE($5, default_evening_qty),
        price_per_liter = COALESCE($6, price_per_liter),
        sequence = COALESCE($7, sequence),
        active = COALESCE($8, active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING 
        id, 
        name, 
        phone, 
        area_id as "areaId", 
        default_morning_qty::float as "defaultMorningQty", 
        default_evening_qty::float as "defaultEveningQty", 
        price_per_liter::float as "pricePerLiter", 
        COALESCE(sequence, 0)::int as "sequence",
        active,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      name ? name.trim() : null,
      formattedPhone !== undefined ? formattedPhone : phone,
      areaId,
      defaultMorningQty !== undefined ? parseFloat(defaultMorningQty) : null,
      defaultEveningQty !== undefined ? parseFloat(defaultEveningQty) : null,
      pricePerLiter !== undefined ? parseFloat(pricePerLiter) : null,
      seqVal,
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
