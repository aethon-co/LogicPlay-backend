/**
 * Simple in-memory OTP store with TTL.
 * Maps phone -> { otp, expiresAt }
 * Auto-cleans expired entries every 5 minutes.
 */

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_RESEND_INTERVAL_MS = 30 * 1000; // 30 seconds between resends

const _store = new Map(); // phone -> { otp, expiresAt, sentAt }

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of _store.entries()) {
    if (now > entry.expiresAt) _store.delete(phone);
  }
}, 5 * 60 * 1000);

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function saveOtp(phone, otp) {
  const now = Date.now();
  _store.set(phone, {
    otp,
    expiresAt: now + OTP_TTL_MS,
    sentAt: now,
  });
}

function canResend(phone) {
  const entry = _store.get(phone);
  if (!entry) return true;
  return Date.now() - entry.sentAt >= MAX_RESEND_INTERVAL_MS;
}

function verifyOtp(phone, otp) {
  const entry = _store.get(phone);
  if (!entry) return { valid: false, reason: 'OTP not found or expired' };
  if (Date.now() > entry.expiresAt) {
    _store.delete(phone);
    return { valid: false, reason: 'OTP has expired' };
  }
  if (entry.otp !== String(otp).trim()) {
    return { valid: false, reason: 'Incorrect OTP' };
  }
  _store.delete(phone); // single use
  return { valid: true };
}

module.exports = { generateOtp, saveOtp, canResend, verifyOtp };
