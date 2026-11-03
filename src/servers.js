const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const realtime = require('./realtime');
const perms = require('./permissions');
const { parseMentions } = require('./mentions');
const files = require('./attachments');
const { sanitizeEmbeds } = require('./richEmbeds');
const { emojisOf, removeServerEmojis } = require('./emojis');

const router = express.Router();
router.use(requireAuth);

const MAX_MESSAGE = 2000;
const ICON_DIR = path.join(__dirname, '..', 'uploads', 'servers');
const MAX_ICON_BYTES = 1024 * 1024;
const HEX_RE = /^#[0-9a-f]{6}$/i;

function normalizeChannelName(name, type) {
  const trimmed = String(name || '').trim().slice(0, 100);
  if (type === 'voice') return trimmed;
  return trimmed
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-+/g, '-');
}

function serverPayload(server, viewerId) {
  const roleMap = Object.fromEntries(db.memberEntries(server.id).map((m) => [m.userId, m.roles || []]));
  const { inviteCode, ...rest } = server;
  return {
    ...rest,
    ...(perms.has(server, viewerId, 'CREATE_INVITE') ? { inviteCode } : {}),
    channels: db.channelsOfServer(server.id),
    categories: db.categoriesOfServer(server.id),
    roles: db.rolesOfServer(server.id),
    emojis: emojisOf(server.id),
    voice: realtime.voiceStatesForServer(server.id),
    members: db.membersOfServer(server.id).map((u) => ({ ...realtime.withPresence(u), roles: roleMap[u.id] || [] })),
  };
}

function need(perm) {
  return (req, res, next) => {
    if (!perms.has(req.server, req.user.id, perm)) {
      return res.status(403).json({ error: 'Bunu yapmak için iznin yok.' });
    }
    next();
  };
}

function loadServer(req, res, next) {
  const server = db.findServerById(req.params.serverId);
  if (!server || !db.isMember(server.id, req.user.id)) {
    return res.status(404).json({ error: 'Sunucu bulunamadı.' });
  }
  req.server = server;
  next();
}

function ownerOnly(req, res, next) {
  if (req.server.ownerId !== req.user.id) {
    return res.status(403).json({ error: 'Bunu sadece sunucu sahibi yapabilir.' });
  }
  next();
}

function loadChannel(req, res, next) {
  const channel = db.findChannelById(req.params.channelId);
  if (!channel || !db.isMember(channel.serverId, req.user.id)) {
    return res.status(404).json({ error: 'Kanal bulunamadı.' });
  }
  req.channel = channel;
  req.server = db.findServerById(channel.serverId);
  next();
}

const withoutInvite = ({ inviteCode, ...server }) => server;

router.get('/servers', (req, res) => {
  res.json({ servers: db.serversForUser(req.user.id).map((s) => ({ ...withoutInvite(s), emojis: emojisOf(s.id) })) });
});

router.post('/servers', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ errors: { name: 'Sunucu adı 2-100 karakter olmalı.' } });
  }
  const server = db.createServer({ name, ownerId: req.user.id });
  realtime.joinServerRoom(req.user.id, server.id);
  res.status(201).json({ server: serverPayload(server, req.user.id) });
});

router.post('/servers/join', (req, res) => {
  const raw = String(req.body?.code || '').trim();
  const code = raw.split('/').filter(Boolean).pop() || '';
  const server = db.findServerByInvite(code);
  if (!server) return res.status(404).json({ errors: { code: 'Davet geçersiz ya da süresi dolmuş.' } });
  if (db.isBanned(server.id, req.user.id)) {
    return res.status(403).json({ errors: { code: 'Bu sunucudan yasaklandın.' } });
  }

  const added = db.addMember(server.id, req.user.id);
  realtime.joinServerRoom(req.user.id, server.id);
  if (added) {
    realtime.toServer(server.id, 'member:joined', { serverId: server.id, user: { ...realtime.withPresence(req.user), roles: [] } });
  }
  res.json({ server: serverPayload(server, req.user.id), alreadyMember: !added });
});

