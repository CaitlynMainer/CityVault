// middleware/saveReturnTo.js
// Save the URL the user was trying to access before login,
// but only for real, top-level HTML navigations.

function isInternalPath(url) {
  // prevent open-redirects; only allow same-site paths
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
}

function isAssetPath(url) {
  // ignore common static assets and files with extensions
  const assetExt = /\.(?:png|jpe?g|gif|svg|ico|webp|avif|bmp|tiff|css|js|mjs|map|json|txt|xml|webmanifest|mp3|mp4|webm|wav|ogg|woff2?|ttf|eot)$/i;
  if (assetExt.test(url)) return true;

  // ignore well-known static prefixes
  return (
    url.startsWith('/public') ||
    url.startsWith('/assets') ||
    url.startsWith('/static') ||
    url.startsWith('/css') ||
    url.startsWith('/js') ||
    url.startsWith('/img') ||
    url.startsWith('/images') ||
    url === '/favicon.ico' ||
    url === '/favicon.svg' ||
    url === '/robots.txt'
  );
}

function isTopLevelHtmlNav(req) {
  const accept = req.get('accept') || '';
  const secFetchMode = (req.get('sec-fetch-mode') || '').toLowerCase();
  const secFetchDest = (req.get('sec-fetch-dest') || '').toLowerCase();

  // Top-level navigations sent by modern browsers
  const looksNavigate = secFetchMode === 'navigate' || secFetchDest === 'document';

  // Fallback: requests that accept HTML and are not XHR/fetch API calls
  const acceptsHtml = accept.includes('text/html');
  const isAjax = req.xhr || (req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';

  return (looksNavigate && acceptsHtml) || (acceptsHtml && !isAjax);
}

function saveReturnTo(req, res, next) {
  try {
    const url = req.originalUrl;

    // Only for unauthenticated GET requests to real pages
    if (
      req.session &&
      !req.session.username &&
      req.method === 'GET' &&
      !url.startsWith('/login') &&
      !url.startsWith('/register') &&
      !url.startsWith('/api') &&
      !isAssetPath(url) &&
      isTopLevelHtmlNav(req) &&
      isInternalPath(url)
    ) {
      // Avoid overwriting a good target with something worse
      const current = req.session.returnTo;
      const isBadCurrent =
        !current || current === '/' || current.startsWith('/login') || isAssetPath(current);

      if (isBadCurrent || current !== url) {
        req.session.returnTo = url;
      }

      // Don’t block the request if saving fails
      req.session.save(err => {
        if (err) console.error('Session save error (saveReturnTo):', err);
        next();
      });
      return;
    }
  } catch (e) {
    console.error('saveReturnTo middleware error:', e);
  }

  next();
}

module.exports = saveReturnTo;
