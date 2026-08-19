const { getDriveAccessToken } = require('./_drive_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fileId } = req.body || {};
  if (!fileId) return res.status(400).json({ error: 'Falta fileId' });

  try {
    const accessToken = await getDriveAccessToken();
    const auth = `Bearer ${accessToken}`;
    const dr = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE', headers: { Authorization: auth }
    });
    if (dr.status === 204) return res.status(200).json({ success: true, method: 'deleted' });
    // Fallback: trash it
    const tr = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH', headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
    const td = await tr.json();
    if (td.id) return res.status(200).json({ success: true, method: 'trashed' });
    return res.status(500).json({ error: 'No se pudo eliminar' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
