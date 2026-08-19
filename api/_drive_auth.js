// Shared helper: gets a Drive access token using the Service Account
// No expiry issues — service accounts use a signed JWT, always valid.

const { createSign } = require('crypto');

async function getDriveAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Vercel stores \n as literal \\n in env vars — fix it
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    throw new Error('Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY en Vercel');
  }

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  // Build JWT
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const sigInput = `${header}.${payload}`;

  const sign = createSign('RSA-SHA256');
  sign.update(sigInput);
  const signature = sign.sign(privateKey, 'base64url');
  const jwt = `${sigInput}.${signature}`;

  // Exchange JWT for access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || 'No se pudo obtener token de service account');
  return data.access_token;
}

module.exports = { getDriveAccessToken };
