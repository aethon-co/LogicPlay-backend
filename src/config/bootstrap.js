const db = require('./db');

async function ensureCoreTables() {
  await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      email text UNIQUE NOT NULL,
      password text NOT NULL,
      school_name text NOT NULL,
      grade text NOT NULL,
      full_name text NOT NULL,
      created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.students (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      email text UNIQUE NOT NULL,
      full_name text NOT NULL,
      grade text NOT NULL,
      school_name text,
      created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
      updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.games (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name text,
      title text,
      description text,
      subject text,
      category text,
      grade_level text,
      grade text,
      file_url text,
      game_url text,
      thumbnail_url text,
      image_url text,
      file_name text,
      created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
    )
  `);
}

module.exports = { ensureCoreTables };

