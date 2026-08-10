// Vercel serverless function — sube planificaciones de PRÁCTICAS a Drive
// usando las credenciales de moadon guardadas en variables de entorno.
// Los usuarios de Prácticas no necesitan OAuth propio.

const ROOT_FOLDER_ID = '1hiLmTa_gwzq39fmbUadm8utnhL-XiUme'; // Planificaciones

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fileName, fileBase64, subArea, grupo } = req.body || {};

  if (!fileName || !fileBase64 || !subArea || !grupo) {
    return res.status(400).json({ error: 'Faltan campos: fileName, fileBase64, subArea, grupo' });
  }

  try {
    // ── 1. Obtener access token usando el refresh token de moadon ──
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        grant_type:    'refresh_token'
      })
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.status(500).json({ error: 'No se pudo obtener access token', details: tokenData });
    }

    // ── Helpers de Drive ──
    async function driveGet(url) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      return r.json();
    }
    async function drivePost(url, body) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return r.json();
    }
    async function findFolder(name, parentId) {
      const q = encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const d = await driveGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
      return (d.files || [])[0]?.id || null;
    }
    async function getOrCreateFolder(name, parentId) {
      const existing = await findFolder(name, parentId);
      if (existing) return existing;
      const created = await drivePost('https://www.googleapis.com/drive/v3/files', {
        name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId]
      });
      return created.id;
    }

    // ── 2. Construir estructura: ROOT/subArea/PRACTICAS/grupo ──
    const subAreaId   = await getOrCreateFolder(subArea,    ROOT_FOLDER_ID);
    const practicasId = await getOrCreateFolder('PRACTICAS', subAreaId);
    const grupoId     = await getOrCreateFolder(grupo,       practicasId);

    // ── 3. Subir el PDF con multipart ──
    const pdfBuffer = Buffer.from(fileBase64, 'base64');
    const boundary  = 'plani_cissab_boundary';
    const metadata  = JSON.stringify({ name: fileName, parents: [grupoId], mimeType: 'application/pdf' });

    const bodyParts = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
      pdfBuffer,
      Buffer.from(`\r\n--${boundary}--`, 'utf8')
    ]);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: bodyParts
    });
    const uploadData = await uploadRes.json();

    if (uploadData.id) {
      return res.status(200).json({ success: true, fileId: uploadData.id, fileName });
    } else {
      return res.status(500).json({ error: 'Error al subir a Drive', details: uploadData });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
