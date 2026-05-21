// ─── MIGRATION RUNNER ─────────────────────────────────
// This script runs all SQL migration files in order
// Run it with: npm run migrate

require('dotenv').config();

const { Pool } = require('pg');
const fs       = require('fs');   // File system — to read .sql files
const path     = require('path'); // To build file paths correctly

// Connect to the database
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// List all migration files in the order they must run
// Order matters — users depends on companies, so companies must run first
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
];

const runMigrations = async () => {
  console.log('🔄 Running migrations...\n');

  for (const file of migrationFiles) {
    // Build the full path to the SQL file
    const filePath = path.join(__dirname, file);

    // Read the SQL file contents as a string
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
      // Execute the SQL against the database
      await pool.query(sql);
      console.log(`✅ Migrated: ${file}`);
    } catch (err) {
      // If any migration fails, stop everything and report the error
      console.error(`❌ Failed: ${file}`);
      console.error(`   Error: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\n🎉 All migrations completed successfully!');
  console.log('📋 Tables created: companies, users, leave_types, leave_balances, leave_requests, public_holidays, notifications');

  // Close the database connection when done
  await pool.end();
};

// Run the migrations
runMigrations();