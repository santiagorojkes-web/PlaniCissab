// Vercel serverless function — obtiene el _config.json de un área
// para los usuarios de PRÁCTICAS que no tienen OAuth propio.

const ROOT_FOLDER_ID = '1hiLmTa_gwzq39fmbUadm8utnhL-XiUme';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const subArea = req.query.subArea;
  if (!subArea) return res.status(400).json({ error: 'Falta parámetro subArea' });

  try {
    // ── Obtener access token con las credenciales de moadon ──
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
    if (!accessToken) return res.status(500).json({ error: 'No se pudo autenticar', details: tokenData });

    const auth = `Bearer ${accessToken}`;

    // ── Buscar carpeta del sub-área dentro de Planificaciones ──
    const qArea = encodeURIComponent(`name='${subArea}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const areaRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qArea}&fields=files(id)&pageSize=1`, { headers: { Authorization: auth } });
    const areaData = await areaRes.json();
    const areaId = (areaData.files || [])[0]?.id;
    if (!areaId) return res.status(404).json({ error: `No se encontró la carpeta del área: ${subArea}` });

    // ── Buscar _config.json en esa carpeta ──
    const qConfig = encodeURIComponent(`name='_config.json' and '${areaId}' in parents and trashed=false`);
    const configRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qConfig}&fields=files(id)&pageSize=1`, { headers: { Authorization: auth } });
    const configData = await configRes.json();
    const configId = (configData.files || [])[0]?.id;
    if (!configId) return res.status(404).json({ error: `No hay config para el área: ${subArea}` });

    // ── Descargar el contenido del _config.json ──
    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${configId}?alt=media`, { headers: { Authorization: auth } });
    const config = await fileRes.json();

    return res.status(200).json({ success: true, config });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
