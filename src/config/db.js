// Load environment variables from the .env file
require('dotenv').config();

// Import the PostgreSQL library
const { Pool } = require('pg');

// ─── CREATE CONNECTION POOL ───────────────────────────
// A pool keeps several database connections open and reuses them
// This is much faster than opening a new connection on every request
const pool = new Pool({
  host:     process.env.DB_HOST,      // Database server address
  port:     process.env.DB_PORT,      // PostgreSQL port (default 5432)
  database: process.env.DB_NAME,      // Database name
  user:     process.env.DB_USER,      // Database username
  password: process.env.DB_PASSWORD,  // Database password
});

// ─── CONNECTION EVENTS ────────────────────────────────
// Fires once when the pool successfully connects to the database
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

// Fires if the pool hits an unexpected error
// We exit the process because the app cannot work without a database
pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
  process.exit(1);
});

// ─── QUERY HELPER ─────────────────────────────────────
// A shortcut function to run a SQL query
// Example: query('SELECT * FROM users WHERE id = $1', [userId])
// We use $1, $2 placeholders (never string concatenation) to prevent SQL injection
const query = (text, params) => pool.query(text, params);

// ─── TRANSACTION HELPER ───────────────────────────────
// Returns a dedicated client for multi-step transactions
// Example: creating a company AND a user at the same time
// If one step fails, we can roll back both — keeping data clean
const getClient = () => pool.connect();

// Export so other files in the project can use these helpers
module.exports = { query, getClient, pool };