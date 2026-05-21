// ─── DATABASE CONFIGURATION ───────────────────────────
// Supports both local development and Railway production
//
// Local development:
//   Uses individual DB_HOST, DB_PORT etc. from .env
//
// Railway production:
//   Uses DATABASE_URL which Railway provides automatically
//   Format: postgresql://user:password@host:port/dbname
//
// The Pool automatically manages connections so we do not
// need to open and close connections manually

require('dotenv').config();
const { Pool } = require('pg');

// ─── BUILD POOL CONFIG ────────────────────────────────
// If DATABASE_URL exists (Railway) use it directly
// Otherwise build config from individual variables (local)
const poolConfig = process.env.DATABASE_URL
  ? {
      // Railway production — use the full connection string
      connectionString: process.env.DATABASE_URL,
      // Railway requires SSL in production
      // rejectUnauthorized: false allows self-signed certs
      ssl: {
        rejectUnauthorized: false,
      },
    }
  : {
      // Local development — use individual variables
      host:     process.env.DB_HOST,
      port:     process.env.DB_PORT,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

// Create the connection pool with the correct config
const pool = new Pool(poolConfig);

// Log connection status on startup
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

// Log and exit if the pool hits a fatal error
pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
  process.exit(1);
});

// Helper to run a SQL query
// Uses $1, $2 placeholders to prevent SQL injection
const query = (text, params) => pool.query(text, params);

// Helper to get a dedicated client for transactions
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };