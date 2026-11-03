(async () => {
  const card = document.getElementById('card');
  const params = new URLSearchParams(location.search);
  const clientId = params.get('client_id') || '';
  const permissions = params.get('permissions') || '';

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    children.flat(Infinity).forEach((c) => c != null && c !== false && node.append(c));
    return node;
  }

  async function api(method, url, body) {
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Bir şeyler ters gitti.');
    return data;
  }

  const avatar = (user) => el('div', { class: 'az-avatar', style: `background:${user.avatarColor || '#8b5cf6'}` },
    user.avatarUrl ? el('img', { src: user.avatarUrl, alt: '' }) : (user.displayName || '?')[0].toUpperCase());

  const show = (...nodes) => card.replaceChildren(...nodes.flat(Infinity).filter(Boolean));

  let info;
  try {
    info = await api('GET', `/api/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${encodeURIComponent(permissions)}`);
  } catch (err) {
    return show(el('p', { class: 'az-err' }, err.message), el('div', { class: 'az-actions' }, el('a', { class: 'az-cancel', href: '/channels/@me' }, 'Cydlone\'a dön')));
  }
  const { application: app, servers } = info;
  const bot = app.bot;
  document.title = `${app.name} sunucuna eklensin mi? | Cydlone`;

  const available = servers.filter((s) => !s.hasBot);
  const select = el('select', { class: 'az-select', id: 'az-server', 'aria-label': 'Sunucu seç' },
    el('option', { value: '' }, available.length ? 'Bir sunucu seç' : 'Ekleyebileceğin sunucu yok'),
    servers.map((s) => el('option', { value: s.id, disabled: s.hasBot }, s.hasBot ? `${s.name} (bot zaten ekli)` : s.name)));
  const ok = el('button', { class: 'az-ok', type: 'button', disabled: true }, 'Yetkilendir');
  const err = el('p', { class: 'az-err', hidden: true });
  select.addEventListener('change', () => { ok.disabled = !select.value; });

  ok.addEventListener('click', async () => {
    ok.disabled = true;
    err.hidden = true;
    try {
      const { server } = await api('POST', '/api/oauth2/authorize', { client_id: clientId, serverId: select.value, permissions: info.permissions.map((p) => p.id) });
      show(
        el('div', { class: 'az-done' }, '🎉'),
        el('div', { class: 'az-head' },
          el('div', { class: 'az-name' }, app.name, el('span', { class: 'az-bot' }, 'BOT')),
          el('p', { class: 'az-sub' }, `${server.name} sunucusuna eklendi.`)),
        el('div', { class: 'az-actions' }, el('a', { class: 'az-ok', href: `/channels/${server.id}` }, 'Sunucuya git')),
      );
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      ok.disabled = false;
    }
  });

  show(
    el('div', { class: 'az-head' },
      avatar(bot),
      el('div', { class: 'az-name' }, app.name, el('span', { class: 'az-bot' }, 'BOT')),
      el('p', { class: 'az-sub' }, 'sunucuna eklenmek istiyor'),
      app.description ? el('p', { class: 'az-desc' }, app.description) : null),
    el('label', { class: 'az-label', for: 'az-server' }, 'Sunucuya ekle'),
    select,
    info.permissions.length ? [
      el('span', { class: 'az-label' }, 'Bu bota verilecek izinler'),
      el('ul', { class: 'az-perms' }, info.permissions.map((p) => el('li', {}, p.name))),
    ] : null,
    el('p', { class: 'az-note' }, 'Sadece "Sunucuyu Yönet" izni olduğun sunucular listelenir. İzinler botun adını taşıyan bir role verilir; sende olmayan bir izin bota verilemez.'),
    err,
    el('div', { class: 'az-actions' },
      el('a', { class: 'az-cancel', href: '/channels/@me' }, 'İptal'),
      ok),
  );
})();