router.get('/servers/:serverId', loadServer, (req, res) => {
  res.json({ server: serverPayload(req.server, req.user.id) });
});

router.patch('/servers/:serverId', loadServer, need('MANAGE_SERVER'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ errors: { name: 'Sunucu adı 2-100 karakter olmalı.' } });
  }
  const server = withoutInvite(db.updateServer(req.server.id, { name }));
  realtime.toServer(server.id, 'server:updated', { server });
  res.json({ server });
});

const VANITY_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

router.put('/servers/:serverId/vanity', loadServer, need('MANAGE_SERVER'), (req, res) => {
  if (!req.server.verified) {
    return res.status(403).json({ error: 'Özel davet bağlantısı sadece doğrulanmış sunucularda kullanılabilir.' });
  }
  const code = String(req.body?.code || '').trim().toLowerCase();
  if (code && !VANITY_RE.test(code)) {
    return res.status(400).json({ errors: { code: '3-32 karakter olmalı; sadece harf (a-z), rakam ve tire kullanılabilir, tireyle başlayıp bitemez.' } });
  }
  const taken = code && db.read('servers').some((s) => s.id !== req.server.id
    && (s.vanityCode === code || String(s.inviteCode).toLowerCase() === code));
  if (taken) return res.status(409).json({ errors: { code: 'Bu bağlantı başka bir sunucu tarafından kullanılıyor.' } });

  const server = withoutInvite(db.updateServer(req.server.id, { vanityCode: code || null }));
  realtime.toServer(server.id, 'server:updated', { server });
  res.json({ server });
});

function removeServerIcon(server) {
  if (!server?.iconUrl) return;
  fs.rm(path.join(ICON_DIR, path.basename(server.iconUrl)), { force: true }, () => {});
}

