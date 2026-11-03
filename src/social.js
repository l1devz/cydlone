const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const realtime = require('./realtime');
const { withAuthors, replyTarget, botEmbeds, MAX_MESSAGE } = require('./servers');
const files = require('./attachments');

const router = express.Router();
router.use(requireAuth);

function notifyRelationships(...userIds) {
  userIds.forEach((id) => realtime.toUser(id, 'relationships:changed', {}));
}

function relationship(meId, otherId) {
  if (db.hasBlocked(meId, otherId)) return 'blocked';
  const f = db.findFriendship(meId, otherId);
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friend';
  return f.requesterId === meId ? 'outgoing' : 'incoming';
}

router.get('/users/:userId', (req, res) => {
  const user = db.findUserById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  const mutualServers = db.serversForUser(req.user.id)
    .filter((s) => db.isMember(s.id, user.id))
    .map((s) => ({ id: s.id, name: s.name, iconColor: s.iconColor, iconUrl: s.iconUrl || null, verified: !!s.verified }));
  const friendIds = (id) => new Set(db.friendshipsOf(id)
    .filter((f) => f.status === 'accepted')
    .map((f) => (f.requesterId === id ? f.addresseeId : f.requesterId)));
  const theirs = friendIds(user.id);
  const mutualFriends = user.id === req.user.id ? [] : db.findUsersByIds([...friendIds(req.user.id)].filter((id) => theirs.has(id)))
    .map(realtime.withPresence);
  res.json({
    user: realtime.withPresence(user),
    relationship: user.id === req.user.id ? 'self' : relationship(req.user.id, user.id),
    mutualServers,
    mutualFriends,
  });
});

router.get('/friends', (req, res) => {
  const meId = req.user.id;
  const list = db.friendshipsOf(meId);
  const otherId = (f) => (f.requesterId === meId ? f.addresseeId : f.requesterId);
  const users = Object.fromEntries(db.findUsersByIds([
    ...list.map(otherId),
    ...db.blocksOf(meId).map((b) => b.blockedId),
  ]).map((u) => [u.id, u]));

  res.json({
    friends: list.filter((f) => f.status === 'accepted' && users[otherId(f)])
      .map((f) => ({ ...realtime.withPresence(users[otherId(f)]), since: f.acceptedAt })),
    incoming: list.filter((f) => f.status === 'pending' && f.addresseeId === meId && users[f.requesterId])
      .map((f) => ({ requestId: f.id, user: realtime.withPresence(users[f.requesterId]) })),
    outgoing: list.filter((f) => f.status === 'pending' && f.requesterId === meId && users[f.addresseeId])
      .map((f) => ({ requestId: f.id, user: realtime.withPresence(users[f.addresseeId]) })),
    blocked: db.blocksOf(meId).filter((b) => users[b.blockedId]).map((b) => db.publicUser(users[b.blockedId])),
  });
});

router.post('/friends/requests', (req, res) => {
  const meId = req.user.id;
  const raw = String(req.body?.username || req.body?.userId || '').trim();
  const found = req.body?.userId ? { user: db.findUserById(raw) } : db.findUserByHandle(raw);
  if (found.ambiguous) {
    return res.status(400).json({ error: 'Bu kullanıcı adını birden fazla kişi kullanıyor. Etiketiyle birlikte yaz, ör. ayse#1234.' });
  }
  const target = found.user;
  const notFound = 'Hmm, bu işe yaramadı. Kullanıcı adını ve etiketi doğru yazdığından emin ol.';

  if (!target || db.hasBlocked(target.id, meId)) return res.status(404).json({ error: notFound });
  if (target.id === meId) return res.status(400).json({ error: 'Kendine arkadaşlık isteği gönderemezsin.' });
  if (target.bot) return res.status(400).json({ error: 'Botları arkadaş olarak ekleyemezsin.' });
  if (db.hasBlocked(meId, target.id)) {
    return res.status(400).json({ error: 'Bu kullanıcıyı engelledin. Önce engeli kaldırman gerekiyor.' });
  }

  const existing = db.findFriendship(meId, target.id);
  if (existing?.status === 'accepted') return res.status(400).json({ error: 'Zaten bu kullanıcıyla arkadaşsın!' });
  if (existing?.requesterId === meId) return res.status(400).json({ error: 'Bu kullanıcıya zaten istek gönderdin.' });

  if (existing) {
    db.acceptFriendRequest(existing.id);
    notifyRelationships(meId, target.id);
    return res.json({ result: 'accepted', user: db.publicUser(target) });
  }

  db.createFriendRequest(meId, target.id);
  notifyRelationships(meId, target.id);
  res.status(201).json({ result: 'sent', user: db.publicUser(target) });
});

router.post('/friends/requests/:requestId/accept', (req, res) => {
  const f = db.findFriendshipById(req.params.requestId);
  if (!f || f.addresseeId !== req.user.id || f.status !== 'pending') {
    return res.status(404).json({ error: 'İstek bulunamadı.' });
  }
  db.acceptFriendRequest(f.id);
  notifyRelationships(f.requesterId, f.addresseeId);
  res.json({ ok: true });
});

