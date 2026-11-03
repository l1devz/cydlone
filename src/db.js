const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { snowflake } = require('./snowflake');
const config = require('./config');

const DB_DIR = path.join(__dirname, '..', 'database');

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function filePath(collection) {
  return path.join(DB_DIR, `${collection}.json`);
}

function read(collection) {
  ensureDir();
  const file = filePath(collection);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8').trim();
  return raw ? JSON.parse(raw) : [];
}

function write(collection, data) {
  ensureDir();
  const file = filePath(collection);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function findUserById(id) {
  return read('users').find((u) => u.id === id) || null;
}

function findUserByEmail(email) {
  const e = email.toLowerCase();
  return read('users').find((u) => u.email === e) || null;
}

const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

function findUsersByUsername(username) {
  return read('users').filter((u) => sameName(u.username, username));
}

function findUserByTag(username, discriminator) {
  return read('users').find((u) => sameName(u.username, username) && u.discriminator === discriminator) || null;
}

function findUserByHandle(handle) {
  const raw = String(handle || '').trim();
  const m = /^(.+)#(\d{4})$/.exec(raw);
  if (m) return { user: findUserByTag(m[1], m[2]) };
  const matches = findUsersByUsername(raw);
  if (matches.length > 1) return { ambiguous: true };
  return { user: matches[0] || null };
}

function freeDiscriminator(username, exceptUserId = null) {
  const used = new Set(findUsersByUsername(username).filter((u) => u.id !== exceptUserId).map((u) => u.discriminator));
  if (used.size >= 9999) return null;
  let d;
  do d = String(crypto.randomInt(1, 10000)).padStart(4, '0'); while (used.has(d));
  return d;
}

function createUser({ email, username, discriminator, displayName, passwordHash, birthDate, badges = [] }) {
  const users = read('users');
  const user = {
    id: snowflake(),
    email: email.toLowerCase(),
    username,
    discriminator,
    displayName: displayName || username,
    passwordHash,
    birthDate,
    avatarColor: randomAvatarColor(),
    badges,
    status: 'online',
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  write('users', users);
  return user;
}

function randomAvatarColor() {
  const colors = ['#8b5cf6', '#a855f7', '#7c3aed', '#c026d3', '#6366f1', '#9333ea', '#d946ef'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, email, birthDate, ...rest } = user;
  return rest;
}

function selfUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function findUsersByIds(ids) {
  const set = new Set(ids);
  return read('users').filter((u) => set.has(u.id));
}

function newInviteCode() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)];
  return code;
}

function findServerById(id) {
  return read('servers').find((s) => s.id === id) || null;
}

function findServerByInvite(code) {
  const vanity = String(code || '').toLowerCase();
  const servers = read('servers');
  return servers.find((s) => s.inviteCode === code)
    || servers.find((s) => s.verified && s.vanityCode && s.vanityCode === vanity)
    || null;
}

function createServer({ name, ownerId }) {
  const servers = read('servers');
  const server = {
    id: crypto.randomUUID(),
    name,
    ownerId,
    iconColor: randomAvatarColor(),
    inviteCode: newInviteCode(),
    createdAt: new Date().toISOString(),
  };
  servers.push(server);
  write('servers', servers);
  createEveryoneRole(server.id);
  addMember(server.id, ownerId);
  const text = createCategory({ serverId: server.id, name: 'Yazı Kanalları' });
  const voice = createCategory({ serverId: server.id, name: 'Ses Kanalları' });
  createChannel({ serverId: server.id, name: 'genel', type: 'text', categoryId: text.id });
  createChannel({ serverId: server.id, name: 'Genel', type: 'voice', categoryId: voice.id });
  return server;
}

function updateServer(id, changes) {
  const servers = read('servers');
  const server = servers.find((s) => s.id === id);
  if (!server) return null;
  Object.assign(server, changes);
  write('servers', servers);
  return server;
}

const isBanned = (serverId, userId) => read('bans').some((b) => b.serverId === serverId && b.userId === userId);
const bansOfServer = (serverId) => read('bans').filter((b) => b.serverId === serverId);

