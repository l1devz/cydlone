const db = require('../src/db');
const { BADGES, findBadge, normalizeBadges } = require('../src/badges');

const [command, username, badgeArg] = process.argv.slice(2);

function fail(msg) {
  console.error(`Hata: ${msg}`);
  process.exit(1);
}

function loadUser() {
  if (!username) fail('Kullanıcı adı gerekli.');
  const { user, ambiguous } = db.findUserByHandle(username);
  if (ambiguous) fail(`"${username}" adını birden fazla kişi kullanıyor; etiketiyle yaz, ör. ${username}#1234.`);
  if (!user) fail(`"${username}" adında bir kullanıcı yok.`);
  return user;
}

function loadBadge() {
  const badge = findBadge(badgeArg);
  if (!badge) fail(`"${badgeArg || ''}" adında bir rozet yok. Rozetleri görmek için: npm run badge -- list`);
  return badge;
}

function printBadges(user) {
  const names = (user.badges || []).map((id) => findBadge(id)?.name || id);
  console.log(`${user.username}#${user.discriminator}: ${names.length ? names.join(', ') : 'rozet yok'}`);
}

switch (command) {
  case 'list':
    BADGES.forEach((b) => console.log(`${b.id.padEnd(16)} ${b.name} — ${b.description}`));
    break;

  case 'show':
    printBadges(loadUser());
    break;

  case 'give': {
    const user = loadUser();
    const badge = loadBadge();
    if ((user.badges || []).includes(badge.id)) {
      console.log(`${user.username} zaten "${badge.name}" rozetine sahip.`);
    } else {
      db.updateUser(user.id, { badges: normalizeBadges([...(user.badges || []), badge.id]) });
      console.log(`"${badge.name}" rozeti ${user.username} kullanıcısına verildi.`);
    }
    printBadges(db.findUserById(user.id));
    break;
  }

  case 'take': {
    const user = loadUser();
    const badge = loadBadge();
    db.updateUser(user.id, { badges: (user.badges || []).filter((id) => id !== badge.id) });
    console.log(`"${badge.name}" rozeti ${user.username} kullanıcısından alındı.`);
    printBadges(db.findUserById(user.id));
    break;
  }

  default:
    console.log('Kullanım: npm run badge -- <list | show | give | take> [kullanıcı] [rozet]');
    process.exit(command ? 1 : 0);
}
