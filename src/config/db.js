// ─── DATABASE CONFIGURATION ───────────────────────────
// This file sets up the connection pool to PostgreSQL
//
// A connection pool keeps multiple database connections
// open and ready — this is much faster than opening a
// new connection for every API request
//
// Supports three environments:
//   Local development → uses individual DB_ variables
//   Render            → uses DATABASE_URL from Render
//   Supabase          → uses DATABASE_URL from Supabase
//
// Both Render and Supabase provide DATABASE_URL
// automatically so we do not need to change this file
// when switching between them

require('dotenv').config();
const { Pool } = require('pg');

// ─── DECIDE WHICH CONFIG TO USE ───────────────────────
// If DATABASE_URL exists use it — this is set automatically
// by both Render and Supabase
// If it does not exist fall back to individual variables
// for local development
let poolConfig;

if (process.env.DATABASE_URL) {
  // ── Production / Supabase ─────────────────────────
  // Supabase and most cloud databases require SSL
  // rejectUnauthorized: false allows self-signed
  // certificates which cloud providers use
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
    // Connection pool size settings
    // max: maximum number of connections to keep open
    // idleTimeoutMillis: close idle connections after 30s
    // connectionTimeoutMillis: fail if no connection in 2s
    max:                    10,
    idleTimeoutMillis:      30000,
    connectionTimeoutMillis:2000,
  };
} else {
  // ── Local Development ─────────────────────────────
  // No SSL needed for local PostgreSQL
  poolConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'leave_management',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
  };
}

// ─── CREATE THE CONNECTION POOL ───────────────────────
const pool = new Pool(poolConfig);

// ─── LOG CONNECTION STATUS ────────────────────────────
// This fires once when the first query is made
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

// ─── LOG POOL ERRORS ──────────────────────────────────
// This fires if a connection in the pool unexpectedly
// drops — we log the error but do not exit the process
// because the pool will automatically reconnect
pool.on('error', (err) => {
  console.error('❌ Database pool error:', err.message);
});

// ─── QUERY HELPER ────────────────────────────────────
// Runs a SQL query using a connection from the pool
// text   = the SQL string with $1, $2 placeholders
// params = the values to replace $1, $2 etc.
// Using placeholders prevents SQL injection attacks
const query = (text, params) => pool.query(text, params);

// ─── CLIENT HELPER ────────────────────────────────────
// Gets a dedicated connection for transactions
// Used when we need to run multiple queries atomically
// e.g. debit balance AND update request in one transaction
// Always call client.release() when done
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };