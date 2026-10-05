const { Pool } = require('pg');
require('dotenv').config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_XQEkwOo8Lr7J@ep-sparkling-dust-b4ztwx0b-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 20,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err, client) => {
  console.warn('PostgreSQL pool background notification:', err.message);
});

// Helper for single queries with automatic retry
async function query(text, params, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      if (attempt === retries || !err.message.includes('Connection terminated')) {
        throw err;
      }
      console.warn(`[db.query] Connection hiccup on attempt ${attempt + 1}, retrying...`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

// Helper for transactions with automatic retry
async function transaction(callback, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (_) {}
      }
      if (attempt === retries || !err.message.includes('Connection terminated')) {
        throw err;
      }
      console.warn(`[db.transaction] Retrying transaction attempt ${attempt + 1}...`);
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      if (client) client.release();
    }
  }
}

module.exports = {
  query,
  transaction,
  pool,
};
