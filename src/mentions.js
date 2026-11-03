const db = require('./db');
const perms = require('./permissions');

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const USER_RE = /<@(\d{17,20})>/g;
const ROLE_RE = new RegExp(`<@&(${UUID})>`, 'g');

const CODE_RE = /```(?:[\w#+.-]{1,20}\n)?[\s\S]*?```|`[^`\n]+`/g;

function parseMentions(content, server, authorId, channel) {
  content = content.replace(CODE_RE, ' ');
  const users = new Set();
  const roles = new Set();
  const canEveryone = perms.hasIn(server, authorId, channel, 'MENTION_EVERYONE');

  for (const [, id] of content.matchAll(USER_RE)) {
    if (db.isMember(server.id, id)) users.add(id);
  }
  for (const [, id] of content.matchAll(ROLE_RE)) {
    const role = db.findRoleById(id);
    if (role && role.serverId === server.id && !role.isEveryone && (role.mentionable || canEveryone)) roles.add(id);
  }
  return {
    users: [...users],
    roles: [...roles],
    everyone: canEveryone && /(^|\s)@everyone(?![\w])/.test(content),
    here: canEveryone && /(^|\s)@here(?![\w])/.test(content),
  };
}

module.exports = { parseMentions };
