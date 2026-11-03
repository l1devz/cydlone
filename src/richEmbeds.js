const MAX_EMBEDS = 10;
const MAX_TOTAL = 6000;
const LIMITS = { title: 256, description: 4096, authorName: 256, fieldName: 256, fieldValue: 1024, footer: 2048, fields: 25 };

const httpUrl = (v) => {
  if (!v) return null;
  try {
    const u = new URL(String(v));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
};

const text = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

function color(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v >= 0 && v <= 0xffffff) return `#${Math.floor(v).toString(16).padStart(6, '0')}`;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(v).trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

function one(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const e = {};
  const title = text(raw.title, LIMITS.title);
  const description = text(raw.description, LIMITS.description);
  if (title) e.title = title;
  if (description) e.description = description;
  const url = httpUrl(raw.url);
  if (url) e.url = url;
  const c = color(raw.color);
  if (c) e.color = c;
  if (raw.author?.name) {
    e.author = { name: text(raw.author.name, LIMITS.authorName) };
    const au = httpUrl(raw.author.url), ai = httpUrl(raw.author.icon_url ?? raw.author.iconUrl);
    if (au) e.author.url = au;
    if (ai) e.author.iconUrl = ai;
  }
  if (Array.isArray(raw.fields)) {
    const fields = raw.fields.slice(0, LIMITS.fields)
      .map((f) => ({ name: text(f?.name, LIMITS.fieldName), value: text(f?.value, LIMITS.fieldValue), inline: !!f?.inline }))
      .filter((f) => f.name && f.value);
    if (fields.length) e.fields = fields;
  }
  if (raw.footer?.text) {
    e.footer = { text: text(raw.footer.text, LIMITS.footer) };
    const fi = httpUrl(raw.footer.icon_url ?? raw.footer.iconUrl);
    if (fi) e.footer.iconUrl = fi;
  }
  const image = httpUrl(raw.image?.url ?? raw.image);
  const thumbnail = httpUrl(raw.thumbnail?.url ?? raw.thumbnail);
  if (image) e.image = image;
  if (thumbnail) e.thumbnail = thumbnail;
  if (raw.timestamp) {
    const t = new Date(raw.timestamp);
    if (!Number.isNaN(t.getTime())) e.timestamp = t.toISOString();
  }
  return e.title || e.description || e.fields || e.image || e.thumbnail || e.author ? e : null;
}

function sanitizeEmbeds(raw) {
  if (raw == null) return { embeds: [] };
  if (!Array.isArray(raw)) return { error: 'embeds bir liste olmalı.' };
  if (raw.length > MAX_EMBEDS) return { error: `Bir mesajda en fazla ${MAX_EMBEDS} embed olabilir.` };
  const embeds = raw.map(one).filter(Boolean);
  const total = embeds.reduce((n, e) => n + (e.title?.length || 0) + (e.description?.length || 0)
    + (e.author?.name.length || 0) + (e.footer?.text.length || 0)
    + (e.fields || []).reduce((m, f) => m + f.name.length + f.value.length, 0), 0);
  if (total > MAX_TOTAL) return { error: `Embed'lerin toplam yazısı en fazla ${MAX_TOTAL} karakter olabilir.` };
  return { embeds };
}

module.exports = { sanitizeEmbeds };
