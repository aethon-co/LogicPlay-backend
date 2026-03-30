const https = require('https');

/**
 * Send an OTP via 2Factor.in SMS for Indian numbers.
 *
 * Preferred API endpoint:
 *   POST https://2factor.in/API/V1/{API_KEY}/ADDON_SERVICES/SEND/TSMS
 *
 * Returns a promise that resolves to true on success, throws on failure.
 *
 * Env vars required:
 *   TWO_FACTOR_API_KEY — your 2Factor.in API key
 *
 * Optional env vars for explicit transactional SMS:
 *   TWO_FACTOR_SENDER_ID — approved sender ID for transactional SMS
 *   TWO_FACTOR_SMS_TEMPLATE — full SMS body with "{OTP}" placeholder
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
  const senderId = String(process.env.TWO_FACTOR_SENDER_ID || '').trim();
  const template = String(
    process.env.TWO_FACTOR_SMS_TEMPLATE ||
      'Your LogicPlay OTP is {OTP}. It is valid for 10 minutes. Do not share this OTP with anyone. - LogicPlay'
  ).trim();

  if (!senderId) {
    throw new Error('TWO_FACTOR_SENDER_ID is not configured on the server.');
  }

  const msg = template.replace(/\{OTP\}/g, String(otp));
  return postJson(
    {
      hostname: '2factor.in',
      path: `/API/V1/${apiKey}/ADDON_SERVICES/SEND/TSMS`,
      headers: { 'Content-Type': 'application/json' },
    },
    {
      From: senderId,
      To: normalized,
      Msg: msg,
    },
    'Transactional SMS send failed'
  );
}

function postJson(options, payload, errorPrefix) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        port: 443,
        ...options,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            console.info('[smsSender] gateway response', {
              path: options.path,
              statusCode: res.statusCode,
              status: json.Status,
              details: json.Details,
            });
            if (json.Status === 'Success') {
              resolve(true);
            } else {
              reject(new Error(`${errorPrefix}: ${json.Details || 'Unknown error'}`));
            }
          } catch {
            reject(new Error('Invalid response from SMS gateway.'));
          }
        });
      }
    );

    req.on('error', (err) => {
      reject(new Error(`SMS gateway request failed: ${err.message}`));
    });

    if (payload) {
      req.write(JSON.stringify(payload));
    }

    req.end();
  });
}

module.exports = { sendOtpViaTwoFactor, normalizeIndianNumber };
