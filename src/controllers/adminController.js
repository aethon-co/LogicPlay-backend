const db = require('../config/db');

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"(.*)"$/, '$1').trim());
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function pick(row, keyMap, candidates) {
  for (const name of candidates) {
    const idx = keyMap.get(name);
    if (typeof idx === 'number') return row[idx] ?? '';
  }
  return '';
}

async function ensureStudentsTable() {
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
}

exports.importStudentsCsv = async (req, res) => {
  const csvText = typeof req.body === 'string' ? req.body : req.body?.csv;
  if (!csvText || typeof csvText !== 'string') {
    return res.status(400).json({ error: 'CSV content required. Send text/csv body or { "csv": "..." }' });
  }

  try {
    await ensureStudentsTable();

    const lines = csvText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must include header and at least one row' });
    }

    const headers = splitCsvLine(lines[0]).map(normalizeHeader);
    const keyMap = new Map();
    headers.forEach((h, index) => keyMap.set(h, index));

    const required = ['email', 'grade'];
    const missing = required.filter((k) => !keyMap.has(k));
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required header(s): ${missing.join(', ')}` });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const row = splitCsvLine(lines[lineIndex]);
      const email = normalizeEmail(pick(row, keyMap, ['email', 'student_email']));
      const grade = String(pick(row, keyMap, ['grade', 'class', 'grade_level'])).trim();
      const fullName = String(pick(row, keyMap, ['full_name', 'name', 'student_name']) || 'Student').trim();
      const schoolName = String(pick(row, keyMap, ['school_name', 'school']) || '').trim();

      if (!email || !email.includes('@') || !grade) {
        skipped += 1;
        continue;
      }

      const existing = await db.query('SELECT id FROM students WHERE email = $1', [email]);
      if (existing.rows.length === 0) {
        await db.query(
          'INSERT INTO students (email, full_name, grade, school_name) VALUES ($1, $2, $3, $4)',
          [email, fullName || 'Student', grade, schoolName || null],
        );
        inserted += 1;
      } else {
        await db.query(
          `UPDATE students
           SET full_name = $2, grade = $3, school_name = $4, updated_at = timezone('utc'::text, now())
           WHERE email = $1`,
          [email, fullName || 'Student', grade, schoolName || null],
        );
        updated += 1;
      }
    }

    return res.status(200).json({
      message: 'students_import_complete',
      totalRows: lines.length - 1,
      inserted,
      updated,
      skipped,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

