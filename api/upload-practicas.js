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
    return res.status(400).json({ error: 'Faltan campos: fileName, fileBase64, subArea, grupo' });

  try {
    const accessToken = await getDriveAccessToken();
    const auth = `Bearer ${accessToken}`;

    async function findFolder(name, parentId) {
      const q = encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const d = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, { headers: { Authorization: auth } })).json();
      return (d.files || [])[0]?.id || null;
    }
    async function createFolder(name, parentId) {
      const d = await (await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
      })).json();
      return d.id;
    }
    async function getOrCreate(name, parentId) {
      return (await findFolder(name, parentId)) || (await createFolder(name, parentId));
    }

    const subAreaId   = await getOrCreate(subArea,    ROOT_FOLDER_ID);
    const practicasId = await getOrCreate('PRACTICAS', subAreaId);
    const grupoId     = await getOrCreate(grupo,       practicasId);

    const pdfBuffer = Buffer.from(fileBase64, 'base64');
    const boundary  = 'plani_cissab_boundary';
    const metadata  = JSON.stringify({ name: fileName, parents: [grupoId], mimeType: 'application/pdf' });
    const bodyParts = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
      pdfBuffer,
      Buffer.from(`\r\n--${boundary}--`, 'utf8')
    ]);
    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: bodyParts
    });
    const uploadData = await uploadRes.json();
    if (uploadData.id) return res.status(200).json({ success: true, fileId: uploadData.id, fileName });
    return res.status(500).json({ error: 'Error al subir a Drive', details: uploadData });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
