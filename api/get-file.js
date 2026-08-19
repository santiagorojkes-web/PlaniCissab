const { getDriveAccessToken } = require('./_drive_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'Falta fileId' });

  try {
    const accessToken = await getDriveAccessToken();
    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const buffer = await fileRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return res.status(200).json({ success: true, base64 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
