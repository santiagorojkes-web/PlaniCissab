const ROOT_FOLDER_ID = '1hiLmTa_gwzq39fmbUadm8utnhL-XiUme';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const subArea = req.query.subArea;
  if (!subArea) return res.status(400).json({ error: 'Falta subArea' });

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
    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;
    if (!access_token) return res.status(500).json({
      error: 'No se pudo autenticar',
      googleError: tokenData.error,
      hint: 'Verificá las env vars GOOGLE_CLIENT_SECRET y GOOGLE_REFRESH_TOKEN en Vercel'
    });

    const auth = `Bearer ${access_token}`;

    // Search for area folder inside Planificaciones root
    const qArea = encodeURIComponent(`name='${subArea}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const areaRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qArea}&fields=files(id,name)&pageSize=5`, { headers: { Authorization: auth } });
    const areaData = await areaRes.json();
    const areaId = (areaData.files || [])[0]?.id;

    if (!areaId) return res.status(404).json({
      error: `No se encontró la carpeta del área "${subArea}" en Drive`,
      hint: 'El coordinador de esta área todavía no guardó la configuración desde el backend',
      foldersFound: (areaData.files || []).map(f => f.name)
    });

    // Search for _config.json inside area folder
    const qCfg = encodeURIComponent(`name='_config.json' and '${areaId}' in parents and trashed=false`);
    const cfgRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qCfg}&fields=files(id)&pageSize=1`, { headers: { Authorization: auth } });
    const cfgData = await cfgRes.json();
    const cfgId = (cfgData.files || [])[0]?.id;

    if (!cfgId) return res.status(404).json({
      error: `No hay _config.json para el área "${subArea}"`,
      hint: 'El coordinador debe guardar la configuración desde el backend al menos una vez',
      areaFolderId: areaId
    });

    // Download config
    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${cfgId}?alt=media`, { headers: { Authorization: auth } });
    const config = await fileRes.json();

    // Return with debug info about what users were found
    const usuariosKeys = config.usuarios ? Object.keys(config.usuarios) : [];
    return res.status(200).json({
      success: true,
      config,
      debug: { gruposEncontrados: usuariosKeys }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
