const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const realtime = require('./realtime');
const perms = require('./permissions');
const { parseMentions } = require('./mentions');
const { withAuthors, MAX_MESSAGE } = require('./servers');
const { sanitizeEmbeds } = require('./richEmbeds');

const router = express.Router();

const RESPONSE_MS = 3000;
const LIFETIME_MS = 15 * 60 * 1000;
const MAX_COMMANDS = 100;
const NAME_RE = /^[\p{Ll}\p{N}_-]{1,32}$/u;
const OPTION_TYPES = ['string', 'integer', 'number', 'boolean', 'user', 'channel', 'role'];

const appOfBot = (botId) => db.read('applications').find((a) => a.botId === botId) || null;
const commandsOfApp = (appId) => db.read('commands').filter((c) => c.applicationId === appId);

function cleanCommand(raw, i) {
  const where = `${i + 1}. komut`;
  const name = String(raw?.name || '').trim();
  if (!NAME_RE.test(name)) return { error: `${where}: ad 1-32 karakter; küçük harf, rakam, - ve _ olmalı.` };
  const description = String(raw?.description || '').trim();
  if (!description || description.length > 100) return { error: `/${name}: açıklama 1-100 karakter olmalı.` };
  const options = [];
  let optionalSeen = false;
  for (const [j, o] of (Array.isArray(raw.options) ? raw.options : []).slice(0, 25).entries()) {
    const oname = String(o?.name || '').trim();
    if (!NAME_RE.test(oname)) return { error: `/${name}: ${j + 1}. seçeneğin adı geçersiz.` };
    if (!OPTION_TYPES.includes(o?.type)) return { error: `/${name} ${oname}: tür ${OPTION_TYPES.join(', ')} olmalı.` };
    const odesc = String(o?.description || '').trim();
    if (!odesc || odesc.length > 100) return { error: `/${name} ${oname}: açıklama 1-100 karakter olmalı.` };
    const required = !!o.required;
    if (required && optionalSeen) return { error: `/${name}: zorunlu seçenekler isteğe bağlı olanlardan önce gelmeli.` };
    if (!required) optionalSeen = true;
    if (options.some((x) => x.name === oname)) return { error: `/${name}: "${oname}" seçeneği iki kez tanımlanmış.` };
    options.push({ name: oname, description: odesc, type: o.type, required });
  }
  const validPerms = new Set(perms.PERMISSIONS.map((p) => p.id));
  const defaultMemberPermissions = (Array.isArray(raw.default_member_permissions) ? raw.default_member_permissions : [])
    .map(String).filter((p) => validPerms.has(p));
  return { command: { name, description, options, defaultMemberPermissions } };
}

const publicCommand = ({ id, applicationId, name, description, options, defaultMemberPermissions }) =>
  ({ id, applicationId, name, description, options, default_member_permissions: defaultMemberPermissions });

const botOnly = (req, res, next) => {
  if (!req.user?.bot) return res.status(403).json({ error: 'Bu uç noktayı sadece botlar kullanabilir.' });
  req.application = appOfBot(req.user.id);
  if (!req.application) return res.status(404).json({ error: 'Bu botun uygulaması bulunamadı.' });
  next();
};

router.get('/api/applications/@me/commands', requireAuth, botOnly, (req, res) => {
  res.json({ commands: commandsOfApp(req.application.id).map(publicCommand) });
});

router.put('/api/applications/@me/commands', requireAuth, botOnly, (req, res) => {
  const list = Array.isArray(req.body) ? req.body : req.body?.commands;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'Gövde bir komut listesi olmalı.' });
  if (list.length > MAX_COMMANDS) return res.status(400).json({ error: `En fazla ${MAX_COMMANDS} komut kaydedilebilir.` });
  const cleaned = [];
  for (const [i, raw] of list.entries()) {
    const { command, error } = cleanCommand(raw, i);
    if (error) return res.status(400).json({ error });
    if (cleaned.some((c) => c.name === command.name)) return res.status(400).json({ error: `/${command.name} iki kez tanımlanmış.` });
    cleaned.push(command);
  }
  const appId = req.application.id;
  const old = Object.fromEntries(commandsOfApp(appId).map((c) => [c.name, c]));
  const commands = cleaned.map((c) => ({ id: old[c.name]?.id || crypto.randomUUID(), applicationId: appId, ...c }));
  db.write('commands', [...db.read('commands').filter((c) => c.applicationId !== appId), ...commands]);
  db.serversForUser(req.user.id).forEach((s) => realtime.toServer(s.id, 'commands:updated', { serverId: s.id }));
  res.json({ commands: commands.map(publicCommand) });
});

