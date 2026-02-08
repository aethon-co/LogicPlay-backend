const db = require('../config/db');
const { hashPassword, verifyPassword, signToken } = require('../utils/security');

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function getAuthSecret() {
  return process.env.AUTH_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-insecure-secret';
}

function publicUser(userRow) {
  if (!userRow) return null;
  const { password, ...rest } = userRow;
  return rest;
}

async function getImportedStudent(email) {
  try {
    const student = await db.query(
      'SELECT email, full_name, grade, school_name FROM students WHERE email = $1 LIMIT 1',
      [email],
    );
    return student.rows[0] ?? null;
  } catch (_) {
    return null;
  }
}

exports.signup = async (req, res) => {
  const { email, password, schoolName, grade, name } = req.body;

  if (!email || !password || !schoolName || !name) {
    return res.status(400).json({ error: 'All fields (email, password, schoolName, name) are required' });
  }

  try {
    const emailNorm = normalizeEmail(email);
    if (!emailNorm.includes('@')) return res.status(400).json({ error: 'Invalid email' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [emailNorm]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const importedStudent = await getImportedStudent(emailNorm);
    const resolvedGrade = String(importedStudent?.grade ?? grade ?? '').trim();
    if (!resolvedGrade) {
      return res.status(400).json({ error: 'Grade is required (or import student CSV first)' });
    }

    const resolvedName = String(name || importedStudent?.full_name || 'Student').trim();
    const resolvedSchool = String(importedStudent?.school_name || schoolName).trim();

    const passwordHash = hashPassword(password);
    const newUser = await db.query(
      'INSERT INTO users (email, password, school_name, grade, full_name) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, school_name, grade',
      [emailNorm, passwordHash, resolvedSchool, resolvedGrade, resolvedName]
    );

    const user = newUser.rows[0];
    const token = signToken({ sub: user.id }, getAuthSecret());
    res.status(201).json({
      message: 'User created successfully',
      token,
      user,
      gradeSource: importedStudent ? 'students_csv' : 'signup_input',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const emailNorm = normalizeEmail(email);
    const result = await db.query('SELECT * FROM users WHERE email = $1', [emailNorm]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const userRow = result.rows[0];
    let ok = false;
    const stored = userRow.password;
    if (typeof stored === 'string' && stored.startsWith('pbkdf2_')) {
      ok = verifyPassword(password, stored);
    } else {
      // Legacy plaintext passwords (older schema) — upgrade on successful login.
      ok = String(password) === String(stored);
      if (ok) {
        try {
          const upgraded = hashPassword(password);
          await db.query('UPDATE users SET password = $1 WHERE id = $2', [upgraded, userRow.id]);
          userRow.password = upgraded;
        } catch (_) {
          // If upgrade fails, still allow login.
        }
      }
    }
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken({ sub: userRow.id }, getAuthSecret());
    res.status(200).json({ message: 'Login successful', token, user: publicUser(userRow) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.me = async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  return res.status(200).json({ user: req.user });
};