function addBan({ serverId, userId, reason = '', bannedBy }) {
  const bans = read('bans').filter((b) => !(b.serverId === serverId && b.userId === userId));
  const ban = { serverId, userId, reason, bannedBy, createdAt: new Date().toISOString() };
  bans.push(ban);
  write('bans', bans);
  return ban;
}

function removeBan(serverId, userId) {
  const bans = read('bans');
  const rest = bans.filter((b) => !(b.serverId === serverId && b.userId === userId));
  write('bans', rest);
  return rest.length !== bans.length;
}

function deleteRecentMessages(serverId, userId, sinceMs) {
  const channelIds = new Set(read('channels').filter((c) => c.serverId === serverId).map((c) => c.id));
  const since = new Date(Date.now() - sinceMs).toISOString();
  const messages = read('messages');
  const gone = messages.filter((m) => channelIds.has(m.channelId) && m.authorId === userId && m.createdAt >= since);
  if (gone.length) write('messages', messages.filter((m) => !gone.includes(m)));
  return gone.map((m) => ({ channelId: m.channelId, messageId: m.id }));
}

function deleteServer(id) {
  write('servers', read('servers').filter((s) => s.id !== id));
  write('members', read('members').filter((m) => m.serverId !== id));
  const channelIds = new Set(read('channels').filter((c) => c.serverId === id).map((c) => c.id));
  write('channels', read('channels').filter((c) => c.serverId !== id));
  write('categories', read('categories').filter((c) => c.serverId !== id));
  write('roles', read('roles').filter((r) => r.serverId !== id));
  write('bans', read('bans').filter((b) => b.serverId !== id));
  write('messages', read('messages').filter((m) => !channelIds.has(m.channelId)));
}

const EVERYONE_DEFAULT_PERMISSIONS = ['CREATE_INVITE', 'VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES', 'CONNECT'];

function createEveryoneRole(serverId) {
  const roles = read('roles');
  const role = {
    id: crypto.randomUUID(),
    serverId,
    name: '@everyone',
    color: null,
    permissions: [...EVERYONE_DEFAULT_PERMISSIONS],
    position: 0,
    hoist: false,
    mentionable: false,
    isEveryone: true,
    hasViewChannel: true,
    hasAttachFiles: true,
  };
  roles.push(role);
  write('roles', roles);
  return role;
}

function rolesOfServer(serverId) {
  return read('roles').filter((r) => r.serverId === serverId).sort((a, b) => b.position - a.position);
}

function findRoleById(id) {
  return read('roles').find((r) => r.id === id) || null;
}

function createRole({ serverId, name, color = null, permissions = [], hoist = false, mentionable = false, position }) {
  const roles = read('roles');
  roles.forEach((r) => { if (r.serverId === serverId && !r.isEveryone && r.position >= position) r.position += 1; });
  const role = { id: crypto.randomUUID(), serverId, name, color, permissions, position, hoist, mentionable, isEveryone: false };
  roles.push(role);
  write('roles', roles);
  return role;
}

function updateRole(id, changes) {
  const roles = read('roles');
  const role = roles.find((r) => r.id === id);
  if (!role) return null;
  Object.assign(role, changes);
  write('roles', roles);
  return role;
}

function setRoleOrder(serverId, idsTopToBottom) {
  const roles = read('roles');
  const n = idsTopToBottom.length;
  idsTopToBottom.forEach((id, i) => {
    const role = roles.find((r) => r.id === id && r.serverId === serverId);
    if (role) role.position = n - i;
  });
  write('roles', roles);
}

function deleteRole(id) {
  const role = findRoleById(id);
  if (!role) return;
  const roles = read('roles').filter((r) => r.id !== id);
  roles.forEach((r) => { if (r.serverId === role.serverId && r.position > role.position) r.position -= 1; });
  write('roles', roles);
  write('members', read('members').map((m) => (m.roles?.includes(id) ? { ...m, roles: m.roles.filter((x) => x !== id) } : m)));
  write('channels', read('channels').map((c) => (c.overwrites?.some((o) => o.roleId === id)
    ? { ...c, overwrites: c.overwrites.filter((o) => o.roleId !== id) } : c)));
}

