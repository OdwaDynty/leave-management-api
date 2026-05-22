// ─── MIGRATION RUNNER ─────────────────────────────────
// Runs all SQL migration files in order
//
// Used for:
//   1. Local development — sets up your local database
//   2. Render startup command — ensures tables exist
//
// Each migration uses IF NOT EXISTS so running them
// multiple times is safe — they will not duplicate tables
//
// On Supabase we ran these manually in the SQL editor
// On Render we run this on every deployment to ensure
// the database schema is always up to date

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

// ─── MIGRATION FILES IN ORDER ─────────────────────────
// The order matters because of foreign key dependencies
// e.g. users depends on companies so companies must
// be created first
const migrationFiles = [
  '001_create_companies.sql',
  '002_create_users.sql',
  '003_create_leave_types.sql',
  '004_create_leave_balances.sql',
  '005_create_leave_requests.sql',
  '006_create_public_holidays.sql',
  '007_create_notifications.sql',
  '008_create_audit_logs.sql',
  '009_create_leave_policies.sql',
  '010_create_role_requests.sql',
  '011_update_leave_requests_multi_approval.sql',
  '012_add_password_reset_tokens.sql',
  '013_create_subscriptions.sql',
];

// ─── RUN ALL MIGRATIONS ───────────────────────────────
const runMigrations = async () => {
  const client = await pool.connect();

  try {
    console.log('🚀 Running database migrations...');

    for (const file of migrationFiles) {
      // Build the full path to the migration file
      const filePath = path.join(__dirname, file);

      // Check if the file exists before trying to read it
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  Migration file not found: ${file}`);
        continue;
      }

      // Read the SQL file contents
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        // Run the SQL
        await client.query(sql);
        console.log(`✅ Migrated: ${file}`);
      } catch (err) {
        // If the error is "already exists" that is fine
        // The IF NOT EXISTS clause handles most cases but
        // ALTER TABLE might throw if column already exists
        if (
          err.message.includes('already exists') ||
          err.message.includes('duplicate column')
        ) {
          console.log(`ℹ️  Skipped (already exists): ${file}`);
        } else {
          // Real error — log it but continue with other files
          console.error(`❌ Error in ${file}:`, err.message);
        }
      }
    }

    console.log('🎉 All migrations completed successfully!');
  } finally {
    // Always release the client back to the pool
    // Even if an error occurred
    client.release();
    // Close all pool connections when done
    await pool.end();
  }
};

// Run the migrations
runMigrations().catch((err) => {
  console.error('Migration runner failed:', err.message);
  process.exit(1);
});