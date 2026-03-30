const https = require('https');

function normalizeIndianNumber(phone) {
  let p = String(phone).replace(/[\s\-()]/g, '');
  if (p.startsWith('+91')) p = p.slice(3);
  else if (p.startsWith('91') && p.length === 12) p = p.slice(2);
  if (!/^[6-9]\d{9}$/.test(p)) {
    throw new Error('Please enter a valid 10-digit Indian mobile number.');
  }
  return p;
}

function formatWhatsAppNumber(phone) {
  return `+91${normalizeIndianNumber(phone)}`;
}

async function sendOtpViaWhatsApp(phone, otp) {
  const phoneNumberId = String(process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID || '').trim();
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const templateName = String(process.env.WHATSAPP_OTP_TEMPLATE_NAME || '').trim();
  const apiVersion = String(process.env.WHATSAPP_API_VERSION || 'v20.0').trim();
  const languageCode = String(process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || 'en_US').trim();

  if (!phoneNumberId) {
    throw new Error('WHATSAPP_BUSINESS_PHONE_NUMBER_ID is not configured on the server.');
  }
  if (!accessToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN is not configured on the server.');
  }
  if (!templateName) {
    throw new Error('WHATSAPP_OTP_TEMPLATE_NAME is not configured on the server.');
  }

  const to = formatWhatsAppNumber(phone);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: String(otp),
            },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: 0,
          parameters: [
            {
              type: 'text',
              text: String(otp),
            },
          ],
        },
      ],
    },
  };

  return postJson(
    {
      hostname: 'graph.facebook.com',
      path: `/${apiVersion}/${phoneNumberId}/messages`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
    payload
  );
}

function postJson(options, payload) {
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
            const messageId = json?.messages?.[0]?.id;
            console.info('[whatsappSender] gateway response', {
              path: options.path,
              statusCode: res.statusCode,
              messageId,
              error: json?.error?.message,
            });

            if (res.statusCode >= 200 && res.statusCode < 300 && messageId) {
              resolve(true);
              return;
            }

            reject(
              new Error(
                json?.error?.message || 'WhatsApp send failed with an unexpected response.'
              )
            );
          } catch {
            reject(new Error('Invalid response from WhatsApp gateway.'));
          }
        });
      }
    );

    req.on('error', (err) => {
      reject(new Error(`WhatsApp gateway request failed: ${err.message}`));
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

module.exports = { sendOtpViaWhatsApp, normalizeIndianNumber };
