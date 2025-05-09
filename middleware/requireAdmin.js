function requireAdmin(req, res, next) {
    if (!req.session.username || req.session.role !== 'admin') {
      return res.status(403).send('Access denied.');
    }
    next();
  }
  
  module.exports = requireAdmin;