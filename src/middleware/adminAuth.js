function requireAdminKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || !expected.trim()) {
    return res.status(500).json({ error: 'admin_api_key_not_configured' });
  }

  const provided = req.headers['x-admin-key'];
  if (typeof provided !== 'string' || provided !== expected) {
    return res.status(401).json({ error: 'unauthorized_admin' });
  }

  return next();
}

module.exports = { requireAdminKey };

