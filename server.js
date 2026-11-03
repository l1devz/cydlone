const path = require('path');
const config = require('./src/config');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const auth = require('./src/auth');
const servers = require('./src/servers');
const social = require('./src/social');
const users = require('./src/users');
const messages = require('./src/messages');
const invites = require('./src/invites');
const embeds = require('./src/embeds');
const attachments = require('./src/attachments');
const emojis = require('./src/emojis');
const spotify = require('./src/spotify');
const applications = require('./src/applications');
const interactions = require('./src/interactions');
const realtime = require('./src/realtime');
const { migrate } = require('./src/migrate');

migrate();

const app = express();
const PORT = config.port;
const PUBLIC = path.join(__dirname, 'public');

app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());
app.use(auth.loadUser);

const BOT_BLOCKED = [/^\/api\/auth\//, /^\/api\/users\/me(\/|$)/, /^\/api\/friends/, /^\/api\/blocks/, /^\/api\/connections/, /^\/api\/servers\/join$/];
app.use((req, res, next) => {
  if (req.user?.bot && (BOT_BLOCKED.some((re) => re.test(req.path)) || (req.method === 'POST' && req.path === '/api/servers'))) {
    return res.status(403).json({ error: 'Botlar bu işlemi yapamaz.' });
  }
  next();
});

app.use('/api/auth', auth.router);
app.use(applications.router);
app.use(interactions.router);
app.use('/api', servers.router);
app.use('/api', users);
app.use('/api', messages);
app.use('/api', social);
app.use('/api', invites.router);
app.use('/api', embeds.router);
app.use('/api', attachments.router);
app.use('/api', emojis.router);
app.use(spotify.router);

const page = (name) => (_req, res) => res.sendFile(path.join(PUBLIC, `${name}.html`));
const guestOnly = (req, res, next) => (req.user ? res.redirect('/channels/@me') : next());
const userOnly = (req, res, next) => (req.user ? next() : res.redirect('/login'));

app.get('/', (req, res) => res.redirect(req.user ? '/channels/@me' : '/login'));
app.get('/login', guestOnly, page('login'));
app.get('/register', guestOnly, page('register'));
app.get('/app', (_req, res) => res.redirect('/channels/@me'));
app.get(['/channels/@me', '/channels/:serverId', '/channels/:serverId/:channelId'], userOnly, page('app'));
app.get('/oauth2/authorize', userOnly, page('authorize'));
app.get('/gelistirici', page('gelistirici'));

app.get('/davet/:code', (req, res) => {
  if (req.user) return res.redirect(`/channels/@me?davet=${encodeURIComponent(req.params.code)}`);
  res.type('html').send(invites.invitePage(req, req.params.code));
});

app.get('/ekler/:id/:name', attachments.serveAttachment);
app.get('/emojiler/:id', emojis.serveEmoji);

app.use(express.static(PUBLIC, { index: false }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d', immutable: true }));

attachments.cleanupAttachments();
setInterval(attachments.cleanupAttachments, 6 * 60 * 60 * 1000).unref();

spotify.startPolling();

const httpServer = http.createServer(app);
realtime.init(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Cydlone çalışıyor: http://localhost:${PORT}`);
});
