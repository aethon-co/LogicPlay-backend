require('dotenv').config();
const { Client } = require('pg');

// Try constructing a direct connection string
// Original: postgresql://postgres.gtegbguedauzyatwjeyj:nMnsFiG3OYYQUVKs@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
const projectRef = 'gtegbguedauzyatwjeyj';
const password = 'nMnsFiG3OYYQUVKs';
const directConnectionString = `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;

console.log('Testing connection to DIRECT URL:', directConnectionString.replace(/:[^:@]*@/, ':****@'));

const client = new Client({
  connectionString: directConnectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function testConnection() {
  try {
    await client.connect();
    console.log('Successfully connected to the database!');
    const res = await client.query('SELECT NOW()');
    console.log('Current time from DB:', res.rows[0]);
    await client.end();
  } catch (err) {
    console.error('Connection error:', err);
  }
}

testConnection();