function isMember(serverId, userId) {
  return read('members').some((m) => m.serverId === serverId && m.userId === userId);
}

function addMember(serverId, userId) {
  const members = read('members');
  if (members.some((m) => m.serverId === serverId && m.userId === userId)) return false;
  members.push({ serverId, userId, roles: [], joinedAt: new Date().toISOString() });
  write('members', members);
  return true;
}

function removeMember(serverId, userId) {
  write('members', read('members').filter((m) => !(m.serverId === serverId && m.userId === userId)));
}

function serversForUser(userId) {
  const ids = read('members').filter((m) => m.userId === userId).map((m) => m.serverId);
  const servers = read('servers');
  return ids.map((id) => servers.find((s) => s.id === id)).filter(Boolean);
}

function membersOfServer(serverId) {
  const ids = read('members').filter((m) => m.serverId === serverId).map((m) => m.userId);
  return findUsersByIds(ids);
}

function getMember(serverId, userId) {
  return read('members').find((m) => m.serverId === serverId && m.userId === userId) || null;
}

function memberEntries(serverId) {
  return read('members').filter((m) => m.serverId === serverId);
}

function setMemberRoles(serverId, userId, roleIds) {
  const members = read('members');
  const m = members.find((x) => x.serverId === serverId && x.userId === userId);
  if (!m) return null;
  m.roles = roleIds;
  write('members', members);
  return m;
}

function channelsOfServer(serverId) {
  return read('channels')
    .filter((c) => c.serverId === serverId)
    .sort((a, b) => a.position - b.position);
}

function findChannelById(id) {
  return read('channels').find((c) => c.id === id) || null;
}

function createChannel({ serverId, name, type, categoryId = null }) {
  const channels = read('channels');
  const position = channels.filter((c) => c.serverId === serverId).length;
  const channel = {
    id: crypto.randomUUID(),
    serverId,
    categoryId,
    name,
    type,
    position,
    createdAt: new Date().toISOString(),
  };
  channels.push(channel);
  write('channels', channels);
  return channel;
}

function updateChannel(id, changes) {
  const channels = read('channels');
  const channel = channels.find((c) => c.id === id);
  if (!channel) return null;
  Object.assign(channel, changes);
  write('channels', channels);
  return channel;
}

function deleteChannel(id) {
  write('channels', read('channels').filter((c) => c.id !== id));
  write('messages', read('messages').filter((m) => m.channelId !== id));
}

function categoriesOfServer(serverId) {
  return read('categories').filter((c) => c.serverId === serverId).sort((a, b) => a.position - b.position);
}

function findCategoryById(id) {
  return read('categories').find((c) => c.id === id) || null;
}

function createCategory({ serverId, name }) {
  const categories = read('categories');
  const category = {
    id: crypto.randomUUID(),
    serverId,
    name,
    position: categories.filter((c) => c.serverId === serverId).length,
    createdAt: new Date().toISOString(),
  };
  categories.push(category);
  write('categories', categories);
  return category;
}

function updateCategory(id, changes) {
  const categories = read('categories');
  const category = categories.find((c) => c.id === id);
  if (!category) return null;
  Object.assign(category, changes);
  write('categories', categories);
  return category;
}

function deleteCategory(id) {
  write('categories', read('categories').filter((c) => c.id !== id));
  write('channels', read('channels').map((c) => (c.categoryId === id ? { ...c, categoryId: null } : c)));
}

function messagesOfChannel(channelId, { before, limit = 50 } = {}) {
  let list = read('messages').filter((m) => m.channelId === channelId);
  if (before) list = list.filter((m) => m.createdAt < before);
  return list.slice(-limit);
}

