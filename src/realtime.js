const { Server } = require('socket.io');
const cookie = require('cookie');
const db = require('./db');
const perms = require('./permissions');
const { userFromToken, botFromToken, COOKIE_NAME } = require('./auth');

let io = null;
const connections = new Map();
const activities = new Map();

function presenceOf(user) {
  if (!user || !connections.get(user.id)) return 'offline';
  return user.status === 'invisible' ? 'offline' : user.status || 'online';
}

function withPresence(user) {
  if (!user) return null;
  const presence = presenceOf(user);
  const activity = presence === 'offline' ? null : activities.get(user.id) || null;
  return { ...db.publicUser(user), presence, activity };
}

function setActivity(userId, activity) {
  const prev = activities.get(userId) || null;
  const same = prev && activity && prev.id === activity.id && Math.abs(prev.start - activity.start) < 3000;
  if (same || (!prev && !activity)) return;
  if (activity) activities.set(userId, activity);
  else activities.delete(userId);
  if (!io) return;
  const payload = { userId, activity };
  io.to(`user:${userId}`).emit('activity', payload);
  db.relatedUserIds(userId).forEach((id) => io.to(`user:${id}`).emit('activity', payload));
}

function broadcastPresence(userId) {
  const user = db.findUserById(userId);
  if (!user) return;
  const payload = { userId, presence: presenceOf(user) };
  db.relatedUserIds(userId).forEach((id) => io.to(`user:${id}`).emit('presence', payload));
}

function broadcastUserUpdate(userId) {
  const user = db.findUserById(userId);
  if (!user || !io) return;
  io.to(`user:${userId}`).emit('me:updated', { user: db.selfUser(user) });
  const payload = { user: withPresence(user) };
  db.relatedUserIds(userId).forEach((id) => io.to(`user:${id}`).emit('user:updated', payload));
}

function disconnectUser(userId) {
  io?.in(`user:${userId}`).disconnectSockets(true);
  connections.delete(userId);
}

function init(httpServer) {
  io = new Server(httpServer);

  io.use((socket, next) => {
    const botToken = socket.handshake.auth?.token;
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const user = botToken ? botFromToken(botToken) : userFromToken(cookies[COOKIE_NAME]);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    socket.join(`user:${userId}`);
    db.serversForUser(userId).forEach((s) => socket.join(`server:${s.id}`));

    const count = (connections.get(userId) || 0) + 1;
    connections.set(userId, count);
    if (count === 1) broadcastPresence(userId);
    if (activities.has(userId)) socket.emit('activity', { userId, activity: activities.get(userId) });
    const me = db.findUserById(userId);
    socket.emit('ready', {
      user: withPresence(me),
      servers: db.serversForUser(userId).map(({ inviteCode, ...s }) => ({ ...s, channels: db.channelsOfServer(s.id) })),
    });

    socket.on('voice:join', ({ channelId, muted, deafened } = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const channel = db.findChannelById(channelId);
      if (!channel || channel.type !== 'voice' || !db.isMember(channel.serverId, userId)) {
        return reply({ error: 'Ses kanalı bulunamadı.' });
      }
      if (!perms.hasIn(db.findServerById(channel.serverId), userId, channel, 'CONNECT')) {
        return reply({ error: 'Bu ses kanalına bağlanma iznin yok.' });
      }
      leaveVoice(socket);
      for (const [sid, cid] of [...socketVoice]) {
        if (voice.get(cid)?.get(sid)?.userId !== userId) continue;
        const other = io.sockets.sockets.get(sid);
        if (other) {
          other.emit('voice:kicked', { reason: 'Başka bir sekmeden ses kanalına bağlandın.' });
          leaveVoice(other);
        }
      }
      const peers = voiceParticipants(channelId);
      if (!voice.has(channelId)) voice.set(channelId, new Map());
      voice.get(channelId).set(socket.id, { userId, muted: !!muted, deafened: !!deafened, video: false, screen: false });
      socketVoice.set(socket.id, channelId);
      socket.join(`voice:${channelId}`);
      reply({ selfId: socket.id, peers });
      broadcastVoice(channelId);
    });

    socket.on('voice:leave', () => leaveVoice(socket));

    socket.on('voice:update', (patch = {}) => {
      const channelId = socketVoice.get(socket.id);
      const entry = channelId && voice.get(channelId)?.get(socket.id);
      if (!entry) return;
      ['muted', 'deafened', 'video', 'screen'].forEach((k) => { if (k in patch) entry[k] = !!patch[k]; });
      broadcastVoice(channelId);
    });

    socket.on('voice:signal', ({ to, data } = {}) => {
      const channelId = socketVoice.get(socket.id);
      if (!channelId || socketVoice.get(to) !== channelId) return;
      io.to(to).emit('voice:signal', { from: socket.id, userId, data });
    });

    socket.on('disconnect', () => {
      leaveVoice(socket);
      const left = (connections.get(userId) || 1) - 1;
      if (left > 0) return connections.set(userId, left);
      connections.delete(userId);
      broadcastPresence(userId);
    });

    socket.on('typing', ({ channelId } = {}) => {
      if (!channelId) return;
      const user = db.findUserById(userId);
      const payload = { channelId, user: { id: user.id, displayName: user.displayName } };

      const channel = db.findChannelById(channelId);
      if (channel) {
        const server = db.findServerById(channel.serverId);
        if (!perms.hasIn(server, userId, channel, 'SEND_MESSAGES')) return;
        perms.viewersOf(server, channel)
          .filter((id) => id !== userId)
          .forEach((id) => io.to(`user:${id}`).emit('typing', payload));
        return;
      }
      const dm = db.findDmById(channelId);
      if (dm && dm.userIds.includes(userId)) {
        dm.userIds.filter((id) => id !== userId).forEach((id) => io.to(`user:${id}`).emit('typing', payload));
      }
    });
  });
}