router.delete('/friends/requests/:requestId', (req, res) => {
  const f = db.findFriendshipById(req.params.requestId);
  const involved = f && (f.addresseeId === req.user.id || f.requesterId === req.user.id);
  if (!involved || f.status !== 'pending') return res.status(404).json({ error: 'İstek bulunamadı.' });
  db.deleteFriendship(f.requesterId, f.addresseeId);
  notifyRelationships(f.requesterId, f.addresseeId);
  res.json({ ok: true });
});

router.delete('/friends/:userId', (req, res) => {
  if (!db.areFriends(req.user.id, req.params.userId)) return res.status(404).json({ error: 'Arkadaş bulunamadı.' });
  db.deleteFriendship(req.user.id, req.params.userId);
  notifyRelationships(req.user.id, req.params.userId);
  res.json({ ok: true });
});

router.post('/blocks/:userId', (req, res) => {
  const target = db.findUserById(req.params.userId);
  if (!target || target.id === req.user.id) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  db.deleteFriendship(req.user.id, target.id);
  db.addBlock(req.user.id, target.id);
  notifyRelationships(req.user.id, target.id);
  res.json({ ok: true });
});

router.delete('/blocks/:userId', (req, res) => {
  db.removeBlock(req.user.id, req.params.userId);
  notifyRelationships(req.user.id);
  res.json({ ok: true });
});

function dmPayload(dm, meId) {
  const other = db.findUserById(dm.userIds.find((id) => id !== meId));
  return { id: dm.id, user: realtime.withPresence(other), lastMessageAt: dm.lastMessageAt, createdAt: dm.createdAt };
}

function loadDm(req, res, next) {
  const dm = db.findDmById(req.params.dmId);
  if (!dm || !dm.userIds.includes(req.user.id)) return res.status(404).json({ error: 'Sohbet bulunamadı.' });
  req.dm = dm;
  req.otherId = dm.userIds.find((id) => id !== req.user.id);
  next();
}

router.get('/dms', (req, res) => {
  const dms = db.dmsOf(req.user.id).filter((d) => !(d.hiddenFor || []).includes(req.user.id));
  res.json({ dms: dms.map((d) => dmPayload(d, req.user.id)).filter((d) => d.user) });
});

router.post('/dms', (req, res) => {
  const meId = req.user.id;
  const target = db.findUserById(String(req.body?.userId || ''));
  if (!target || target.id === meId) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  let dm = db.findDmBetween(meId, target.id);
  if (!dm) {
    if (db.isBlockedEitherWay(meId, target.id)) {
      return res.status(403).json({ error: 'Bu kullanıcıya mesaj gönderemezsin.' });
    }
    if (!db.areFriends(meId, target.id) && !db.shareServer(meId, target.id)) {
      return res.status(403).json({ error: 'Mesaj gönderebilmek için arkadaş olmanız ya da aynı sunucuda bulunmanız gerekiyor.' });
    }
    dm = db.createDm(meId, target.id);
  }
  db.setDmHidden(dm.id, meId, false);
  res.json({ dm: dmPayload(db.findDmById(dm.id), meId) });
});

router.delete('/dms/:dmId', loadDm, (req, res) => {
  db.setDmHidden(req.dm.id, req.user.id, true);
  res.json({ ok: true });
});

router.get('/dms/:dmId', loadDm, (req, res) => {
  res.json({ dm: dmPayload(req.dm, req.user.id) });
});

router.get('/dms/:dmId/messages', loadDm, (req, res) => {
  const messages = db.messagesOfChannel(req.dm.id, { before: req.query.before });
  res.json({ messages: withAuthors(messages) });
});

router.post('/dms/:dmId/messages', loadDm, (req, res) => {
  const meId = req.user.id;
  if (db.isBlockedEitherWay(meId, req.otherId)) {
    return res.status(403).json({ error: 'Mesajın gönderilemedi. Bu kullanıcıyla aranda bir engel var.' });
  }
  if (!db.areFriends(meId, req.otherId) && !db.shareServer(meId, req.otherId)) {
    return res.status(403).json({ error: 'Mesajın gönderilemedi. Artık bu kullanıcıyla ortak bir sunucun ya da arkadaşlığın yok.' });
  }
  const content = String(req.body?.content || '').trim();
  const { attachments, error } = files.pendingAttachments(req.body, meId);
  if (error) return res.status(400).json({ error });
  const embedResult = botEmbeds(req);
  if (embedResult.error) return res.status(400).json({ error: embedResult.error });
  const { embeds } = embedResult;
  if (!content && !attachments.length && !embeds.length) return res.status(400).json({ error: 'Mesaj boş olamaz.' });
  if (content.length > MAX_MESSAGE) {
    return res.status(400).json({ error: `Mesaj en fazla ${MAX_MESSAGE} karakter olabilir.` });
  }

  const target = replyTarget(req.body, req.dm.id);
  if (target === undefined) return res.status(400).json({ error: 'Yanıtlanan mesaj bulunamadı.' });
  const reply = target ? { replyTo: target.id } : {};
  const created = db.createMessage({
    channelId: req.dm.id, authorId: meId, content, ...reply, attachments: attachments.map(files.publicAttachment), embeds,
  });
  files.bindAttachments(attachments, created.id);
  const [message] = withAuthors([created]);
  db.touchDm(req.dm.id, message.createdAt);
  const dm = db.findDmById(req.dm.id);
  dm.userIds.forEach((id) => realtime.toUser(id, 'dm:message', { dm: dmPayload(dm, id), message }));
  res.status(201).json({ message });
});

module.exports = router;
