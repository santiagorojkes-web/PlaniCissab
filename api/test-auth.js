const { createSign } = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey     = process.env.GOOGLE_PRIVATE_KEY || '';
  const privateKey = rawKey.replace(/\\n/g, '\n');

  // Step 1: check env vars
  if (!email)      return res.status(500).json({ step: 1, error: 'GOOGLE_SERVICE_ACCOUNT_EMAIL no está configurada en Vercel' });
  if (!rawKey)     return res.status(500).json({ step: 1, error: 'GOOGLE_PRIVATE_KEY no está configurada en Vercel' });
  if (!privateKey.includes('BEGIN')) return res.status(500).json({
    step: 1, error: 'GOOGLE_PRIVATE_KEY no tiene el formato correcto (falta -----BEGIN...-----)',
    preview: privateKey.substring(0, 80)
  });

  // Step 2: try JWT signing
  let jwt;
  try {
    const now     = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: email, scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now
    })).toString('base64url');
    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    jwt = `${header}.${payload}.${sign.sign(privateKey, 'base64url')}`;
  } catch(e) {
    return res.status(500).json({ step: 2, error: 'Error firmando JWT: ' + e.message });
  }

  // Step 3: exchange JWT for access token
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    });
    const d = await r.json();
    if (d.access_token) return res.status(200).json({ success: true, message: 'Service account funciona correctamente', email });
    return res.status(500).json({ step: 3, error: 'Google rechazó el token', googleError: d.error, desc: d.error_description });
  } catch(e) {
    return res.status(500).json({ step: 3, error: 'Error conectando con Google: ' + e.message });
  }
};
