const express = require('express');
const router = express.Router();
const OAuth2Server = require('oauth2-server');
const oauthModel = require('../oauth/oauthModel');

const oauth = new OAuth2Server({
  model: oauthModel,
  allowBearerTokensInQueryString: true,
  requireClientAuthentication: {
    password: false,
    refresh_token: false
  }
});

router.post('/token', async (req, res) => {
  const request = new OAuth2Server.Request(req);
  const response = new OAuth2Server.Response(res);

  try {
    const token = await oauth.token(request, response);
    res.status(response.status).json(token);
  } catch (err) {
    console.error('[OAuth Error]', err);
    res.status(err.code || 500).json({ error: err.message });
  }
});

module.exports = router;
