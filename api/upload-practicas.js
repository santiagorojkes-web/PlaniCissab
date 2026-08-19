// Upload uses moadon's OAuth refresh token (service accounts have no Drive storage quota)
// All read/delete operations use the service account instead.
const ROOT_FOLDER_ID = '1hiLmTa_gwzq39fmbUadm8utnhL-XiUme';

async function getMoadonToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token'
    })
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('No se pudo obtener token: ' + (d.error_description || d.error || JSON.stringify(d)));
  return d.access_token;
}

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
    const token = await getMoadonToken();
    const auth  = `Bearer ${token}`;

    async function find(name, parentId) {
      const q = encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const d = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, { headers:{Authorization:auth} })).json();
      if (d.error) throw new Error(`Error buscando "${name}": ${d.error.message}`);
      return (d.files||[])[0]?.id || null;
    }
    async function mkdir(name, parentId) {
      const d = await (await fetch('https://www.googleapis.com/drive/v3/files', {
        method:'POST', headers:{Authorization:auth,'Content-Type':'application/json'},
        body: JSON.stringify({name, mimeType:'application/vnd.google-apps.folder', parents:[parentId]})
      })).json();
      if (d.error) throw new Error(`Error creando "${name}": ${d.error.message}`);
      return d.id;
    }
    async function getOrMake(name, parentId) {
      return (await find(name, parentId)) || (await mkdir(name, parentId));
    }

    const subAreaId   = await getOrMake(subArea,    ROOT_FOLDER_ID);
    const practicasId = await getOrMake('PRACTICAS', subAreaId);
    const grupoId     = await getOrMake(grupo,       practicasId);

    const pdf      = Buffer.from(fileBase64, 'base64');
    const boundary = 'plani_b';
    const meta     = JSON.stringify({ name: fileName, parents: [grupoId], mimeType: 'application/pdf' });
    const body     = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
      pdf,
      Buffer.from(`\r\n--${boundary}--`)
    ]);

    const up = await (await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method:'POST', headers:{Authorization:auth, 'Content-Type':`multipart/related; boundary=${boundary}`}, body
    })).json();

    if (up.id) return res.status(200).json({ success: true, fileId: up.id });
    return res.status(500).json({ error: up.error?.message || 'Upload failed', raw: JSON.stringify(up).substring(0,300) });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
