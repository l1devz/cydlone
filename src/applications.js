const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { requireAuth, hashBotToken } = require('./auth');
const realtime = require('./realtime');
const perms = require('./permissions');
const { snowflake } = require('./snowflake');

const router = express.Router();

const MAX_APPS = 10;
const MAX_DESCRIPTION = 400;

const newToken = (botId) => `${Buffer.from(botId).toString('base64url')}.${crypto.randomBytes(27).toString('base64url')}`;

function botUsername(name) {
  const ascii = String(name).toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_.]/g, '').slice(0, 32);
  return ascii.length >= 2 ? ascii : 'bot';
}

function cleanName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 32 ? name : null;
}

const appsOf = (userId) => db.read('applications').filter((a) => a.ownerId === userId);

function publicApp(app) {
  const bot = db.findUserById(app.botId);
  return {
    id: app.id,
    name: app.name,
    description: app.description || '',
    createdAt: app.createdAt,
    bot: bot ? realtime.withPresence(bot) : null,
    serverCount: bot ? db.serversForUser(bot.id).length : 0,
  };
}

function saveApp(app) {
  const list = db.read('applications').filter((a) => a.id !== app.id);
  list.push(app);
  db.write('applications', list);
}

const humansOnly = (req, res, next) => {
  if (req.user?.bot) return res.status(403).json({ error: 'Botlar bu işlemi yapamaz.' });
  next();
};

function loadApp(req, res, next) {
  const app = db.read('applications').find((a) => a.id === req.params.appId);
  if (!app || app.ownerId !== req.user.id) return res.status(404).json({ error: 'Uygulama bulunamadı.' });
  req.app_ = app;
  next();
}

router.get('/api/gelistirici/izinler', (_req, res) => {
  res.json({ permissions: perms.PERMISSIONS.map(({ id, name, description }) => ({ id, name, description })) });
});

router.get('/api/users/@me', requireAuth, (req, res) => {
  res.json({ user: req.user.bot ? realtime.withPresence(req.user) : db.selfUser(req.user) });
});

router.get('/api/applications', requireAuth, humansOnly, (req, res) => {
  res.json({ applications: appsOf(req.user.id).map(publicApp) });
});

router.post('/api/applications', requireAuth, humansOnly, (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ errors: { name: 'Uygulama adı 2-32 karakter olmalı.' } });
  if (appsOf(req.user.id).length >= MAX_APPS) {
    return res.status(400).json({ errors: { name: `En fazla ${MAX_APPS} uygulama oluşturabilirsin.` } });
  }
  const username = botUsername(name);
  const discriminator = db.freeDiscriminator(username);
  if (!discriminator) return res.status(400).json({ errors: { name: 'Bu adı çok fazla bot kullanıyor; başka bir ad dene.' } });

  const bot = db.createUser({
    email: `bot-${snowflake()}@bot.cydlone.local`,
    username,
    discriminator,
    displayName: name,
    passwordHash: null,
    birthDate: null,
  });
  db.updateUser(bot.id, { bot: true, bio: '' });
  const token = newToken(bot.id);
  const app = {
    id: snowflake(),
    ownerId: req.user.id,
    name,
    description: '',
    botId: bot.id,
    tokenHash: hashBotToken(token),
    createdAt: new Date().toISOString(),
  };
  saveApp(app);
  res.status(201).json({ application: publicApp(app), token });
});

router.get('/api/applications/:appId', requireAuth, humansOnly, loadApp, (req, res) => {
  res.json({ application: publicApp(req.app_) });
});

router.patch('/api/applications/:appId', requireAuth, humansOnly, loadApp, (req, res) => {
  const app = req.app_;
  const errors = {};
  if (req.body?.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) errors.name = 'Uygulama adı 2-32 karakter olmalı.';
    else app.name = name;
  }
  if (req.body?.description !== undefined) {
    const description = String(req.body.description).trim();
    if (description.length > MAX_DESCRIPTION) errors.description = `Açıklama en fazla ${MAX_DESCRIPTION} karakter olabilir.`;
    else app.description = description;
  }
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  saveApp(app);
  const bot = db.findUserById(app.botId);
  if (bot) {
    const username = botUsername(app.name);
    const changes = { displayName: app.name, bio: app.description };
    if (username !== bot.username) {
      const discriminator = db.freeDiscriminator(username, bot.id);
      if (discriminator) Object.assign(changes, { username, discriminator });
    }
    db.updateUser(bot.id, changes);
    realtime.broadcastUserUpdate(bot.id);
  }
  res.json({ application: publicApp(app) });
});