router.get('/api/servers/:serverId/commands', requireAuth, (req, res) => {
  const server = db.findServerById(req.params.serverId);
  if (!server || !db.isMember(server.id, req.user.id)) return res.status(404).json({ error: 'Sunucu bulunamadı.' });
  const botIds = new Set(db.membersOfServer(server.id).filter((u) => u.bot).map((u) => u.id));
  const apps = db.read('applications').filter((a) => botIds.has(a.botId));
  const commands = apps.flatMap((app) => {
    const bot = db.publicUser(db.findUserById(app.botId));
    return commandsOfApp(app.id)
      .filter((c) => c.defaultMemberPermissions.every((p) => perms.has(server, req.user.id, p)))
      .map((c) => ({ ...publicCommand(c), application: { id: app.id, name: app.name }, bot }));
  });
  res.json({ commands });
});

const interactions = new Map();

function sweep() {
  const now = Date.now();
  interactions.forEach((it, id) => {
    if (now - it.createdAt < LIFETIME_MS) return;
    if (it.messageId && it.thinking && !it.ephemeral) {
      const msg = db.patchMessage(it.messageId, { thinking: undefined, failed: true });
      if (msg) realtime.toChannel(it.channel, 'message:updated', { message: withAuthors([msg])[0] });
    }
    interactions.delete(id);
  });
}
setInterval(sweep, 60 * 1000).unref();

function resolveOptions(command, raw, server) {
  const given = raw && typeof raw === 'object' ? raw : {};
  const options = [];
  const resolved = { users: {}, roles: {}, channels: {} };
  for (const o of command.options) {
    const v = given[o.name];
    if (v === undefined || v === null || v === '') {
      if (o.required) return { error: `"${o.name}" seçeneği zorunlu.` };
      continue;
    }
    let value = v;
    if (o.type === 'string') {
      value = String(v).slice(0, 6000);
    } else if (o.type === 'integer' || o.type === 'number') {
      value = Number(v);
      if (!Number.isFinite(value) || (o.type === 'integer' && !Number.isInteger(value))) return { error: `"${o.name}" bir sayı olmalı.` };
    } else if (o.type === 'boolean') {
      value = v === true || v === 'true';
    } else if (o.type === 'user') {
      const user = db.isMember(server.id, String(v)) ? db.findUserById(String(v)) : null;
      if (!user) return { error: `"${o.name}" için sunucudan bir üye seç.` };
      resolved.users[user.id] = { ...db.publicUser(user), roles: db.getMember(server.id, user.id).roles || [] };
      value = user.id;
    } else if (o.type === 'role') {
      const role = db.rolesOfServer(server.id).find((r) => r.id === String(v));
      if (!role) return { error: `"${o.name}" için sunucudan bir rol seç.` };
      resolved.roles[role.id] = role;
      value = role.id;
    } else if (o.type === 'channel') {
      const channel = db.channelsOfServer(server.id).find((c) => c.id === String(v));
      if (!channel) return { error: `"${o.name}" için sunucudan bir kanal seç.` };
      resolved.channels[channel.id] = channel;
      value = channel.id;
    }
    options.push({ name: o.name, type: o.type, value });
  }
  return { options, resolved };
}

router.post('/api/interactions', requireAuth, (req, res) => {
  if (req.user.bot) return res.status(403).json({ error: 'Botlar komut kullanamaz.' });
  const command = db.read('commands').find((c) => c.id === String(req.body?.commandId || ''));
  if (!command) return res.status(404).json({ error: 'Bu komut artık yok.' });
  const app = db.read('applications').find((a) => a.id === command.applicationId);
  const channel = db.findChannelById(String(req.body?.channelId || ''));
  const server = channel && db.findServerById(channel.serverId);
  if (!app || !server || channel.type !== 'text' || !db.isMember(server.id, req.user.id)) {
    return res.status(404).json({ error: 'Kanal bulunamadı.' });
  }
  if (!db.isMember(server.id, app.botId)) return res.status(400).json({ error: 'Bu komutun botu bu sunucuda değil.' });
  if (!perms.hasIn(server, req.user.id, channel, 'SEND_MESSAGES')) return res.status(403).json({ error: 'Bu kanalda komut kullanma iznin yok.' });
  if (!command.defaultMemberPermissions.every((p) => perms.has(server, req.user.id, p))) {
    return res.status(403).json({ error: 'Bu komutu kullanma iznin yok.' });
  }
  const { options, resolved, error } = resolveOptions(command, req.body?.options, server);
  if (error) return res.status(400).json({ error });

  const bot = db.findUserById(app.botId);
  const it = {
    id: crypto.randomUUID(),
    applicationId: app.id,
    botId: app.botId,
    command,
    channel,
    serverId: server.id,
    user: db.publicUser(req.user),
    createdAt: Date.now(),
    responded: false,
    messageId: null,
    ephemeral: false,
    thinking: false,
  };
  interactions.set(it.id, it);

  realtime.toUser(app.botId, 'interaction:create', {
    id: it.id,
    type: 'command',
    command: { id: command.id, name: command.name },
    options,
    resolved,
    user: { ...it.user, roles: db.getMember(server.id, req.user.id).roles || [] },
    serverId: server.id,
    channelId: channel.id,
  });

  setTimeout(() => {
    if (it.responded) return;
    it.failed = true;
    realtime.toUser(req.user.id, 'interaction:failed', {
      interactionId: it.id, channelId: channel.id, command: command.name, bot: db.publicUser(bot),
    });
  }, RESPONSE_MS);

  res.status(202).json({ interaction: { id: it.id } });
});

