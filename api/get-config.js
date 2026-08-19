const { getDriveAccessToken } = require('./_drive_auth');
const ROOT_FOLDER_ID = '1hiLmTa_gwzq39fmbUadm8utnhL-XiUme';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const subArea = req.query.subArea;
  if (!subArea) return res.status(400).json({ error: 'Falta subArea' });

  try {
    const accessToken = await getDriveAccessToken();
    const auth = `Bearer ${accessToken}`;

    const qArea = encodeURIComponent(`name='${subArea}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const areaData = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${qArea}&fields=files(id)&pageSize=1`, { headers: { Authorization: auth } })).json();
    const areaId = (areaData.files || [])[0]?.id;
    if (!areaId) return res.status(404).json({ error: `Sin carpeta para: ${subArea}` });

    const qCfg = encodeURIComponent(`name='_config.json' and '${areaId}' in parents and trashed=false`);
    const cfgData = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${qCfg}&fields=files(id)&pageSize=1`, { headers: { Authorization: auth } })).json();
    const cfgId = (cfgData.files || [])[0]?.id;
    if (!cfgId) return res.status(404).json({ error: `Sin config para: ${subArea}` });

    const config = await (await fetch(`https://www.googleapis.com/drive/v3/files/${cfgId}?alt=media`, { headers: { Authorization: auth } })).json();
    return res.status(200).json({ success: true, config });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
