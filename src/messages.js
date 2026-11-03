const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const realtime = require('./realtime');
const { withAuthors, addReplyMention, botEmbeds, MAX_MESSAGE } = require('./servers');
const perms = require('./permissions');
const { parseMentions } = require('./mentions');
const { removeAttachmentsOf } = require('./attachments');

const router = express.Router();
router.use(requireAuth);

function loadMessage(req, res, next) {
  const message = db.findMessageById(req.params.messageId);
  const notFound = () => res.status(404).json({ error: 'Mesaj bulunamadı.' });
  if (!message) return notFound();

  const channel = db.findChannelById(message.channelId);
  if (channel) {
    req.server = db.findServerById(channel.serverId);
    if (!perms.hasIn(req.server, req.user.id, channel, 'VIEW_CHANNEL')) return notFound();
    req.channel = channel;
  } else {
    const dm = db.findDmById(message.channelId);
    if (!dm || !dm.userIds.includes(req.user.id)) return notFound();
    req.dm = dm;
  }
  req.message = message;
  next();
}

function broadcast(req, event, payload) {
  if (req.channel) realtime.toChannel(req.channel, event, payload);
  else req.dm.userIds.forEach((id) => realtime.toUser(id, event, payload));
}

router.patch('/messages/:messageId', loadMessage, (req, res) => {
  if (req.message.authorId !== req.user.id) {
    return res.status(403).json({ error: 'Sadece kendi mesajlarını düzenleyebilirsin.' });
  }
  const content = req.body?.content === undefined && req.user.bot ? req.message.content : String(req.body?.content || '').trim();
  const embedResult = botEmbeds(req);
  if (embedResult.error) return res.status(400).json({ error: embedResult.error });
  const embeds = req.body?.embeds == null ? req.message.embeds || [] : embedResult.embeds;
  if (!content && !req.message.attachments?.length && !embeds.length) return res.status(400).json({ error: 'Mesaj boş olamaz.' });
  if (content.length > MAX_MESSAGE) {
    return res.status(400).json({ error: `Mesaj en fazla ${MAX_MESSAGE} karakter olabilir.` });
  }
  if (content === req.message.content && req.body?.embeds == null) {
    return res.json({ message: withAuthors([req.message])[0] });
  }

  const mentions = req.server
    ? addReplyMention(parseMentions(content, req.server, req.user.id, req.channel), req.message, req.server, req.user.id)
    : undefined;
  db.updateMessage(req.message.id, content, mentions);
  const [message] = withAuthors([db.patchMessage(req.message.id, { embeds: embeds.length ? embeds : undefined })]);
  broadcast(req, 'message:updated', { message });
  res.json({ message });
});

router.delete('/messages/:messageId', loadMessage, (req, res) => {
  const isAuthor = req.message.authorId === req.user.id;
  const canManage = req.channel && perms.hasIn(req.server, req.user.id, req.channel, 'MANAGE_MESSAGES');
  if (!isAuthor && !canManage) {
    return res.status(403).json({ error: 'Bu mesajı silme yetkin yok.' });
  }
  db.deleteMessage(req.message.id);
  removeAttachmentsOf(req.message);
  broadcast(req, 'message:deleted', { channelId: req.message.channelId, messageId: req.message.id });
  res.json({ ok: true });
});

module.exports = router;
