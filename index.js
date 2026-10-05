const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./db/initDb');
const mastersRoutes = require('./routes/masters');
const areasRoutes = require('./routes/areas');
const usersRoutes = require('./routes/users');
const customersRoutes = require('./routes/customers');
const deliveriesRoutes = require('./routes/deliveries');
const reportsRoutes = require('./routes/reports');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Aanira Milk API',
    database: 'PostgreSQL (Neon)',
    timestamp: new Date().toISOString(),
  });
});

// Route registration
app.use('/api/masters', mastersRoutes);
app.use('/api/areas', areasRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/deliveries', deliveriesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/auth', authRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start Server after ensuring database tables are ready
async function startServer() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`🚀 Aanira Milk Backend Server running on http://localhost:${PORT}`);
      console.log(`📡 Connected to PostgreSQL Neon DB`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