function loadInteraction(req, res, next) {
  const it = interactions.get(req.params.interactionId);
  if (!it || it.botId !== req.user.id) return res.status(404).json({ error: 'Etkileşim bulunamadı ya da süresi doldu.' });
  req.it = it;
  next();
}

function responseData(body) {
  const content = String(body?.content ?? '').trim();
  if (content.length > MAX_MESSAGE) return { error: `Mesaj en fazla ${MAX_MESSAGE} karakter olabilir.` };
  const { embeds, error } = sanitizeEmbeds(body?.embeds);
  if (error) return { error };
  return { content, embeds };
}

function sendResponse(it, { content, embeds, ephemeral, thinking }) {
  const server = db.findServerById(it.serverId);
  const interaction = { id: it.id, name: it.command.name, user: it.user };
  if (ephemeral) {
    const message = {
      id: crypto.randomUUID(),
      channelId: it.channel.id,
      authorId: it.botId,
      content,
      ...(embeds.length ? { embeds } : {}),
      interaction,
      ephemeral: true,
      ...(thinking ? { thinking: true } : {}),
      createdAt: new Date().toISOString(),
      author: db.publicUser(db.findUserById(it.botId)),
    };
    realtime.toUser(it.user.id, 'message:new', { serverId: it.serverId, message });
    return message;
  }
  const mentions = parseMentions(content, server, it.botId, it.channel);
  const created = db.createMessage({ channelId: it.channel.id, authorId: it.botId, content, mentions, embeds, interaction, thinking });
  const [message] = withAuthors([created]);
  realtime.toChannel(it.channel, 'message:new', { serverId: it.serverId, message });
  return message;
}

router.post('/api/interactions/:interactionId/callback', requireAuth, botOnly, loadInteraction, (req, res) => {
  const { it } = req;
  if (it.responded) return res.status(400).json({ error: 'Bu etkileşime zaten yanıt verildi.' });
  if (it.failed || Date.now() - it.createdAt > RESPONSE_MS + 1000) {
    return res.status(400).json({ error: `Yanıt süresi (${RESPONSE_MS / 1000} sn) doldu. Uzun işler için önce "defer" gönder.` });
  }
  const type = req.body?.type;
  if (type !== 'reply' && type !== 'defer') return res.status(400).json({ error: 'type "reply" ya da "defer" olmalı.' });
  const ephemeral = !!req.body?.data?.ephemeral;
  let payload = { content: '', embeds: [] };
  if (type === 'reply') {
    payload = responseData(req.body?.data);
    if (payload.error) return res.status(400).json({ error: payload.error });
    if (!payload.content && !payload.embeds.length) return res.status(400).json({ error: 'Yanıt boş olamaz.' });
  }
  it.responded = true;
  it.ephemeral = ephemeral;
  it.thinking = type === 'defer';
  const message = sendResponse(it, { ...payload, ephemeral, thinking: it.thinking });
  it.messageId = message.id;
  it.message = ephemeral ? message : null;
  res.json({ message });
});

router.patch('/api/interactions/:interactionId/original', requireAuth, botOnly, loadInteraction, (req, res) => {
  const { it } = req;
  if (!it.messageId) return res.status(400).json({ error: 'Önce callback ile yanıt ver.' });
  const data = responseData(req.body);
  if (data.error) return res.status(400).json({ error: data.error });
  if (!data.content && !data.embeds.length) return res.status(400).json({ error: 'Yanıt boş olamaz.' });
  it.thinking = false;
  if (it.ephemeral) {
    const message = { ...it.message, content: data.content, embeds: data.embeds.length ? data.embeds : undefined, thinking: undefined };
    it.message = message;
    realtime.toUser(it.user.id, 'message:updated', { message });
    return res.json({ message });
  }
  const server = db.findServerById(it.serverId);
  const mentions = parseMentions(data.content, server, it.botId, it.channel);
  const msg = db.patchMessage(it.messageId, {
    content: data.content, mentions, embeds: data.embeds.length ? data.embeds : undefined, thinking: undefined,
  });
  if (!msg) return res.status(404).json({ error: 'Yanıt mesajı silinmiş.' });
  const [message] = withAuthors([msg]);
  realtime.toChannel(it.channel, 'message:updated', { message });
  res.json({ message });
});

router.post('/api/interactions/:interactionId/followup', requireAuth, botOnly, loadInteraction, (req, res) => {
  const { it } = req;
  if (!it.responded) return res.status(400).json({ error: 'Önce callback ile yanıt ver.' });
  const data = responseData(req.body);
  if (data.error) return res.status(400).json({ error: data.error });
  if (!data.content && !data.embeds.length) return res.status(400).json({ error: 'Mesaj boş olamaz.' });
  res.json({ message: sendResponse(it, { ...data, ephemeral: !!req.body?.ephemeral, thinking: false }) });
});

module.exports = { router };
