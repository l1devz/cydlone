const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { requireAuth, COOKIE_NAME, EMAIL_RE, USERNAME_RE } = require('./auth');
const realtime = require('./realtime');
const { BADGES } = require('./badges');
const { PERMISSIONS } = require('./permissions');
const { removeServerIcon } = require('./servers');
const { removeServerEmojis } = require('./emojis');
const spotify = require('./spotify');

const router = express.Router();
router.use(requireAuth);

const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const BANNER_DIR = path.join(__dirname, '..', 'uploads', 'banners');
const MAX_AVATAR_BYTES = 1024 * 1024;
const MAX_BANNER_BYTES = 1.5 * 1024 * 1024;
const STATUSES = ['online', 'idle', 'dnd', 'invisible'];
const HEX_RE = /^#[0-9a-f]{6}$/i;

async function checkPassword(user, password) {
  return bcrypt.compare(String(password || ''), user.passwordHash);
}

function saved(res, user) {
  realtime.broadcastUserUpdate(user.id);
  res.json({ user: db.selfUser(user) });
}

router.get('/badges', (_req, res) => {
  res.json({ badges: BADGES });
});

router.get('/permissions', (_req, res) => {
  res.json({ permissions: PERMISSIONS });
});

router.patch('/users/me', (req, res) => {
  const body = req.body || {};
  const changes = {};
  const errors = {};

  if ('displayName' in body) {
    const v = String(body.displayName).trim();
    if (!v || v.length > 32) errors.displayName = 'Görünen ad 1-32 karakter olmalı.';
    else changes.displayName = v;
  }
  if ('bio' in body) {
    const v = String(body.bio).trim();
    if (v.length > 190) errors.bio = 'Hakkımda en fazla 190 karakter olabilir.';
    else changes.bio = v;
  }
  if ('pronouns' in body) {
    const v = String(body.pronouns).trim();
    if (v.length > 40) errors.pronouns = 'Zamirler en fazla 40 karakter olabilir.';
    else changes.pronouns = v;
  }
  ['avatarColor', 'bannerColor'].forEach((key) => {
    if (!(key in body)) return;
    if (!HEX_RE.test(body[key])) errors[key] = 'Geçersiz renk.';
    else changes[key] = body[key].toLowerCase();
  });
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) errors.status = 'Geçersiz durum.';
    else changes.status = body.status;
  }

  if (Object.keys(errors).length) return res.status(400).json({ errors });
  saved(res, db.updateUser(req.user.id, changes));
});

router.patch('/users/me/account', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!(await checkPassword(req.user, password))) {
    return res.status(400).json({ errors: { password: 'Şifre yanlış.' } });
  }
  const changes = {};
  const errors = {};

  if (username != null) {
    const v = String(username).trim();
    if (!USERNAME_RE.test(v)) {
      errors.username = '2-32 karakter; sadece harf, rakam, _ ve . kullanılabilir.';
    } else {
      const taken = db.findUserByTag(v, req.user.discriminator);
      const disc = !taken || taken.id === req.user.id ? req.user.discriminator : db.freeDiscriminator(v, req.user.id);
      if (!disc) errors.username = 'Bu kullanıcı adını çok fazla kişi kullanıyor. Başka bir ad dene.';
      else Object.assign(changes, { username: v, discriminator: disc });
    }
  }
  if (email != null) {
    const v = String(email).trim().toLowerCase();
    const owner = db.findUserByEmail(v);
    if (!EMAIL_RE.test(v)) errors.email = 'Geçerli bir e-posta adresi girin.';
    else if (owner && owner.id !== req.user.id) errors.email = 'Bu e-posta zaten kayıtlı.';
    else changes.email = v;
  }

  if (Object.keys(errors).length) return res.status(400).json({ errors });
  saved(res, db.updateUser(req.user.id, changes));
});