router.post('/api/applications/:appId/token', requireAuth, humansOnly, loadApp, (req, res) => {
  const token = newToken(req.app_.botId);
  saveApp({ ...req.app_, tokenHash: hashBotToken(token) });
  realtime.disconnectUser(req.app_.botId);
  res.json({ token });
});

router.delete('/api/applications/:appId', requireAuth, humansOnly, loadApp, (req, res) => {
  const { botId } = req.app_;
  const servers = db.serversForUser(botId).map((s) => s.id);
  realtime.disconnectUser(botId);
  db.deleteUser(botId);
  db.write('applications', db.read('applications').filter((a) => a.id !== req.app_.id));
  db.write('commands', db.read('commands').filter((c) => c.applicationId !== req.app_.id));
  servers.forEach((id) => realtime.toServer(id, 'member:left', { serverId: id, userId: botId }));
  res.json({ ok: true });
});

const validPermissions = new Set(perms.PERMISSIONS.map((p) => p.id));

function parsePermissions(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
  return [...new Set(list.map((p) => String(p).trim()).filter((p) => validPermissions.has(p)))];
}

const appByClientId = (id) => db.read('applications').find((a) => a.id === String(id || '')) || null;

router.get('/api/oauth2/authorize', requireAuth, humansOnly, (req, res) => {
  const app = appByClientId(req.query.client_id);
  if (!app) return res.status(404).json({ error: 'Böyle bir uygulama yok.' });
  const bot = db.findUserById(app.botId);
  const servers = db.serversForUser(req.user.id)
    .filter((s) => perms.has(s, req.user.id, 'MANAGE_SERVER'))
    .map((s) => ({ id: s.id, name: s.name, iconColor: s.iconColor, iconUrl: s.iconUrl || null, hasBot: db.isMember(s.id, bot.id) }));
  res.json({
    application: { id: app.id, name: app.name, description: app.description || '', bot: realtime.withPresence(bot) },
    permissions: perms.PERMISSIONS.filter((p) => parsePermissions(req.query.permissions).includes(p.id)),
    servers,
  });
});

router.post('/api/oauth2/authorize', requireAuth, humansOnly, (req, res) => {
  const app = appByClientId(req.body?.client_id);
  if (!app) return res.status(404).json({ error: 'Böyle bir uygulama yok.' });
  const server = db.findServerById(String(req.body?.serverId || ''));
  if (!server || !db.isMember(server.id, req.user.id)) return res.status(404).json({ error: 'Sunucu bulunamadı.' });
  if (!perms.has(server, req.user.id, 'MANAGE_SERVER')) {
    return res.status(403).json({ error: 'Bu sunucuya bot eklemek için "Sunucuyu Yönet" izni gerekiyor.' });
  }
  const botId = app.botId;
  if (db.isMember(server.id, botId)) return res.status(400).json({ error: 'Bot zaten bu sunucuda.' });
  if (db.isBanned(server.id, botId)) return res.status(403).json({ error: 'Bu bot sunucudan yasaklanmış. Önce Sunucu Ayarları → Yasaklar\'dan yasağı kaldır.' });

  db.addMember(server.id, botId);
  const granted = parsePermissions(req.body?.permissions).filter((p) => perms.has(server, req.user.id, p));
  let roles = [];
  if (granted.length) {
    const top = perms.highestPosition(server, req.user.id);
    const maxPos = Math.max(0, ...db.rolesOfServer(server.id).map((r) => r.position));
    const role = db.createRole({
      serverId: server.id,
      name: app.name,
      permissions: granted,
      position: top === Infinity ? maxPos + 1 : Math.max(1, top),
    });
    db.setMemberRoles(server.id, botId, [role.id]);
    roles = [role.id];
    realtime.toServer(server.id, 'roles:updated', { serverId: server.id, roles: db.rolesOfServer(server.id) });
  }
  realtime.joinServerRoom(botId, server.id);
  realtime.toServer(server.id, 'member:joined', { serverId: server.id, user: { ...realtime.withPresence(db.findUserById(botId)), roles } });
  res.json({ ok: true, server: { id: server.id, name: server.name } });
});

module.exports = { router };
