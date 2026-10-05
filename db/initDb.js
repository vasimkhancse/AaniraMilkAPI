const { pool } = require('./pool');

async function initDb() {
  const client = await pool.connect();
  try {
    console.log('🔗 Connecting to PostgreSQL Neon Database...');
    await client.query('BEGIN');

    // 1. Settings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Areas Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS areas (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        short_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Users Table (Staff & Supply Boys)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'supply_boy',
        assigned_area VARCHAR(100) DEFAULT 'all',
        phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE users DROP COLUMN IF EXISTS username CASCADE;
    `);

    // 4. Customers Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        area_id VARCHAR(100) REFERENCES areas(id) ON DELETE SET NULL,
        default_morning_qty NUMERIC(8, 2) DEFAULT 1.0,
        default_evening_qty NUMERIC(8, 2) DEFAULT 0.0,
        price_per_liter NUMERIC(10, 2) DEFAULT 60.00,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Deliveries / Daily Entries Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id VARCHAR(150) PRIMARY KEY,
        customer_id VARCHAR(100) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        customer_name VARCHAR(255),
        date DATE NOT NULL,
        shift VARCHAR(50) NOT NULL,
        qty NUMERIC(8, 2) NOT NULL,
        rate NUMERIC(10, 2) NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        supply_boy_id VARCHAR(100),
        area_id VARCHAR(100),
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_delivery_customer_date_shift UNIQUE (customer_id, date, shift)
      );
    `);

    // Create Indexes for rapid querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_deliveries_date_shift ON deliveries(date, shift);
      CREATE INDEX IF NOT EXISTS idx_deliveries_customer ON deliveries(customer_id);
      CREATE INDEX IF NOT EXISTS idx_deliveries_date ON deliveries(date);
    `);

    // Seed default settings if missing
    await client.query(`
      INSERT INTO settings (key, value)
      VALUES 
        ('milkRatePerLiter', '60'::jsonb),
        ('quantityPresets', '[
          {"label": "1/4 L", "value": 0.25, "display": "0.25"},
          {"label": "1/2 L", "value": 0.5, "display": "0.5"},
          {"label": "1 L", "value": 1.0, "display": "1"},
          {"label": "1.5 L", "value": 1.5, "display": "1.5"},
          {"label": "2 L", "value": 2.0, "display": "2"}
        ]'::jsonb),
        ('shifts', '[
          {"id": "morning", "name": "Morning", "icon": "sunny-outline", "timeRange": "6:00 AM - 8:30 AM"},
          {"id": "evening", "name": "Evening", "icon": "moon-outline", "timeRange": "5:00 PM - 7:30 PM"}
        ]'::jsonb)
      ON CONFLICT (key) DO NOTHING;
    `);

    // Seed default Areas if empty
    const areaCheck = await client.query('SELECT COUNT(*) FROM areas');
    if (parseInt(areaCheck.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO areas (id, name, short_name) VALUES
          ('area-1', 'Area 1 - Kovaipudur North', 'Area 1'),
          ('area-2', 'Area 2 - Kovaipudur South', 'Area 2'),
          ('area-3', 'Area 3 - Ashram Road', 'Area 3'),
          ('area-4', 'Area 4 - VLB Ring Road', 'Area 4')
        ON CONFLICT (id) DO NOTHING;
      `);
      console.log('✅ Initialized default delivery areas.');
    }

    // Seed default Staff & Admin users if empty
    const userCheck = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCheck.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO users (id,name, role, assigned_area, phone) VALUES
          ('admin', 'Store Admin', 'admin', 'all', '+91 99440 00000'),
          ('ravi_sb', 'Ravi Kumar', 'supply_boy', 'area-1', '+91 98765 43210'),
          ('bala_sb', 'Bala Murugan', 'supply_boy', 'area-2', '+91 98456 12345'),
          ('kumar_sb', 'Kumar Logan', 'supply_boy', 'area-3', '+91 97890 12345')
        ON CONFLICT (id) DO NOTHING;
      `);
      console.log('✅ Initialized default staff users.');
    }

    await client.query('COMMIT');
    console.log('✅ PostgreSQL schema & master tables initialized successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  initDb().then(() => {
    console.log('Database initialization script finished.');
    process.exit(0);
  }).catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
}

module.exports = { initDb };
