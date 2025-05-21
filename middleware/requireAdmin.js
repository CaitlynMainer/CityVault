function requireAdmin(req, res, next) {
  if (!req.user?.username || !['gm', 'admin'].includes(req.user.role)) {
    return res.status(403).send('Access denied.');
  }
  next();
}

module.exports = requireAdmin;
