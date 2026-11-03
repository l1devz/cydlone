const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'config.json');
const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const spotify = config.spotify || {};

module.exports = {
  port: Number(process.env.PORT || config.port) || 3000,
  jwtSecret: process.env.JWT_SECRET || config.jwtSecret || '',
  secureCookies: process.env.NODE_ENV === 'production' || !!config.secureCookies,
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || spotify.clientId || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || spotify.clientSecret || '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || spotify.redirectUri || '',
  },
};