const voice = new Map();
const socketVoice = new Map();

function voiceParticipants(channelId) {
  return [...(voice.get(channelId) || new Map())].map(([socketId, s]) => ({ socketId, ...s }));
}

function voiceStatesForServer(serverId) {
  const out = {};
  db.channelsOfServer(serverId).forEach((c) => { if (voice.has(c.id)) out[c.id] = voiceParticipants(c.id); });
  return out;
}

function broadcastVoice(channelId) {
  const channel = db.findChannelById(channelId);
  if (!channel || !io) return;
  io.to(`server:${channel.serverId}`).emit('voice:state', {
    serverId: channel.serverId,
    channelId,
    participants: voiceParticipants(channelId),
  });
}

function leaveVoice(socket) {
  const channelId = socketVoice.get(socket.id);
  if (!channelId) return;
  socketVoice.delete(socket.id);
  const room = voice.get(channelId);
  room?.delete(socket.id);
  if (room && !room.size) voice.delete(channelId);
  socket.leave(`voice:${channelId}`);
  socket.to(`voice:${channelId}`).emit('voice:peer-left', { socketId: socket.id });
  broadcastVoice(channelId);
}

function endVoice({ channelId, userId, serverId, reason }) {
  for (const [sid, cid] of [...socketVoice]) {
    if (channelId && cid !== channelId) continue;
    if (serverId && db.findChannelById(cid)?.serverId !== serverId) continue;
    if (userId && voice.get(cid)?.get(sid)?.userId !== userId) continue;
    const socket = io?.sockets.sockets.get(sid);
    if (!socket) continue;
    socket.emit('voice:kicked', { reason });
    leaveVoice(socket);
  }
}

function enforceVoiceAccess(serverId) {
  const server = db.findServerById(serverId);
  if (!server) return;
  for (const [sid, cid] of [...socketVoice]) {
    const channel = db.findChannelById(cid);
    if (channel?.serverId !== serverId) continue;
    const entry = voice.get(cid)?.get(sid);
    if (!entry || perms.hasIn(server, entry.userId, channel, 'CONNECT')) continue;
    const socket = io?.sockets.sockets.get(sid);
    if (!socket) continue;
    socket.emit('voice:kicked', { reason: 'Bu ses kanalına bağlanma iznin kaldırıldı.' });
    leaveVoice(socket);
  }
}

function toChannel(channel, event, payload) {
  if (!io) return;
  const server = db.findServerById(channel.serverId);
  if (!server) return;
  perms.viewersOf(server, channel).forEach((id) => io.to(`user:${id}`).emit(event, payload));
}

function toServer(serverId, event, payload) {
  io?.to(`server:${serverId}`).emit(event, payload);
}

function toUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

function joinServerRoom(userId, serverId) {
  io?.in(`user:${userId}`).socketsJoin(`server:${serverId}`);
}

function leaveServerRoom(userId, serverId) {
  io?.in(`user:${userId}`).socketsLeave(`server:${serverId}`);
}

function closeServerRoom(serverId) {
  io?.in(`server:${serverId}`).socketsLeave(`server:${serverId}`);
}

module.exports = {
  init,
  toServer,
  toChannel,
  toUser,
  joinServerRoom,
  leaveServerRoom,
  closeServerRoom,
  presenceOf,
  withPresence,
  setActivity,
  broadcastPresence,
  broadcastUserUpdate,
  disconnectUser,
  voiceStatesForServer,
  endVoice,
  enforceVoiceAccess,
};