function createMessage({ channelId, authorId, content, mentions = null, replyTo = null, replyMention = false, attachments = [], embeds = [], interaction = null, thinking = false }) {
  const messages = read('messages');
  const message = {
    id: crypto.randomUUID(),
    channelId,
    authorId,
    content,
    ...(mentions ? { mentions } : {}),
    ...(replyTo ? { replyTo, replyMention } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(embeds.length ? { embeds } : {}),
    ...(interaction ? { interaction } : {}),
    ...(thinking ? { thinking: true } : {}),
    createdAt: new Date().toISOString(),
  };
  messages.push(message);
  write('messages', messages);
  return message;
}

function updateUser(id, changes) {
  const users = read('users');
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  Object.assign(user, changes);
  write('users', users);
  return user;
}

const pairOf = (f, a, b) =>
  (f.requesterId === a && f.addresseeId === b) || (f.requesterId === b && f.addresseeId === a);

function findFriendship(a, b) {
  return read('friendships').find((f) => pairOf(f, a, b)) || null;
}

function findFriendshipById(id) {
  return read('friendships').find((f) => f.id === id) || null;
}

function friendshipsOf(userId) {
  return read('friendships').filter((f) => f.requesterId === userId || f.addresseeId === userId);
}

function createFriendRequest(requesterId, addresseeId) {
  const list = read('friendships');
  const request = {
    id: crypto.randomUUID(),
    requesterId,
    addresseeId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  list.push(request);
  write('friendships', list);
  return request;
}

function acceptFriendRequest(id) {
  const list = read('friendships');
  const f = list.find((x) => x.id === id);
  if (!f) return null;
  f.status = 'accepted';
  f.acceptedAt = new Date().toISOString();
  write('friendships', list);
  return f;
}

function deleteFriendship(a, b) {
  write('friendships', read('friendships').filter((f) => !pairOf(f, a, b)));
}

function areFriends(a, b) {
  const f = findFriendship(a, b);
  return !!f && f.status === 'accepted';
}

function blocksOf(userId) {
  return read('blocks').filter((b) => b.blockerId === userId);
}

function isBlockedEitherWay(a, b) {
  return read('blocks').some((x) =>
    (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a));
}

function hasBlocked(blockerId, blockedId) {
  return read('blocks').some((x) => x.blockerId === blockerId && x.blockedId === blockedId);
}

function addBlock(blockerId, blockedId) {
  if (hasBlocked(blockerId, blockedId)) return;
  const list = read('blocks');
  list.push({ blockerId, blockedId, createdAt: new Date().toISOString() });
  write('blocks', list);
}

function removeBlock(blockerId, blockedId) {
  write('blocks', read('blocks').filter((x) => !(x.blockerId === blockerId && x.blockedId === blockedId)));
}

function findDmById(id) {
  return read('dms').find((d) => d.id === id) || null;
}

function findDmBetween(a, b) {
  return read('dms').find((d) => d.userIds.includes(a) && d.userIds.includes(b)) || null;
}

function dmsOf(userId) {
  return read('dms')
    .filter((d) => d.userIds.includes(userId))
    .sort((x, y) => (y.lastMessageAt || y.createdAt).localeCompare(x.lastMessageAt || x.createdAt));
}

function createDm(a, b) {
  const list = read('dms');
  const dm = { id: crypto.randomUUID(), userIds: [a, b], createdAt: new Date().toISOString(), lastMessageAt: null };
  list.push(dm);
  write('dms', list);
  return dm;
}

function touchDm(id, at) {
  const list = read('dms');
  const dm = list.find((d) => d.id === id);
  if (!dm) return;
  dm.lastMessageAt = at;
  dm.hiddenFor = [];
  write('dms', list);
}

function setDmHidden(id, userId, hidden) {
  const list = read('dms');
  const dm = list.find((d) => d.id === id);
  if (!dm) return;
  const set = new Set(dm.hiddenFor || []);
  hidden ? set.add(userId) : set.delete(userId);
  dm.hiddenFor = [...set];
  write('dms', list);
}

function shareServer(a, b) {
  const members = read('members');
  const mine = new Set(members.filter((m) => m.userId === a).map((m) => m.serverId));
  return members.some((m) => m.userId === b && mine.has(m.serverId));
}

function relatedUserIds(userId) {
  const ids = new Set();
  friendshipsOf(userId).forEach((f) => ids.add(f.requesterId === userId ? f.addresseeId : f.requesterId));
  const members = read('members');
  const mine = new Set(members.filter((m) => m.userId === userId).map((m) => m.serverId));
  members.forEach((m) => { if (mine.has(m.serverId)) ids.add(m.userId); });
  ids.delete(userId);
  return [...ids];
}

function findMessageById(id) {
  return read('messages').find((m) => m.id === id) || null;
}

function findMessagesByIds(ids) {
  const set = new Set(ids);
  return read('messages').filter((m) => set.has(m.id));
}

function updateMessage(id, content, mentions) {
  const messages = read('messages');
  const message = messages.find((m) => m.id === id);
  if (!message) return null;
  message.content = content;
  if (mentions) message.mentions = mentions;
  message.editedAt = new Date().toISOString();
  write('messages', messages);
  return message;
}

function patchMessage(id, changes) {
  const messages = read('messages');
  const message = messages.find((m) => m.id === id);
  if (!message) return null;
  Object.entries(changes).forEach(([k, v]) => { if (v === undefined) delete message[k]; else message[k] = v; });
  write('messages', messages);
  return message;
}

function deleteMessage(id) {
  write('messages', read('messages').filter((m) => m.id !== id));
}

function deleteUser(userId) {
  read('servers').filter((s) => s.ownerId === userId).forEach((s) => deleteServer(s.id));
  write('members', read('members').filter((m) => m.userId !== userId));
  write('friendships', read('friendships').filter((f) => f.requesterId !== userId && f.addresseeId !== userId));
  write('blocks', read('blocks').filter((b) => b.blockerId !== userId && b.blockedId !== userId));
  const dmIds = new Set(read('dms').filter((d) => d.userIds.includes(userId)).map((d) => d.id));
  write('dms', read('dms').filter((d) => !dmIds.has(d.id)));
  write('messages', read('messages').filter((m) => !dmIds.has(m.channelId)));
  write('users', read('users').filter((u) => u.id !== userId));
}

function getJwtSecret() {
  if (config.jwtSecret) return config.jwtSecret;
  ensureDir();
  const file = path.join(DB_DIR, '.jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, 'utf8');
  return secret;
}

module.exports = {
  findUserById,
  findUserByEmail,
  findUsersByUsername,
  findUserByTag,
  findUserByHandle,
  freeDiscriminator,
  createUser,
  publicUser,
  selfUser,
  findUsersByIds,
  findServerById,
  findServerByInvite,
  createServer,
  updateServer,
  deleteServer,
  isMember,
  addMember,
  removeMember,
  serversForUser,
  membersOfServer,
  channelsOfServer,
  findChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
  createEveryoneRole,
  rolesOfServer,
  findRoleById,
  createRole,
  updateRole,
  setRoleOrder,
  deleteRole,
  getMember,
  memberEntries,
  setMemberRoles,
  categoriesOfServer,
  findCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  read,
  write,
  messagesOfChannel,
  createMessage,
  findMessageById,
  findMessagesByIds,
  updateMessage,
  deleteMessage,
  isBanned,
  bansOfServer,
  addBan,
  removeBan,
  deleteRecentMessages,
  patchMessage,
  updateUser,
  deleteUser,
  findFriendship,
  findFriendshipById,
  friendshipsOf,
  createFriendRequest,
  acceptFriendRequest,
  deleteFriendship,
  areFriends,
  blocksOf,
  isBlockedEitherWay,
  hasBlocked,
  addBlock,
  removeBlock,
  findDmById,
  findDmBetween,
  dmsOf,
  createDm,
  touchDm,
  setDmHidden,
  shareServer,
  relatedUserIds,
  getJwtSecret,
};
