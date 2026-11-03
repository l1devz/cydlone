const db = require('../src/db');

const [command, ...rest] = process.argv.slice(2);
const query = rest.join(' ').trim();

function fail(msg) {
  console.error(`Hata: ${msg}`);
  process.exit(1);
}

function loadServer() {
  if (!query) fail('Sunucu adı ya da id gerekli.');
  const servers = db.read('servers');
  const byId = servers.find((s) => s.id === query);
  if (byId) return byId;
  const matches = servers.filter((s) => s.name.toLowerCase() === query.toLowerCase());
  if (matches.length > 1) fail(`"${query}" adında birden fazla sunucu var; id ile belirt (npm run server -- list).`);
  if (!matches.length) fail(`"${query}" adında bir sunucu yok.`);
  return matches[0];
}

function describe(s) {
  const owner = db.findUserById(s.ownerId);
  const tag = owner ? `${owner.username}#${owner.discriminator}` : '?';
  const vanity = s.vanityCode ? `, özel bağlantı: /davet/${s.vanityCode}` : '';
  return `${s.verified ? '✔ ' : '  '}${s.name}  (sahip: ${tag}, id: ${s.id}${vanity})`;
}

switch (command) {
  case 'list':
    db.read('servers').forEach((s) => console.log(describe(s)));
    break;

  case 'verify': {
    const s = loadServer();
    db.updateServer(s.id, { verified: true, verifiedAt: new Date().toISOString() });
    console.log(`"${s.name}" artık doğrulanmış bir sunucu.`);
    console.log(describe(db.findServerById(s.id)));
    break;
  }

  case 'unverify': {
    const s = loadServer();
    db.updateServer(s.id, { verified: false, verifiedAt: null, vanityCode: null });
    console.log(`"${s.name}" sunucusunun doğrulama tiki ve özel davet bağlantısı kaldırıldı.`);
    console.log(describe(db.findServerById(s.id)));
    break;
  }

  default:
    console.log('Kullanım: npm run server -- <list | verify | unverify> [sunucu]');
    process.exit(command ? 1 : 0);
}
