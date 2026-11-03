const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const perms = require('./permissions');

const router = express.Router();

const DIR = path.join(__dirname, '..', 'attachments');
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PER_MESSAGE = 10;
const PENDING_TTL = 24 * 60 * 60 * 1000;

const INLINE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac',
]);

const fileOf = (id) => path.join(DIR, id);

function cleanName(raw) {
  let name = '';
  try { name = decodeURIComponent(String(raw || '')); } catch { name = String(raw || ''); }
  name = name.replace(/[\u0000-\u001f\u007f/\\]/g, '').replace(/^\.+/, '').trim().slice(-120);
  return name || 'dosya';
}

function cleanType(raw) {
  const type = String(raw || '').split(';')[0].trim().toLowerCase();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type) ? type : 'application/octet-stream';
}

const dimension = (v) => {
  const n = Math.round(Number(v));
  return n > 0 && n < 100000 ? n : null;
};

const publicAttachment = (a) => ({
  id: a.id,
  name: a.name,
  size: a.size,
  contentType: a.contentType,
  ...(a.width && a.height ? { width: a.width, height: a.height } : {}),
  url: `/ekler/${a.id}/${encodeURIComponent(a.name)}`,
});

const rawBody = express.raw({ type: () => true, limit: MAX_BYTES });

router.post('/attachments', requireAuth, rawBody, (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ error: 'Dosya boş.' });

  const contentType = cleanType(req.get('x-file-type'));
  const image = contentType.startsWith('image/') || contentType.startsWith('video/');
  const attachment = {
    id: crypto.randomUUID(),
    uploaderId: req.user.id,
    messageId: null,
    name: cleanName(req.get('x-file-name')),
    size: body.length,
    contentType,
    ...(image ? { width: dimension(req.get('x-width')), height: dimension(req.get('x-height')) } : {}),
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileOf(attachment.id), body);
  const list = db.read('attachments');
  list.push(attachment);
  db.write('attachments', list);
  res.status(201).json({ attachment: { ...publicAttachment(attachment) } });
});

router.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: `Dosya en fazla ${MAX_BYTES / 1024 / 1024} MB olabilir.` });
  }
  next(err);
});

router.delete('/attachments/:id', requireAuth, (req, res) => {
  const list = db.read('attachments');
  const a = list.find((x) => x.id === req.params.id);
  if (!a || a.uploaderId !== req.user.id || a.messageId) return res.status(404).json({ error: 'Dosya bulunamadı.' });
  db.write('attachments', list.filter((x) => x.id !== a.id));
  fs.rm(fileOf(a.id), { force: true }, () => {});
  res.json({ ok: true });
});

function pendingAttachments(body, userId) {
  const ids = Array.isArray(body?.attachments) ? [...new Set(body.attachments.map(String))] : [];
  if (!ids.length) return { attachments: [] };
  if (ids.length > MAX_PER_MESSAGE) return { error: `Bir mesajda en fazla ${MAX_PER_MESSAGE} dosya olabilir.` };
  const byId = Object.fromEntries(db.read('attachments').map((a) => [a.id, a]));
  const found = ids.map((id) => byId[id]);
  if (found.some((a) => !a || a.uploaderId !== userId || a.messageId)) {
    return { error: 'Dosyalardan biri bulunamadı; tekrar yüklemeyi dene.' };
  }
  return { attachments: found };
}

function bindAttachments(attachments, messageId) {
  if (!attachments.length) return;
  const ids = new Set(attachments.map((a) => a.id));
  const list = db.read('attachments');
  list.forEach((a) => { if (ids.has(a.id)) a.messageId = messageId; });
  db.write('attachments', list);
}

function removeAttachmentsOf(message) {
  if (!message?.attachments?.length) return;
  const ids = new Set(message.attachments.map((a) => a.id));
  db.write('attachments', db.read('attachments').filter((a) => !ids.has(a.id)));
  ids.forEach((id) => fs.rm(fileOf(id), { force: true }, () => {}));
}

function cleanupAttachments() {
  const list = db.read('attachments');
  if (!list.length) return;
  const messageIds = new Set(db.read('messages').map((m) => m.id));
  const now = Date.now();
  const keep = list.filter((a) => (a.messageId ? messageIds.has(a.messageId) : now - new Date(a.createdAt) < PENDING_TTL));
  if (keep.length === list.length) return;
  const kept = new Set(keep.map((a) => a.id));
  list.filter((a) => !kept.has(a.id)).forEach((a) => fs.rm(fileOf(a.id), { force: true }, () => {}));
  db.write('attachments', keep);
}

function canSee(user, a) {
  if (!a.messageId) return a.uploaderId === user.id;
  const message = db.findMessageById(a.messageId);
  if (!message) return false;
  const channel = db.findChannelById(message.channelId);
  if (channel) return perms.hasIn(db.findServerById(channel.serverId), user.id, channel, 'VIEW_CHANNEL');
  const dm = db.findDmById(message.channelId);
  return !!dm && dm.userIds.includes(user.id);
}

function serveAttachment(req, res) {
  const a = req.user && db.read('attachments').find((x) => x.id === req.params.id);
  if (!a || !canSee(req.user, a)) return res.status(404).type('text').send('Dosya bulunamadı.');
  const inline = INLINE_TYPES.has(a.contentType) && req.query.indir === undefined;
  const ascii = a.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.set({
    'Content-Type': inline ? a.contentType : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=604800, immutable',
  });
  res.sendFile(fileOf(a.id), { headers: {}, lastModified: false }, (err) => {
    if (err && !res.headersSent) res.status(404).type('text').send('Dosya bulunamadı.');
  });
}

module.exports = {
  router,
  publicAttachment,
  pendingAttachments,
  bindAttachments,
  removeAttachmentsOf,
  cleanupAttachments,
  serveAttachment,
  MAX_PER_MESSAGE,
};
