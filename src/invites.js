const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const realtime = require('./realtime');

const router = express.Router();

function invitePreview(server, viewerId = null) {
  const members = db.membersOfServer(server.id);
  return {
    server: { id: server.id, name: server.name, iconColor: server.iconColor, iconUrl: server.iconUrl || null, verified: !!server.verified },
    memberCount: members.length,
    onlineCount: members.filter((u) => realtime.presenceOf(u) !== 'offline').length,
    ...(viewerId ? { isMember: db.isMember(server.id, viewerId) } : {}),
  };
}

router.get('/invites/:code', requireAuth, (req, res) => {
  const server = db.findServerByInvite(req.params.code);
  if (!server) return res.status(404).json({ error: 'Davet geçersiz ya da süresi dolmuş.' });
  res.json({ invite: { code: req.params.code, ...invitePreview(server, req.user.id) } });
});

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function invitePage(req, code) {
  const server = db.findServerByInvite(code);
  const loginUrl = `/login?davet=${encodeURIComponent(code)}`;
  const preview = server && invitePreview(server);
  const title = server ? `${server.name} sunucusuna davet edildin` : 'Geçersiz davet';
  const desc = server
    ? `${preview.onlineCount} çevrimiçi • ${preview.memberCount} üye. Cydlone'da sohbete katıl!`
    : 'Bu davet geçersiz ya da süresi dolmuş.';
  const origin = `${req.protocol}://${req.get('host')}`;
  const url = `${origin}/davet/${encodeURIComponent(code)}`;
  const image = server?.iconUrl ? `${origin}${server.iconUrl}` : null;
  const e = escapeHtml;
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)} | Cydlone</title>
  <link rel="icon" href="/img/logo.svg">
  <meta name="description" content="${e(desc)}">
  <meta property="og:site_name" content="Cydlone">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${e(url)}">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(desc)}">
  ${image ? `<meta property="og:image" content="${e(image)}">
  <meta property="og:image:width" content="256">
  <meta property="og:image:height" content="256">
  ` : ''}<meta name="twitter:card" content="summary">
  <meta name="theme-color" content="${e(server?.iconColor || '#8b5cf6')}">
  <meta http-equiv="refresh" content="0;url=${e(loginUrl)}">
</head>
<body style="background:#111018;color:#e8e7f0;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0">
  <p>${e(title)}. <a style="color:#a78bfa" href="${e(loginUrl)}">Katılmak için giriş yap</a></p>
</body>
</html>`;
}

module.exports = { router, invitePage };
