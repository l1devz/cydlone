const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const realtime = require('./realtime');
const perms = require('./permissions');

const router = express.Router();

const DIR = path.join(__dirname, '..', 'uploads', 'emojis');
const MAX_BYTES = 256 * 1024;
const LIMIT = 50;
const NAME_RE = /^[A-Za-z0-9_]{2,32}$/;

function sniff(buf) {
  const starts = (...bytes) => bytes.every((b, i) => buf[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (starts(0xff, 0xd8, 0xff)) return 'jpg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

const publicEmoji = ({ id, serverId, name, animated, creatorId, createdAt }) => ({ id, serverId, name, animated, creatorId, createdAt });
const emojisOf = (serverId) => db.read('emojis').filter((e) => e.serverId === serverId).map(publicEmoji);

function broadcast(serverId) {
  realtime.toServer(serverId, 'emojis:updated', { serverId, emojis: emojisOf(serverId) });
}

function uniqueName(raw, serverId, exceptId = null) {
  let base = String(raw || '').trim().replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 32);
  if (base.replace(/_/g, '').length < 2) base = 'emoji';
  const taken = new Set(db.read('emojis').filter((e) => e.serverId === serverId && e.id !== exceptId).map((e) => e.name.toLowerCase()));
  let name = base;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base.slice(0, 32 - String(i).length - 1)}_${i}`;
  return name;
}

function canManage(server, userId) {
  return !!server && db.isMember(server.id, userId) && perms.has(server, userId, 'MANAGE_EMOJIS');
}

router.post('/servers/:serverId/emojis', requireAuth, (req, res) => {
  const server = db.findServerById(req.params.serverId);
  if (!server || !db.isMember(server.id, req.user.id)) return res.status(404).json({ error: 'Sunucu bulunamadı.' });
  if (!canManage(server, req.user.id)) return res.status(403).json({ error: 'Emoji eklemek için "İfadeleri Yönet" izni gerekiyor.' });

  const match = /^data:[\w/+.-]*;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.dataUrl || ''));
  if (!match) return res.status(400).json({ error: 'Dosya okunamadı.' });
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > MAX_BYTES) return res.status(400).json({ error: 'Emoji en fazla 256 KB olabilir.' });
  const ext = sniff(buffer);
  if (!ext) return res.status(400).json({ error: 'Sadece PNG, JPG, WEBP ya da GIF yükleyebilirsin.' });

  const animated = ext === 'gif';
  const count = db.read('emojis').filter((e) => e.serverId === server.id && e.animated === animated).length;
  if (count >= LIMIT) {
    return res.status(400).json({ error: `Bu sunucuda en fazla ${LIMIT} ${animated ? 'hareketli' : 'sabit'} emoji olabilir.` });
  }

  const emoji = {
    id: crypto.randomUUID(),
    serverId: server.id,
    name: uniqueName(req.body?.name, server.id),
    animated,
    ext,
    creatorId: req.user.id,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${emoji.id}.${ext}`), buffer);
  const list = db.read('emojis');
  list.push(emoji);
  db.write('emojis', list);
  broadcast(server.id);
  res.status(201).json({ emoji: publicEmoji(emoji) });
});

function loadEmoji(req, res, next) {
  const emoji = db.read('emojis').find((e) => e.id === req.params.emojiId);
  const server = emoji && db.findServerById(emoji.serverId);
  if (!emoji || !server || !db.isMember(server.id, req.user.id)) return res.status(404).json({ error: 'Emoji bulunamadı.' });
  if (!canManage(server, req.user.id)) return res.status(403).json({ error: 'Bunu yapmak için "İfadeleri Yönet" izni gerekiyor.' });
  req.emoji = emoji;
  next();
}

router.patch('/emojis/:emojiId', requireAuth, loadEmoji, (req, res) => {
  const raw = String(req.body?.name || '').trim();
  if (!NAME_RE.test(raw)) {
    return res.status(400).json({ error: 'Emoji adı 2-32 karakter olmalı; sadece harf, rakam ve _ kullanılabilir.' });
  }
  const list = db.read('emojis');
  const emoji = list.find((e) => e.id === req.emoji.id);
  emoji.name = uniqueName(raw, emoji.serverId, emoji.id);
  db.write('emojis', list);
  broadcast(emoji.serverId);
  res.json({ emoji: publicEmoji(emoji) });
});

router.delete('/emojis/:emojiId', requireAuth, loadEmoji, (req, res) => {
  db.write('emojis', db.read('emojis').filter((e) => e.id !== req.emoji.id));
  fs.rm(path.join(DIR, `${req.emoji.id}.${req.emoji.ext}`), { force: true }, () => {});
  broadcast(req.emoji.serverId);
  res.json({ ok: true });
});

function removeServerEmojis(serverId) {
  const list = db.read('emojis');
  const gone = list.filter((e) => e.serverId === serverId);
  if (!gone.length) return;
  gone.forEach((e) => fs.rm(path.join(DIR, `${e.id}.${e.ext}`), { force: true }, () => {}));
  db.write('emojis', list.filter((e) => e.serverId !== serverId));
}

function serveEmoji(req, res) {
  const emoji = db.read('emojis').find((e) => e.id === req.params.id);
  if (!emoji) return res.status(404).type('text').send('Emoji bulunamadı.');
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.sendFile(path.join(DIR, `${emoji.id}.${emoji.ext}`), (err) => {
    if (err && !res.headersSent) res.status(404).type('text').send('Emoji bulunamadı.');
  });
}

module.exports = { router, emojisOf, removeServerEmojis, serveEmoji };
