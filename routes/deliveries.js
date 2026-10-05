const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// GET deliveries with optional filters
router.get('/', async (req, res) => {
  try {
    const { date, shift, customerId, month, areaId } = req.query;
    let query = `
      SELECT 
        d.id,
        d.customer_id as "customerId",
        COALESCE(c.name, d.customer_name) as "customerName",
        TO_CHAR(d.date, 'YYYY-MM-DD') as "date",
        d.shift,
        d.qty::float as "qty",
        d.rate::float as "rate",
        d.amount::float as "amount",
        d.supply_boy_id as "supplyBoyId",
        COALESCE(d.area_id, c.area_id) as "areaId",
        d.recorded_at as "recordedAt"
      FROM deliveries d
      LEFT JOIN customers c ON d.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      params.push(date);
      query += ` AND d.date = $${params.length}`;
    }

    if (shift) {
      params.push(shift.toLowerCase());
      query += ` AND LOWER(d.shift) = $${params.length}`;
    }

    if (customerId) {
      params.push(customerId);
      query += ` AND d.customer_id = $${params.length}`;
    }

    if (month) {
      // month: '2026-10'
      params.push(`${month}%`);
      query += ` AND TO_CHAR(d.date, 'YYYY-MM') LIKE $${params.length}`;
    }

    if (areaId && areaId !== 'all') {
      params.push(areaId);
      query += ` AND (d.area_id = $${params.length} OR c.area_id = $${params.length})`;
    }

    query += ` ORDER BY d.date DESC, d.shift ASC, d.customer_name ASC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching deliveries:', err);
    res.status(500).json({ error: 'Failed to fetch deliveries', details: err.message });
  }
});

// POST /api/deliveries/batch - batch save/upsert daily entries
router.post('/batch', async (req, res) => {
  try {
    const { entries, date, shift, supplyBoyId, areaId } = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'Entries must be an array' });
    }

    const savedCount = await db.transaction(async (client) => {
      let count = 0;
      for (const item of entries) {
        const custId = item.customerId;
        const itemDate = item.date || date;
        const itemShift = item.shift || shift;
        const qty = parseFloat(item.qty) || 0;
        const rate = parseFloat(item.rate) || 60;
        const amount = Math.round(qty * rate);
        const sbId = item.supplyBoyId || supplyBoyId || 'admin';
        const aId = item.areaId || areaId || 'area-1';
        const custName = item.customerName || '';
        const entryId = item.id || `del-${custId}-${itemDate}-${itemShift.toLowerCase()}`;

        if (qty > 0) {
          // Upsert delivery
          await client.query(`
            INSERT INTO deliveries (
              id, customer_id, customer_name, date, shift, qty, rate, amount, supply_boy_id, area_id, recorded_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
            ON CONFLICT (customer_id, date, shift) DO UPDATE SET
              qty = EXCLUDED.qty,
              rate = EXCLUDED.rate,
              amount = EXCLUDED.amount,
              customer_name = COALESCE(EXCLUDED.customer_name, deliveries.customer_name),
              supply_boy_id = EXCLUDED.supply_boy_id,
              area_id = EXCLUDED.area_id,
              recorded_at = CURRENT_TIMESTAMP
          `, [
            entryId,
            custId,
            custName,
            itemDate,
            itemShift,
            qty,
            rate,
            amount,
            sbId,
            aId,
          ]);
          count++;
        } else {
          // If qty is 0, delete any existing record for this customer, date, and shift
          await client.query(`
            DELETE FROM deliveries
            WHERE customer_id = $1 AND date = $2 AND LOWER(shift) = LOWER($3)
          `, [custId, itemDate, itemShift]);
        }
      }
      return count;
    });

    res.json({ success: true, count: savedCount, message: `Processed ${entries.length} entries successfully` });
  } catch (err) {
    console.error('Error saving deliveries batch:', err);
    res.status(500).json({ error: 'Failed to save deliveries batch', details: err.message });
  }
});

// DELETE single delivery
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM deliveries WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting delivery:', err);
    res.status(500).json({ error: 'Failed to delete delivery', details: err.message });
  }
});

module.exports = router;
