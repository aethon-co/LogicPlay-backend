const https = require('https');

/**
 * Deliver an OTP via a 2Factor.in VOICE CALL — the user receives an automated
 * phone call that reads out their OTP digits.
 *
 * API endpoint:
 *   GET https://2factor.in/API/V1/{API_KEY}/VOICE/{PHONE}/{OTP}
 *
 * Returns a promise that resolves to true on success, throws on failure.
 *
 * Env vars required:
 *   TWO_FACTOR_API_KEY — your 2Factor.in API key
 */

function normalizeIndianNumber(phone) {
  let p = String(phone).replace(/[\s\-()]/g, '');
  if (p.startsWith('+91')) p = p.slice(3);
  else if (p.startsWith('91') && p.length === 12) p = p.slice(2);
  if (!/^[6-9]\d{9}$/.test(p)) {
    throw new Error('Please enter a valid 10-digit Indian mobile number.');
  }
  return p;
}

async function sendOtpViaTwoFactor(phone, otp) {
  const apiKey = process.env.TWO_FACTOR_API_KEY;
  if (!apiKey) {
    throw new Error('TWO_FACTOR_API_KEY is not configured on the server.');
  }

  const normalized = normalizeIndianNumber(phone);
  // VOICE call — 2Factor will call the number and read out the OTP digits
  const url = `https://2factor.in/API/V1/${apiKey}/VOICE/${normalized}/${otp}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.Status === 'Success') {
            resolve(true);
          } else {
            reject(new Error(`Voice call failed: ${json.Details || 'Unknown error'}`));
          }
        } catch {
          reject(new Error('Invalid response from voice OTP gateway.'));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Voice OTP request failed: ${err.message}`));
    });
  });
}

module.exports = { sendOtpViaTwoFactor, normalizeIndianNumber };
