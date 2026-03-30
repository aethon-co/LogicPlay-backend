const db = require('../config/db');
const { hashPassword, verifyPassword, signToken } = require('../utils/security');
const { generateOtp, saveOtp, canResend, verifyOtp: verifyOtpInStore } = require('../utils/otpStore');
const { sendOtpViaWhatsApp, normalizeIndianNumber } = require('../utils/whatsappSender');

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

function maskPhone(phone) {
  const value = String(phone || '').trim();
  if (value.length < 4) return 'unknown';
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
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

// ─── OTP: Send ─────────────────────────────────────────────────────────────

exports.sendOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  let normalized;
  try {
    normalized = normalizeIndianNumber(phone);
  } catch (err) {
    console.warn('[auth/send-otp] invalid phone', { phone: maskPhone(phone), error: err.message });
    return res.status(400).json({ error: err.message });
  }

  if (!canResend(normalized)) {
    console.warn('[auth/send-otp] resend throttled', { phone: maskPhone(normalized) });
    return res.status(429).json({ error: 'Please wait 30 seconds before requesting a new OTP.' });
  }

  const otp = generateOtp();
  saveOtp(normalized, otp);
  console.info('[auth/send-otp] sending OTP', { phone: maskPhone(normalized) });

  try {
    await sendOtpViaWhatsApp(normalized, otp);
    console.info('[auth/send-otp] OTP sent', { phone: maskPhone(normalized) });
    return res.status(200).json({ message: 'OTP sent successfully on WhatsApp.' });
  } catch (err) {
    console.error('[auth/send-otp] OTP send failed', { phone: maskPhone(normalized), error: err.message });
    return res.status(500).json({ error: err.message });
  }
};

// ─── OTP: Verify ───────────────────────────────────────────────────────────

exports.verifyOtp = async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required.' });
  }

  let normalized;
  try {
    normalized = normalizeIndianNumber(phone);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const result = verifyOtpInStore(normalized, otp);
  if (!result.valid) {
    return res.status(400).json({ error: result.reason });
  }

  return res.status(200).json({ message: 'OTP verified successfully.', verified: true });
};

// ─── Signup ────────────────────────────────────────────────────────────────

exports.signup = async (req, res) => {
  const { email, password, schoolName, grade, name, phone } = req.body;

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

    // Normalize phone if provided
    let phoneNorm = null;
    if (phone) {
      try { phoneNorm = normalizeIndianNumber(phone); } catch (_) {}
    }

    const newUser = await db.query(
      'INSERT INTO users (email, password, school_name, grade, full_name, phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, full_name, school_name, grade, phone',
      [emailNorm, passwordHash, resolvedSchool, resolvedGrade, resolvedName, phoneNorm]
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
    // If phone column doesn't exist yet, fall back without phone
    if (error.message && error.message.includes('column "phone" of relation "users" does not exist')) {
      try {
        const emailNorm = normalizeEmail(email);
        const importedStudent = await getImportedStudent(emailNorm);
        const resolvedGrade = String(importedStudent?.grade ?? grade ?? '').trim();
        const resolvedName = String(name || importedStudent?.full_name || 'Student').trim();
        const resolvedSchool = String(importedStudent?.school_name || schoolName).trim();
        const passwordHash = hashPassword(password);
        const newUser = await db.query(
          'INSERT INTO users (email, password, school_name, grade, full_name) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, school_name, grade',
          [emailNorm, passwordHash, resolvedSchool, resolvedGrade, resolvedName]
        );
        const user = newUser.rows[0];
        const token = signToken({ sub: user.id }, getAuthSecret());
        return res.status(201).json({ message: 'User created successfully', token, user });
      } catch (fallbackErr) {
        return res.status(500).json({ error: fallbackErr.message });
      }
    }
    res.status(500).json({ error: error.message });
  }
};

// ─── Login ─────────────────────────────────────────────────────────────────

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
