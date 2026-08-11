// Elimina un archivo de Drive usando las credenciales de moadon
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fileId } = req.body || {};
  if (!fileId) return res.status(400).json({ error: 'Falta fileId' });

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

    // Try DELETE first
    const dr = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${access_token}` }
    });

    if (dr.status === 204) {
      return res.status(200).json({ success: true, method: 'deleted' });
    }

    // Fallback: rename to mark as replaced
    const pr = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '_reemplazado_' + Date.now() + '.pdf' })
    });
    const pd = await pr.json();
    if (pd.id) return res.status(200).json({ success: true, method: 'renamed' });

    return res.status(500).json({ error: 'No se pudo eliminar ni renombrar' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
