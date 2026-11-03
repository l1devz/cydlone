const fs = require('fs');
const path = require('path');
const db = require('./db');
const { normalizeBadges } = require('./badges');
const { snowflakeAt, isSnowflake } = require('./snowflake');

const DB_DIR = path.join(__dirname, '..', 'database');

function migrateUserIds(log) {
  const users = db.read('users');
  const old = users.filter((u) => !isSnowflake(u.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  if (!old.length) return;

  const files = fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.json'));
  const backup = path.join(DB_DIR, `yedek-kimlik-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(backup, { recursive: true });
  files.forEach((f) => fs.copyFileSync(path.join(DB_DIR, f), path.join(backup, f)));

  const map = new Map();
  const perMs = new Map();
  old.forEach((u) => {
    const ms = Date.parse(u.createdAt) || Date.now();
    const seq = perMs.get(ms) || 0;
    perMs.set(ms, seq + 1);
    map.set(u.id, snowflakeAt(ms, seq));
  });

  const swapTokens = (s) => (s.includes('<@')
    ? s.replace(/<@([0-9a-f-]{36})>/g, (tok, id) => (map.has(id) ? `<@${map.get(id)}>` : tok))
    : s);
  const walk = (v) => {
    if (typeof v === 'string') return map.get(v) ?? swapTokens(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, val]) => [map.get(k) ?? k, walk(val)]));
    }
    return v;
  };

  files.forEach((f) => {
    const name = f.slice(0, -5);
    const data = walk(db.read(name));
    if (name === 'users') {
      const back = new Map([...map].map(([o, n]) => [n, o]));
      data.forEach((u) => { if (back.has(u.id)) u.legacyId = back.get(u.id); });
    }
    db.write(name, data);
  });
  log.push(`${old.length} kullanıcı kimliği sayısala çevrildi (yedek: ${path.basename(backup)})`);
}

function migrate() {
  const log = [];

  migrateUserIds(log);

  const users = db.read('users');
  let usersChanged = false;
  users.forEach((u) => {
    if (!u.discriminator) {
      const used = new Set(users.filter((x) => x.discriminator && x.username.toLowerCase() === u.username.toLowerCase()).map((x) => x.discriminator));
      let d;
      do d = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0'); while (used.has(d));
      u.discriminator = d;
      usersChanged = true;
      log.push(`${u.username} -> #${d}`);
    }
    const badges = normalizeBadges(u.badges);
    if (JSON.stringify(badges) !== JSON.stringify(u.badges)) {
      u.badges = badges;
      usersChanged = true;
    }
  });
  if (usersChanged) db.write('users', users);

  db.read('servers').forEach((server) => {
    if (db.categoriesOfServer(server.id).length) return;
    const channels = db.channelsOfServer(server.id);
    if (channels.some((c) => c.categoryId)) return;
    const text = db.createCategory({ serverId: server.id, name: 'Yazı Kanalları' });
    const voice = db.createCategory({ serverId: server.id, name: 'Ses Kanalları' });
    channels.forEach((c) => db.updateChannel(c.id, { categoryId: c.type === 'voice' ? voice.id : text.id }));
    log.push(`${server.name}: kategoriler oluşturuldu`);
  });

  db.read('servers').forEach((server) => {
    if (db.rolesOfServer(server.id).some((r) => r.isEveryone)) return;
    db.createEveryoneRole(server.id);
    log.push(`${server.name}: @everyone rolü oluşturuldu`);
  });
  const roles = db.read('roles');
  const oldEveryone = roles.filter((r) => r.isEveryone && !r.hasViewChannel);
  if (oldEveryone.length) {
    oldEveryone.forEach((r) => {
      r.permissions = [...new Set([...(r.permissions || []), 'VIEW_CHANNEL'])];
      r.hasViewChannel = true;
    });
    db.write('roles', roles);
    log.push(`${oldEveryone.length} sunucuya "Kanalları Görüntüle" izni eklendi`);
  }

  const roles2 = db.read('roles');
  const noAttach = roles2.filter((r) => r.isEveryone && !r.hasAttachFiles);
  if (noAttach.length) {
    noAttach.forEach((r) => {
      r.permissions = [...new Set([...(r.permissions || []), 'ATTACH_FILES'])];
      r.hasAttachFiles = true;
    });
    db.write('roles', roles2);
    log.push(`${noAttach.length} sunucuya "Dosya Ekle" izni eklendi`);
  }

  const members = db.read('members');
  if (members.some((m) => !Array.isArray(m.roles))) {
    db.write('members', members.map((m) => (Array.isArray(m.roles) ? m : { ...m, roles: [] })));
  }

  if (log.length) console.log(`Veri güncellemesi: ${log.join(', ')}`);
}

module.exports = { migrate };