router.post('/users/me/password', async (req, res) => {
  const { current, next } = req.body || {};
  if (!(await checkPassword(req.user, current))) {
    return res.status(400).json({ errors: { current: 'Mevcut şifre yanlış.' } });
  }
  if (String(next || '').length < 8) {
    return res.status(400).json({ errors: { next: 'Yeni şifre en az 8 karakter olmalı.' } });
  }
  db.updateUser(req.user.id, { passwordHash: await bcrypt.hash(String(next), 10) });
  res.json({ ok: true });
});

const IMAGES = {
  avatar: { dir: AVATAR_DIR, folder: 'avatars', field: 'avatarUrl', max: MAX_AVATAR_BYTES, tooBig: 'Resim en fazla 1 MB olabilir.' },
  banner: { dir: BANNER_DIR, folder: 'banners', field: 'bannerUrl', max: MAX_BANNER_BYTES, tooBig: 'Afiş en fazla 1,5 MB olabilir.' },
};

function removeImageFile(user, kind) {
  const { dir, field } = IMAGES[kind];
  if (!user[field]) return;
  fs.rm(path.join(dir, path.basename(user[field])), { force: true }, () => {});
}

function uploadImage(kind) {
  return (req, res) => {
    const { dir, folder, field, max, tooBig } = IMAGES[kind];
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.dataUrl || ''));
    if (!match) return res.status(400).json({ error: 'Desteklenmeyen resim biçimi.' });
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > max) return res.status(400).json({ error: tooBig });

    fs.mkdirSync(dir, { recursive: true });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const name = `${req.user.id}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buffer);
    removeImageFile(req.user, kind);
    saved(res, db.updateUser(req.user.id, { [field]: `/uploads/${folder}/${name}` }));
  };
}

function deleteImage(kind) {
  return (req, res) => {
    removeImageFile(req.user, kind);
    saved(res, db.updateUser(req.user.id, { [IMAGES[kind].field]: null }));
  };
}

router.post('/users/me/avatar', uploadImage('avatar'));
router.delete('/users/me/avatar', deleteImage('avatar'));
router.post('/users/me/banner', uploadImage('banner'));
router.delete('/users/me/banner', deleteImage('banner'));

router.delete('/users/me', async (req, res) => {
  if (!(await checkPassword(req.user, req.body?.password))) {
    return res.status(400).json({ errors: { password: 'Şifre yanlış.' } });
  }
  const userId = req.user.id;
  const related = db.relatedUserIds(userId);
  const owned = db.serversForUser(userId).filter((s) => s.ownerId === userId).map((s) => s.id);
  const joined = db.serversForUser(userId).filter((s) => s.ownerId !== userId).map((s) => s.id);

  owned.forEach((id) => realtime.toServer(id, 'server:deleted', { serverId: id }));
  joined.forEach((id) => realtime.toServer(id, 'member:left', { serverId: id, userId }));

  removeImageFile(req.user, 'avatar');
  removeImageFile(req.user, 'banner');
  spotify.removeConnection(userId);
  const apps = db.read('applications').filter((a) => a.ownerId === userId);
  apps.forEach((a) => {
    db.serversForUser(a.botId).forEach((s) => realtime.toServer(s.id, 'member:left', { serverId: s.id, userId: a.botId }));
    realtime.disconnectUser(a.botId);
    db.deleteUser(a.botId);
  });
  if (apps.length) {
    const ids = new Set(apps.map((a) => a.id));
    db.write('applications', db.read('applications').filter((a) => a.ownerId !== userId));
    db.write('commands', db.read('commands').filter((c) => !ids.has(c.applicationId)));
  }
  db.serversForUser(userId).filter((s) => s.ownerId === userId).forEach((s) => { removeServerIcon(s); removeServerEmojis(s.id); });
  db.deleteUser(userId);
  owned.forEach((id) => realtime.closeServerRoom(id));
  related.forEach((id) => realtime.toUser(id, 'relationships:changed', {}));
  realtime.disconnectUser(userId);

  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

module.exports = router;
