const { getDriveAccessToken } = require('./_drive_auth');
const ROOT_FOLDER_ID = '1hiLmTa_gwzq39fmbUadm8utnhL-XiUme';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fileName, fileBase64, subArea, grupo } = req.body || {};
  if (!fileName || !fileBase64 || !subArea || !grupo)
    return res.status(400).json({ error: 'Faltan campos' });

  try {
    // Step 1: get token
    let accessToken;
    try {
      accessToken = await getDriveAccessToken();
    } catch(e) {
      return res.status(500).json({ error: 'Error de autenticación: ' + e.message });
    }
    const auth = `Bearer ${accessToken}`;

    // Step 2: helper functions
    async function driveGet(url) {
      const r = await fetch(url, { headers: { Authorization: auth } });
      return r.json();
    }
    async function drivePost(body) {
      const r = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return r.json();
    }
    async function findFolder(name, parentId) {
      const q = encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const d = await driveGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`);
      if (d.error) throw new Error(`Error buscando carpeta "${name}": ${d.error.message}`);
      return (d.files || [])[0]?.id || null;
    }
    async function getOrCreate(name, parentId) {
      const existing = await findFolder(name, parentId);
      if (existing) return existing;
      const d = await drivePost({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] });
      if (d.error) throw new Error(`Error creando carpeta "${name}": ${d.error.message}`);
      return d.id;
    }

    // Step 3: build folder structure
    const subAreaId   = await getOrCreate(subArea,    ROOT_FOLDER_ID);
    const practicasId = await getOrCreate('PRACTICAS', subAreaId);
    const grupoId     = await getOrCreate(grupo,       practicasId);

    // Step 4: upload PDF
    const pdfBuffer = Buffer.from(fileBase64, 'base64');
    const boundary  = 'plani_cissab_boundary';
    const metadata  = JSON.stringify({ name: fileName, parents: [grupoId], mimeType: 'application/pdf' });
    const bodyParts = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
      pdfBuffer,
      Buffer.from(`\r\n--${boundary}--`, 'utf8')
    ]);
    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: bodyParts
    });
    const uploadData = await uploadRes.json();
    if (uploadData.id) return res.status(200).json({ success: true, fileId: uploadData.id });
    return res.status(500).json({
      error: 'Error al subir a Drive',
      driveError: uploadData.error?.message || uploadData.error?.status || JSON.stringify(uploadData).substring(0,300)
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
