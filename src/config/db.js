const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_URL;

if (!connectionString) {
  console.error('Missing DATABASE_URL/SUPABASE_URL in .env');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  // Keep pool tiny — Supabase Transaction mode (port 6543) supports many
  // logical connections but each pg.Pool slot holds a real server connection.
  // On Render free tier a pool of 3 is safe and more than enough.
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
