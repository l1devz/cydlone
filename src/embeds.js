const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const zlib = require('zlib');
const express = require('express');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

const TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 768 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const USER_AGENT = 'Mozilla/5.0 (compatible; CydloneBot/1.0; link preview)';

const blocked = new net.BlockList();
[
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
  '203.0.113.0/24', '224.0.0.0/3',
].forEach((c) => { const [a, p] = c.split('/'); blocked.addSubnet(a, Number(p), 'ipv4'); });
['::/127', '64:ff9b::/96', '100::/64', '2001:db8::/32', 'fc00::/7', 'fe80::/10', 'ff00::/8']
  .forEach((c) => { const [a, p] = c.split('/'); blocked.addSubnet(a, Number(p), 'ipv6'); });

function isBlockedIp(ip) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1];
  const type = net.isIP(ip);
  if (!type) return true;
  return blocked.check(ip, type === 4 ? 'ipv4' : 'ipv6');
}

function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true, family: options.family || 0 }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isBlockedIp(a.address))) {
      return cb(Object.assign(new Error('Bu adrese erişilemez.'), { code: 'EBLOCKED' }));
    }
    if (options.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

function checkUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && !['80', '443'].includes(url.port)) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isBlockedIp(host)) return null;
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) return null;
  return url;
}

function safeGet(raw, { accept, compressed = true }, hops = 0) {
  return new Promise((resolve, reject) => {
    const url = checkUrl(raw);
    if (!url) return reject(new Error('Geçersiz ya da izin verilmeyen adres.'));
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(url, {
      lookup: safeLookup,
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: accept,
        'Accept-Language': 'tr,en;q=0.8',
        'Accept-Encoding': compressed ? 'gzip, deflate, br' : 'identity',
      },
    }, (res) => {
      const { statusCode: code, headers } = res;
      if (code >= 300 && code < 400 && headers.location) {
        res.resume();
        if (hops >= MAX_REDIRECTS) return reject(new Error('Çok fazla yönlendirme.'));
        let next;
        try { next = new URL(headers.location, url).href; } catch { return reject(new Error('Geçersiz yönlendirme.')); }
        return resolve(safeGet(next, { accept, compressed }, hops + 1));
      }
      if (code !== 200) { res.resume(); return reject(new Error(`HTTP ${code}`)); }
      resolve({ url: url.href, res });
    });
    req.on('timeout', () => req.destroy(new Error('Zaman aşımı.')));
    req.on('error', reject);
  });
}

function decoded(res) {
  const enc = String(res.headers['content-encoding'] || '').toLowerCase();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (enc === 'deflate') return res.pipe(zlib.createInflate());
  if (enc === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function readLimited(res, max) {
  return new Promise((resolve, reject) => {
    const stream = decoded(res);
    const chunks = [];
    let size = 0;
    const done = () => { clearTimeout(timer); res.destroy(); resolve(Buffer.concat(chunks)); };
    const timer = setTimeout(done, TIMEOUT_MS);
    stream.on('data', (c) => {
      chunks.push(c);
      size += c.length;
      if (size >= max) { stream.removeAllListeners('data'); done(); }
    });
    stream.on('end', done);
    stream.on('error', (err) => { clearTimeout(timer); res.destroy(); size ? resolve(Buffer.concat(chunks)) : reject(err); });
  });
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function attrsOf(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

function charsetOf(contentType, buffer) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType || '');
  if (fromHeader) return fromHeader[1];
  const head = buffer.subarray(0, 4096).toString('latin1');
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] || 'utf-8';
}

function textOf(buffer, charset) {
  try { return new TextDecoder(charset).decode(buffer); } catch { return new TextDecoder('utf-8').decode(buffer); }
}

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

function absolute(raw, base) {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

function parsePage(html, pageUrl) {
  const head = html.slice(0, Math.max(html.search(/<\/head>/i), 0) || html.length);
  const meta = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    const key = (a.property || a.name || '').toLowerCase();
    if (key && a.content != null && !(key in meta)) meta[key] = a.content;
  }
  const title = meta['og:title'] || meta['twitter:title']
    || decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] || '');
  const description = meta['og:description'] || meta['twitter:description'] || meta.description || '';
  const imageUrl = absolute(meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url']
    || meta['twitter:image'] || meta['twitter:image:src'], pageUrl);
  const color = /^#[0-9a-f]{6}$/i.test(meta['theme-color'] || '') ? meta['theme-color'] : null;
  const width = Number(meta['og:image:width']) || null;
  const height = Number(meta['og:image:height']) || null;
  const large = meta['twitter:card'] === 'summary_large_image' || (width && height ? width / height > 1.3 && width >= 400 : false);
  if (!clip(title, 1) && !clip(description, 1) && !imageUrl) return null;
  return {
    type: 'link',
    siteName: clip(meta['og:site_name'] || new URL(pageUrl).hostname.replace(/^www\./, ''), 80),
    title: clip(title, 256),
    description: clip(description, 350),
    color,
    image: imageUrl ? { url: imageUrl, width, height, large } : null,
  };
}

const CACHE_TTL = 30 * 60 * 1000;
const FAIL_TTL = 5 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map();

async function unfurl(raw) {
  const { url, res } = await safeGet(raw, { accept: 'text/html,application/xhtml+xml;q=0.9,image/*;q=0.8,*/*;q=0.5' });
  const type = String(res.headers['content-type'] || '').toLowerCase();
  if (/^image\/(png|jpe?g|gif|webp|avif)/.test(type)) {
    res.destroy();
    return { type: 'image', image: { url, width: null, height: null, large: true } };
  }
  if (!type.includes('html')) { res.destroy(); return null; }
  const buffer = await readLimited(res, MAX_HTML_BYTES);
  return parsePage(textOf(buffer, charsetOf(type, buffer)), url);
}

function embedFor(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.promise;
  const entry = { at: Date.now(), ttl: CACHE_TTL };
  entry.promise = unfurl(url).catch(() => { entry.ttl = FAIL_TTL; return null; });
  cache.delete(url);
  cache.set(url, entry);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return entry.promise;
}

router.get('/embeds', async (req, res) => {
  const url = String(req.query.url || '');
  if (url.length > 2048 || !checkUrl(url)) return res.json({ embed: null });
  const embed = await embedFor(url);
  res.set('Cache-Control', embed ? 'private, max-age=600' : 'no-store');
  res.json({ embed: embed && { url, ...embed } });
});

router.get('/embeds/image', async (req, res) => {
  const url = String(req.query.url || '');
  try {
    if (url.length > 2048) throw new Error();
    const { res: upstream } = await safeGet(url, { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9', compressed: false });
    const type = String(upstream.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const length = Number(upstream.headers['content-length']) || 0;
    if (!/^image\/(png|jpeg|jpg|gif|webp|avif|x-icon|vnd\.microsoft\.icon)$/.test(type) || length > MAX_IMAGE_BYTES) {
      upstream.destroy();
      return res.sendStatus(415);
    }
    res.set({
      'Content-Type': type,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    if (length) res.set('Content-Length', String(length));
    let size = 0;
    upstream.on('data', (c) => { size += c.length; if (size > MAX_IMAGE_BYTES) { upstream.destroy(); res.destroy(); } });
    upstream.on('error', () => res.destroy());
    req.on('close', () => upstream.destroy());
    upstream.pipe(res);
  } catch {
    if (!res.headersSent) res.sendStatus(502);
  }
});

module.exports = { router, checkUrl };
