const express = require('express');
const router = express.Router();
const db = require('../db/pool');

// GET /api/reports/monthly-summary?month=YYYY-MM&areaId=...
router.get('/monthly-summary', async (req, res) => {
  try {
    const { month, areaId } = req.query;
    const targetMonth = month || new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    // Get all active customers first (optionally filtered by area)
    let custQuery = `
      SELECT 
        c.id as "customerId",
        c.name as "customerName",
        c.phone,
        c.area_id as "areaId",
        c.price_per_liter::float as "pricePerLiter",
        COALESCE(c.sequence, 0)::int as "sequence"
      FROM customers c
      WHERE c.active = true
    `;
    const custParams = [];
    if (areaId && areaId !== 'all') {
      custParams.push(areaId);
      custQuery += ` AND c.area_id = $${custParams.length}`;
    }
    custQuery += ` ORDER BY COALESCE(c.sequence, 0) ASC, c.name ASC`;

    const customersResult = await db.query(custQuery, custParams);
    const customers = customersResult.rows;

    // Get deliveries for this month
    let delQuery = `
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
        COALESCE(c.sequence, 0)::int as "sequence"
      FROM deliveries d
      LEFT JOIN customers c ON d.customer_id = c.id
      WHERE TO_CHAR(d.date, 'YYYY-MM') = $1
    `;
    const delParams = [targetMonth];

    if (areaId && areaId !== 'all') {
      delParams.push(areaId);
      delQuery += ` AND (d.area_id = $2 OR c.area_id = $2)`;
    }

    delQuery += ` ORDER BY d.date ASC, d.shift ASC`;

    const deliveriesResult = await db.query(delQuery, delParams);
    const deliveries = deliveriesResult.rows;

    // Aggregate per customer
    const customerMap = {};
    customers.forEach((c) => {
      customerMap[c.customerId] = {
        customerId: c.customerId,
        customerName: c.customerName,
        phone: c.phone || '',
        areaId: c.areaId,
        sequence: c.sequence || 0,
        totalMilk: 0,
        totalAmount: 0,
        deliveryCount: 0,
        entries: [],
      };
    });

    deliveries.forEach((del) => {
      if (!customerMap[del.customerId]) {
        customerMap[del.customerId] = {
          customerId: del.customerId,
          customerName: del.customerName || 'Customer',
          phone: '',
          areaId: del.areaId || 'area-1',
          sequence: del.sequence || 0,
          totalMilk: 0,
          totalAmount: 0,
          deliveryCount: 0,
          entries: [],
        };
      }
      const item = customerMap[del.customerId];
      item.totalMilk += Number(del.qty || 0);
      item.totalAmount += Number(del.amount || 0);
      item.deliveryCount += 1;
      item.entries.push(del);
    });

    const customerSummaries = Object.values(customerMap)
      .map((c) => ({
        ...c,
        totalMilk: Number(c.totalMilk.toFixed(2)),
        totalAmount: Math.round(c.totalAmount),
      }))
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0) || a.customerName.localeCompare(b.customerName));

    const grandTotalMilk = customerSummaries.reduce((sum, c) => sum + c.totalMilk, 0);
    const grandTotalAmount = customerSummaries.reduce((sum, c) => sum + c.totalAmount, 0);
    const activeCustomersCount = customerSummaries.filter((c) => c.totalMilk > 0).length || customerSummaries.length;

    res.json({
      month: targetMonth,
      totalCustomers: activeCustomersCount,
      totalMilk: Number(grandTotalMilk.toFixed(2)),
      totalAmount: grandTotalAmount,
      customerSummaries,
    });
  } catch (err) {
    console.error('Error generating monthly summary:', err);
    res.status(500).json({ error: 'Failed to generate monthly summary', details: err.message });
  }
});

// GET /api/reports/customer-bill?customerId=...&month=YYYY-MM
router.get('/customer-bill', async (req, res) => {
  try {
    const { customerId, month } = req.query;
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    const targetMonth = month || new Date().toISOString().slice(0, 7);

    // Get customer details
    const custResult = await db.query(`
      SELECT 
        id, 
        name, 
        phone, 
        area_id as "areaId", 
        default_morning_qty::float as "defaultMorningQty", 
        default_evening_qty::float as "defaultEveningQty", 
        price_per_liter::float as "pricePerLiter"
      FROM customers 
      WHERE id = $1
    `, [customerId]);

    const customer = custResult.rows[0] || {
      id: customerId,
      name: 'Customer',
      phone: '',
      pricePerLiter: 60,
    };

    // Get all delivery entries for this customer in target month
    const delResult = await db.query(`
      SELECT 
        id,
        customer_id as "customerId",
        customer_name as "customerName",
        TO_CHAR(date, 'YYYY-MM-DD') as "date",
        shift,
        qty::float as "qty",
        rate::float as "rate",
        amount::float as "amount",
        supply_boy_id as "supplyBoyId",
        area_id as "areaId",
        recorded_at as "recordedAt"
      FROM deliveries
      WHERE customer_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2
      ORDER BY date ASC, shift ASC
    `, [customerId, targetMonth]);

    const entries = delResult.rows;
    const totalMilk = entries.reduce((sum, e) => sum + Number(e.qty || 0), 0);
    const totalAmount = entries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    res.json({
      customer,
      month: targetMonth,
      entries,
      totalMilk: Number(totalMilk.toFixed(2)),
      totalAmount: Math.round(totalAmount),
    });
  } catch (err) {
    console.error('Error generating customer bill:', err);
    res.status(500).json({ error: 'Failed to generate customer bill', details: err.message });
  }
});

module.exports = router;
