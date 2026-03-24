const db = require('./db');

async function ensureCoreTables() {
  // pgcrypto is pre-installed on Supabase; ignore if already exists
  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  } catch (_) {}

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

  // Add multiplayer_score column to users (safe to run multiple times)
  await db.query(`
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS multiplayer_score integer DEFAULT 0 NOT NULL
  `);

  // Multiplayer match history
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.multiplayer_history (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      player1_id uuid,
      player1_name text NOT NULL,
      player2_id uuid,
      player2_name text NOT NULL,
      player1_score integer DEFAULT 0,
      player2_score integer DEFAULT 0,
      winner_id uuid,
      played_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
    )
  `);
}

module.exports = { ensureCoreTables };