router.post('/servers/:serverId/icon', loadServer, need('MANAGE_SERVER'), (req, res) => {
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.dataUrl || ''));
  if (!match) return res.status(400).json({ error: 'Desteklenmeyen resim biçimi.' });
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_ICON_BYTES) return res.status(400).json({ error: 'Resim en fazla 1 MB olabilir.' });

  fs.mkdirSync(ICON_DIR, { recursive: true });
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const name = `${req.server.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(ICON_DIR, name), buffer);
  removeServerIcon(req.server);
  const server = withoutInvite(db.updateServer(req.server.id, { iconUrl: `/uploads/servers/${name}` }));
  realtime.toServer(server.id, 'server:updated', { server });
  res.json({ server });
});

router.delete('/servers/:serverId/icon', loadServer, need('MANAGE_SERVER'), (req, res) => {
  removeServerIcon(req.server);
  const server = withoutInvite(db.updateServer(req.server.id, { iconUrl: null }));
  realtime.toServer(server.id, 'server:updated', { server });
  res.json({ server });
});

router.delete('/servers/:serverId', loadServer, ownerOnly, (req, res) => {
  removeServerIcon(req.server);
  removeServerEmojis(req.server.id);
  realtime.endVoice({ serverId: req.server.id, reason: 'Sunucu silindi.' });
  realtime.toServer(req.server.id, 'server:deleted', { serverId: req.server.id });
  db.deleteServer(req.server.id);
  realtime.closeServerRoom(req.server.id);
  res.json({ ok: true });
});

router.post('/servers/:serverId/leave', loadServer, (req, res) => {
  if (req.server.ownerId === req.user.id) {
    return res.status(400).json({ error: 'Sunucu sahibi sunucudan ayrılamaz; sunucuyu silebilirsin.' });
  }
  realtime.endVoice({ serverId: req.server.id, userId: req.user.id, reason: 'Sunucudan ayrıldın.' });
  db.removeMember(req.server.id, req.user.id);
  realtime.leaveServerRoom(req.user.id, req.server.id);
  realtime.toServer(req.server.id, 'member:left', { serverId: req.server.id, userId: req.user.id });
  res.json({ ok: true });
});

router.post('/servers/:serverId/channels', loadServer, need('MANAGE_CHANNELS'), (req, res) => {
  const type = req.body?.type === 'voice' ? 'voice' : 'text';
  const name = normalizeChannelName(req.body?.name, type);
  if (!name) return res.status(400).json({ errors: { name: 'Kanal adı gerekli.' } });
  const categoryId = req.body?.categoryId || null;
  if (categoryId && db.findCategoryById(categoryId)?.serverId !== req.server.id) {
    return res.status(400).json({ errors: { name: 'Kategori bulunamadı.' } });
  }

  const channel = db.createChannel({ serverId: req.server.id, name, type, categoryId });
  realtime.toServer(req.server.id, 'channel:created', { channel });
  res.status(201).json({ channel });
});

router.put('/channels/:channelId/overwrites', loadChannel, need('MANAGE_CHANNELS'), need('MANAGE_ROLES'), (req, res) => {
  const { server, channel } = req;
  const allowed = perms.channelPermissionIds(channel.type);
  const roles = db.rolesOfServer(server.id);
  const clean = (list) => [...new Set(Array.isArray(list) ? list : [])].filter((p) => allowed.has(p)).sort();
  const seen = new Set();
  const overwrites = [];
  for (const o of Array.isArray(req.body?.overwrites) ? req.body.overwrites : []) {
    if (!roles.some((r) => r.id === o?.roleId) || seen.has(o.roleId)) continue;
    seen.add(o.roleId);
    const allow = clean(o.allow);
    overwrites.push({ roleId: o.roleId, allow, deny: clean(o.deny).filter((p) => !allow.includes(p)) });
  }

  const before = new Map((channel.overwrites || []).map((o) => [o.roleId, o]));
  const after = new Map(overwrites.map((o) => [o.roleId, o]));
  const mine = perms.channelPermissionsOf(server, req.user.id, channel);
  const stateOf = (o, p) => (o?.allow.includes(p) ? 'allow' : o?.deny.includes(p) ? 'deny' : null);
  for (const roleId of new Set([...before.keys(), ...after.keys()])) {
    const changed = [...allowed].filter((p) => stateOf(before.get(roleId), p) !== stateOf(after.get(roleId), p));
    const listChanged = before.has(roleId) !== after.has(roleId);
    if (!changed.length && !listChanged) continue;
    const role = roles.find((r) => r.id === roleId);
    if (role && !role.isEveryone && !perms.canManageRole(server, req.user.id, role)) {
      return res.status(403).json({ error: `"${role.name}" rolü senin en yüksek rolüne eşit ya da daha yüksek; iznini değiştiremezsin.` });
    }
    if (changed.some((p) => !mine.has(p))) {
      return res.status(403).json({ error: 'Bu kanalda sahip olmadığın bir izni değiştiremezsin.' });
    }
  }

  const updated = db.updateChannel(channel.id, { overwrites });
  realtime.toServer(server.id, 'channel:updated', { channel: updated });
  realtime.enforceVoiceAccess(server.id);
  res.json({ channel: updated });
});

router.patch('/channels/:channelId', loadChannel, need('MANAGE_CHANNELS'), (req, res) => {
  const name = normalizeChannelName(req.body?.name, req.channel.type);
  if (!name) return res.status(400).json({ errors: { name: 'Kanal adı gerekli.' } });
  const channel = db.updateChannel(req.channel.id, { name });
  realtime.toServer(req.server.id, 'channel:updated', { channel });
  res.json({ channel });
});

function cleanCategoryName(name) {
  return String(name || '').trim().slice(0, 100);
}

function loadCategory(req, res, next) {
  const category = db.findCategoryById(req.params.categoryId);
  if (!category || !db.isMember(category.serverId, req.user.id)) {
    return res.status(404).json({ error: 'Kategori bulunamadı.' });
  }
  req.category = category;
  req.server = db.findServerById(category.serverId);
  next();
}

router.post('/servers/:serverId/categories', loadServer, need('MANAGE_CHANNELS'), (req, res) => {
  const name = cleanCategoryName(req.body?.name);
  if (!name) return res.status(400).json({ errors: { name: 'Kategori adı gerekli.' } });
  const category = db.createCategory({ serverId: req.server.id, name });
  realtime.toServer(req.server.id, 'category:created', { category });
  res.status(201).json({ category });
});

router.patch('/categories/:categoryId', loadCategory, need('MANAGE_CHANNELS'), (req, res) => {
  const name = cleanCategoryName(req.body?.name);
  if (!name) return res.status(400).json({ errors: { name: 'Kategori adı gerekli.' } });
  const category = db.updateCategory(req.category.id, { name });
  realtime.toServer(req.server.id, 'category:updated', { category });
  res.json({ category });
});

router.delete('/categories/:categoryId', loadCategory, need('MANAGE_CHANNELS'), (req, res) => {
  db.deleteCategory(req.category.id);
  realtime.toServer(req.server.id, 'category:deleted', { serverId: req.server.id, categoryId: req.category.id });
  res.json({ ok: true });
});

router.delete('/channels/:channelId', loadChannel, need('MANAGE_CHANNELS'), (req, res) => {
  const textChannels = db.channelsOfServer(req.server.id).filter((c) => c.type === 'text');
  if (req.channel.type === 'text' && textChannels.length <= 1) {
    return res.status(400).json({ error: 'Sunucuda en az bir yazı kanalı kalmalı.' });
  }
  realtime.endVoice({ channelId: req.channel.id, reason: 'Ses kanalı silindi.' });
  db.deleteChannel(req.channel.id);
  realtime.toServer(req.server.id, 'channel:deleted', { serverId: req.server.id, channelId: req.channel.id });
  res.json({ ok: true });
});

function loadRole(req, res, next) {
  const role = db.findRoleById(req.params.roleId);
  if (!role || !db.isMember(role.serverId, req.user.id)) return res.status(404).json({ error: 'Rol bulunamadı.' });
  req.role = role;
  req.server = db.findServerById(role.serverId);
  next();
}

function roleChanges(req, body, { isEveryone = false } = {}) {
  const changes = {};
  const errors = {};
  if ('name' in body && !isEveryone) {
    const name = String(body.name || '').trim();
    if (!name || name.length > 100) errors.name = 'Rol adı 1-100 karakter olmalı.';
    else if (/^@?(everyone|here)$/i.test(name)) errors.name = 'Bu ad kullanılamaz.';
    else changes.name = name;
  }
  if ('color' in body && !isEveryone) {
    if (body.color !== null && !HEX_RE.test(body.color)) errors.color = 'Geçersiz renk.';
    else changes.color = body.color ? body.color.toLowerCase() : null;
  }
  ['hoist', 'mentionable'].forEach((k) => { if (k in body && !isEveryone) changes[k] = !!body[k]; });
  if ('permissions' in body) {
    const mine = perms.permissionsOf(req.server, req.user.id);
    const wanted = [...new Set((body.permissions || []).filter((p) => perms.PERMISSION_IDS.has(p)))];
    const current = new Set(req.role?.permissions || []);
    const added = wanted.filter((p) => !current.has(p));
    if (added.some((p) => !mine.has(p))) errors.permissions = 'Sahip olmadığın bir izni veremezsin.';
    else changes.permissions = wanted;
  }
  return { changes, errors };
}

router.post('/servers/:serverId/roles', loadServer, need('MANAGE_ROLES'), (req, res) => {
  const { changes, errors } = roleChanges(req, { name: 'yeni rol', color: null, permissions: [], ...req.body });
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  const top = perms.highestPosition(req.server, req.user.id);
  const maxPos = Math.max(0, ...db.rolesOfServer(req.server.id).map((r) => r.position));
  const position = top === Infinity ? maxPos + 1 : Math.max(1, top);
  const role = db.createRole({ serverId: req.server.id, ...changes, position });
  realtime.toServer(req.server.id, 'roles:updated', { serverId: req.server.id, roles: db.rolesOfServer(req.server.id) });
  res.status(201).json({ role });
});

router.patch('/roles/:roleId', loadRole, need('MANAGE_ROLES'), (req, res) => {
  if (!req.role.isEveryone && !perms.canManageRole(req.server, req.user.id, req.role)) {
    return res.status(403).json({ error: 'Kendi en yüksek rolüne eşit ya da daha yüksek bir rolü düzenleyemezsin.' });
  }
  const { changes, errors } = roleChanges(req, req.body || {}, { isEveryone: req.role.isEveryone });
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  const role = db.updateRole(req.role.id, changes);
  realtime.toServer(req.server.id, 'roles:updated', { serverId: req.server.id, roles: db.rolesOfServer(req.server.id) });
  realtime.enforceVoiceAccess(req.server.id);
  res.json({ role });
});

router.put('/servers/:serverId/roles/order', loadServer, need('MANAGE_ROLES'), (req, res) => {
  const roles = db.rolesOfServer(req.server.id).filter((r) => !r.isEveryone);
  const ids = Array.isArray(req.body?.roles) ? req.body.roles : [];
  const sameSet = ids.length === roles.length && new Set(ids).size === ids.length && ids.every((id) => roles.some((r) => r.id === id));
  if (!sameSet) return res.status(400).json({ error: 'Rol listesi güncel değil. Sayfayı yenileyip tekrar dene.' });

  const top = perms.highestPosition(req.server, req.user.id);
  const n = ids.length;
  for (const [i, id] of ids.entries()) {
    const role = roles.find((r) => r.id === id);
    const newPos = n - i;
    if (newPos === role.position) continue;
    if (!perms.canManageRole(req.server, req.user.id, role) || newPos >= top) {
      return res.status(403).json({ error: 'Kendi en yüksek rolünün üstündeki rollerin sırasını değiştiremezsin.' });
    }
  }
  db.setRoleOrder(req.server.id, ids);
  realtime.toServer(req.server.id, 'roles:updated', { serverId: req.server.id, roles: db.rolesOfServer(req.server.id) });
  res.json({ ok: true });
});

router.delete('/roles/:roleId', loadRole, need('MANAGE_ROLES'), (req, res) => {
  if (req.role.isEveryone) return res.status(400).json({ error: '@everyone rolü silinemez.' });
  if (!perms.canManageRole(req.server, req.user.id, req.role)) {
    return res.status(403).json({ error: 'Kendi en yüksek rolüne eşit ya da daha yüksek bir rolü silemezsin.' });
  }
  db.deleteRole(req.role.id);
  realtime.toServer(req.server.id, 'roles:updated', {
    serverId: req.server.id,
    roles: db.rolesOfServer(req.server.id),
    members: db.memberEntries(req.server.id).map((m) => ({ userId: m.userId, roles: m.roles || [] })),
  });
  db.channelsOfServer(req.server.id).forEach((channel) => realtime.toServer(req.server.id, 'channel:updated', { channel }));
  realtime.enforceVoiceAccess(req.server.id);
  res.json({ ok: true });
});

function loadTarget(req, res, next) {
  if (!db.isMember(req.server.id, req.params.userId)) return res.status(404).json({ error: 'Üye bulunamadı.' });
  next();
}

router.put('/servers/:serverId/members/:userId/roles', loadServer, need('MANAGE_ROLES'), loadTarget, (req, res) => {
  const { server } = req;
  const targetId = req.params.userId;
  const serverRoles = db.rolesOfServer(server.id).filter((r) => !r.isEveryone);
  const wanted = new Set((req.body?.roles || []).filter((id) => serverRoles.some((r) => r.id === id)));
  const current = new Set(db.getMember(server.id, targetId).roles || []);
  const changed = serverRoles.filter((r) => wanted.has(r.id) !== current.has(r.id));
  if (changed.some((r) => !perms.canManageRole(server, req.user.id, r))) {
    return res.status(403).json({ error: 'Kendi en yüksek rolüne eşit ya da daha yüksek bir rolü veremez ya da alamazsın.' });
  }
  const roles = serverRoles.filter((r) => wanted.has(r.id)).map((r) => r.id);
  db.setMemberRoles(server.id, targetId, roles);
  realtime.toServer(server.id, 'member:roles', { serverId: server.id, userId: targetId, roles });
  realtime.enforceVoiceAccess(server.id);
  res.json({ roles });
});

router.post('/servers/:serverId/members/:userId/kick', loadServer, need('KICK_MEMBERS'), loadTarget, (req, res) => {
  const { server } = req;
  const targetId = req.params.userId;
  if (targetId === req.user.id) return res.status(400).json({ error: 'Kendini atamazsın; sunucudan ayrılabilirsin.' });
  if (!perms.canManageMember(server, req.user.id, targetId)) {
    return res.status(403).json({ error: 'Bu üyenin rolü seninkinden yüksek ya da eşit.' });
  }
  realtime.endVoice({ serverId: server.id, userId: targetId, reason: 'Sunucudan atıldın.' });
  db.removeMember(server.id, targetId);
  realtime.leaveServerRoom(targetId, server.id);
  realtime.toUser(targetId, 'server:removed', { serverId: server.id, reason: `${server.name} sunucusundan atıldın.` });
  realtime.toServer(server.id, 'member:left', { serverId: server.id, userId: targetId });
  res.json({ ok: true });
});

function bannedUser(ban) {
  const user = db.findUserById(ban.userId);
  const by = db.findUserById(ban.bannedBy);
  return {
    ...ban,
    user: user ? db.publicUser(user) : { id: ban.userId, displayName: 'Silinmiş Kullanıcı', username: 'silinmis' },
    bannedByUser: by ? db.publicUser(by) : null,
  };
}

router.get('/servers/:serverId/bans', loadServer, need('BAN_MEMBERS'), (req, res) => {
  res.json({ bans: db.bansOfServer(req.server.id).map(bannedUser).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

router.post('/servers/:serverId/bans/:userId', loadServer, need('BAN_MEMBERS'), (req, res) => {
  const { server } = req;
  const targetId = req.params.userId;
  const target = db.findUserById(targetId);
  if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Kendini yasaklayamazsın.' });
  if (targetId === server.ownerId) return res.status(403).json({ error: 'Sunucu sahibi yasaklanamaz.' });
  const isMember = db.isMember(server.id, targetId);
  if (isMember && !perms.canManageMember(server, req.user.id, targetId)) {
    return res.status(403).json({ error: 'Bu üyenin rolü seninkinden yüksek ya da eşit.' });
  }
  const reason = String(req.body?.reason || '').trim().slice(0, 512);
  const hours = [0, 1, 24, 168].includes(Number(req.body?.deleteMessages)) ? Number(req.body.deleteMessages) : 0;

  const ban = db.addBan({ serverId: server.id, userId: targetId, reason, bannedBy: req.user.id });
  if (isMember) {
    realtime.endVoice({ serverId: server.id, userId: targetId, reason: 'Sunucudan yasaklandın.' });
    db.removeMember(server.id, targetId);
    realtime.leaveServerRoom(targetId, server.id);
    realtime.toUser(targetId, 'server:removed', {
      serverId: server.id,
      reason: `${server.name} sunucusundan yasaklandın.${reason ? ` Sebep: ${reason}` : ''}`,
    });
    realtime.toServer(server.id, 'member:left', { serverId: server.id, userId: targetId });
  }
  if (hours) {
    db.deleteRecentMessages(server.id, targetId, hours * 60 * 60 * 1000)
      .forEach((m) => realtime.toServer(server.id, 'message:deleted', m));
  }
  realtime.toServer(server.id, 'bans:updated', { serverId: server.id });
  res.json({ ban: bannedUser(ban) });
});

router.delete('/servers/:serverId/bans/:userId', loadServer, need('BAN_MEMBERS'), (req, res) => {
  if (!db.removeBan(req.server.id, req.params.userId)) return res.status(404).json({ error: 'Bu kişi yasaklı değil.' });
  realtime.toServer(req.server.id, 'bans:updated', { serverId: req.server.id });
  res.json({ ok: true });
});

function withAuthors(messages) {
  const replyIds = [...new Set(messages.map((m) => m.replyTo).filter(Boolean))];
  const refs = Object.fromEntries((replyIds.length ? db.findMessagesByIds(replyIds) : []).map((r) => [r.id, r]));
  const authorIds = [...messages, ...Object.values(refs)].map((m) => m.authorId);
  const users = db.findUsersByIds([...new Set(authorIds)]);
  const byId = Object.fromEntries(users.map((u) => [u.id, db.publicUser(u)]));
  const reference = (r) => (r ? {
    id: r.id, authorId: r.authorId, content: r.content, attachmentCount: r.attachments?.length || 0, author: byId[r.authorId] || null,
  } : null);
  return messages.map((m) => ({
    ...m,
    author: byId[m.authorId] || null,
    ...(m.replyTo ? { referenced: reference(refs[m.replyTo]) } : {}),
  }));
}

function replyTarget(body, channelId) {
  if (!body?.replyTo) return null;
  const target = db.findMessageById(String(body.replyTo));
  return target && target.channelId === channelId ? target : undefined;
}

function addReplyMention(mentions, message, server, authorId) {
  const target = message.replyTo && message.replyMention ? db.findMessageById(message.replyTo) : null;
  if (!target || target.authorId === authorId || !db.isMember(server.id, target.authorId)) return mentions;
  return { ...mentions, users: [...new Set([...mentions.users, target.authorId])] };
}

router.get('/channels/:channelId/messages', loadChannel, (req, res) => {
  if (!perms.hasIn(req.server, req.user.id, req.channel, 'VIEW_CHANNEL')) {
    return res.status(403).json({ error: 'Bu kanalı görme iznin yok.' });
  }
  if (req.channel.type !== 'text') return res.json({ messages: [] });
  const messages = db.messagesOfChannel(req.channel.id, { before: req.query.before });
  res.json({ messages: withAuthors(messages) });
});

router.post('/channels/:channelId/messages', loadChannel, (req, res) => {
  if (req.channel.type !== 'text') return res.status(400).json({ error: 'Bu kanala mesaj gönderilemez.' });
  if (!perms.hasIn(req.server, req.user.id, req.channel, 'SEND_MESSAGES')) {
    return res.status(403).json({ error: 'Bu kanala mesaj gönderme iznin yok.' });
  }
  const content = String(req.body?.content || '').trim();
  const { attachments, error } = files.pendingAttachments(req.body, req.user.id);
  if (error) return res.status(400).json({ error });
  if (attachments.length && !perms.hasIn(req.server, req.user.id, req.channel, 'ATTACH_FILES')) {
    return res.status(403).json({ error: 'Bu kanala dosya gönderme iznin yok.' });
  }
  const embedResult = botEmbeds(req);
  if (embedResult.error) return res.status(400).json({ error: embedResult.error });
  const { embeds } = embedResult;
  if (!content && !attachments.length && !embeds.length) return res.status(400).json({ error: 'Mesaj boş olamaz.' });
  if (content.length > MAX_MESSAGE) {
    return res.status(400).json({ error: `Mesaj en fazla ${MAX_MESSAGE} karakter olabilir.` });
  }

  const target = replyTarget(req.body, req.channel.id);
  if (target === undefined) return res.status(400).json({ error: 'Yanıtlanan mesaj bulunamadı.' });
  const reply = target ? { replyTo: target.id, replyMention: req.body.mentionReply !== false } : {};
  const mentions = addReplyMention(parseMentions(content, req.server, req.user.id, req.channel), reply, req.server, req.user.id);
  const created = db.createMessage({
    channelId: req.channel.id, authorId: req.user.id, content, mentions, ...reply,
    attachments: attachments.map(files.publicAttachment), embeds,
  });
  files.bindAttachments(attachments, created.id);
  const [message] = withAuthors([created]);
  realtime.toChannel(req.channel, 'message:new', { serverId: req.server.id, message });
  res.status(201).json({ message });
});

function botEmbeds(req) {
  if (req.body?.embeds == null) return { embeds: [] };
  if (!req.user.bot) return { error: "Embed'leri sadece botlar gönderebilir." };
  return sanitizeEmbeds(req.body.embeds);
}

module.exports = { router, withAuthors, replyTarget, addReplyMention, removeServerIcon, botEmbeds, MAX_MESSAGE };
