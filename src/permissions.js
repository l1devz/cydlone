const db = require('./db');

const PERMISSIONS = [
  { id: 'ADMINISTRATOR', name: 'Yönetici', description: 'Tüm izinlere sahiptir. Bu izni dikkatli ver.' },
  { id: 'MANAGE_SERVER', name: 'Sunucuyu Yönet', description: 'Sunucunun adını ve özel davet bağlantısını değiştirebilir.' },
  { id: 'MANAGE_ROLES', name: 'Rolleri Yönet', description: 'Kendi en yüksek rolünün altındaki rolleri oluşturabilir, düzenleyebilir, üyelere verebilir ve kanal izinlerini ayarlayabilir.' },
  { id: 'MANAGE_CHANNELS', name: 'Kanalları Yönet', description: 'Kanal ve kategori oluşturabilir, düzenleyebilir ve silebilir.' },
  { id: 'MANAGE_EMOJIS', name: 'İfadeleri Yönet', description: 'Sunucuya özel emoji ekleyebilir, yeniden adlandırabilir ve silebilir.' },
  { id: 'MANAGE_MESSAGES', name: 'Mesajları Yönet', description: 'Başkalarının mesajlarını silebilir.', channelTypes: ['text'] },
  { id: 'KICK_MEMBERS', name: 'Üyeleri At', description: 'Kendi rolünden düşük üyeleri sunucudan atabilir.' },
  { id: 'BAN_MEMBERS', name: 'Üyeleri Yasakla', description: 'Kendi rolünden düşük üyeleri sunucudan yasaklayabilir ve yasakları kaldırabilir.' },
  { id: 'CREATE_INVITE', name: 'Davet Oluştur', description: 'Sunucuya davet bağlantısı paylaşabilir.' },
  { id: 'VIEW_CHANNEL', name: 'Kanalları Görüntüle', description: 'Kanalları görebilir ve yazı kanallarındaki mesajları okuyabilir.', channelTypes: ['text', 'voice'] },
  { id: 'SEND_MESSAGES', name: 'Mesaj Gönder', description: 'Yazı kanallarına mesaj gönderebilir.', channelTypes: ['text'] },
  { id: 'ATTACH_FILES', name: 'Dosya Ekle', description: 'Mesajlarına dosya, resim ve video ekleyebilir.', channelTypes: ['text'] },
  { id: 'MENTION_EVERYONE', name: '@everyone, @here ve Tüm Rollerden Bahset', description: '@everyone ve @here ile herkese, bahsedilemez rollere de bildirim gönderebilir.', channelTypes: ['text'] },
  { id: 'CONNECT', name: 'Bağlan', description: 'Ses kanallarına katılabilir.', channelTypes: ['voice'] },
];
const PERMISSION_IDS = new Set(PERMISSIONS.map((p) => p.id));

function channelPermissionIds(type) {
  return new Set(PERMISSIONS.filter((p) => p.channelTypes?.includes(type)).map((p) => p.id));
}

function everyoneRole(serverId) {
  return db.rolesOfServer(serverId).find((r) => r.isEveryone) || null;
}

function memberRoles(serverId, userId) {
  const ids = new Set(db.getMember(serverId, userId)?.roles || []);
  return db.rolesOfServer(serverId).filter((r) => r.isEveryone || ids.has(r.id));
}

function permissionsFromRoles(server, userId, roles) {
  if (server.ownerId === userId) return new Set(PERMISSION_IDS);
  const set = new Set(roles.flatMap((r) => r.permissions || []));
  return set.has('ADMINISTRATOR') ? new Set(PERMISSION_IDS) : set;
}

function permissionsOf(server, userId) {
  if (!server) return new Set();
  if (server.ownerId === userId) return new Set(PERMISSION_IDS);
  if (!db.isMember(server.id, userId)) return new Set();
  return permissionsFromRoles(server, userId, memberRoles(server.id, userId));
}

function channelPermissionsFromRoles(server, userId, roles, channel) {
  const set = permissionsFromRoles(server, userId, roles);
  if (server.ownerId === userId || set.has('ADMINISTRATOR')) return set;
  const byRole = new Map((channel.overwrites || []).map((o) => [o.roleId, o]));
  const apply = (deny, allow) => {
    deny.forEach((p) => set.delete(p));
    allow.forEach((p) => set.add(p));
  };
  const everyone = byRole.get(roles.find((r) => r.isEveryone)?.id);
  if (everyone) apply(everyone.deny, everyone.allow);
  const others = roles.filter((r) => !r.isEveryone).map((r) => byRole.get(r.id)).filter(Boolean);
  apply(others.flatMap((o) => o.deny), others.flatMap((o) => o.allow));
  return set.has('VIEW_CHANNEL') ? set : new Set();
}

function channelPermissionsOf(server, userId, channel) {
  if (!server || !db.isMember(server.id, userId)) return new Set();
  return channelPermissionsFromRoles(server, userId, memberRoles(server.id, userId), channel);
}

function has(server, userId, perm) {
  return permissionsOf(server, userId).has(perm);
}

function hasIn(server, userId, channel, perm) {
  return channelPermissionsOf(server, userId, channel).has(perm);
}

function viewersOf(server, channel) {
  const roles = db.rolesOfServer(server.id);
  return db.memberEntries(server.id)
    .filter((m) => {
      const ids = new Set(m.roles || []);
      const mine = roles.filter((r) => r.isEveryone || ids.has(r.id));
      return channelPermissionsFromRoles(server, m.userId, mine, channel).has('VIEW_CHANNEL');
    })
    .map((m) => m.userId);
}

function highestPosition(server, userId) {
  if (server.ownerId === userId) return Infinity;
  return Math.max(0, ...memberRoles(server.id, userId).map((r) => r.position));
}

function canManageMember(server, actorId, targetId) {
  if (targetId === server.ownerId) return false;
  return highestPosition(server, actorId) > highestPosition(server, targetId);
}

function canManageRole(server, actorId, role) {
  return !role.isEveryone && highestPosition(server, actorId) > role.position;
}

module.exports = {
  PERMISSIONS,
  PERMISSION_IDS,
  channelPermissionIds,
  everyoneRole,
  memberRoles,
  permissionsOf,
  channelPermissionsOf,
  has,
  hasIn,
  viewersOf,
  highestPosition,
  canManageMember,
  canManageRole,
};
