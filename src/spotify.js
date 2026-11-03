const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const config = require('./config');
const { requireAuth } = require('./auth');
const realtime = require('./realtime');

const router = express.Router();

const CLIENT_ID = config.spotify.clientId;
const CLIENT_SECRET = config.spotify.clientSecret;
const SCOPES = 'user-read-currently-playing user-read-playback-state';
const ACCOUNTS_URL = 'https://accounts.spotify.com';
const API_URL = 'https://api.spotify.com/v1';
const POLL_MS = 10 * 1000;
const STATE_TTL = 10 * 60 * 1000;

const configured = () => !!(CLIENT_ID && CLIENT_SECRET);

const pending = new Map();

const connectionOf = (userId) => db.read('connections').find((c) => c.userId === userId && c.provider === 'spotify') || null;

function saveConnection(conn) {
  const list = db.read('connections').filter((c) => !(c.userId === conn.userId && c.provider === 'spotify'));
  list.push(conn);
  db.write('connections', list);
}

function updateConnection(userId, changes) {
  const list = db.read('connections');
  const conn = list.find((c) => c.userId === userId && c.provider === 'spotify');
  if (!conn) return null;
  Object.assign(conn, changes);
  db.write('connections', list);
  return conn;
}

function removeConnection(userId) {
  db.write('connections', db.read('connections').filter((c) => !(c.userId === userId && c.provider === 'spotify')));
  realtime.setActivity(userId, null);
}

const publicConnection = (c) => (c ? {
  connected: true,
  displayName: c.displayName,
  profileUrl: c.profileUrl,
  showActivity: c.showActivity !== false,
} : { connected: false });

const basicAuth = () => `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;

async function tokenRequest(params) {
  const res = await fetch(`${ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error_description || data.error || `Spotify ${res.status}`), { code: data.error });
  return data;
}

async function accessTokenFor(conn) {
  if (Date.now() < conn.expiresAt - 60 * 1000) return conn.accessToken;
  const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: conn.refreshToken });
  const changes = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
  };
  Object.assign(conn, changes);
  updateConnection(conn.userId, changes);
  return conn.accessToken;
}

async function spotifyGet(conn, path) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${await accessTokenFor(conn)}` },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 204) return null;
  if (res.status === 429) {
    throw Object.assign(new Error('Spotify hız sınırı'), { retryAfter: Number(res.headers.get('retry-after')) || 30 });
  }
  if (!res.ok) throw Object.assign(new Error(`Spotify ${res.status}`), { status: res.status });
  return res.json();
}

function activityFrom(data) {
  const item = data?.item;
  if (!item || !data.is_playing) return null;
  const isEpisode = data.currently_playing_type === 'episode';
  const images = isEpisode ? item.images || item.show?.images : item.album?.images;
  const start = Date.now() - (data.progress_ms || 0);
  return {
    type: 'spotify',
    id: item.id,
    title: item.name,
    artists: isEpisode ? item.show?.name || '' : (item.artists || []).map((a) => a.name).join(', '),
    album: isEpisode ? '' : item.album?.name || '',
    image: (images?.[1] || images?.[0])?.url || null,
    url: item.external_urls?.spotify || null,
    start,
    end: start + (item.duration_ms || 0),
  };
}

const backoff = new Map();

async function pollUser(conn) {
  if ((backoff.get(conn.userId) || 0) > Date.now()) return;
  try {
    const data = await spotifyGet(conn, '/me/player/currently-playing?additional_types=episode');
    realtime.setActivity(conn.userId, activityFrom(data));
  } catch (err) {
    if (err.code === 'invalid_grant') {
      removeConnection(conn.userId);
      realtime.toUser(conn.userId, 'connections:changed', {});
      return;
    }
    backoff.set(conn.userId, Date.now() + (err.retryAfter ? err.retryAfter * 1000 : 60 * 1000));
  }
}

let polling = false;
async function pollAll() {
  if (polling || !configured()) return;
  polling = true;
  try {
    const conns = db.read('connections').filter((c) => c.provider === 'spotify');
    for (const conn of conns) {
      const user = db.findUserById(conn.userId);
      if (!user || conn.showActivity === false || realtime.presenceOf(user) === 'offline') {
        realtime.setActivity(conn.userId, null);
        continue;
      }
      await pollUser(conn);
    }
  } finally {
    polling = false;
  }
}

function startPolling() {
  if (!configured()) return;
  setInterval(pollAll, POLL_MS).unref();
  pollAll();
}

router.get('/api/connections', requireAuth, (req, res) => {
  res.json({ spotify: { available: configured(), ...publicConnection(connectionOf(req.user.id)) } });
});

router.patch('/api/connections/spotify', requireAuth, (req, res) => {
  const conn = updateConnection(req.user.id, { showActivity: req.body?.showActivity !== false });
  if (!conn) return res.status(404).json({ error: 'Spotify hesabı bağlı değil.' });
  if (conn.showActivity === false) realtime.setActivity(req.user.id, null);
  else pollUser(conn);
  res.json({ spotify: { available: true, ...publicConnection(conn) } });
});

router.delete('/api/connections/spotify', requireAuth, (req, res) => {
  removeConnection(req.user.id);
  res.json({ ok: true });
});

const redirectUri = (req) => config.spotify.redirectUri || `${req.protocol}://${req.get('host')}/baglantilar/spotify/geri`;

router.get('/baglantilar/spotify', (req, res) => {
  if (!req.user) return res.redirect('/login');
  const origin = `${req.protocol}://${req.get('host')}`;
  if (!configured()) return res.redirect(`${origin}/channels/@me?baglanti=spotify-yok`);
  const now = Date.now();
  pending.forEach((v, k) => { if (now - v.at > STATE_TTL) pending.delete(k); });
  const state = crypto.randomBytes(16).toString('hex');
  pending.set(state, { userId: req.user.id, origin, at: now });
  const url = new URL(`${ACCOUNTS_URL}/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri(req),
    state,
    show_dialog: 'true',
  });
  res.redirect(url.href);
});

router.get('/baglantilar/spotify/geri', async (req, res) => {
  const entry = pending.get(String(req.query.state || ''));
  if (!entry || Date.now() - entry.at > STATE_TTL) return res.status(400).type('text').send('Bağlantı isteği geçersiz ya da süresi dolmuş. Tekrar dene.');
  pending.delete(String(req.query.state));
  const back = (result) => res.redirect(`${entry.origin}/channels/@me?baglanti=${result}`);
  if (req.query.error || !req.query.code) return back('spotify-iptal');
  try {
    const tokens = await tokenRequest({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: redirectUri(req) });
    const meRes = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!meRes.ok) throw new Error(`Spotify ${meRes.status}`);
    const profile = await meRes.json();
    const conn = {
      userId: entry.userId,
      provider: 'spotify',
      accountId: profile.id,
      displayName: profile.display_name || profile.id,
      profileUrl: profile.external_urls?.spotify || null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      showActivity: true,
      createdAt: new Date().toISOString(),
    };
    saveConnection(conn);
    backoff.delete(conn.userId);
    pollUser(conn);
    back('spotify');
  } catch (err) {
    console.error('Spotify bağlantısı kurulamadı:', err.message);
    back('spotify-hata');
  }
});

module.exports = { router, startPolling, removeConnection };
