const https = require('https');

/**
 * Send an OTP via 2Factor.in — cheapest reliable SMS OTP for Indian numbers.
 * 
 * API endpoint:
 *   GET https://2factor.in/API/V1/{API_KEY}/SMS/{PHONE}/{OTP}
 * 
 * Returns a promise that resolves to true on success, throws on failure.
 * 
 * Env vars required:
 *   TWO_FACTOR_API_KEY — your 2Factor.in API key
 */

function normalizeIndianNumber(phone) {
  // Strip whitespace / dashes
  let p = String(phone).replace(/[\s\-()]/g, '');
  // Remove leading +91 or 91 prefix
  if (p.startsWith('+91')) p = p.slice(3);
  else if (p.startsWith('91') && p.length === 12) p = p.slice(2);
  // Must be 10 digits starting with 6-9
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
  const url = `https://2factor.in/API/V1/${apiKey}/SMS/${normalized}/${otp}/LogicPlay`;

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
            reject(new Error(`SMS send failed: ${json.Details || 'Unknown error'}`));
          }
        } catch {
          reject(new Error('Invalid response from SMS gateway.'));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`SMS gateway request failed: ${err.message}`));
    });
  });
}

module.exports = { sendOtpViaTwoFactor, normalizeIndianNumber };
