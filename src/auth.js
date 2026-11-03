const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const config = require('./config');
const { AUTO_BADGES } = require('./badges');

const router = express.Router();
const JWT_SECRET = db.getJwtSecret();
const COOKIE_NAME = 'cydlone_token';
const TOKEN_TTL_DAYS = 7;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9_.]{2,32}$/;

function setAuthCookie(res, user) {
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: `${TOKEN_TTL_DAYS}d` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function userFromToken(token) {
  if (!token) return null;
  try {
    const id = jwt.verify(token, JWT_SECRET).sub;
    return db.findUserById(id) || db.read('users').find((u) => u.legacyId === id) || null;
  } catch {
    return null;
  }
}

const hashBotToken = (token) => require('crypto').createHash('sha256').update(String(token)).digest('hex');

function botFromToken(raw) {
  const token = String(raw || '').replace(/^Bot\s+/i, '').trim();
  if (!token) return null;
  const hash = hashBotToken(token);
  const app = db.read('applications').find((a) => a.tokenHash === hash);
  return app ? db.findUserById(app.botId) : null;
}

function loadUser(req, _res, next) {
  const header = req.get('authorization') || '';
  req.user = /^Bot\s/i.test(header) ? botFromToken(header) : userFromToken(req.cookies[COOKIE_NAME]);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
  next();
}

function isAdult13(birthDate) {
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return false;
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 13);
  return d <= limit;
}

router.post('/register', async (req, res) => {
  const { email = '', displayName = '', username = '', password = '', birthDate = '' } = req.body || {};
  const errors = {};

  const cleanEmail = String(email).trim();
  const cleanUsername = String(username).trim();
  const cleanDisplay = String(displayName).trim();
  let discriminator = null;

  if (!EMAIL_RE.test(cleanEmail)) errors.email = 'Geçerli bir e-posta adresi girin.';
  else if (db.findUserByEmail(cleanEmail)) errors.email = 'Bu e-posta zaten kayıtlı.';

  if (!USERNAME_RE.test(cleanUsername)) {
    errors.username = '2-32 karakter; sadece harf, rakam, _ ve . kullanılabilir.';
  } else {
    discriminator = db.freeDiscriminator(cleanUsername);
    if (!discriminator) errors.username = 'Bu kullanıcı adını çok fazla kişi kullanıyor. Başka bir ad dene.';
  }

  if (cleanDisplay.length > 32) errors.displayName = 'Görünen ad en fazla 32 karakter olabilir.';

  if (String(password).length < 8) errors.password = 'Şifre en az 8 karakter olmalı.';

  if (!birthDate) errors.birthDate = 'Doğum tarihi gerekli.';
  else if (!isAdult13(birthDate)) errors.birthDate = "Cydlone'u kullanmak için en az 13 yaşında olmalısın.";

  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = db.createUser({
    email: cleanEmail,
    username: cleanUsername,
    discriminator,
    displayName: cleanDisplay || cleanUsername,
    passwordHash,
    birthDate,
    badges: [...AUTO_BADGES],
  });

  setAuthCookie(res, user);
  res.status(201).json({ user: db.selfUser(user) });
});

router.post('/login', async (req, res) => {
  const { login = '', password = '' } = req.body || {};
  const id = String(login).trim();
  const found = id.includes('@') && !id.includes('#') ? { user: db.findUserByEmail(id) } : db.findUserByHandle(id);
  if (found.ambiguous) {
    return res.status(400).json({
      errors: { login: 'Bu kullanıcı adını birden fazla kişi kullanıyor. Etiketinle gir, ör. ad#1234.' },
    });
  }
  const { user } = found;

  const ok = user && !user.bot && user.passwordHash && (await bcrypt.compare(String(password), user.passwordHash));
  if (!ok) {
    return res.status(401).json({
      errors: { login: 'Giriş bilgileri veya şifre geçersiz.', password: 'Giriş bilgileri veya şifre geçersiz.' },
    });
  }

  setAuthCookie(res, user);
  res.json({ user: db.selfUser(user) });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: db.selfUser(req.user) });
});

module.exports = { router, loadUser, requireAuth, userFromToken, botFromToken, hashBotToken, COOKIE_NAME, EMAIL_RE, USERNAME_RE };
