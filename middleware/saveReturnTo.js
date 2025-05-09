// Save the URL the user was trying to access before login
function saveReturnTo(req, res, next) {
    if (
      req.session &&
      !req.session.username &&
      req.method === 'GET' &&
      !req.originalUrl.startsWith('/login') &&
      !req.originalUrl.startsWith('/register') &&
      !req.originalUrl.startsWith('/css') &&
      !req.originalUrl.startsWith('/js') &&
      !req.originalUrl.startsWith('/public') &&
      req.originalUrl !== '/favicon.ico'
    ) {
      req.session.returnTo = req.originalUrl;
      req.session.save(err => {
        if (err) {
          console.error('Session save error:', err);
        }
        next();
      });
    } else {
      next();
    }
  }
  
  
  module.exports = saveReturnTo;