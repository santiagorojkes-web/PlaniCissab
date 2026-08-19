const { createSign } = require('crypto');
const ROOT_FOLDER_ID = '1hiLmTa_gwzq39fmbUadm8utnhL-XiUme';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  try {
    // Get token
    const now     = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: email, scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now
    })).toString('base64url');
    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const jwt = `${header}.${payload}.${sign.sign(privateKey, 'base64url')}`;
    const tr = await (await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    })).json();
    const token = tr.access_token;
    if (!token) return res.status(500).json({ error: 'No token', details: tr });

    const auth = `Bearer ${token}`;

    // Test 1: list files in root Planificaciones folder
    const r1 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${ROOT_FOLDER_ID}' in parents and trashed=false`)}&fields=files(id,name)&pageSize=10`, {
      headers: { Authorization: auth }
    });
    const d1 = await r1.json();

    if (d1.error) return res.status(500).json({
      error: 'Service account no puede acceder a la carpeta Planificaciones',
      googleError: d1.error.message,
      solucion: `Compartí la carpeta con ID ${ROOT_FOLDER_ID} con ${email} como Editor en Drive`
    });

    return res.status(200).json({
      success: true,
      message: 'Todo funciona — service account tiene acceso a Drive',
      carpetasEncontradas: (d1.files || []).map(f => f.name)
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
