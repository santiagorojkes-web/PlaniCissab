// Lista planificaciones "(con comentarios)" en la carpeta PRACTICAS/[grupo]
const ROOT_FOLDER_ID = '1hiLmTa_gwzq39fmbUadm8utnhL-XiUme';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { subArea, grupo } = req.query;
  if (!subArea || !grupo) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      })
    });
    const { access_token } = await tokenRes.json();
    if (!access_token) return res.status(500).json({ error: 'No se pudo autenticar' });
    const auth = `Bearer ${access_token}`;

    async function findFolder(name, parentId) {
      const q = encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const d = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, { headers: { Authorization: auth } })).json();
      return (d.files || [])[0]?.id || null;
    }

    const subAreaId   = await findFolder(subArea, ROOT_FOLDER_ID);
    if (!subAreaId) return res.status(200).json({ files: [] });
    const practicasId = await findFolder('PRACTICAS', subAreaId);
    if (!practicasId) return res.status(200).json({ files: [] });
    const grupoId     = await findFolder(grupo, practicasId);
    if (!grupoId) return res.status(200).json({ files: [] });

    // Search for (con comentarios) files in grupo folder
    const q = encodeURIComponent(`name contains '(con comentarios)' and '${grupoId}' in parents and mimeType='application/pdf' and trashed=false`);
    const d = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&pageSize=20&orderBy=modifiedTime desc`, { headers: { Authorization: auth } })).json();

    return res.status(200).json({ files: d.files || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
