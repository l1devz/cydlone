(async () => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const STATUS_LABELS = {
    online: 'Çevrimiçi',
    idle: 'Boşta',
    dnd: 'Rahatsız Etmeyin',
    invisible: 'Görünmez',
    offline: 'Çevrimdışı',
  };
  const GROUP_WINDOW_MS = 7 * 60 * 1000;

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || Object.values(data.errors || {})[0] || 'Bir şeyler ters gitti.');
      err.errors = data.errors;
      throw err;
    }
    return data;
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    children.flat(Infinity).forEach((c) => c != null && c !== false && node.append(c));
    return node;
  }

  function icon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  function initials(name) {
    return [...(name || '').trim()][0]?.toUpperCase() || '?';
  }

  function serverIconFill(node, s) {
    node.classList.toggle('has-img', !!s.iconUrl);
    node.style.setProperty('--srv-color', s.iconColor);
    node.replaceChildren(s.iconUrl ? el('img', { src: s.iconUrl, alt: '', draggable: 'false' }) : acronym(s.name));
    return node;
  }

  function acronym(name) {
    return name.trim().split(/\s+/).slice(0, 3).map((w) => [...w][0]).join('').toUpperCase();
  }

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch {  } },
  };

  const LOCALE = window.I18N?.locale || 'tr-TR';
  const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = (iso) => new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
  const sameDay = (a, b) => a.toDateString() === b.toDateString();

  function stampText(iso) {
    const d = new Date(iso);
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return `Bugün ${timeFmt.format(d)}`;
    if (sameDay(d, yesterday)) return `Dün ${timeFmt.format(d)}`;
    return `${d.toLocaleDateString(LOCALE)} ${timeFmt.format(d)}`;
  }

  function richText(text) {
    const frag = document.createDocumentFragment();
    const re = /https?:\/\/[^\s<]+/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      frag.append(text.slice(last, m.index));
      frag.append(el('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer' }, m[0]));
      last = m.index + m[0].length;
    }
    frag.append(text.slice(last));
    return frag;
  }

  let me;
  let badgeDefs = {};
  let permDefs = [];
  try {
    const [meRes, badgeRes, permRes] = await Promise.all([
      api('GET', '/api/auth/me'), api('GET', '/api/badges'), api('GET', '/api/permissions'),
    ]);
    me = meRes.user;
    badgeDefs = Object.fromEntries(badgeRes.badges.map((b) => [b.id, b]));
    permDefs = permRes.permissions;
  } catch {
    return;
  }

  {
    const ns = 'http://www.w3.org/2000/svg';
    const holder = document.createElementNS(ns, 'svg');
    holder.setAttribute('width', '0');
    holder.setAttribute('height', '0');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.position = 'absolute';
    holder.innerHTML = `<defs>${Object.values(badgeDefs).map((b) => b.defs || '').join('')}</defs>`;
    document.body.prepend(holder);
  }

  function tagOf(u) {
    return u?.discriminator ? `${u.username}#${u.discriminator}` : u?.username || '';
  }

  const botTag = (user) => (user?.bot ? el('span', { class: 'bot-tag', dataset: { tip: 'Bu hesap bir bot' } }, 'BOT') : null);

  function copyTagButton(user) {
    const tag = tagOf(user);
    const btn = el('button', {
      class: 'copy-tag',
      type: 'button',
      'aria-label': `${tag} kullanıcı adını kopyala`,
      dataset: { tip: 'Kullanıcı adını kopyala' },
    }, icon('copy'));
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(tag);
      } catch {
        return toast('Kopyalanamadı.');
      }
      btn.classList.add('done');
      btn.replaceChildren(icon('check'));
      btn.dataset.tip = 'Kopyalandı!';
      setTimeout(() => { btn.classList.remove('done'); btn.replaceChildren(icon('copy')); btn.dataset.tip = 'Kullanıcı adını kopyala'; }, 1500);
    });
    return btn;
  }

  function nameTag(user, cls = '') {
    return el('span', { class: `name-tag ${cls}` },
      el('span', { class: 'nt-name' }, user.username),
      user.discriminator ? el('span', { class: 'nt-disc' }, `#${user.discriminator}`) : null);
  }

  function badgeIcon(badge) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.innerHTML = badge.svg;
    return svg;
  }

  function badgeRow(user, cls = '') {
    const badges = (user?.badges || []).map((id) => badgeDefs[id]).filter(Boolean);
    if (!badges.length) return null;
    return el('div', { class: `badge-row ${cls}` }, badges.map((b) => el('button', {
      class: `user-badge${b.rarity ? ' rare' : ''}`,
      type: 'button',
      'aria-label': b.name,
      dataset: { tip: b.name },
      style: `--bdg:${b.color}`,
      onclick: (e) => { e.stopPropagation(); showBadgeCard(b, e.currentTarget); },
    }, badgeIcon(b))));
  }

  let badgeCard = null;
  function showBadgeCard(b, anchor) {
    const same = badgeCard?.dataset.badge === b.id;
    badgeCard?.remove();
    badgeCard = null;
    if (same) return;
    badgeCard = el('div', {
      class: `badge-card${b.rarity ? ' rare' : ''}`,
      style: `--bdg:${b.color}`,
      dataset: { badge: b.id },
      role: 'dialog',
      'aria-label': b.name,
      onclick: (e) => e.stopPropagation(),
    },
    el('div', { class: 'bc-icon' }, badgeIcon(b)),
    b.rarity ? el('div', { class: 'bc-rarity' }, `✦ ${b.rarity} Rozet`) : null,
    el('div', { class: 'bc-name' }, b.name),
    el('p', { class: 'bc-desc' }, b.description),
    b.note ? el('p', { class: 'bc-note' }, b.note) : null);
    document.body.append(badgeCard);
    const r = anchor.getBoundingClientRect();
    const cr = badgeCard.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - cr.width - 8, r.left + r.width / 2 - cr.width / 2));
    const top = r.top - cr.height - 10 > 8 ? r.top - cr.height - 10 : r.bottom + 10;
    badgeCard.style.left = `${left}px`;
    badgeCard.style.top = `${top}px`;
  }

  const state = {
    servers: [],
    details: {},
    messages: {},
    dms: [],
    rel: { friends: [], incoming: [], outgoing: [], blocked: [] },
    presence: {},
    activity: {},
    unread: {},
    mentionCounts: {},
    mentionServer: {},
    view: 'friends',
    serverId: null,
    convId: null,
  };

  const current = () => state.details[state.serverId];
  const currentChannel = () => current()?.channels.find((c) => c.id === state.convId);
  const currentDm = () => state.dms.find((d) => d.id === state.convId);
  const isOwner = () => current()?.ownerId === me.id;

  function memberOf(server, userId) {
    return server?.members.find((m) => m.id === userId) || null;
  }

  function rolesOf(server, userId) {
    const ids = new Set(memberOf(server, userId)?.roles || []);
    return (server?.roles || []).filter((r) => r.isEveryone || ids.has(r.id));
  }

  function permsOf(server, userId = me.id) {
    const all = permDefs.map((p) => p.id);
    if (!server) return new Set();
    if (server.ownerId === userId) return new Set(all);
    const set = new Set(rolesOf(server, userId).flatMap((r) => r.permissions || []));
    return set.has('ADMINISTRATOR') ? new Set(all) : set;
  }

  function can(perm, server = current()) {
    return permsOf(server).has(perm);
  }

  function channelPermsOf(server, channel, userId = me.id) {
    const set = permsOf(server, userId);
    if (!channel || server.ownerId === userId || set.has('ADMINISTRATOR')) return set;
    const roles = rolesOf(server, userId);
    const byRole = new Map((channel.overwrites || []).map((o) => [o.roleId, o]));
    const apply = (deny, allow) => {
      deny.forEach((p) => set.delete(p));
      allow.forEach((p) => set.add(p));
    };
    const everyone = byRole.get(roles.find((r) => r.isEveryone)?.id);
    if (everyone) apply(everyone.deny, everyone.allow);
    const others = roles.filter((r) => !r.isEveryone).map((r) => byRole.get(r.id)).filter(Boolean);
    apply(others.flatMap((o) => o.deny), others.flatMap((o) => o.allow));
    return set.has('VIEW_CHANNEL') ? set : new Set();
  }

  function canIn(channel, perm, server = current()) {
    return channelPermsOf(server, channel).has(perm);
  }

  const visibleChannels = (server) => server.channels.filter((c) => canIn(c, 'VIEW_CHANNEL', server));

  function isPrivateChannel(server, channel) {
    const everyone = server.roles.find((r) => r.isEveryone);
    return !!channel.overwrites?.some((o) => o.roleId === everyone?.id && o.deny.includes('VIEW_CHANNEL'));
  }

  function highestPos(server, userId) {
    if (server.ownerId === userId) return Infinity;
    return Math.max(0, ...rolesOf(server, userId).map((r) => r.position));
  }

  function canManageMember(server, userId) {
    return userId !== server.ownerId && highestPos(server, me.id) > highestPos(server, userId);
  }

  function canManageRole(server, role) {
    return !role.isEveryone && highestPos(server, me.id) > role.position;
  }

  function roleColor(server, userId) {
    return rolesOf(server, userId).find((r) => !r.isEveryone && r.color)?.color || null;
  }

  function presenceOf(user) {
    if (!user) return 'offline';
    if (user.id === me.id) return me.status;
    return state.presence[user.id] || user.presence || 'offline';
  }

  function rememberPresence(users) {
    users.forEach((u) => {
      if (u?.presence) state.presence[u.id] = u.presence;
      if (u && 'activity' in u) state.activity[u.id] = u.activity;
    });
  }

  function activityOf(userId) {
    const a = state.activity[userId];
    if (!a) return null;
    const presence = userId === me.id ? me.status : state.presence[userId];
    if (!presence || presence === 'offline' || presence === 'invisible') return null;
    if (a.end && Date.now() > a.end + 5000) return null;
    return a;
  }

  const proxiedImage = (url) => `/api/embeds/image?url=${encodeURIComponent(url)}`;

  function activityLine(userId) {
    const a = activityOf(userId);
    if (!a) return null;
    return el('div', { class: 'member-activity', title: `${a.title} — ${a.artists}` },
      el('span', {}, el('b', {}, 'Spotify'), ' dinliyor'),
      icon('spotify'));
  }

  function activityCard(userId) {
    const a = activityOf(userId);
    if (!a) return null;
    const placeholder = () => el('span', { class: 'act-cover' }, icon('music'));
    let cover = placeholder();
    if (a.image) {
      cover = el('img', { class: 'act-cover', src: proxiedImage(a.image), alt: a.album || a.title, draggable: 'false' });
      cover.addEventListener('error', () => cover.replaceWith(placeholder()), { once: true });
    }
    return el('div', { class: 'activity-card', dataset: { start: a.start, end: a.end } },
      el('h4', { class: 'act-head' }, el('span', {}, 'Spotify dinliyor'), icon('spotify')),
      el('div', { class: 'act-body' },
        cover,
        el('div', { class: 'act-info' },
          a.url ? el('a', { class: 'act-title', href: a.url, target: '_blank', rel: 'noopener noreferrer', title: a.title }, a.title)
            : el('strong', { class: 'act-title' }, a.title),
          el('div', { class: 'act-sub', title: a.artists }, a.artists),
          a.album ? el('div', { class: 'act-sub', title: a.album }, a.album) : null)),
      a.end > a.start ? el('div', { class: 'act-progress' },
        el('span', { class: 'act-time' }),
        el('div', { class: 'act-bar' }, el('i')),
        el('span', { class: 'act-time' }, mediaTime((a.end - a.start) / 1000))) : null);
  }

  const activitySlot = (userId) => el('div', { class: 'activity-slot', dataset: { activityOf: userId } }, activityCard(userId));

  function paintActivity(userId) {
    document.querySelectorAll(`.activity-slot[data-activity-of="${userId}"]`).forEach((slot) => {
      slot.replaceChildren(activityCard(userId) || '');
    });
    tickActivities();
  }

  function tickActivities() {
    document.querySelectorAll('.activity-card').forEach((card) => {
      const start = Number(card.dataset.start), end = Number(card.dataset.end);
      if (!(end > start)) return;
      const now = Math.min(Date.now(), end);
      const bar = card.querySelector('.act-bar i');
      const time = card.querySelector('.act-time');
      if (bar) bar.style.width = `${((now - start) / (end - start)) * 100}%`;
      if (time) time.textContent = mediaTime((now - start) / 1000);
    });
  }
  setInterval(tickActivities, 1000);

  function fillAvatar(node, user) {
    [...node.childNodes].filter((n) => !n.classList?.contains('status')).forEach((n) => n.remove());
    node.style.background = user?.avatarColor || '#555';
    node.classList.toggle('has-img', !!user?.avatarUrl);
    node.prepend(user?.avatarUrl
      ? el('img', { src: user.avatarUrl, alt: '', draggable: 'false' })
      : document.createTextNode(initials(user?.displayName)));
  }

  function avatar(user, { status = true, cls = '' } = {}) {
    const a = el('span', { class: `avatar ${cls}` });
    if (status) a.append(el('span', { class: `status ${presenceOf(user)}`, dataset: { presence: user?.id } }));
    fillAvatar(a, user);
    return a;
  }

  function paintPresence(userId) {
    const p = userId === me.id ? me.status : state.presence[userId] || 'offline';
    $$(`[data-presence="${userId}"]`).forEach((s) => { s.className = `status ${p}`; });
  }

  function renderMe() {
    ['#me-avatar', '#um-avatar'].forEach((sel) => {
      const node = $(sel);
      fillAvatar(node, me);
      node.querySelector('.status').dataset.presence = me.id;
    });
    $('#me-name').textContent = me.displayName;
    $('#um-name').replaceChildren(nameTag(me));
    $('#um-username').textContent = [me.displayName !== me.username ? me.displayName : null, me.pronouns].filter(Boolean).join(' • ');
    $('#um-bio').textContent = me.bio || '';
    $('#um-badges').replaceChildren(badgeRow(me) || '');
    paintBanner($('.um-banner'), me, '--bc');
    $('#um-date').textContent = shortDate(me.createdAt);
    showMyStatus();
  }

  function showMyStatus() {
    paintPresence(me.id);
    $('#me-sub').textContent = STATUS_LABELS[me.status];
  }

  async function setStatus(status) {
    const prev = me.status;
    me.status = status;
    showMyStatus();
    try {
      await api('PATCH', '/api/users/me', { status });
    } catch (err) {
      me.status = prev;
      showMyStatus();
      toast(err.message);
    }
  }

  renderMe();

  $('#user-info').addEventListener('mouseenter', () => { $('#me-sub').textContent = tagOf(me); });
  $('#user-info').addEventListener('mouseleave', () => { $('#me-sub').textContent = STATUS_LABELS[me.status]; });

  const userMenu = $('#user-menu');
  const toggleUserMenu = (e) => {
    e.stopPropagation();
    const open = !userMenu.classList.contains('open');
    closeFloating();
    userMenu.classList.toggle('open', open);
  };
  $('#user-info').addEventListener('click', toggleUserMenu);
  $('#settings-btn').addEventListener('click', (e) => { e.stopPropagation(); openSettings('account'); });
  $('#edit-profile-btn').addEventListener('click', () => openSettings('profile'));
  userMenu.addEventListener('click', (e) => e.stopPropagation());

  $$('.um-item[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setStatus(btn.dataset.status);
      userMenu.classList.remove('open');
    });
  });

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  $('#logout-btn').addEventListener('click', logout);

  async function loadRelationships() {
    state.rel = await api('GET', '/api/friends');
    rememberPresence([...state.rel.friends, ...state.rel.incoming.map((r) => r.user), ...state.rel.outgoing.map((r) => r.user)]);
    renderFriends();
    renderBadges();
  }

  function relationshipWith(userId) {
    if (userId === me.id) return 'self';
    if (state.rel.blocked.some((u) => u.id === userId)) return 'blocked';
    if (state.rel.friends.some((u) => u.id === userId)) return 'friend';
    if (state.rel.incoming.some((r) => r.user.id === userId)) return 'incoming';
    if (state.rel.outgoing.some((r) => r.user.id === userId)) return 'outgoing';
    return 'none';
  }

  const actions = {
    async sendRequest(userId) {
      const { result } = await api('POST', '/api/friends/requests', { userId });
      toast(result === 'accepted' ? 'Artık arkadaşsınız!' : 'Arkadaşlık isteği gönderildi.');
    },
    accept: (userId) => {
      const r = state.rel.incoming.find((x) => x.user.id === userId);
      return api('POST', `/api/friends/requests/${r.requestId}/accept`);
    },
    decline: (userId) => {
      const r = state.rel.incoming.find((x) => x.user.id === userId) || state.rel.outgoing.find((x) => x.user.id === userId);
      return api('DELETE', `/api/friends/requests/${r.requestId}`);
    },
    remove: (userId) => api('DELETE', `/api/friends/${userId}`),
    block: (userId) => api('POST', `/api/blocks/${userId}`),
    unblock: (userId) => api('DELETE', `/api/blocks/${userId}`),
  };

  async function runAction(name, userId) {
    try {
      await actions[name](userId);
      await loadRelationships();
      refreshProfiles();
    } catch (err) {
      toast(err.message);
    }
  }

  function confirmRemoveFriend(user) {
    confirmModal({
      title: `'${user.displayName}' adlı kişiyi çıkar`,
      body: `${user.displayName} adlı kişiyi arkadaşlarından çıkarmak istediğine emin misin?`,
      confirmText: 'Arkadaşı Çıkar',
      onConfirm: () => runAction('remove', user.id),
    });
  }

  function confirmBlock(user) {
    confirmModal({
      title: `${user.displayName} engellensin mi?`,
      body: 'Engellediğin kişi sana direkt mesaj gönderemez ve arkadaşlıktan çıkarılır.',
      confirmText: 'Engelle',
      onConfirm: () => runAction('block', user.id),
    });
  }

  async function openDmWith(userId) {
    try {
      const { dm } = await api('POST', '/api/dms', { userId });
      upsertDm(dm);
      closeFloating();
      go(`/channels/@me/${dm.id}`);
    } catch (err) {
      toast(err.message);
    }
  }

  let friendsTab = 'online';
  const EMPTY_TEXT = {
    online: 'Kimse etrafta yok. Belki bir arkadaş eklemeye ne dersin?',
    all: 'Henüz hiç arkadaşın yok. Hadi birini ekle!',
    pending: 'Bekleyen arkadaşlık isteği yok. Al sana bir Cydlone maskotu.',
    blocked: 'Kimseyi engellemedin. Engellediğin kişiler burada görünür.',
  };

  function openTab(name) {
    friendsTab = name;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $('#pane-list').classList.toggle('hidden', name === 'add');
    $('#pane-add').classList.toggle('hidden', name !== 'add');
    if (name === 'add') $('#add-input').focus();
    else renderFriends();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => openTab(t.dataset.tab)));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.goto)));
  $('#friend-search').addEventListener('input', renderFriends);

  function roundBtn(ic, tip, onclick, cls = '') {
    return el('button', {
      class: `round-btn ${cls}`,
      'aria-label': tip,
      dataset: { tip },
      onclick: (e) => { e.stopPropagation(); onclick(e); },
    }, icon(ic));
  }

  function friendRow(user, sub, buttons, onclick) {
    return el('div', { class: 'friend-row', onclick, dataset: { userId: user.id } },
      avatar(user),
      el('div', { class: 'fr-text' },
        el('span', { class: 'fr-name' }, user.displayName, el('small', {}, tagOf(user))),
        el('span', { class: 'fr-sub' }, sub)),
      el('div', { class: 'fr-actions' }, buttons));
  }

  function friendMenu(e, user) {
    const anchor = e.currentTarget;
    openContextMenu(anchor, [
      { label: 'Profili Görüntüle', onclick: () => showProfilePopout(user.id, anchor) },
      { label: 'Arkadaşı Çıkar', danger: true, onclick: () => confirmRemoveFriend(user) },
      { label: 'Engelle', danger: true, onclick: () => confirmBlock(user) },
    ]);
  }

  function renderFriends() {
    if (friendsTab === 'add') return;
    const q = $('#friend-search').value.trim().toLocaleLowerCase('tr-TR');
    const match = (u) => !q || u.displayName.toLocaleLowerCase('tr-TR').includes(q) || tagOf(u).toLowerCase().includes(q);
    const byName = (a, b) => a.displayName.localeCompare(b.displayName, 'tr');
    let header, rows;

    if (friendsTab === 'online' || friendsTab === 'all') {
      const list = state.rel.friends
        .filter((u) => friendsTab === 'all' || presenceOf(u) !== 'offline')
        .filter(match).sort(byName);
      header = `${friendsTab === 'online' ? 'Çevrimiçi' : 'Tüm arkadaşlar'} — ${list.length}`;
      rows = list.map((u) => friendRow(u, STATUS_LABELS[presenceOf(u)], [
        roundBtn('chat', 'Mesaj', () => openDmWith(u.id)),
        roundBtn('dots', 'Diğer', (e) => friendMenu(e, u)),
      ], () => openDmWith(u.id)));
    } else if (friendsTab === 'pending') {
      const inc = state.rel.incoming.filter((r) => match(r.user));
      const out = state.rel.outgoing.filter((r) => match(r.user));
      header = `Bekleyen — ${inc.length + out.length}`;
      rows = [
        ...inc.map((r) => friendRow(r.user, 'Gelen Arkadaşlık İsteği', [
          roundBtn('check', 'Kabul Et', () => runAction('accept', r.user.id), 'ok'),
          roundBtn('x', 'Reddet', () => runAction('decline', r.user.id), 'no'),
        ], (e) => showProfilePopout(r.user.id, e.currentTarget))),
        ...out.map((r) => friendRow(r.user, 'Giden Arkadaşlık İsteği', [
          roundBtn('x', 'İptal Et', () => runAction('decline', r.user.id), 'no'),
        ], (e) => showProfilePopout(r.user.id, e.currentTarget))),
      ];
    } else {
      const list = state.rel.blocked.filter(match).sort(byName);
      header = `Engellenen — ${list.length}`;
      rows = list.map((u) => friendRow(u, 'Engellendi', [
        roundBtn('block', 'Engeli Kaldır', () => runAction('unblock', u.id), 'no'),
      ]));
    }

    const listEl = $('#friend-list');
    if (!rows.length) {
      listEl.replaceChildren();
      $('#empty-text').textContent = q ? 'Bu isimle kimseyi bulamadık.' : EMPTY_TEXT[friendsTab];
      return;
    }
    listEl.replaceChildren(el('div', { class: 'fl-header' }, header), ...rows);
  }

  const addInput = $('#add-input');
  const addBtn = $('#add-form button');
  const addMsg = $('#add-msg');
  addInput.addEventListener('input', () => {
    addBtn.disabled = !addInput.value.trim();
    addMsg.textContent = '';
  });
  $('#add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = addInput.value.trim();
    if (!username) return;
    addBtn.disabled = true;
    try {
      const { result, user } = await api('POST', '/api/friends/requests', { username });
      addMsg.className = 'add-msg ok';
      addMsg.textContent = result === 'accepted'
        ? `${user.displayName} ile artık arkadaşsınız!`
        : `Başarılı! ${tagOf(user)} kullanıcısına arkadaşlık isteğin gönderildi.`;
      addInput.value = '';
      await loadRelationships();
    } catch (err) {
      addMsg.className = 'add-msg err';
      addMsg.textContent = err.message;
      addBtn.disabled = false;
    }
  });

  function renderBadges() {
    const pending = state.rel.incoming.length;
    const unread = Object.values(state.unread).reduce((a, b) => a + b, 0);
    const setBadge = (sel, n) => {
      const b = $(sel);
      b.textContent = n > 99 ? '99+' : n;
      b.classList.toggle('hidden', !n);
    };
    setBadge('#pending-badge', pending);
    setBadge('#friends-badge', pending);
    setBadge('#home-badge', pending + unread);
    const total = pending + unread;
    document.title = document.title.replace(/^\(\d+\+?\) /, '');
    if (total) document.title = `(${total}) ${document.title}`;
  }

  function setTitle(text) {
    document.title = text;
    renderBadges();
  }

  function upsertDm(dm) {
    rememberPresence([dm.user]);
    const i = state.dms.findIndex((d) => d.id === dm.id);
    if (i >= 0) state.dms[i] = { ...state.dms[i], ...dm };
    else state.dms.push(dm);
    state.dms.sort((a, b) => (b.lastMessageAt || b.createdAt).localeCompare(a.lastMessageAt || a.createdAt));
    renderDmList();
  }

  function renderDmList() {
    $('#dm-list').replaceChildren(...state.dms.map((dm) => {
      const unread = state.unread[dm.id] || 0;
      return el('div', {
        class: `dm-item${dm.id === state.convId ? ' active' : ''}${unread ? ' unread' : ''}`,
        dataset: { userId: dm.user.id, dmId: dm.id },
        onclick: () => go(`/channels/@me/${dm.id}`),
      },
      avatar(dm.user),
      el('span', { class: 'dm-name' }, dm.user.displayName),
      unread ? el('span', { class: 'badge' }, unread) : null,
      el('button', {
        class: 'icon-btn dm-close',
        dataset: { tip: 'DM\'yi Kapat' },
        onclick: (e) => { e.stopPropagation(); closeDm(dm.id); },
      }, icon('x')));
    }));
    $('#friends-nav').classList.toggle('active', state.view === 'friends');
  }

  async function closeDm(dmId) {
    try {
      await api('DELETE', `/api/dms/${dmId}`);
    } catch (err) {
      return toast(err.message);
    }
    state.dms = state.dms.filter((d) => d.id !== dmId);
    delete state.unread[dmId];
    renderBadges();
    if (state.convId === dmId) go('/channels/@me', { replace: true });
    else renderDmList();
  }

  $('#friends-nav').addEventListener('click', () => go('/channels/@me'));

  $('#new-dm').addEventListener('click', () => {
    const search = el('input', { class: 'input-plain', placeholder: 'Arkadaşının kullanıcı adını yaz' });
    const list = el('div', { class: 'pick-list' });
    const draw = () => {
      const q = search.value.trim().toLocaleLowerCase('tr-TR');
      const friends = state.rel.friends.filter((u) => !q
        || u.displayName.toLocaleLowerCase('tr-TR').includes(q) || tagOf(u).toLowerCase().includes(q));
      list.replaceChildren(...(friends.length ? friends.map((u) => el('div', {
        class: 'dm-item', onclick: () => { closeModal(); openDmWith(u.id); },
      }, avatar(u), el('span', { class: 'dm-name' }, u.displayName), el('small', {}, tagOf(u))))
        : [el('p', { class: 'hint' }, state.rel.friends.length ? 'Eşleşen arkadaş yok.' : 'Henüz arkadaşın yok. Önce birini ekle!')]));
    };
    search.addEventListener('input', draw);
    draw();
    openModal(
      el('div', { class: 'modal-head left' },
        el('h2', {}, 'Arkadaş Seç'),
        el('p', {}, 'Bir arkadaşınla direkt mesajlaşmaya başla.')),
      el('div', { class: 'modal-body' }, search, el('div', { style: 'margin-top:12px;max-height:300px;overflow-y:auto' }, list)),
    );
  });

  function renderServerList() {
    const mentionsIn = (serverId) => Object.entries(state.mentionCounts)
      .filter(([cid]) => state.mentionServer[cid] === serverId)
      .reduce((sum, [, n]) => sum + n, 0);
    $('#server-list').replaceChildren(...state.servers.map((s) => {
      const n = mentionsIn(s.id);
      return el('div', { class: `server-item${s.id === state.serverId ? ' active' : ''}` },
        el('span', { class: 'pill' }),
        serverIconFill(el('button', {
          class: 'server-btn guild',
          'aria-label': s.name,
          dataset: { tip: s.name, serverId: s.id, ...(s.verified ? { tipVerified: '' } : {}) },
          onclick: () => go(`/channels/${s.id}`),
        }), s),
        s.verified ? el('span', { class: 'rail-verified', 'aria-hidden': 'true' }, icon('verified')) : null,
        n ? el('span', { class: 'badge rail-badge' }, n > 99 ? '99+' : n) : null);
    }));
    $('#home-item').classList.toggle('active', !state.serverId);
  }

  $('#home-btn').addEventListener('click', () => go('/channels/@me'));

  function go(path, { replace = false } = {}) {
    if (path !== location.pathname) history[replace ? 'replaceState' : 'pushState']({}, '', path);
    route();
  }

  window.addEventListener('popstate', route);

  async function route() {
    closeFloating();
    const [, , first, second] = location.pathname.split('/');

    if (!first || first === '@me') {
      if (!second) return showFriends();
      let dm = state.dms.find((d) => d.id === second);
      if (!dm) {
        try {
          dm = (await api('GET', `/api/dms/${second}`)).dm;
          upsertDm(dm);
        } catch {
          toast('Sohbet bulunamadı.');
          return go('/channels/@me', { replace: true });
        }
      }
      return showDm(dm.id);
    }

    const serverId = first;
    try {
      if (!state.details[serverId]) {
        state.details[serverId] = (await api('GET', `/api/servers/${serverId}`)).server;
        rememberPresence(state.details[serverId].members);
      }
    } catch {
      toast('Sunucu bulunamadı.');
      return go('/channels/@me', { replace: true });
    }
    const server = state.details[serverId];
    const remembered = store.get(`cydlone:last:${serverId}`);
    const visible = visibleChannels(server);
    const target = visible.find((c) => c.id === second)
      || visible.find((c) => c.id === remembered)
      || visible.find((c) => c.type === 'text');
    if (!target) return showServer(serverId, null);
    if (target.id !== second) return go(`/channels/${serverId}/${target.id}`, { replace: true });
    showServer(serverId, target.id);
  }

  function setLayout(view) {
    state.view = view;
    const inServer = view === 'server';
    $('#dm-sidebar').classList.toggle('hidden', inServer);
    $('#server-sidebar').classList.toggle('hidden', !inServer);
    $('#home-view').classList.toggle('hidden', view !== 'friends');
    $('#channel-view').classList.toggle('hidden', view === 'friends');
    $('#members').classList.toggle('hidden', view !== 'server');
    $('#dm-profile').classList.toggle('hidden', view !== 'dm');
    applySidePanel();
  }

  function showFriends() {
    state.serverId = null;
    state.convId = null;
    setLayout('friends');
    setTitle('Cydlone | Arkadaşlar');
    renderServerList();
    renderDmList();
    renderFriends();
  }

  function showDm(dmId) {
    const changed = dmId !== state.convId;
    state.serverId = null;
    state.convId = dmId;
    delete state.unread[dmId];
    setLayout('dm');
    renderServerList();
    renderDmList();
    renderBadges();
    if (changed) openConversation();
  }

  function showServer(serverId, channelId) {
    const changed = channelId !== state.convId;
    state.serverId = serverId;
    state.convId = channelId;
    if (channelId) {
      store.set(`cydlone:last:${serverId}`, channelId);
      delete state.mentionCounts[channelId];
    }
    setLayout('server');
    renderServerList();
    renderServerHeader();
    renderChannels();
    renderMembers();
    if (changed) openConversation();
  }

  const serverMenu = $('#server-menu');
  const serverHeader = $('#server-header');

  function verifiedMark() {
    const mark = icon('verified');
    mark.classList.add('verified-mark');
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', 'Doğrulanmış Sunucu');
    mark.dataset.tip = 'Doğrulanmış Sunucu';
    return mark;
  }

  function renderServerHeader() {
    $('#server-name').replaceChildren(...[current().verified ? verifiedMark() : null, current().name].filter(Boolean));
    const show = {
      invite: can('CREATE_INVITE'),
      settings: can('MANAGE_SERVER') || can('MANAGE_ROLES') || can('KICK_MEMBERS'),
      roles: can('MANAGE_ROLES'),
      'create-channel': can('MANAGE_CHANNELS'),
      'create-category': can('MANAGE_CHANNELS'),
      delete: isOwner(),
      leave: !isOwner(),
    };
    serverMenu.querySelectorAll('[data-action]').forEach((b) => b.classList.toggle('hidden', !show[b.dataset.action]));
    let prevVisible = false;
    serverMenu.querySelectorAll('.sm-item, .sm-sep').forEach((n) => {
      if (n.classList.contains('sm-sep')) {
        n.classList.toggle('hidden', !prevVisible);
        prevVisible = false;
      } else if (!n.classList.contains('hidden')) prevVisible = true;
    });
  }

  function closeServerMenu() {
    serverMenu.classList.remove('open');
    serverHeader.classList.remove('open');
  }

  serverHeader.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !serverMenu.classList.contains('open');
    closeFloating();
    serverMenu.classList.toggle('open', open);
    serverHeader.classList.toggle('open', open);
  });
  serverMenu.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    closeServerMenu();
    ({
      invite: () => inviteModal(current()),
      settings: () => openServerSettings(),
      roles: () => openServerSettings('roles'),
      'create-channel': () => createChannelModal('text'),
      'create-category': () => createCategoryModal(),
      delete: () => deleteServerModal(current()),
      leave: () => leaveServerModal(current()),
    })[action]();
  });

  function closeFloating() {
    userMenu.classList.remove('open');
    closeServerMenu();
    $('#popout').classList.remove('open');
    ctxMenu?.remove();
    ctxMenu = null;
    badgeCard?.remove();
    badgeCard = null;
  }

  document.addEventListener('click', closeFloating);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (backdrop.classList.contains('open')) return closeModal();
    if (ctxMenu || badgeCard || $('#popout').classList.contains('open') || userMenu.classList.contains('open')) return closeFloating();
    if (!$('#mention-popup').classList.contains('hidden')) return closeMentionPopup();
    if (serverSettingsOpen()) return closeServerSettings();
    if (settingsOpen()) closeSettings();
    closeServerMenu();
  });

  let ctxMenu = null;
  function openContextMenu(anchor, items, { keep = false } = {}) {
    if (keep) { ctxMenu?.remove(); ctxMenu = null; } else closeFloating();
    const list = items.filter(Boolean).filter((it, i, arr) => it !== '-' || (i > 0 && i < arr.length - 1 && arr[i - 1] !== '-'));
    if (!list.length) return;
    ctxMenu = el('div', { class: 'ctx-menu', role: 'menu', onclick: (e) => e.stopPropagation() },
      list.map((it) => (it === '-' ? el('div', { class: 'sm-sep' }) : el('button', {
        class: `sm-item${it.danger ? ' danger' : ''}`,
        role: 'menuitem',
        onclick: () => { closeFloating(); it.onclick(); },
      }, el('span', {}, it.label), it.hint ? el('small', { class: 'ctx-hint' }, it.hint) : null))));
    document.body.append(ctxMenu);
    const mr = ctxMenu.getBoundingClientRect();
    let x, y;
    if (anchor instanceof Element) {
      const r = anchor.getBoundingClientRect();
      x = r.left; y = r.bottom + 6;
    } else {
      ({ x, y } = anchor);
    }
    ctxMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - mr.width - 8, x))}px`;
    ctxMenu.style.top = `${Math.max(8, Math.min(window.innerHeight - mr.height - 8, y))}px`;
    ctxMenu.querySelector('button')?.focus({ preventScroll: true });
  }

  function copyText(text, msg = 'Panoya kopyalandı.') {
    navigator.clipboard?.writeText(text).then(() => toast(msg), () => toast('Kopyalanamadı.'));
  }

  function knownUser(id) {
    if (id === me.id) return me;
    const pools = [
      state.rel.friends, state.rel.blocked,
      state.rel.incoming.map((r) => r.user), state.rel.outgoing.map((r) => r.user),
      state.dms.map((d) => d.user),
      ...Object.values(state.details).map((s) => s.members),
      ...Object.values(state.messages).map((list) => list.map((m) => m.author)),
    ];
    for (const pool of pools) {
      const u = pool.find((x) => x?.id === id);
      if (u) return u;
    }
    return null;
  }

  function serverMemberItems(user) {
    const server = state.view === 'server' ? current() : null;
    if (!server || !memberOf(server, user.id)) return [];
    const self = user.id === me.id;
    return [
      '-',
      { label: 'Bahset', onclick: () => insertMention({ type: 'user', id: user.id, label: user.displayName }) },
      can('MANAGE_ROLES') && { label: 'Rolleri Düzenle', onclick: () => editMemberRolesModal(server, user) },
      can('KICK_MEMBERS') && !self && canManageMember(server, user.id)
        && { label: `${user.displayName} adlı kişiyi at`, danger: true, onclick: () => confirmKick(server, user) },
      can('BAN_MEMBERS') && !self && user.id !== server.ownerId && canManageMember(server, user.id)
        && { label: `${user.displayName} adlı kişiyi yasakla`, danger: true, onclick: () => confirmBan(server, user) },
    ];
  }

  function userMenuItems(user, anchor, { dmId } = {}) {
    if (user.id === me.id) {
      return [
        { label: 'Profil', onclick: () => showProfilePopout(user.id, anchor) },
        { label: 'Profili Düzenle', onclick: () => openSettings('profile') },
        ...serverMemberItems(user),
        '-',
        { label: 'Kullanıcı Adını Kopyala', onclick: () => copyText(tagOf(user)) },
      ];
    }
    const rel = relationshipWith(user.id);
    return [
      { label: 'Profil', onclick: () => showProfilePopout(user.id, anchor) },
      rel !== 'blocked' && { label: 'Mesaj Gönder', onclick: () => openDmWith(user.id) },
      '-',
      rel === 'none' && !user.bot && { label: 'Arkadaş Ekle', onclick: () => runAction('sendRequest', user.id) },
      rel === 'incoming' && { label: 'İsteği Kabul Et', onclick: () => runAction('accept', user.id) },
      rel === 'incoming' && { label: 'İsteği Yoksay', onclick: () => runAction('decline', user.id) },
      rel === 'outgoing' && { label: 'İsteği İptal Et', onclick: () => runAction('decline', user.id) },
      rel === 'friend' && { label: 'Arkadaşı Çıkar', danger: true, onclick: () => confirmRemoveFriend(user) },
      rel === 'blocked'
        ? { label: 'Engeli Kaldır', onclick: () => runAction('unblock', user.id) }
        : { label: 'Engelle', danger: true, onclick: () => confirmBlock(user) },
      ...serverMemberItems(user),
      '-',
      { label: 'Kullanıcı Adını Kopyala', onclick: () => copyText(tagOf(user)) },
      dmId && '-',
      dmId && { label: "DM'yi Kapat", onclick: () => closeDm(dmId) },
    ];
  }

  function messageMenuItems(m) {
    if (m.ephemeral) return [];
    return [
      canReply() && { label: 'Yanıtla', onclick: () => startReply(m) },
      canEdit(m) && { label: 'Mesajı Düzenle', onclick: () => startEdit(m.id) },
      { label: 'Metni Kopyala', onclick: () => copyText(plainText(m.content)) },
      canDelete(m) && '-',
      canDelete(m) && { label: 'Mesajı Sil', danger: true, onclick: () => confirmDeleteMessage(m) },
    ];
  }

  function channelMenuItems(server, channel) {
    const manage = can('MANAGE_CHANNELS');
    return [
      manage && { label: 'Kanalı Düzenle', onclick: () => channelSettingsModal(channel) },
      manage && can('MANAGE_ROLES') && { label: 'İzinleri Düzenle', onclick: () => channelSettingsModal(channel, 'permissions') },
      can('CREATE_INVITE') && { label: 'Davet Et', onclick: () => inviteModal(server) },
      { label: 'Kanal Bağlantısını Kopyala', onclick: () => copyText(`${location.origin}/channels/${server.id}/${channel.id}`) },
      manage && '-',
      manage && { label: 'Kanal Oluştur', onclick: () => createChannelModal(channel.type, channel.categoryId) },
      manage && { label: 'Kanalı Sil', danger: true, onclick: () => deleteChannelModal(channel) },
    ];
  }

  function categoryMenuItems(category) {
    const owner = can('MANAGE_CHANNELS');
    return [
      { label: collapsed.has(category.id) ? 'Kategoriyi Genişlet' : 'Kategoriyi Daralt', onclick: () => toggleCategory(category.id) },
      owner && '-',
      owner && { label: 'Kanal Oluştur', onclick: () => createChannelModal('text', category.id) },
      owner && { label: 'Kategoriyi Düzenle', onclick: () => renameCategoryModal(category) },
      owner && { label: 'Kategoriyi Sil', danger: true, onclick: () => deleteCategoryModal(category) },
    ];
  }

  function serverMenuItems(server) {
    const isCurrent = state.serverId === server.id;
    const owner = server.ownerId === me.id;
    const c = (perm) => isCurrent && can(perm);
    return [
      (!isCurrent || can('CREATE_INVITE')) && { label: 'Davet Et', onclick: () => inviteModal(server) },
      '-',
      (c('MANAGE_SERVER') || c('MANAGE_ROLES') || c('KICK_MEMBERS')) && { label: 'Sunucu Ayarları', onclick: () => openServerSettings() },
      c('MANAGE_ROLES') && { label: 'Roller', onclick: () => openServerSettings('roles') },
      c('MANAGE_CHANNELS') && { label: 'Kanal Oluştur', onclick: () => createChannelModal('text') },
      c('MANAGE_CHANNELS') && { label: 'Kategori Oluştur', onclick: () => createCategoryModal() },
      '-',
      owner
        ? { label: 'Sunucuyu Sil', danger: true, onclick: () => deleteServerModal(server) }
        : { label: 'Sunucudan Ayrıl', danger: true, onclick: () => leaveServerModal(server) },
    ];
  }

  function contextItemsFor(target) {
    const userEl = target.closest('[data-user-id]');
    if (userEl) {
      const user = knownUser(userEl.dataset.userId);
      if (user) return userMenuItems(user, userEl, { dmId: userEl.dataset.dmId });
    }

    const msgEl = target.closest('.msg[data-id]');
    if (msgEl) {
      const m = (state.messages[state.convId] || []).find((x) => x.id === msgEl.dataset.id);
      if (m && editing?.id !== m.id) return messageMenuItems(m);
    }

    const serverBtn = target.closest('[data-server-id]');
    if (serverBtn) {
      const server = state.details[serverBtn.dataset.serverId] || state.servers.find((s) => s.id === serverBtn.dataset.serverId);
      if (server) return serverMenuItems(server);
    }

    if (state.view !== 'server' || !current()) return [];
    const server = current();

    const channelEl = target.closest('.channel-item[data-channel-id]');
    if (channelEl) {
      const channel = server.channels.find((c) => c.id === channelEl.dataset.channelId);
      if (channel) return channelMenuItems(server, channel);
    }

    const catEl = target.closest('.cat-header[data-category-id]');
    if (catEl) {
      const category = server.categories.find((c) => c.id === catEl.dataset.categoryId);
      if (category) return categoryMenuItems(category);
    }

    if (target.closest('#channel-list')) {
      return [
        can('MANAGE_CHANNELS') && { label: 'Kanal Oluştur', onclick: () => createChannelModal('text') },
        can('MANAGE_CHANNELS') && { label: 'Kategori Oluştur', onclick: () => createCategoryModal() },
        '-',
        can('CREATE_INVITE') && { label: 'Davet Et', onclick: () => inviteModal(server) },
      ];
    }
    return [];
  }

  document.addEventListener('contextmenu', (e) => {
    if (e.shiftKey || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    const selection = String(window.getSelection() || '').trim();
    const items = [
      selection && { label: 'Kopyala', onclick: () => copyText(selection) },
      selection && '-',
      ...contextItemsFor(e.target),
    ];
    if (items.some((it) => it && it !== '-')) openContextMenu({ x: e.clientX, y: e.clientY }, items);
    else closeFloating();
  });

  const collapsed = new Set(JSON.parse(store.get('cydlone:collapsed') || '[]'));

  function toggleCategory(id) {
    collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
    store.set('cydlone:collapsed', JSON.stringify([...collapsed]));
    renderChannels();
  }

  function channelItem(server, c) {
    const isVoice = c.type === 'voice';
    const connectedHere = isVoice && voice.state.channelId === c.id;
    const item = el('div', {
      class: `channel-item${c.id === state.convId ? ' active' : ''}${connectedHere ? ' connected' : ''}`,
      dataset: { channelId: c.id },
      onclick: () => {
        if (isVoice && !connectedHere) voice.join(c.id, server.id);
        go(`/channels/${server.id}/${c.id}`);
      },
    },
    el('span', { class: 'ch-icon' },
      icon(c.type === 'voice' ? 'speaker' : 'hash'),
      isPrivateChannel(server, c) ? el('span', { class: 'ch-lock', 'aria-label': 'Özel kanal', dataset: { tip: 'Özel kanal' } }, icon('lock')) : null),
    el('span', { class: 'ch-name' }, c.name),
    state.mentionCounts[c.id] ? el('span', { class: 'badge mention-badge' }, state.mentionCounts[c.id]) : null,
    el('span', { class: 'ch-actions' },
      can('CREATE_INVITE') ? el('button', {
        class: 'icon-btn',
        dataset: { tip: 'Davet Oluştur' },
        onclick: (e) => { e.stopPropagation(); inviteModal(server); },
      }, icon('invite')) : null,
      can('MANAGE_CHANNELS') ? el('button', {
        class: 'icon-btn',
        dataset: { tip: 'Kanalı Düzenle' },
        onclick: (e) => { e.stopPropagation(); channelSettingsModal(c); },
      }, icon('gear')) : null));
    return isVoice ? [item, voiceUserList(server, c.id)] : item;
  }

  function renderChannels() {
    const server = current();
    const visible = visibleChannels(server);
    const inCat = (id) => visible.filter((c) => (c.categoryId || null) === id);
    const hiddenCat = (cat) => !inCat(cat.id).length && !can('MANAGE_CHANNELS')
      && server.channels.some((c) => c.categoryId === cat.id);
    const sections = [
      el('div', { class: 'cat-body' }, inCat(null).map((c) => channelItem(server, c))),
      ...server.categories.filter((cat) => !hiddenCat(cat)).map((cat) => {
        const header = el('div', {
          class: `cat-header${collapsed.has(cat.id) ? ' collapsed' : ''}`,
          dataset: { categoryId: cat.id },
          onclick: () => toggleCategory(cat.id),
        },
        icon('chevron'),
        el('span', {}, cat.name),
        can('MANAGE_CHANNELS') ? el('button', {
          class: 'icon-btn',
          dataset: { tip: 'Kanal Oluştur' },
          'aria-label': 'Kanal Oluştur',
          onclick: (e) => { e.stopPropagation(); createChannelModal('text', cat.id); },
        }, icon('plus')) : null);
        return el('div', {}, header, el('div', { class: 'cat-body' }, inCat(cat.id).map((c) => channelItem(server, c))));
      }),
    ];
    $('#channel-list').replaceChildren(...sections);
  }

  function renderMembers() {
    const server = current();
    const byName = (a, b) => a.displayName.localeCompare(b.displayName, 'tr');
    const online = server.members.filter((u) => !['offline', 'invisible'].includes(presenceOf(u))).sort(byName);
    const offline = server.members.filter((u) => !online.includes(u)).sort(byName);
    const hoisted = server.roles.filter((r) => r.hoist && !r.isEveryone);
    const groupOf = (u) => rolesOf(server, u.id).find((r) => r.hoist && !r.isEveryone)?.id || null;

    const row = (u, isOnline) => el('div', {
      class: 'member',
      dataset: { userId: u.id },
      style: isOnline ? '' : 'opacity:.45',
      onclick: (e) => { e.stopPropagation(); showProfilePopout(u.id, e.currentTarget, 'left'); },
    },
    avatar(u),
    el('div', { class: 'member-main' },
      el('div', { class: 'member-line' },
        el('span', { class: 'member-name', style: roleColor(server, u.id) ? `color:${roleColor(server, u.id)}` : '' }, u.displayName),
        botTag(u),
        u.id === server.ownerId ? el('span', { class: 'crown', 'aria-label': 'Sunucu Sahibi', dataset: { tip: 'Sunucu Sahibi' } }, icon('crown')) : null),
      isOnline ? activityLine(u.id) : null));

    const sections = [];
    hoisted.forEach((r) => {
      const list = online.filter((u) => groupOf(u) === r.id);
      if (list.length) sections.push(el('div', { class: 'member-group' }, `${r.name} — ${list.length}`), ...list.map((u) => row(u, true)));
    });
    const rest = online.filter((u) => !groupOf(u));
    if (rest.length) sections.push(el('div', { class: 'member-group' }, `Çevrimiçi — ${rest.length}`), ...rest.map((u) => row(u, true)));
    if (offline.length) sections.push(el('div', { class: 'member-group' }, `Çevrimdışı — ${offline.length}`), ...offline.map((u) => row(u, false)));
    $('#members').replaceChildren(...sections);
  }

  const sideToggle = $('#members-toggle');
  function sidePanelKey() { return state.view === 'dm' ? 'cydlone:dmprofile' : 'cydlone:members'; }
  function applySidePanel() {
    const hidden = store.get(sidePanelKey()) === 'hidden';
    $('#members').classList.toggle('collapsed', hidden);
    $('#dm-profile').classList.toggle('collapsed', hidden);
    sideToggle.classList.toggle('active', !hidden);
    sideToggle.firstElementChild.firstElementChild.setAttribute('href', state.view === 'dm' ? '#i-at' : '#i-friends');
    sideToggle.dataset.tip = state.view === 'dm'
      ? (hidden ? 'Kullanıcı Profilini Göster' : 'Kullanıcı Profilini Gizle')
      : (hidden ? 'Üye Listesini Göster' : 'Üye Listesini Gizle');
  }
  sideToggle.addEventListener('click', () => {
    store.set(sidePanelKey(), store.get(sidePanelKey()) === 'hidden' ? 'shown' : 'hidden');
    applySidePanel();
  });

  async function buildProfile(userId, { compact, roles = compact, tab = null }) {
    const { user, relationship, mutualServers, mutualFriends = [] } = await api('GET', `/api/users/${userId}`);
    rememberPresence([user]);
    const act = (name) => () => runAction(name, user.id);
    const buttons = [];
    let more = null;
    if (relationship !== 'self') {
      if (compact && relationship !== 'blocked') buttons.push(el('button', { class: 'btn-purple', onclick: () => openDmWith(user.id) }, 'Mesaj Gönder'));
      if (relationship === 'none' && !user.bot) buttons.push(el('button', { class: 'btn-soft', onclick: act('sendRequest') }, icon('invite'), 'Arkadaş Ekle'));
      if (relationship === 'outgoing') buttons.push(el('button', { class: 'btn-soft', disabled: true }, 'İstek Gönderildi'));
      if (relationship === 'incoming') {
        buttons.push(el('button', { class: 'btn-soft', onclick: act('accept') }, icon('check'), 'Kabul Et'));
        buttons.push(el('button', { class: 'btn-soft', onclick: act('decline') }, 'Yoksay'));
      }
      if (relationship === 'blocked') buttons.push(el('button', { class: 'btn-soft', onclick: act('unblock') }, 'Engeli Kaldır'));
      const moreItems = () => [
        relationship === 'friend' && { label: 'Arkadaşı Çıkar', danger: true, onclick: () => confirmRemoveFriend(user) },
        relationship !== 'blocked' && { label: 'Engelle', danger: true, onclick: () => confirmBlock(user) },
        '-',
        { label: 'Kullanıcı kimliğini kopyala', onclick: () => copyText(user.id, 'Kullanıcı kimliği kopyalandı.') },
      ];
      more = el('button', {
        class: 'profile-more',
        type: 'button',
        'aria-label': 'Diğer seçenekler',
        'aria-haspopup': 'menu',
        dataset: { tip: 'Diğer' },
        onclick: (e) => {
          e.stopPropagation();
          const btn = e.currentTarget;
          if (ctxMenu && ctxMenu.owner === btn) { ctxMenu.remove(); ctxMenu = null; return; }
          openContextMenu(btn, moreItems(), { keep: true });
          if (ctxMenu) ctxMenu.owner = btn;
        },
      }, icon('dots'));
    }

    const mutualLinks = relationship === 'self' || tab ? null : mutualSummary(mutualFriends, mutualServers, (t) => {
      closeFloating();
      showFullProfile(user.id, t);
    });

    const view = profileView(user, {
      footer: [roles ? memberRolesSection(user) : null],
      buttons,
      more,
      extra: mutualLinks,
    });
    if (tab && relationship !== 'self') addProfileTabs(view, tab, mutualFriends, mutualServers);
    return view;
  }

  function mutualSummary(friends, servers, open) {
    const parts = [];
    if (friends.length) parts.push(el('button', { class: 'mutual-link', type: 'button', onclick: () => open('friends') }, `${friends.length} Ortak Arkadaş`));
    if (servers.length) parts.push(el('button', { class: 'mutual-link', type: 'button', onclick: () => open('servers') }, `${servers.length} Ortak Sunucu`));
    if (!parts.length) return null;
    return el('div', { class: 'mutual-summary' }, parts.flatMap((p, i) => (i ? [el('span', { 'aria-hidden': 'true' }, '•'), p] : [p])));
  }

  function addProfileTabs(view, tab, friends, servers) {
    const about = view.querySelector('.profile-card');
    const empty = (text) => el('div', { class: 'mutual-empty' }, text);
    const panels = {
      about,
      friends: el('div', { class: 'mutual-list' }, friends.length ? friends.map((u) => el('button', {
        class: 'mutual-item',
        type: 'button',
        onclick: () => showFullProfile(u.id),
      }, avatar(u), el('span', { class: 'mi-name' }, u.displayName), el('span', { class: 'mi-sub' }, tagOf(u)))) : empty('Ortak arkadaşınız yok.')),
      servers: el('div', { class: 'mutual-list' }, servers.length ? servers.map((s) => el('button', {
        class: 'mutual-item',
        type: 'button',
        onclick: () => { closeModal(); go(`/channels/${s.id}`); },
      }, serverIconFill(el('span', { class: 'mi-server' }), s), el('span', { class: 'mi-name' }, s.name), s.verified ? verifiedMark() : null)) : empty('Ortak sunucunuz yok.')),
    };
    const labels = { about: 'Hakkında', friends: `Ortak Arkadaşlar — ${friends.length}`, servers: `Ortak Sunucular — ${servers.length}` };
    const tabs = el('div', { class: 'profile-tabs', role: 'tablist' });
    const host = el('div', { class: 'profile-tab-panel' });
    const show = (key) => {
      tabs.querySelectorAll('.profile-tab').forEach((b) => {
        const on = b.dataset.tab === key;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
      host.replaceChildren(panels[key]);
    };
    Object.keys(labels).forEach((key) => tabs.append(el('button', {
      class: 'profile-tab',
      type: 'button',
      role: 'tab',
      dataset: { tab: key },
      onclick: () => show(key),
    }, labels[key])));
    about.replaceWith(tabs, host);
    show(panels[tab] ? tab : 'about');
  }

  function memberRolesSection(user) {
    const server = state.view === 'server' ? current() : null;
    if (!server || !memberOf(server, user.id)) return null;
    const roles = rolesOf(server, user.id).filter((r) => !r.isEveryone);
    const editable = can('MANAGE_ROLES');
    return [
      el('h4', {}, roles.length ? 'Roller' : 'Rol yok'),
      el('div', { class: 'role-chips' },
        roles.map((r) => roleChip(r, editable && canManageRole(server, r)
          ? (chip) => removeMemberRole(server, user, r, chip) : null)),
        editable ? el('button', {
          class: 'role-chip add',
          type: 'button',
          'aria-label': 'Rol ekle',
          dataset: { tip: 'Rolleri Düzenle' },
          onclick: () => editMemberRolesModal(server, user),
        }, '+') : null),
    ];
  }

  function roleChip(role, onRemove) {
    const style = `--rc:${role.color || '#9a99ad'}`;
    if (!onRemove) return el('span', { class: 'role-chip', style }, el('i'), role.name);
    const chip = el('span', { class: 'role-chip removable', style },
      el('button', {
        class: 'rc-remove',
        type: 'button',
        'aria-label': `${role.name} rolünü kaldır`,
        dataset: { tip: 'Rolü Kaldır' },
        onclick: (e) => { e.stopPropagation(); onRemove(chip); },
      }, el('i'), icon('x')),
      role.name);
    return chip;
  }

  async function removeMemberRole(server, user, role, chip) {
    const roles = (memberOf(server, user.id)?.roles || []).filter((id) => id !== role.id);
    chip.classList.add('removing');
    try {
      await api('PUT', `/api/servers/${server.id}/members/${user.id}/roles`, { roles });
      const list = chip.parentElement;
      chip.remove();
      if (!list.querySelector('.role-chip:not(.add)')) list.previousElementSibling.textContent = 'Rol yok';
    } catch (err) {
      chip.classList.remove('removing');
      toast(err.message);
    }
  }

  function paintBanner(node, user, colorVar = '--pc') {
    node.style.setProperty(colorVar, user.bannerColor || user.avatarColor);
    node.style.backgroundImage = user.bannerUrl ? `url("${user.bannerUrl}")` : '';
    node.classList.toggle('has-img', !!user.bannerUrl);
    return node;
  }

  function profileView(user, { footer = [], buttons = [], more = null, extra = null } = {}) {
    return el('div', { class: 'profile' },
      paintBanner(el('div', { class: 'profile-banner' }), user),
      more,
      avatar(user, { cls: 'large' }),
      el('div', { class: 'profile-body' },
        el('div', { class: 'profile-name' }, el('span', { class: 'profile-display' }, user.displayName || user.username), botTag(user)),
        el('div', { class: 'profile-username' }, nameTag(user), copyTagButton(user)),
        badgeRow(user, 'under-name'),
        user.pronouns ? el('div', { class: 'profile-pronouns' }, user.pronouns) : null,
        extra,
        el('div', { class: 'profile-card' },
          activitySlot(user.id),
          user.bio ? [el('h4', {}, 'Hakkımda'), el('p', { class: 'profile-bio' }, user.bio)] : null,
          el('h4', {}, 'Cydlone üyesi'),
          el('p', {}, shortDate(user.createdAt)),
          footer),
        buttons.length ? el('div', { class: 'profile-actions' }, buttons) : null));
  }

  let popoutTarget = null;
  async function showProfilePopout(userId, anchor, side = 'right') {
    const pop = $('#popout');
    const wasOpenFor = pop.classList.contains('open') && popoutTarget?.userId === userId;
    closeFloating();
    if (wasOpenFor) return;
    popoutTarget = { userId, anchor, side };
    let content;
    try {
      content = await buildProfile(userId, { compact: true });
    } catch (err) {
      return toast(err.message);
    }
    const av = content.querySelector('.avatar.large');
    av.classList.add('opens-full');
    av.dataset.tip = 'Profili Görüntüle';
    av.addEventListener('click', () => showFullProfile(userId));
    pop.replaceChildren(content);
    pop.classList.add('open');
    const r = anchor.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const left = side === 'left' ? r.left - pr.width - 12 : r.right + 12;
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pr.width - 8, left))}px`;
    pop.style.top = `${Math.max(8, Math.min(window.innerHeight - pr.height - 8, r.top))}px`;
  }
  $('#popout').addEventListener('click', (e) => e.stopPropagation());

  async function showFullProfile(userId, tab = 'about') {
    let content;
    try {
      content = await buildProfile(userId, { compact: true, roles: false, tab });
    } catch (err) {
      return toast(err.message);
    }
    content.classList.add('profile-full');
    openModal(content);
  }

  async function refreshProfiles() {
    if (state.view === 'dm') renderDmProfile();
    if ($('#popout').classList.contains('open') && popoutTarget) {
      const { userId, anchor, side } = popoutTarget;
      popoutTarget = null;
      showProfilePopout(userId, anchor, side);
    }
  }

  async function renderDmProfile() {
    const dm = currentDm();
    if (!dm) return;
    try {
      const content = await buildProfile(dm.user.id, { compact: false });
      if (state.convId === dm.id) $('#dm-profile').replaceChildren(content);
    } catch {  }
    if (state.convId === dm.id) renderWelcomeActions();
  }

  const messagesEl = $('#messages');
  const composer = $('#composer');
  const input = $('#composer-input');

  function convUrl() {
    return state.view === 'dm' ? `/api/dms/${state.convId}/messages` : `/api/channels/${state.convId}/messages`;
  }

  async function openConversation() {
    editing = null;
    replying = null;
    clearUploads();
    slash = null;
    renderSlashBar();
    renderReplyBar();
    typingUsers.forEach((t) => clearTimeout(t.timer));
    typingUsers.clear();
    renderTyping();

    const convId = state.convId;
    let isText = true;
    if (state.view === 'dm') {
      const dm = currentDm();
      setTitle(`Cydlone | @${dm.user.displayName}`);
      $('#channel-icon').firstElementChild.setAttribute('href', '#i-at');
      $('#channel-title').textContent = dm.user.displayName;
      input.placeholder = `@${dm.user.displayName} kişisine mesaj gönder`;
      $('#dm-profile').replaceChildren();
      renderDmProfile();
    } else {
      const channel = currentChannel();
      if (!channel) {
        $('#channel-title').textContent = '';
        messagesEl.replaceChildren();
        return;
      }
      isText = channel.type === 'text';
      setTitle(`${isText ? '#' : ''}${channel.name} | ${current().name}`);
      $('#channel-icon').firstElementChild.setAttribute('href', isText ? '#i-hash' : '#i-speaker');
      $('#channel-title').textContent = channel.name;
      input.placeholder = `#${channel.name} kanalına mesaj gönder`;
      delete state.mentionCounts[channel.id];
      renderServerList();
    }
    input.disabled = false;
    composer.classList.remove('locked');
    if (state.view === 'server') updateComposerPermission();
    updateAttachButton();
    composerMap.clear();
    closeMentionPopup();

    messagesEl.classList.toggle('hidden', !isText);
    composer.classList.toggle('hidden', !isText);
    $('#voice-placeholder').classList.toggle('hidden', isText);
    if (!isText) return renderVoiceView();

    input.value = store.get(`cydlone:draft:${convId}`) || '';
    autosize();

    if (!state.messages[convId]) {
      messagesEl.replaceChildren();
      try {
        state.messages[convId] = (await api('GET', convUrl())).messages;
      } catch (err) {
        return toast(err.message);
      }
      if (state.convId !== convId) return;
    }
    renderMessages();
    input.focus();
  }

  function welcomeHeader() {
    if (state.view === 'dm') {
      const { user } = currentDm();
      return el('div', { class: 'channel-welcome dm-welcome' },
        avatar(user, { status: false, cls: 'big' }),
        el('h1', {}, user.displayName),
        el('div', { class: 'dw-user' }, nameTag(user)),
        el('p', {}, el('b', {}, user.displayName), ' ile olan direkt mesaj geçmişinin başlangıcı.'),
        el('div', { class: 'profile-actions', id: 'welcome-actions' }));
    }
    const channel = currentChannel();
    return el('div', { class: 'channel-welcome' },
      el('div', { class: 'cw-icon' }, icon('hash')),
      el('h1', {}, `#${channel.name} kanalına hoş geldin!`),
      el('p', {}, `Bu, #${channel.name} kanalının başlangıcı.`));
  }

  function renderWelcomeActions() {
    const box = $('#welcome-actions');
    const dm = currentDm();
    if (!box || !dm) return;
    const id = dm.user.id;
    const rel = relationshipWith(id);
    const b = (label, onclick, cls = 'btn-soft') => el('button', { class: cls, onclick }, label);
    box.replaceChildren(...[
      rel === 'none' && !dm.user.bot && b('Arkadaş Ekle', () => runAction('sendRequest', id), 'btn-purple'),
      rel === 'outgoing' && el('button', { class: 'btn-soft', disabled: true }, 'Arkadaşlık İsteği Gönderildi'),
      rel === 'incoming' && b('Kabul Et', () => runAction('accept', id), 'btn-purple'),
      rel === 'incoming' && b('Yoksay', () => runAction('decline', id)),
      rel === 'friend' && b('Arkadaşı Çıkar', () => confirmRemoveFriend(dm.user)),
      rel === 'blocked' ? b('Engeli Kaldır', () => runAction('unblock', id)) : b('Engelle', () => confirmBlock(dm.user)),
    ].filter(Boolean));
    const note = $('#blocked-note');
    if (rel === 'blocked' && !note) composer.prepend(el('div', { class: 'blocked-note', id: 'blocked-note' }, 'Bu kullanıcıyı engelledin. Mesaj göndermek için engeli kaldır.'));
    if (rel !== 'blocked') note?.remove();
  }

  function renderMessages() {
    const list = state.messages[state.convId] || [];
    messagesEl.replaceChildren(welcomeHeader());
    if (state.view === 'dm') renderWelcomeActions();
    else $('#blocked-note')?.remove();
    let prev = null;
    list.forEach((m) => { messagesEl.append(...messageNodes(m, prev)); prev = m; });
    scrollToBottom();
  }

  function messageNodes(m, prev) {
    const d = new Date(m.createdAt);
    const nodes = [];
    const newDay = !prev || !sameDay(new Date(prev.createdAt), d);
    if (newDay) nodes.push(el('div', { class: 'day-divider' }, el('span', {}, dayFmt.format(d))));

    const grouped = !newDay && !m.replyTo && !m.interaction && prev.authorId === m.authorId && d - new Date(prev.createdAt) < GROUP_WINDOW_MS;
    const content = editing?.id === m.id ? messageEditor(m) : contentNode(m);
    const tools = messageTools(m);
    const stateCls = `${editing?.id === m.id ? ' editing' : ''}${mentionsMe(m) || repliesToMe(m) ? ' mentioned' : ''}${replying?.message.id === m.id ? ' reply-target' : ''}`;

    if (grouped) {
      nodes.push(el('div', { class: `msg${stateCls}`, dataset: { id: m.id } },
        el('span', { class: 'side-time' }, timeFmt.format(d)), content, tools));
    } else {
      const author = m.author || { displayName: 'Silinmiş Kullanıcı' };
      const openProfile = (e) => { e.stopPropagation(); if (author.id) showProfilePopout(author.id, e.currentTarget); };
      const av = avatar(author, { status: false });
      av.addEventListener('click', openProfile);
      if (author.id) av.dataset.userId = author.id;
      nodes.push(el('div', { class: 'msg-group' },
        el('div', { class: `msg first${m.replyTo || m.interaction ? ' has-reply' : ''}${m.ephemeral ? ' ephemeral' : ''}${stateCls}`, dataset: { id: m.id } },
          m.interaction ? interactionHeader(m) : m.replyTo ? replyPreview(m) : null,
          av,
          el('div', { class: 'msg-head' },
            el('span', {
              class: 'msg-author',
              onclick: openProfile,
              dataset: author.id ? { userId: author.id } : {},
              style: state.view === 'server' && author.id && roleColor(current(), author.id) ? `color:${roleColor(current(), author.id)}` : '',
            }, author.displayName),
            botTag(author),
            el('span', {
              class: 'msg-time',
              title: d.toLocaleString(LOCALE),
              dataset: { short: timeFmt.format(d) },
            }, stampText(m.createdAt))),
          content, tools)));
    }
    return nodes;
  }

  function replyPreview(m) {
    const ref = m.referenced;
    if (!ref) {
      return el('div', { class: 'msg-reply deleted' },
        el('span', { class: 'reply-spine' }),
        el('span', { class: 'reply-missing' }, icon('reply')),
        el('em', {}, 'Orijinal mesaj silindi.'));
    }
    const author = ref.author || { displayName: 'Silinmiş Kullanıcı' };
    const color = state.view === 'server' && author.id ? roleColor(current(), author.id) : null;
    return el('div', { class: 'msg-reply' },
      el('span', { class: 'reply-spine' }),
      avatar(author, { status: false, cls: 'tiny' }),
      el('span', {
        class: 'reply-author',
        style: color ? `color:${color}` : '',
        onclick: (e) => { e.stopPropagation(); if (author.id) showProfilePopout(author.id, e.currentTarget); },
      }, `${mentionsReplied(m) ? '@' : ''}${author.displayName}`),
      el('span', {
        class: 'reply-text',
        role: 'button',
        tabindex: '0',
        dataset: { tip: 'Mesaja git' },
        onclick: () => jumpToMessage(ref.id),
        onkeydown: (e) => { if (e.key === 'Enter') jumpToMessage(ref.id); },
      }, plainText(ref.content).replace(/\s+/g, ' ') || (ref.attachmentCount ? el('em', {}, 'Eki görmek için tıkla') : '')));
  }

  const mentionsReplied = (m) => !!m.replyMention && !!m.referenced && !!m.mentions?.users?.includes(m.referenced.authorId);

  function jumpToMessage(id) {
    const target = messagesEl.querySelector(`.msg[data-id="${id}"]`);
    if (!target) return toast('Bu mesaj yüklü mesajlar arasında değil.');
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.remove('flash');
    void target.offsetWidth;
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 2000);
  }

  function contentNode(m) {
    if (m.thinking) {
      return el('div', { class: 'msg-content msg-thinking' },
        el('span', {}, `${m.author?.displayName || 'Uygulama'} düşünüyor`),
        el('span', { class: 'thinking-dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')),
        ephemeralNote(m));
    }
    if (m.failed) {
      return el('div', { class: 'msg-content msg-failed' },
        el('span', {}, icon('x'), m.ephemeral ? 'Uygulama yanıt vermedi.' : 'Etkileşim başarısız oldu.'),
        ephemeralNote(m));
    }
    const prose = withoutCode(m.content);
    return el('div', { class: `msg-content${isJumbo(m.content) ? ' jumbo' : ''}` },
      m.content ? messageText(m.content) : null,
      m.editedAt ? el('span', { class: 'edited', title: new Date(m.editedAt).toLocaleString(LOCALE) }, ' (düzenlendi)') : null,
      attachmentsNode(m),
      embedsNode(m.embeds),
      inviteEmbeds(prose),
      linkEmbeds(prose),
      ephemeralNote(m));
  }

  function interactionHeader(m) {
    const user = m.interaction.user || { displayName: 'Silinmiş Kullanıcı' };
    return el('div', { class: 'msg-reply msg-interaction' },
      el('span', { class: 'reply-spine' }),
      avatar(user, { status: false, cls: 'tiny' }),
      el('span', {
        class: 'reply-author',
        onclick: (e) => { e.stopPropagation(); if (user.id) showProfilePopout(user.id, e.currentTarget); },
      }, user.displayName),
      el('span', { class: 'mi-cmd' }, `/${m.interaction.name}`),
      el('span', { class: 'mi-used' }, 'komutunu kullandı'));
  }

  function ephemeralNote(m) {
    if (!m.ephemeral) return null;
    return el('div', { class: 'ephemeral-note' },
      icon('eye'),
      el('span', {}, 'Sadece sen görebilirsin'),
      el('span', { 'aria-hidden': 'true' }, '•'),
      el('button', { class: 'link-btn', type: 'button', onclick: () => removeMessage(m.channelId, m.id) }, 'Bu mesajı kapat'));
  }

  function embedsNode(embeds) {
    if (!embeds?.length) return null;
    return el('div', { class: 'rich-embeds' }, embeds.map(richEmbed));
  }

  function richEmbed(e) {
    const link = (url, cls, children) => (url
      ? el('a', { class: cls, href: url, target: '_blank', rel: 'noopener noreferrer' }, children)
      : el('span', { class: cls }, children));
    const img = (url, cls) => {
      const i = el('img', { class: cls, src: proxiedImage(url), alt: '', loading: 'lazy', draggable: 'false' });
      i.addEventListener('error', () => i.remove(), { once: true });
      return i;
    };
    const footerText = [e.footer?.text, e.timestamp ? stampText(e.timestamp) : null].filter(Boolean).join(' • ');
    return el('div', { class: `rich-embed${e.thumbnail ? ' has-thumb' : ''}`, style: e.color ? `--embed-color:${e.color}` : '' },
      el('div', { class: 're-main' },
        e.author ? el('div', { class: 're-author' }, e.author.iconUrl ? img(e.author.iconUrl, 're-author-icon') : null, link(e.author.url, 're-author-name', e.author.name)) : null,
        e.title ? link(e.url, 're-title', e.title) : null,
        e.description ? el('div', { class: 're-desc' }, messageText(e.description)) : null,
        e.fields ? el('div', { class: 're-fields' }, e.fields.map((f) => el('div', { class: `re-field${f.inline ? ' inline' : ''}` },
          el('div', { class: 're-field-name' }, f.name),
          el('div', { class: 're-field-value' }, messageText(f.value))))) : null,
        e.image ? img(e.image, 're-image') : null,
        footerText ? el('div', { class: 're-footer' }, e.footer?.iconUrl ? img(e.footer.iconUrl, 're-footer-icon') : null, el('span', {}, footerText)) : null),
      e.thumbnail ? img(e.thumbnail, 're-thumb') : null);
  }

  const CODE_RE = /```(?:([\w#+.-]{1,20})\n)?([\s\S]*?)```|`([^`\n]+)`/g;
  const withoutCode = (text) => text.replace(CODE_RE, ' ');

  function codeParts(text) {
    const parts = [];
    let last = 0;
    for (const m of text.matchAll(CODE_RE)) {
      const body = m[3] ?? m[2];
      if (!body.trim()) continue;
      parts.push({ code: false, text: text.slice(last, m.index) });
      parts.push({ code: true, inline: m[3] !== undefined, lang: m[1] || '', text: body, raw: m[0] });
      last = m.index + m[0].length;
    }
    parts.push({ code: false, text: text.slice(last) });
    return parts;
  }

  function messageText(text) {
    const frag = document.createDocumentFragment();
    const parts = codeParts(text);
    parts.forEach((p, i) => {
      if (p.code) {
        frag.append(p.inline ? el('code', { class: 'md-code' }, p.text) : codeBlock(p.text, p.lang));
        return;
      }
      let t = p.text;
      if (parts[i + 1]?.code && !parts[i + 1].inline) t = t.replace(/\n$/, '');
      if (parts[i - 1]?.code && !parts[i - 1].inline) t = t.replace(/^\n/, '');
      if (t) frag.append(mentionText(t));
    });
    return frag;
  }

  function codeBlock(code, lang) {
    code = code.replace(/^\n/, '').replace(/\n$/, '');
    const copy = el('button', { class: 'cb-copy', type: 'button', 'aria-label': 'Kodu kopyala', dataset: { tip: 'Kopyala' } }, icon('copy'));
    copy.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(code);
        copy.classList.add('done');
        copy.replaceChildren(icon('check'));
        copy.dataset.tip = 'Kopyalandı!';
        setTimeout(() => { copy.classList.remove('done'); copy.replaceChildren(icon('copy')); copy.dataset.tip = 'Kopyala'; }, 1600);
      } catch { toast('Kopyalanamadı.'); }
    });
    return el('div', { class: 'md-codeblock' },
      lang ? el('span', { class: 'cb-lang' }, lang) : null,
      copy,
      el('pre', {}, el('code', {}, code)));
  }

  function inOpenCodeBlock(area) {
    return ((area.value.slice(0, area.selectionStart).match(/```/g) || []).length % 2) === 1;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let n = bytes / 1024, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toLocaleString(LOCALE, { maximumFractionDigits: n < 10 ? 2 : 1 })} ${units[i]}`;
  }

  function attachmentKind(a) {
    if (/^image\/(png|jpeg|gif|webp|avif)$/.test(a.contentType)) return 'image';
    if (/^video\/(mp4|webm|quicktime)$/.test(a.contentType)) return 'video';
    if (/^audio\/(mpeg|ogg|wav|webm|mp4|aac|flac)$/.test(a.contentType)) return 'audio';
    return 'file';
  }

  function mediaBox(a, maxW = 400, maxH = 300) {
    if (!a.width || !a.height) return '';
    const s = Math.min(1, maxW / a.width, maxH / a.height);
    return `width:${Math.round(a.width * s)}px;height:${Math.round(a.height * s)}px`;
  }

  function stickOnLoad(node, event = 'load') {
    node.addEventListener(event, () => {
      if (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120 + node.offsetHeight) scrollToBottom();
    }, { once: true });
    return node;
  }

  function attachmentsNode(m) {
    if (!m.attachments?.length) return null;
    return el('div', { class: 'msg-attachments' }, m.attachments.map(attachmentNode));
  }

  const mediaNodes = new Map();

  function attachmentNode(a) {
    const kind = attachmentKind(a);
    if (kind === 'audio' || kind === 'video') {
      if (!mediaNodes.has(a.id)) mediaNodes.set(a.id, kind === 'video' ? videoPlayer(a) : fileCard(a, kind));
      return mediaNodes.get(a.id);
    }
    return kind === 'image' ? imageAttachment(a) : fileCard(a, kind);
  }

  function imageAttachment(a) {
    return el('a', {
      class: 'att-image',
      href: a.url,
      target: '_blank',
      rel: 'noopener',
      'aria-label': a.name,
      onclick: (e) => { e.preventDefault(); openImageViewer(a); },
    }, stickOnLoad(el('img', { src: a.url, alt: a.name, loading: 'lazy', draggable: 'false', style: mediaBox(a) })));
  }

  function fileCard(a, kind) {
    const card = el('div', { class: `att-file${kind === 'audio' ? ' audio' : ''}` },
      el('span', { class: 'af-icon' }, icon(kind === 'audio' ? 'music' : 'file')),
      el('div', { class: 'af-info' },
        el('a', { class: 'af-name', href: `${a.url}?indir`, title: a.name, download: a.name }, a.name),
        el('span', { class: 'af-size' }, formatSize(a.size))),
      el('a', { class: 'icon-btn af-download', href: `${a.url}?indir`, download: a.name, 'aria-label': `${a.name} indir`, dataset: { tip: 'İndir' } }, icon('download')));
    if (kind === 'audio') {
      const audio = el('audio', { class: 'att-media', src: a.url, preload: 'metadata' });
      card.append(audio, mediaControls(audio, card));
      bindMediaKeys(card, audio);
    }
    return card;
  }

  let mediaVolume = Math.min(1, Math.max(0, Number(store.get('cydlone:media-volume') ?? 1) || 0));

  function mediaTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  document.addEventListener('play', (e) => {
    if (!e.target.classList?.contains('att-media')) return;
    document.querySelectorAll('.att-media').forEach((m) => { if (m !== e.target) m.pause(); });
  }, true);

  function mediaControls(media, root, { fullscreen = null } = {}) {
    media.volume = mediaVolume;
    const setIcon = (btn, name) => btn.querySelector('use').setAttribute('href', `#i-${name}`);
    const playBtn = el('button', { class: 'mp-btn mp-play', type: 'button', 'aria-label': 'Oynat', dataset: { tip: 'Oynat' } }, icon('play'));
    const time = el('span', { class: 'mp-time' }, '0:00 / 0:00');
    const seek = el('input', { class: 'mp-range mp-seek', type: 'range', min: '0', max: '1000', step: '1', value: '0', 'aria-label': 'Konum' });
    const muteBtn = el('button', { class: 'mp-btn mp-mute', type: 'button', 'aria-label': 'Sesi kapat' }, icon('volume'));
    const vol = el('input', { class: 'mp-range mp-vol', type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(mediaVolume * 100)), 'aria-label': 'Ses düzeyi' });
    const fsBtn = fullscreen ? el('button', { class: 'mp-btn mp-fs', type: 'button', 'aria-label': 'Tam ekran', dataset: { tip: 'Tam Ekran' }, onclick: fullscreen }, icon('fullscreen')) : null;
    let dragging = false;

    const toggle = () => (media.paused || media.ended ? media.play().catch(() => {}) : media.pause());
    playBtn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

    const paintTime = () => {
      const d = media.duration;
      time.textContent = `${mediaTime(media.currentTime)} / ${Number.isFinite(d) ? mediaTime(d) : '0:00'}`;
      if (!dragging) seek.value = String(Number.isFinite(d) && d ? Math.round((media.currentTime / d) * 1000) : 0);
      seek.style.setProperty('--p', `${seek.value / 10}%`);
    };
    const paintBuffer = () => {
      const d = media.duration;
      const b = media.buffered;
      const end = b.length ? b.end(b.length - 1) : 0;
      seek.style.setProperty('--b', `${Number.isFinite(d) && d ? (end / d) * 100 : 0}%`);
    };
    const paintPlay = () => {
      const playing = !media.paused && !media.ended;
      root.classList.toggle('playing', playing);
      root.classList.toggle('ended', media.ended);
      const [name, label] = media.ended ? ['replay', 'Tekrar Oynat'] : playing ? ['pause', 'Duraklat'] : ['play', 'Oynat'];
      setIcon(playBtn, name);
      playBtn.setAttribute('aria-label', label);
      playBtn.dataset.tip = label;
    };
    const paintVolume = () => {
      const level = media.muted ? 0 : media.volume;
      vol.value = String(Math.round(level * 100));
      vol.style.setProperty('--p', `${level * 100}%`);
      setIcon(muteBtn, level === 0 ? 'volume-off' : 'volume');
      const label = level === 0 ? 'Sesi Aç' : 'Sesi Kapat';
      muteBtn.setAttribute('aria-label', label);
    };

    media.addEventListener('loadedmetadata', () => {
      if (media.duration !== Infinity) return paintTime();
      media.addEventListener('timeupdate', () => { media.currentTime = 0; paintTime(); }, { once: true });
      media.currentTime = 1e101;
    });
    media.addEventListener('durationchange', paintTime);
    media.addEventListener('timeupdate', paintTime);
    media.addEventListener('progress', paintBuffer);
    media.addEventListener('play', paintPlay);
    media.addEventListener('pause', paintPlay);
    media.addEventListener('ended', paintPlay);
    media.addEventListener('volumechange', paintVolume);

    seek.addEventListener('input', () => {
      dragging = true;
      seek.style.setProperty('--p', `${seek.value / 10}%`);
      if (Number.isFinite(media.duration)) time.textContent = `${mediaTime((seek.value / 1000) * media.duration)} / ${mediaTime(media.duration)}`;
    });
    seek.addEventListener('change', () => {
      dragging = false;
      if (Number.isFinite(media.duration)) media.currentTime = (seek.value / 1000) * media.duration;
    });

    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (media.muted || media.volume === 0) { media.muted = false; if (!media.volume) media.volume = 0.5; } else media.muted = true;
    });
    vol.addEventListener('input', () => {
      media.muted = false;
      media.volume = vol.value / 100;
      mediaVolume = media.volume;
      store.set('cydlone:media-volume', String(mediaVolume));
    });

    if (fsBtn) {
      document.addEventListener('fullscreenchange', () => {
        const on = document.fullscreenElement === root;
        setIcon(fsBtn, on ? 'fullscreen-exit' : 'fullscreen');
        const label = on ? 'Tam Ekrandan Çık' : 'Tam Ekran';
        fsBtn.setAttribute('aria-label', label);
        fsBtn.dataset.tip = label;
      });
    }

    paintPlay();
    paintVolume();
    const bar = el('div', { class: 'mp-bar', onclick: (e) => e.stopPropagation() },
      playBtn, time, seek,
      el('div', { class: 'mp-volume' }, el('div', { class: 'mp-vol-pop' }, vol), muteBtn),
      fsBtn);
    bar.toggle = toggle;
    return bar;
  }

  function bindMediaKeys(root, media, fullscreen) {
    root.tabIndex = 0;
    root.addEventListener('keydown', (e) => {
      if (e.target.matches('input, a') || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'k') media.paused || media.ended ? media.play().catch(() => {}) : media.pause();
      else if (key === 'arrowright') media.currentTime = Math.min(media.duration || 0, media.currentTime + 5);
      else if (key === 'arrowleft') media.currentTime = Math.max(0, media.currentTime - 5);
      else if (key === 'm') media.muted = !media.muted;
      else if (key === 'f' && fullscreen) fullscreen();
      else return;
      e.preventDefault();
    });
  }

  function videoPlayer(a) {
    const video = stickOnLoad(el('video', { class: 'att-media', src: a.url, preload: 'metadata', playsinline: true }), 'loadedmetadata');
    const root = el('div', { class: 'att-video player', style: mediaBox(a), 'aria-label': a.name });
    const fullscreen = () => {
      if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
      else root.requestFullscreen?.().catch(() => {});
    };
    const bar = mediaControls(video, root, { fullscreen });
    const big = el('button', { class: 'vp-big', type: 'button', 'aria-label': 'Oynat', onclick: (e) => { e.stopPropagation(); bar.toggle(); } }, icon('play'));
    const top = el('div', { class: 'vp-top' },
      el('span', { class: 'vp-name', title: a.name }, a.name),
      el('a', { class: 'mp-btn', href: `${a.url}?indir`, download: a.name, 'aria-label': `${a.name} indir`, dataset: { tip: 'İndir' }, onclick: (e) => e.stopPropagation() }, icon('download')));
    root.append(video, big, top, bar);
    root.addEventListener('click', () => bar.toggle());
    root.addEventListener('dblclick', fullscreen);
    let idle;
    root.addEventListener('mousemove', () => {
      root.classList.remove('idle');
      clearTimeout(idle);
      idle = setTimeout(() => root.classList.add('idle'), 2200);
    });
    bindMediaKeys(root, video, fullscreen);
    return root;
  }

  function openImageViewer(a) {
    openModal(el('div', { class: 'image-viewer' },
      el('img', { src: a.url, alt: a.name }),
      el('div', { class: 'iv-bar' },
        el('span', { class: 'iv-name', title: a.name }, a.name),
        el('a', { href: a.url, target: '_blank', rel: 'noopener' }, 'Tarayıcıda aç'),
        el('a', { href: `${a.url}?indir`, download: a.name }, 'İndir'))));
  }

  const LINK_RE = /https?:\/\/[^\s<]+/g;
  const embedCache = new Map();

  function cleanLink(url) {
    url = url.replace(/[.,!?;:'"`*_~]+$/, '');
    while (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) url = url.slice(0, -1);
    return url;
  }

  const proxied = (url) => `/api/embeds/image?url=${encodeURIComponent(url)}`;

  function fetchEmbed(url) {
    if (!embedCache.has(url)) {
      const entry = { data: undefined };
      entry.promise = api('GET', `/api/embeds?url=${encodeURIComponent(url)}`)
        .then((r) => r.embed).catch(() => null)
        .then((data) => { entry.data = data; return data; });
      embedCache.set(url, entry);
    }
    return embedCache.get(url);
  }

  function linkEmbeds(content) {
    const invite = new RegExp(INVITE_RE.source);
    const urls = [...new Set([...content.matchAll(LINK_RE)].map((x) => cleanLink(x[0])))]
      .filter((u) => !invite.test(u)).slice(0, 10);
    return urls.length ? el('div', { class: 'link-embeds' }, urls.map(linkEmbed)) : null;
  }

  function keepBottom(change) {
    const atBottom = nearBottom();
    change();
    if (atBottom) scrollToBottom();
  }

  function linkEmbed(url) {
    const entry = fetchEmbed(url);
    if (entry.data !== undefined) return linkEmbedBody(url, entry.data);
    const slot = el('div', { class: 'link-embed-slot' });
    entry.promise.then((data) => keepBottom(() => {
      const node = linkEmbedBody(url, data);
      node ? slot.replaceWith(node) : slot.remove();
    }));
    return slot;
  }

  function embedImage(image, cls) {
    const img = el('img', { class: cls, src: proxied(image.url), alt: '', loading: 'lazy', draggable: 'false' });
    if (image.width && image.height) img.style.aspectRatio = `${image.width} / ${image.height}`;
    const atBottom = () => messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120 + img.offsetHeight;
    img.addEventListener('load', () => { if (atBottom()) scrollToBottom(); });
    img.addEventListener('error', () => img.closest('.le-image, .le-thumb-wrap, .image-embed')?.remove());
    return img;
  }

  function fallbackEmbed(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    const host = u.host.replace(/^www\./, '');
    let rest = `${u.pathname}${u.search}`.replace(/^\/$/, '');
    try { rest = decodeURI(rest); } catch {  }
    const favicon = el('img', { class: 'le-favicon', src: proxied(`${u.origin}/favicon.ico`), alt: '', loading: 'lazy' });
    favicon.addEventListener('error', () => favicon.remove());
    return el('div', { class: 'link-embed fallback' },
      el('div', { class: 'le-main' },
        el('div', { class: 'le-site' }, favicon, host),
        el('a', { class: 'le-title', href: url, target: '_blank', rel: 'noopener noreferrer' }, `${host}${rest}`)));
  }

  function linkEmbedBody(url, e) {
    if (!e || (e.type !== 'image' && !e.title && !e.description && !e.image)) return fallbackEmbed(url);
    const out = { href: url, target: '_blank', rel: 'noopener noreferrer' };
    if (e.type === 'image') {
      return el('a', { class: 'image-embed', ...out }, embedImage(e.image, 'ie-img'));
    }
    const large = e.image?.large;
    return el('div', { class: `link-embed${e.image && !large ? ' has-thumb' : ''}`, style: e.color ? `--embed-color:${e.color}` : '' },
      el('div', { class: 'le-main' },
        e.siteName ? el('div', { class: 'le-site' }, e.siteName) : null,
        e.title ? el('a', { class: 'le-title', ...out }, e.title) : null,
        e.description ? el('div', { class: 'le-desc' }, e.description) : null),
      e.image && !large ? el('a', { class: 'le-thumb-wrap', ...out, tabindex: '-1' }, embedImage(e.image, 'le-thumb')) : null,
      large ? el('a', { class: 'le-image', ...out, tabindex: '-1' }, embedImage(e.image, 'le-img')) : null);
  }

  const INVITE_RE = new RegExp(`https?://${location.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/invite/([A-Za-z0-9-]+)`, 'g');
  const inviteCache = new Map();

  function fetchInvite(code) {
    if (!inviteCache.has(code)) {
      const entry = { data: undefined };
      entry.promise = api('GET', `/api/invites/${encodeURIComponent(code)}`)
        .then((r) => r.invite).catch(() => null)
        .then((data) => { entry.data = data; return data; });
      inviteCache.set(code, entry);
    }
    return inviteCache.get(code);
  }

  function inviteEmbeds(content) {
    const codes = [...new Set([...content.matchAll(INVITE_RE)].map((x) => x[1]))].slice(0, 3);
    return codes.length ? el('div', { class: 'invite-embeds' }, codes.map(inviteCard)) : null;
  }

  function inviteCard(code) {
    const entry = fetchInvite(code);
    if (entry.data !== undefined) return entry.data ? inviteCardBody(code, entry.data) : invalidInviteCard();
    const card = el('div', { class: 'invite-card loading', 'aria-busy': 'true' },
      el('div', { class: 'ic-title' }, 'Bir sunucuya katılmaya davet edildin'),
      el('div', { class: 'ic-body' },
        el('div', { class: 'ic-icon skeleton' }),
        el('div', { class: 'ic-info' }, el('div', { class: 'ic-line skeleton' }), el('div', { class: 'ic-line short skeleton' }))));
    entry.promise.then((data) => card.replaceWith(data ? inviteCardBody(code, data) : invalidInviteCard()));
    return card;
  }

  function inviteCardBody(code, invite) {
    const s = invite.server;
    const joined = invite.isMember || state.servers.some((x) => x.id === s.id);
    const btn = el('button', { class: `ic-join${joined ? ' joined' : ''}`, type: 'button' }, joined ? 'Katıldın' : 'Katıl');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (joined) return go(`/channels/${s.id}`);
      btn.disabled = true;
      try {
        const { server } = await api('POST', '/api/servers/join', { code });
        invite.isMember = true;
        addServerLocally(server);
        go(`/channels/${server.id}`);
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
    });
    return el('div', { class: 'invite-card' },
      el('div', { class: 'ic-title' }, joined ? 'Bir sunucuya davet edildin' : 'Bir sunucuya katılmaya davet edildin'),
      el('div', { class: 'ic-body' },
        serverIconFill(el('div', { class: 'ic-icon' }), s),
        el('div', { class: 'ic-info' },
          el('div', { class: 'ic-name' }, s.verified ? verifiedMark() : null, el('span', {}, s.name)),
          el('div', { class: 'ic-counts' },
            el('span', {}, el('i', { class: 'dot online' }), `${invite.onlineCount} Çevrimiçi`),
            el('span', {}, el('i', { class: 'dot invisible' }), `${invite.memberCount} Üye`))),
        btn));
  }

  function invalidInviteCard() {
    return el('div', { class: 'invite-card invalid' },
      el('div', { class: 'ic-title' }, 'Bir sunucuya katılmaya davet edildin'),
      el('div', { class: 'ic-body' },
        el('div', { class: 'ic-icon' }, icon('x')),
        el('div', { class: 'ic-info' },
          el('div', { class: 'ic-name' }, el('span', {}, 'Geçersiz Davet')),
          el('div', { class: 'ic-counts' }, 'Yeni bir davet göndermeyi dene!'))));
  }

  const UUID_SRC = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const USER_ID_SRC = '\\d{17,20}';
  const TOKEN_RE = new RegExp(`<@(${USER_ID_SRC})>|<@&(${UUID_SRC})>|<(a?):(\\w{2,32}):(${UUID_SRC})>|@everyone|@here|https?:\\/\\/[^\\s<]+`, 'g');

  function serverOfChannel(channelId) {
    return Object.values(state.details).find((s) => s.channels.some((c) => c.id === channelId)) || null;
  }

  function findRole(roleId) {
    for (const s of Object.values(state.details)) {
      const r = s.roles?.find((x) => x.id === roleId);
      if (r) return r;
    }
    return null;
  }

  function userLabel(id) {
    return knownUser(id)?.displayName || 'bilinmeyen-kullanıcı';
  }

  function mentionText(text) {
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(TOKEN_RE)) {
      frag.append(text.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[1]) {
        const id = m[1];
        frag.append(el('span', {
          class: 'mention',
          role: 'button',
          dataset: { userId: id },
          onclick: (e) => { e.stopPropagation(); showProfilePopout(id, e.currentTarget); },
        }, `@${userLabel(id)}`));
      } else if (m[2]) {
        const role = findRole(m[2]);
        frag.append(el('span', {
          class: 'mention role',
          style: role?.color ? `--mc:${role.color}` : '',
        }, `@${role?.name || 'silinmiş-rol'}`));
      } else if (m[5]) {
        frag.append(customEmojiImg({ id: m[5], name: m[4], animated: !!m[3] }));
      } else if (m[0] === '@everyone' || m[0] === '@here') {
        frag.append(el('span', { class: 'mention' }, m[0]));
      } else {
        frag.append(el('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer' }, m[0]));
      }
    }
    frag.append(text.slice(last));
    return frag;
  }

  const EMOJI_CATS = window.EMOJI_DATA || [];
  const UNICODE_BY_CODE = new Map();
  EMOJI_CATS.forEach((c) => c.emojis.forEach(([char, code]) => UNICODE_BY_CODE.set(code, char)));

  const emojiToken = (e) => `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;

  function customEmojiImg(e, cls = 'emoji') {
    const img = el('img', {
      class: cls,
      src: `/emojis/${e.id}`,
      alt: `:${e.name}:`,
      draggable: 'false',
      dataset: { tip: `:${e.name}:` },
    });
    img.addEventListener('error', () => img.replaceWith(`:${e.name}:`), { once: true });
    return img;
  }

  function emojiServers() {
    const list = state.servers.map((s) => ({ server: s, emojis: state.details[s.id]?.emojis || s.emojis || [] }))
      .filter((g) => g.emojis.length);
    return list.sort((a, b) => (b.server.id === state.serverId) - (a.server.id === state.serverId));
  }

  function resolveShortcodes(text) {
    const groups = emojiServers();
    const lookup = (code) => {
      const lower = code.toLowerCase();
      const find = (g) => g?.emojis.find((e) => e.name.toLowerCase() === lower);
      const here = find(groups.find((g) => g.server.id === state.serverId));
      if (here) return emojiToken(here);
      if (UNICODE_BY_CODE.has(lower)) return UNICODE_BY_CODE.get(lower);
      const other = groups.map(find).find(Boolean);
      return other ? emojiToken(other) : null;
    };
    let out = '';
    let i = 0;
    while (i < text.length) {
      const rest = text.slice(i);
      const token = /^<a?:\w{2,32}:[\w-]+>/.exec(rest);
      if (token) { out += token[0]; i += token[0].length; continue; }
      const m = /^:([\w+-]{2,32}):/.exec(rest);
      const emoji = m && lookup(m[1]);
      if (emoji) { out += emoji; i += m[0].length; continue; }
      out += text[i];
      i += 1;
    }
    return out;
  }

  const segmenter = new Intl.Segmenter('tr', { granularity: 'grapheme' });
  function isJumbo(text) {
    let count = 0;
    const rest = text.replace(new RegExp(`<a?:\\w{2,32}:${UUID_SRC}>`, 'g'), () => { count++; return ''; }).replace(/\s+/g, '');
    for (const { segment } of segmenter.segment(rest)) {
      if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(segment)) return false;
      count++;
    }
    return count > 0 && count <= 27;
  }

  const RECENT_KEY = 'cydlone:recent-emojis';
  const recentEmojis = () => { try { return JSON.parse(store.get(RECENT_KEY) || '[]'); } catch { return []; } };
  function rememberEmoji(item) {
    const key = item.custom ? `c:${item.custom.id}` : item.char;
    store.set(RECENT_KEY, JSON.stringify([key, ...recentEmojis().filter((k) => k !== key)].slice(0, 24)));
  }

  function allEmojiItems() {
    const custom = emojiServers().flatMap((g) => g.emojis.map((e) => ({ custom: e, server: g.server, code: e.name })));
    const unicode = EMOJI_CATS.flatMap((c) => c.emojis.map(([char, code, keywords]) => ({ char, code, keywords })));
    return { custom, unicode };
  }

  let picker = null;

  function closeEmojiPicker() {
    picker?.remove();
    picker = null;
    $('#emoji-btn').classList.remove('active');
  }

  function openEmojiPicker(anchor, onPick) {
    if (picker) return closeEmojiPicker();
    closeMentionPopup();
    const { custom, unicode } = allEmojiItems();
    const byCustomId = new Map(custom.map((it) => [it.custom.id, it]));
    const byChar = new Map(unicode.map((it) => [it.char, it]));
    const recent = recentEmojis().map((k) => (k.startsWith('c:') ? byCustomId.get(k.slice(2)) : byChar.get(k))).filter(Boolean);

    const search = el('input', { class: 'ep-search', type: 'search', placeholder: 'Emoji ara', 'aria-label': 'Emoji ara', autocomplete: 'off' });
    const grid = el('div', { class: 'ep-grid' });
    const nav = el('div', { class: 'ep-nav' });
    const previewIcon = el('span', { class: 'ep-preview-icon' });
    const previewName = el('span', { class: 'ep-preview-name' });
    const preview = el('div', { class: 'ep-preview' }, previewIcon, previewName);

    const showPreview = (it) => {
      previewIcon.replaceChildren(it.custom ? customEmojiImg(it.custom, 'ep-img') : it.char);
      previewName.textContent = `:${it.code}:`;
    };
    const pick = (it, e) => {
      rememberEmoji(it);
      onPick(it);
      if (!e?.shiftKey) closeEmojiPicker();
    };
    const cell = (it) => el('button', {
      class: 'ep-emoji',
      type: 'button',
      'aria-label': `:${it.code}:`,
      onclick: (e) => pick(it, e),
      onmouseenter: () => showPreview(it),
      onfocus: () => showPreview(it),
    }, it.custom ? customEmojiImg(it.custom, 'ep-img') : it.char);

    const sections = [];
    if (recent.length) sections.push({ id: 'recent', title: 'Sık Kullanılanlar', icon: icon('clock'), items: recent });
    emojiServers().forEach((g) => sections.push({
      id: `s-${g.server.id}`,
      title: g.server.name,
      icon: serverIconFill(el('span', { class: 'ep-server-icon' }), g.server),
      items: g.emojis.map((e) => byCustomId.get(e.id)),
    }));
    EMOJI_CATS.forEach((c) => sections.push({ id: c.id, title: c.name, icon: c.icon, items: c.emojis.map(([char]) => byChar.get(char)) }));

    const renderSections = () => {
      grid.replaceChildren(...sections.map((s) => el('section', { class: 'ep-section', dataset: { section: s.id } },
        el('h3', {}, s.title),
        el('div', { class: 'ep-cells' }, s.items.map(cell)))));
    };
    nav.append(...sections.map((s) => el('button', {
      class: 'ep-nav-btn',
      type: 'button',
      'aria-label': s.title,
      dataset: { tip: s.title, section: s.id },
      onclick: () => {
        search.value = '';
        renderSections();
        grid.querySelector(`[data-section="${s.id}"]`)?.scrollIntoView({ block: 'start' });
      },
    }, s.icon)));

    search.addEventListener('input', () => {
      const q = search.value.trim().toLocaleLowerCase('tr-TR');
      if (!q) return renderSections();
      const match = (it) => it.code.toLowerCase().includes(q) || it.keywords?.includes(q);
      const found = [...custom, ...unicode].filter(match).slice(0, 120);
      grid.replaceChildren(found.length
        ? el('section', { class: 'ep-section' }, el('h3', {}, `"${search.value.trim()}" için sonuçlar`), el('div', { class: 'ep-cells' }, found.map(cell)))
        : el('div', { class: 'ep-empty' }, 'Böyle bir emoji bulamadık.'));
      if (found[0]) showPreview(found[0]);
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeEmojiPicker(); input.focus(); }
      if (e.key === 'Enter') { e.preventDefault(); grid.querySelector('.ep-emoji')?.click(); }
    });

    renderSections();
    const first = sections[0]?.items[0];
    if (first) showPreview(first);
    picker = el('div', { class: 'emoji-picker', role: 'dialog', 'aria-label': 'Emoji seçici', onclick: (e) => e.stopPropagation() },
      el('div', { class: 'ep-head' }, search),
      el('div', { class: 'ep-body' }, nav, grid),
      preview);
    document.body.append(picker);
    const r = anchor.getBoundingClientRect();
    Object.assign(picker.style, {
      right: `${Math.max(8, window.innerWidth - r.right)}px`,
      bottom: `${window.innerHeight - r.top + 8}px`,
    });
    $('#emoji-btn').classList.add('active');
    setTimeout(() => search.focus(), 0);
  }

  document.addEventListener('click', (e) => { if (picker && !e.target.closest('#emoji-btn')) closeEmojiPicker(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && picker) closeEmojiPicker(); });

  function insertEmoji(area, it) {
    if (area.disabled) return;
    const text = it.custom ? `:${it.custom.name}:` : it.char;
    if (it.custom) mapFor(area)?.set(text, emojiToken(it.custom));
    const start = area.selectionStart, end = area.selectionEnd;
    const before = area.value.slice(0, start);
    const pad = it.custom && before && !/\s$/.test(before) ? ' ' : '';
    const after = it.custom ? ' ' : '';
    area.value = `${before}${pad}${text}${after}${area.value.slice(end)}`;
    const caret = before.length + pad.length + text.length + after.length;
    area.focus();
    area.setSelectionRange(caret, caret);
    area.dispatchEvent(new Event('input'));
  }

  $('#emoji-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (input.disabled) return;
    openEmojiPicker(e.currentTarget, (it) => insertEmoji(input, it));
  });

  function emojiCandidates(q) {
    const { custom, unicode } = allEmojiItems();
    const score = (it) => (it.code.toLowerCase().startsWith(q) ? 0 : 1);
    const matches = (list) => list.filter((it) => it.code.toLowerCase().includes(q) || it.keywords?.includes(q))
      .sort((a, b) => score(a) - score(b));
    return [...matches(custom).slice(0, 5), ...matches(unicode)].slice(0, 10).map((it) => ({ type: 'emoji', ...it, label: `:${it.code}:` }));
  }

  function plainText(text) {
    return text
      .replace(new RegExp(`<@(${USER_ID_SRC})>`, 'g'), (_, id) => `@${userLabel(id)}`)
      .replace(new RegExp(`<@&(${UUID_SRC})>`, 'g'), (_, id) => `@${findRole(id)?.name || 'silinmiş-rol'}`)
      .replace(new RegExp(`<a?:(\\w{2,32}):${UUID_SRC}>`, 'g'), ':$1:');
  }

  const repliesToMe = (m) => m.authorId !== me.id && m.referenced?.authorId === me.id;

  function mentionsMe(m) {
    const x = m.mentions;
    if (!x) return false;
    if (x.users?.includes(me.id) || x.everyone) return true;
    if (x.here && me.status !== 'invisible') return true;
    const mine = new Set(memberOf(serverOfChannel(m.channelId), me.id)?.roles || []);
    return (x.roles || []).some((r) => mine.has(r));
  }

  function tokensToText(content) {
    const map = new Map();
    const text = content
      .replace(new RegExp(`<@(${USER_ID_SRC})>`, 'g'), (tok, id) => { const d = `@${userLabel(id)}`; map.set(d, tok); return d; })
      .replace(new RegExp(`<@&(${UUID_SRC})>`, 'g'), (tok, id) => { const d = `@${findRole(id)?.name || 'silinmiş-rol'}`; map.set(d, tok); return d; })
      .replace(new RegExp(`<a?:(\\w{2,32}):${UUID_SRC}>`, 'g'), (tok, name) => { const d = `:${name}:`; map.set(d, tok); return d; });
    return { text, map };
  }

  function textToTokens(text, map) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
    return codeParts(text).map((p) => {
      if (p.code) return p.raw;
      let t = p.text;
      entries.forEach(([display, token]) => {
        t = t.replace(new RegExp(`${esc(display)}(?![\\p{L}\\p{N}_])`, 'gu'), token);
      });
      return resolveShortcodes(t);
    }).join('');
  }

  const mentionPopup = $('#mention-popup');
  const composerMap = new Map();
  let mentionState = null;

  const mapFor = (area) => (area === input ? composerMap : editing?.map);

  function mentionCandidates(q) {
    const server = current();
    if (!server) return [];
    const match = (s) => s.toLocaleLowerCase('tr-TR').includes(q);
    const users = server.members
      .filter((u) => !q || match(u.displayName) || match(u.username))
      .sort((a, b) => (a.displayName.toLocaleLowerCase('tr-TR').startsWith(q) ? -1 : 0) - (b.displayName.toLocaleLowerCase('tr-TR').startsWith(q) ? -1 : 0))
      .slice(0, 6)
      .map((u) => ({ type: 'user', id: u.id, label: u.displayName, sub: tagOf(u), user: u, color: roleColor(server, u.id) }));
    const everyonePerm = canIn(currentChannel(), 'MENTION_EVERYONE');
    const roles = server.roles
      .filter((r) => !r.isEveryone && (r.mentionable || everyonePerm) && (!q || match(r.name)))
      .slice(0, 4)
      .map((r) => ({ type: 'role', id: r.id, label: r.name, sub: 'Rol', color: r.color }));
    const special = everyonePerm
      ? [['everyone', 'Kanaldaki herkese bildirim gönderir.'], ['here', 'Sadece çevrimiçi olanlara bildirim gönderir.']]
        .filter(([k]) => k.startsWith(q))
        .map(([k, sub]) => ({ type: 'special', id: k, label: k, sub }))
      : [];
    return [...users, ...roles, ...special].slice(0, 10);
  }

  function onMentionInput(area) {
    const pos = area.selectionStart;
    const sm = area === input && state.view === 'server' && !slash
      ? /^\/([\p{Ll}\p{N}_-]{0,32})$/u.exec(area.value.slice(0, pos)) : null;
    if (sm && !area.value.includes('\n')) return showCommandPopup(area, sm[1].toLocaleLowerCase('tr-TR'));
    const em = /(^|[\s(]):([\w+-]{2,32})$/.exec(area.value.slice(0, pos));
    if (em && !inOpenCodeBlock(area)) {
      const items = emojiCandidates(em[2].toLowerCase());
      if (!items.length) return closeMentionPopup();
      mentionState = { area, start: pos - em[2].length - 1, end: pos, items, index: 0, emoji: true };
      return renderMentionPopup();
    }
    if (state.view !== 'server') return closeMentionPopup();
    const m = /(^|\s)@([^\s@]{0,32})$/.exec(area.value.slice(0, pos));
    if (!m) return closeMentionPopup();
    const items = mentionCandidates(m[2].toLocaleLowerCase('tr-TR'));
    if (!items.length) return closeMentionPopup();
    mentionState = { area, start: pos - m[2].length - 1, end: pos, items, index: 0 };
    renderMentionPopup();
  }

  function renderMentionPopup() {
    const { area, items, index } = mentionState;
    mentionPopup.replaceChildren(
      el('div', { class: 'mp-title' }, mentionState.title || (mentionState.emoji ? 'Emojiler' : 'Bahsedilecekler')),
      ...items.map((it, i) => el('div', {
        class: `mp-item${i === index ? ' active' : ''}`,
        role: 'option',
        'aria-selected': i === index ? 'true' : 'false',
        onmousedown: (e) => { e.preventDefault(); insertMention(it); },
        onmouseenter: (e) => {
          mentionState.index = i;
          mentionPopup.querySelectorAll('.mp-item').forEach((n) => {
            const on = n === e.currentTarget;
            n.classList.toggle('active', on);
            n.setAttribute('aria-selected', on ? 'true' : 'false');
          });
        },
      },
      it.type === 'user' ? avatar(it.user, { status: false })
        : it.type === 'emoji' ? el('span', { class: 'mp-emoji' }, it.custom ? customEmojiImg(it.custom, 'ep-img') : it.char)
          : it.type === 'command' ? avatar(it.command.bot, { status: false })
            : el('span', { class: 'mp-icon', style: it.color ? `color:${it.color}` : '' }, '@'),
      el('span', { class: 'mp-label', style: it.color ? `color:${it.color}` : '' }, it.type === 'special' ? `@${it.label}` : it.label),
      el('span', { class: 'mp-sub' }, it.type === 'emoji' ? (it.server?.name || '') : it.sub))),
    );
    const r = area.closest('.composer-box, .msg-editor').getBoundingClientRect();
    Object.assign(mentionPopup.style, {
      left: `${r.left}px`,
      width: `${r.width}px`,
      bottom: `${window.innerHeight - r.top + 8}px`,
    });
    mentionPopup.classList.remove('hidden');
  }

  function closeMentionPopup() {
    mentionState = null;
    mentionPopup.classList.add('hidden');
  }

  function insertMention(item) {
    const area = mentionState?.area || input;
    if (area.disabled) return;
    if (item.type === 'command') {
      closeMentionPopup();
      return startSlash(item.command);
    }
    if (item.type === 'emoji') {
      area.value = area.value.slice(0, mentionState.start) + area.value.slice(mentionState.end);
      area.setSelectionRange(mentionState.start, mentionState.start);
      closeMentionPopup();
      rememberEmoji(item);
      return insertEmoji(area, item);
    }
    const display = `@${item.label}`;
    if (item.type === 'user') mapFor(area)?.set(display, `<@${item.id}>`);
    if (item.type === 'role') mapFor(area)?.set(display, `<@&${item.id}>`);
    const start = mentionState ? mentionState.start : area.selectionStart;
    const end = mentionState ? mentionState.end : area.selectionEnd;
    const before = area.value.slice(0, start);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    area.value = `${before}${pad}${display} ${area.value.slice(end)}`;
    const caret = before.length + pad.length + display.length + 1;
    closeMentionPopup();
    area.focus();
    area.setSelectionRange(caret, caret);
    area.dispatchEvent(new Event('input'));
  }

  function mentionKeydown(e) {
    if (!mentionState) return;
    const n = mentionState.items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      mentionState.index = (mentionState.index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      renderMentionPopup();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      insertMention(mentionState.items[mentionState.index]);
    } else if (e.key === 'Escape') {
      closeMentionPopup();
    } else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function bindMentionInput(area) {
    area.addEventListener('keydown', mentionKeydown, true);
    area.addEventListener('input', () => onMentionInput(area));
    area.addEventListener('click', () => onMentionInput(area));
    area.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== area) closeMentionPopup(); }, 100));
  }

  let editing = null;

  const canEdit = (m) => m.authorId === me.id;
  const canDelete = (m) => m.authorId === me.id || (state.view === 'server' && canIn(currentChannel(), 'MANAGE_MESSAGES'));

  function messageTools(m) {
    if (m.ephemeral || m.thinking) return null;
    if (!canReply() && !canEdit(m) && !canDelete(m)) return null;
    const btn = (ic, tip, onclick, cls = '') => el('button', {
      class: `icon-btn ${cls}`,
      'aria-label': tip,
      dataset: { tip },
      onclick: (e) => { e.stopPropagation(); onclick(e); },
    }, icon(ic));
    return el('div', { class: 'msg-tools' },
      canReply() ? btn('reply', 'Yanıtla', () => startReply(m)) : null,
      canEdit(m) ? btn('edit', 'Düzenle', () => startEdit(m.id)) : null,
      canDelete(m) ? btn('trash', 'Sil', (e) => (e.shiftKey ? deleteMessage(m) : confirmDeleteMessage(m)), 'danger') : null);
  }

  function messageEditor(m) {
    const area = el('textarea', { class: 'edit-input', maxlength: '2000', rows: '1' });
    area.value = editing.draft;
    bindMentionInput(area);
    const fit = () => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; };
    area.addEventListener('input', () => { editing.draft = area.value; fit(); });
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEdit(); }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !inOpenCodeBlock(area)) { e.preventDefault(); saveEdit(); }
    });
    area.fit = fit;
    const link = (text, onclick) => el('button', { class: 'link-btn', type: 'button', onclick }, text);
    return el('div', { class: 'msg-editor' },
      area,
      el('div', { class: 'edit-hint' }, 'ESC ile ', link('iptal et', cancelEdit), ' • Enter ile ', link('kaydet', saveEdit)));
  }

  let replying = null;

  const canReply = () => !input.disabled && !$('#blocked-note');

  function startReply(m) {
    if (!canReply()) return;
    if (editing) { editing = null; rerenderMessages(); }
    replying = { message: m, mention: m.authorId !== me.id };
    renderReplyBar();
    markReplyTarget();
    input.focus();
  }

  function cancelReply() {
    if (!replying) return;
    replying = null;
    renderReplyBar();
    markReplyTarget();
  }

  function markReplyTarget() {
    messagesEl.querySelectorAll('.msg.reply-target').forEach((x) => x.classList.remove('reply-target'));
    if (replying) messagesEl.querySelector(`.msg[data-id="${replying.message.id}"]`)?.classList.add('reply-target');
  }

  function renderReplyBar() {
    $('#reply-bar')?.remove();
    composer.classList.toggle('replying', !!replying);
    if (!replying) return;
    const m = replying.message;
    const author = m.author || { displayName: 'Silinmiş Kullanıcı' };
    const color = state.view === 'server' && author.id ? roleColor(current(), author.id) : null;
    const canMention = state.view === 'server' && m.authorId !== me.id;
    composer.querySelector('.composer-box').before(el('div', { class: 'reply-bar', id: 'reply-bar' },
      el('span', { class: 'rb-text' },
        el('b', { style: color ? `color:${color}` : '' }, author.displayName), ' kişisine yanıt veriliyor'),
      canMention ? el('button', {
        class: `reply-mention${replying.mention ? ' on' : ''}`,
        type: 'button',
        'aria-pressed': String(replying.mention),
        dataset: { tip: replying.mention ? 'Bahsetme açık: yanıtladığın kişiye bildirim gider' : 'Bahsetme kapalı' },
        onclick: () => { replying.mention = !replying.mention; renderReplyBar(); input.focus(); },
      }, '@ ', replying.mention ? 'AÇIK' : 'KAPALI') : null,
      el('button', {
        class: 'icon-btn reply-close',
        type: 'button',
        'aria-label': 'Yanıtı iptal et',
        dataset: { tip: 'Yanıtı iptal et' },
        onclick: () => { cancelReply(); input.focus(); },
      }, icon('x'))));
  }

  function rerenderMessages() {
    const top = messagesEl.scrollTop;
    const atBottom = nearBottom();
    renderMessages();
    if (!atBottom) messagesEl.scrollTop = top;
    if (editing) focusEditor();
  }

  function startEdit(id) {
    const m = (state.messages[state.convId] || []).find((x) => x.id === id);
    if (!m || !canEdit(m)) return;
    const { text, map } = tokensToText(m.content);
    editing = { id, draft: text, map };
    rerenderMessages();
    messagesEl.querySelector(`.msg[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function focusEditor() {
    const area = messagesEl.querySelector('.edit-input');
    if (!area) return;
    area.fit();
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }

  function cancelEdit() {
    editing = null;
    rerenderMessages();
    input.focus();
  }

  async function saveEdit() {
    const { id, draft } = editing;
    const content = textToTokens(draft.trim(), editing.map);
    const m = (state.messages[state.convId] || []).find((x) => x.id === id);
    if (!m) return cancelEdit();
    if (!content && !m.attachments?.length) return confirmDeleteMessage(m);
    if (content === m.content) return cancelEdit();
    try {
      const { message } = await api('PATCH', `/api/messages/${id}`, { content });
      editing = null;
      applyMessageUpdate(message);
      rerenderMessages();
      input.focus();
    } catch (err) {
      toast(err.message);
    }
  }

  function confirmDeleteMessage(m) {
    const preview = el('div', { class: 'delete-preview' },
      avatar(m.author, { status: false }),
      el('div', {},
        el('div', { class: 'msg-head' },
          el('span', { class: 'msg-author' }, m.author?.displayName || 'Silinmiş Kullanıcı'),
          el('span', { class: 'msg-time' }, stampText(m.createdAt))),
        contentNode(m)));
    const btn = el('button', { class: 'btn-purple btn-danger', type: 'submit' }, 'Sil');
    const form = el('form', {},
      el('div', { class: 'modal-head left' },
        el('h2', {}, 'Mesajı Sil'),
        el('p', {}, 'Bu mesajı silmek istediğine emin misin?')),
      el('div', { class: 'modal-body' }, preview,
        el('p', { class: 'hint' }, el('b', { style: 'color:var(--success)' }, 'İPUCU: '), 'Shift tuşuna basılı tutarak Sil\'e tıklarsan bu onayı atlarsın.')),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn-ghost', type: 'button', onclick: closeModal }, 'İptal'), btn));
    submitHandler(form, null, btn, async () => {
      await deleteMessage(m);
      closeModal();
    });
    openModal(form);
  }

  async function deleteMessage(m) {
    try {
      await api('DELETE', `/api/messages/${m.id}`);
      removeMessage(m.channelId, m.id);
    } catch (err) {
      toast(err.message);
    }
  }

  function applyMessageUpdate(message) {
    const list = state.messages[message.channelId];
    const i = list?.findIndex((x) => x.id === message.id) ?? -1;
    if (i < 0) return;
    list[i] = message;
    if (replying?.message.id === message.id) replying.message = message;
    const replies = list.filter((x) => x.replyTo === message.id && x.referenced);
    replies.forEach((x) => { x.referenced = { ...x.referenced, content: message.content }; });
    if (message.channelId !== state.convId) return;
    if (replies.length && !editing) return rerenderMessages();
    if (editing?.id === message.id) return;
    const contentEl = messagesEl.querySelector(`.msg[data-id="${message.id}"] .msg-content`);
    contentEl?.replaceWith(contentNode(message));
  }

  function removeMessage(channelId, id) {
    const list = state.messages[channelId];
    if (!list || !list.some((x) => x.id === id)) return;
    state.messages[channelId] = list.filter((x) => x.id !== id);
    state.messages[channelId].forEach((x) => { if (x.replyTo === id) x.referenced = null; });
    if (editing?.id === id) editing = null;
    if (replying?.message.id === id) { replying = null; renderReplyBar(); }
    if (channelId === state.convId) rerenderMessages();
  }

  function nearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(m) {
    const list = state.messages[m.channelId];
    if (!list || list.some((x) => x.id === m.id)) return;
    const prev = list[list.length - 1];
    list.push(m);
    if (m.channelId !== state.convId) return;
    const stick = nearBottom() || m.authorId === me.id;
    messagesEl.append(...messageNodes(m, prev));
    if (stick) scrollToBottom();
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  let lastTypingSent = 0;
  input.addEventListener('input', () => {
    autosize();
    store.set(`cydlone:draft:${state.convId}`, input.value);
    if (input.value.trim() && Date.now() - lastTypingSent > 3000) {
      lastTypingSent = Date.now();
      socket.emit('typing', { channelId: state.convId });
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && replying && !e.defaultPrevented) {
      e.preventDefault();
      cancelReply();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !inOpenCodeBlock(input)) {
      e.preventDefault();
      composer.requestSubmit();
    }
    if (e.key === 'ArrowUp' && !input.value) {
      const mine = (state.messages[state.convId] || []).filter((m) => m.authorId === me.id);
      if (mine.length) {
        e.preventDefault();
        startEdit(mine[mine.length - 1].id);
      }
    }
  });

  bindMentionInput(input);

  composer.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (slash) return sendSlash();
    const typed = input.value.trim();
    const content = textToTokens(typed, composerMap);
    const convId = state.convId;
    const url = convUrl();
    const batch = uploads.filter((u) => !u.sending);
    if ((!typed && !batch.length) || !convId || input.disabled) return;
    if (batch.some((u) => u.error)) return toast('Yüklenemeyen dosyaları kaldır.');
    input.value = '';
    autosize();
    closeMentionPopup();
    store.set(`cydlone:draft:${convId}`, '');
    lastTypingSent = 0;
    const reply = replying && replying.message.channelId === convId
      ? { replyTo: replying.message.id, mentionReply: replying.mention } : {};
    try {
      batch.forEach((u) => { u.sending = true; });
      renderUploads();
      const attachments = batch.length ? (await Promise.all(batch.map((u) => u.promise))).map((a) => a.id) : [];
      const { message } = await api('POST', url, { content, ...reply, ...(attachments.length ? { attachments } : {}) });
      composerMap.clear();
      dropUploads(batch);
      if (reply.replyTo && replying?.message.id === reply.replyTo) cancelReply();
      addMessage(message);
    } catch (err) {
      toast(err.message);
      batch.forEach((u) => { u.sending = false; });
      renderUploads();
      if (state.convId === convId && !input.value) { input.value = typed; autosize(); }
    }
  });

  const commandCache = new Map();
  function loadCommands(serverId) {
    const hit = commandCache.get(serverId);
    if (hit && Date.now() - hit.at < 30000) return hit.promise;
    const promise = api('GET', `/api/servers/${serverId}/commands`).then((r) => r.commands).catch(() => []);
    commandCache.set(serverId, { at: Date.now(), promise });
    return promise;
  }

  async function showCommandPopup(area, q) {
    const serverId = state.serverId;
    const commands = await loadCommands(serverId);
    if (state.serverId !== serverId || !area.value.startsWith(`/${q}`) || slash) return;
    const items = commands
      .filter((c) => c.name.includes(q))
      .sort((a, b) => (b.name.startsWith(q) - a.name.startsWith(q)) || a.name.localeCompare(b.name))
      .slice(0, 10)
      .map((c) => ({ type: 'command', command: c, label: `/${c.name}`, sub: `${c.description} — ${c.bot?.displayName || c.application.name}` }));
    if (!items.length) return closeMentionPopup();
    mentionState = { area, start: 0, end: area.selectionStart, items, index: 0, title: 'Komutlar' };
    renderMentionPopup();
  }

  let slash = null;

  function startSlash(command) {
    slash = { command, values: {} };
    input.value = '';
    autosize();
    renderSlashBar();
  }

  function cancelSlash() {
    slash = null;
    renderSlashBar();
    input.focus();
  }

  function optionItems(o, server) {
    const lower = (t) => t.toLocaleLowerCase('tr-TR');
    if (o.type === 'role') {
      return server.roles.filter((r) => !r.isEveryone).sort((a, b) => b.position - a.position).map((r) => ({
        value: r.id,
        label: `@${r.name}`,
        color: r.color,
        lead: el('span', { class: 'sci-dot', style: `background:${r.color || '#9a99ad'}` }),
        search: lower(r.name),
      }));
    }
    if (o.type === 'user') {
      return [...server.members].sort((a, b) => a.displayName.localeCompare(b.displayName, 'tr')).map((u) => ({
        value: u.id,
        label: u.displayName,
        sub: tagOf(u),
        lead: avatar(u, { status: false }),
        search: lower(`${u.displayName} ${u.username}`),
      }));
    }
    if (o.type === 'channel') {
      return visibleChannels(server).map((c) => ({
        value: c.id,
        label: `${c.type === 'text' ? '#' : ''}${c.name}`,
        lead: el('span', { class: 'sci-icon' }, icon(c.type === 'text' ? 'hash' : 'speaker')),
        search: lower(c.name),
      }));
    }
    if (o.type === 'boolean') {
      return [
        { value: true, label: 'Evet', lead: el('span', { class: 'sci-icon' }, icon('check')), search: 'evet true' },
        { value: false, label: 'Hayır', lead: el('span', { class: 'sci-icon' }, icon('x')), search: 'hayır hayir false' },
      ];
    }
    return null;
  }

  function comboControl(o, items, set) {
    const field = el('input', {
      class: 'sb-input sb-combo-input',
      type: 'text',
      placeholder: { role: 'rol ara', user: 'üye ara', channel: 'kanal ara', boolean: 'evet / hayır' }[o.type],
      autocomplete: 'off',
      spellcheck: 'false',
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-label': o.name,
    });
    const list = el('div', { class: 'sb-combo-list', role: 'listbox', hidden: true });
    const wrap = el('div', { class: 'sb-combo' }, field, list);
    let chosen = null;
    let shown = [];
    let active = 0;

    const paint = () => [...list.children].forEach((n, i) => n.classList.toggle('active', i === active));
    const close = () => { list.hidden = true; field.setAttribute('aria-expanded', 'false'); };
    const choose = (it) => {
      chosen = it;
      field.value = it.label;
      field.style.color = it.color || '';
      wrap.classList.add('has-value');
      set(it.value);
      close();
    };
    const open = () => {
      const typed = chosen && field.value === chosen.label ? '' : field.value;
      const q = typed.replace(/^[@#]/, '').toLocaleLowerCase('tr-TR').trim();
      shown = items.filter((it) => !q || it.search.includes(q))
        .sort((a, b) => (q ? b.search.startsWith(q) - a.search.startsWith(q) : 0))
        .slice(0, 50);
      active = Math.max(0, shown.indexOf(chosen));
      list.replaceChildren(...(shown.length
        ? shown.map((it, i) => el('div', {
          class: `sb-combo-item${i === active ? ' active' : ''}`,
          role: 'option',
          onmousedown: (e) => { e.preventDefault(); choose(it); },
          onmouseenter: () => { active = i; paint(); },
        }, it.lead, el('span', { class: 'sci-label', style: it.color ? `color:${it.color}` : '' }, it.label), it.sub ? el('span', { class: 'sci-sub' }, it.sub) : null))
        : [el('div', { class: 'sb-combo-empty' }, 'Eşleşen sonuç yok')]));
      list.hidden = false;
      field.setAttribute('aria-expanded', 'true');
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    };

    field.addEventListener('focus', open);
    field.addEventListener('click', open);
    field.addEventListener('input', () => {
      chosen = null;
      field.style.color = '';
      wrap.classList.remove('has-value');
      set('');
      open();
    });
    field.addEventListener('blur', () => setTimeout(() => {
      close();
      if (chosen || !field.value) return;
      const q = field.value.replace(/^[@#]/, '').toLocaleLowerCase('tr-TR').trim();
      const exact = items.filter((it) => it.search === q || it.search.split(' ')[0] === q);
      if (exact.length === 1) choose(exact[0]);
      else field.value = '';
    }, 120));
    field.addEventListener('keydown', (e) => {
      const isOpen = !list.hidden && shown.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) return open();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        paint();
        list.children[active]?.scrollIntoView({ block: 'nearest' });
      } else if ((e.key === 'Enter' || e.key === 'Tab') && isOpen && shown[active] !== chosen) {
        e.preventDefault();
        e.stopPropagation();
        choose(shown[active]);
        if (e.key === 'Tab') focusNextOption(wrap);
      } else if (e.key === 'Escape' && !list.hidden) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });
    return wrap;
  }

  function focusNextOption(from) {
    const fields = [...$('#slash-bar').querySelectorAll('.sb-input')];
    const i = fields.findIndex((f) => from.contains(f));
    (fields[i + 1] || $('#slash-bar .sb-send'))?.focus();
  }

  function optionField(o, server, hint) {
    const set = (v) => { if (v === '' || v === undefined) delete slash.values[o.name]; else slash.values[o.name] = v; };
    const items = optionItems(o, server);
    let control;
    if (items) {
      control = comboControl(o, items, set);
    } else {
      control = el('input', {
        class: 'sb-input',
        type: o.type === 'string' ? 'text' : 'number',
        step: o.type === 'integer' ? '1' : 'any',
        maxlength: '6000',
        placeholder: o.type === 'string' ? 'yaz' : 'sayı',
        spellcheck: 'false',
        'aria-label': o.name,
      });
      control.addEventListener('input', () => set(control.value));
    }
    control.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composer.requestSubmit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelSlash(); }
    });
    const field = el('label', { class: `sb-field${o.required ? ' required' : ''}` },
      el('span', { class: 'sb-label' }, o.name, o.required ? el('b', { 'aria-label': 'zorunlu' }, '*') : null, ':'),
      control);
    field.addEventListener('focusin', () => {
      hint.replaceChildren(el('b', {}, o.name), ` — ${o.description}`, o.required ? el('span', { class: 'sb-req' }, ' (zorunlu)') : '');
    });
    return field;
  }

  function renderSlashBar() {
    $('#slash-bar')?.remove();
    composer.classList.toggle('slash-mode', !!slash);
    if (!slash) return;
    const { command } = slash;
    const hint = el('div', { class: 'sb-hint' }, command.description);
    const fields = command.options.map((o) => optionField(o, current(), hint));
    const bar = el('div', { class: 'slash-bar', id: 'slash-bar' },
      el('div', { class: 'sb-row' },
        el('span', { class: 'sb-cmd' },
          command.bot ? avatar(command.bot, { status: false }) : null,
          `/${command.name}`),
        fields,
        el('span', { class: 'sb-spacer' }),
        el('button', { class: 'btn-purple sb-send', type: 'submit', dataset: { tip: 'Gönder (Enter)' } }, icon('send')),
        el('button', { class: 'icon-btn sb-close', type: 'button', 'aria-label': 'Komutu iptal et', dataset: { tip: 'İptal (Esc)' }, onclick: cancelSlash }, icon('x'))),
      el('div', { class: 'sb-foot' },
        hint,
        el('span', { class: 'sb-app' }, command.bot?.displayName || command.application.name)));
    composer.querySelector('.composer-box').before(bar);
    const first = bar.querySelector('.sb-input') || bar.querySelector('.sb-send');
    setTimeout(() => first?.focus(), 0);
    bar.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) cancelSlash(); });
  }

  async function sendSlash() {
    const { command, values } = slash;
    const missing = command.options.find((o) => o.required && values[o.name] === undefined);
    if (missing) {
      toast(`"${missing.name}" seçeneğini doldur.`);
      return [...$('#slash-bar').querySelectorAll('.sb-input')][command.options.indexOf(missing)]?.focus();
    }
    const channelId = state.convId;
    const sent = slash;
    slash = null;
    renderSlashBar();
    try {
      await api('POST', '/api/interactions', { commandId: command.id, channelId, options: values });
    } catch (err) {
      toast(err.message);
      if (state.convId === channelId) { slash = sent; renderSlashBar(); }
    }
  }

  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_FILES = 10;
  let uploads = [];

  function canAttach() {
    if (input.disabled || !state.convId) return false;
    if (state.view !== 'server') return true;
    const channel = currentChannel();
    return !!channel && canIn(channel, 'ATTACH_FILES');
  }

  function updateAttachButton() {
    $('#attach-btn').classList.toggle('hidden', !canAttach());
  }

  $('#attach-btn').addEventListener('click', () => {
    const picker = el('input', { type: 'file', multiple: true });
    picker.addEventListener('change', () => addFiles([...picker.files]));
    picker.click();
  });

  async function imageSize(file) {
    if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(file.type)) return null;
    try {
      const bmp = await createImageBitmap(file);
      const size = { width: bmp.width, height: bmp.height };
      bmp.close();
      return size;
    } catch { return null; }
  }

  function addFiles(files) {
    if (!files.length) return;
    if (!canAttach()) return toast('Burada dosya gönderme iznin yok.');
    for (const file of files) {
      if (uploads.length >= MAX_FILES) { toast(`Bir mesajda en fazla ${MAX_FILES} dosya gönderebilirsin.`); break; }
      if (file.size > MAX_FILE_BYTES) { toast(`${file.name} çok büyük. Dosyalar en fazla 25 MB olabilir.`); continue; }
      if (!file.size) { toast(`${file.name} boş bir dosya.`); continue; }
      const u = {
        key: crypto.randomUUID(),
        file,
        name: file.name || 'dosya',
        preview: /^image\//.test(file.type) ? URL.createObjectURL(file) : null,
        progress: 0,
        attachment: null,
        error: null,
        sending: false,
      };
      u.promise = upload(u);
      u.promise.catch(() => {});
      uploads.push(u);
    }
    renderUploads();
    input.focus();
  }

  async function upload(u) {
    const size = await imageSize(u.file);
    try {
      u.attachment = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        u.xhr = xhr;
        xhr.open('POST', '/api/attachments');
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('X-File-Name', encodeURIComponent(u.name));
        xhr.setRequestHeader('X-File-Type', u.file.type || 'application/octet-stream');
        if (size) { xhr.setRequestHeader('X-Width', size.width); xhr.setRequestHeader('X-Height', size.height); }
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) { u.progress = e.loaded / e.total; paintProgress(u); } };
        xhr.onload = () => {
          let data = {};
          try { data = JSON.parse(xhr.responseText); } catch {  }
          if (xhr.status === 201) resolve(data.attachment);
          else reject(new Error(data.error || 'Dosya yüklenemedi.'));
        };
        xhr.onerror = () => reject(new Error('Dosya yüklenemedi.'));
        xhr.onabort = () => reject(Object.assign(new Error('İptal edildi.'), { aborted: true }));
        xhr.send(u.file);
      });
      u.progress = 1;
      renderUploads();
      return u.attachment;
    } catch (err) {
      if (!err.aborted) { u.error = err.message; renderUploads(); }
      throw err;
    }
  }

  function paintProgress(u) {
    const bar = $(`#upload-tray [data-key="${u.key}"] .ut-progress i`);
    if (bar) bar.style.width = `${Math.round(u.progress * 100)}%`;
  }

  function removeUpload(u) {
    u.xhr?.abort();
    if (u.attachment && !u.sending) api('DELETE', `/api/attachments/${u.attachment.id}`).catch(() => {});
    dropUploads([u]);
  }

  function dropUploads(list) {
    list.forEach((u) => { if (u.preview) URL.revokeObjectURL(u.preview); });
    uploads = uploads.filter((u) => !list.includes(u));
    renderUploads();
  }

  function clearUploads() {
    uploads.filter((u) => !u.sending).forEach(removeUpload);
    uploads = [];
    renderUploads();
  }

  function renderUploads() {
    let tray = $('#upload-tray');
    composer.classList.toggle('has-uploads', uploads.length > 0);
    if (!uploads.length) return tray?.remove();
    if (!tray) {
      tray = el('div', { class: 'upload-tray', id: 'upload-tray' });
      composer.querySelector('.composer-box').prepend(tray);
    }
    tray.replaceChildren(...uploads.map((u) => el('div', {
      class: `upload-tile${u.error ? ' failed' : ''}${u.sending ? ' sending' : ''}`,
      dataset: { key: u.key },
      title: u.name,
    },
    el('div', { class: 'ut-thumb' }, u.preview ? el('img', { src: u.preview, alt: '' }) : icon('file')),
    el('div', { class: 'ut-name' }, u.name),
    el('div', { class: 'ut-meta' }, u.error || formatSize(u.file.size)),
    !u.attachment && !u.error ? el('div', { class: 'ut-progress' }, el('i', { style: `width:${Math.round(u.progress * 100)}%` })) : null,
    u.sending ? null : el('button', {
      class: 'ut-remove',
      type: 'button',
      'aria-label': `${u.name} dosyasını kaldır`,
      dataset: { tip: 'Dosyayı Kaldır' },
      onclick: () => { removeUpload(u); input.focus(); },
    }, icon('x')))));
  }

  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  });

  const chatEl = composer.closest('.chat');
  const dropLayer = el('div', { class: 'drop-layer hidden' },
    el('div', { class: 'drop-card' },
      el('span', { class: 'drop-icon' }, icon('upload')),
      el('strong', {}, 'Dosya yükle'),
      el('span', { class: 'drop-to' })));
  chatEl.append(dropLayer);
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  chatEl.addEventListener('dragenter', (e) => {
    if (!hasFiles(e) || composer.classList.contains('hidden') || !canAttach()) return;
    e.preventDefault();
    dragDepth++;
    dropLayer.querySelector('.drop-to').textContent = state.view === 'dm'
      ? `@${currentDm()?.user.displayName} kişisine gönder`
      : `#${currentChannel()?.name} kanalına gönder`;
    dropLayer.classList.remove('hidden');
  });
  chatEl.addEventListener('dragover', (e) => { if (dragDepth) e.preventDefault(); });
  chatEl.addEventListener('dragleave', () => { if (dragDepth && --dragDepth === 0) dropLayer.classList.add('hidden'); });
  chatEl.addEventListener('drop', (e) => {
    if (!dragDepth) return;
    e.preventDefault();
    dragDepth = 0;
    dropLayer.classList.add('hidden');
    addFiles([...e.dataTransfer.files]);
  });

  function updateComposerPermission() {
    const channel = state.view === 'server' ? currentChannel() : null;
    const blocked = !!channel && channel.type === 'text' && !canIn(channel, 'SEND_MESSAGES');
    input.disabled = blocked;
    composer.classList.toggle('locked', blocked);
    if (blocked) input.placeholder = 'Bu kanala mesaj gönderme iznin yok.';
    else if (channel?.type === 'text') input.placeholder = `#${channel.name} kanalına mesaj gönder`;
    updateAttachButton();
  }

  const typingUsers = new Map();

  function renderTyping() {
    const names = [...typingUsers.values()].map((t) => t.name);
    const box = $('#typing');
    if (!names.length) return box.replaceChildren();
    const text = names.length > 3
      ? [el('span', {}, 'Birkaç kişi yazıyor...')]
      : [...names.flatMap((n, i) => [i ? (i === names.length - 1 ? ' ve ' : ', ') : '', el('b', {}, n)]), ' yazıyor...'];
    box.replaceChildren(el('span', { class: 'typing-dots' }, el('i'), el('i'), el('i')), el('span', {}, ...text));
  }

  function stopTyping(userId) {
    const t = typingUsers.get(userId);
    if (!t) return;
    clearTimeout(t.timer);
    typingUsers.delete(userId);
    renderTyping();
  }

  const socket = io();

  const voice = window.createVoice({ socket, onChange: onVoiceChange, onError: toast });
  const muteBtn = $('#mute-btn');
  const deafenBtn = $('#deafen-btn');
  muteBtn.addEventListener('click', () => voice.toggleMute());
  deafenBtn.addEventListener('click', () => voice.toggleDeafen());
  $('#vpn-leave').addEventListener('click', () => voice.leave());
  $('#vpn-camera').addEventListener('click', () => voice.toggleCamera());
  $('#vpn-screen').addEventListener('click', () => voice.toggleScreen());
  $('#vpn-noise').addEventListener('click', toggleNoise);
  $('#vpn-where').addEventListener('click', () => {
    const { serverId, channelId } = voice.state;
    if (channelId) go(`/channels/${serverId}/${channelId}`);
  });

  function toggleNoise() {
    const on = !voice.prefs.noiseSuppression;
    voice.setPref('noiseSuppression', on);
    toast(on ? 'Gürültü engelleme açık.' : 'Gürültü engelleme kapalı.');
  }

  function voiceParticipantsOf(serverId, channelId) {
    return state.details[serverId]?.voice?.[channelId] || [];
  }

  function voiceUser(p) {
    return knownUser(p.userId) || { id: p.userId, displayName: 'Bilinmeyen', username: '?' };
  }

  function voiceUserList(server, channelId) {
    const parts = voiceParticipantsOf(server.id, channelId);
    if (!parts.length) return null;
    return el('div', { class: 'voice-users' }, parts.map((p) => {
      const u = voiceUser(p);
      const av = avatar(u, { status: false });
      av.dataset.voiceId = p.socketId;
      av.classList.toggle('speaking', voice.isSpeaking(p.socketId));
      return el('div', {
        class: 'voice-user',
        dataset: { userId: u.id },
        role: 'button',
        tabindex: '0',
        onclick: (e) => { e.stopPropagation(); showProfilePopout(u.id, e.currentTarget); },
        onkeydown: (e) => { if (e.key === 'Enter') showProfilePopout(u.id, e.currentTarget); },
      },
        av,
        el('span', { class: 'vu-name' }, u.displayName),
        el('span', { class: 'vu-icons' },
          p.screen ? el('span', { class: 'live-pill' }, 'CANLI') : null,
          p.video ? icon('video') : null,
          p.deafened ? icon('deaf') : p.muted ? icon('mic-off') : null));
    }));
  }

  function renderVoiceControls() {
    const vs = voice.state;
    muteBtn.classList.toggle('off', vs.muted || vs.deafened);
    deafenBtn.classList.toggle('off', vs.deafened);
    muteBtn.dataset.tip = vs.muted || vs.deafened ? 'Sesi Aç' : 'Sesi Kapat';
    deafenBtn.dataset.tip = vs.deafened ? 'Sağırlaştırmayı Kaldır' : 'Sağırlaştır';

    const panel = $('#voice-panel');
    const active = vs.connecting || vs.channelId;
    panel.classList.toggle('hidden', !active);
    if (!active) return;
    const server = state.details[vs.serverId];
    const channel = server?.channels.find((c) => c.id === vs.channelId);
    $('#vpn-status').textContent = vs.connecting ? 'Bağlanıyor...' : 'Ses Bağlantısı Kuruldu';
    panel.classList.toggle('connecting', !!vs.connecting);
    $('#vpn-where').textContent = channel ? `${channel.name} / ${server.name}` : '';
    $('#vpn-noise').classList.toggle('active-accent', voice.prefs.noiseSuppression);
    $('#vpn-noise').dataset.tip = voice.prefs.noiseSuppression ? 'Gürültü Engelleme: Açık' : 'Gürültü Engelleme: Kapalı';
    $('#vpn-camera').classList.toggle('on', vs.video);
    $('#vpn-camera span').textContent = vs.video ? 'Kamerayı Kapat' : 'Kamera';
    $('#vpn-screen').classList.toggle('hidden', !voice.canShareScreen());
    $('#vpn-screen').classList.toggle('on', vs.screen);
    $('#vpn-screen span').textContent = vs.screen ? 'Durdur' : 'Ekran';
  }

  const tiles = new Map();
  let focusedTile = null;

  function renderVoiceView() {
    const channel = currentChannel();
    const box = $('#voice-placeholder');
    if (state.view !== 'server' || !channel || channel.type !== 'voice') return;
    const vs = voice.state;
    const parts = voiceParticipantsOf(state.serverId, channel.id);

    if (vs.channelId !== channel.id) {
      tiles.clear();
      box.replaceChildren(el('div', { class: 'vv-join' },
        el('div', { class: 'vp-icon' }, icon('speaker')),
        el('h2', {}, channel.name),
        el('p', {}, parts.length ? `Şu an kanalda ${parts.length} kişi var.` : 'Kanalda şu an kimse yok.'),
        parts.length ? el('div', { class: 'vv-faces' }, parts.slice(0, 8).map((p) => avatar(voiceUser(p), { status: false }))) : null,
        el('button', {
          class: 'btn-purple',
          disabled: vs.connecting,
          onclick: () => voice.join(channel.id, state.serverId),
        }, vs.connecting ? 'Bağlanıyor...' : 'Ses Kanalına Katıl')));
      return;
    }

    let grid = box.querySelector('.vv-grid');
    if (!grid) {
      grid = el('div', { class: 'vv-grid' });
      box.replaceChildren(grid, el('div', { class: 'vv-controls' }));
    }
    const ensureTile = (key, p, isScreen) => {
      let t = tiles.get(key);
      if (t) return t;
      const video = el('video', { autoplay: true, playsinline: true });
      video.muted = true;
      const avatarBox = el('div', { class: 'vt-avatar' });
      const label = el('div', { class: 'vt-label' });
      const full = el('button', {
        class: 'vt-full',
        type: 'button',
        'aria-label': 'Tam ekran',
        dataset: { tip: 'Tam ekran' },
        onclick: (e) => {
          e.stopPropagation();
          if (document.fullscreenElement) document.exitFullscreen();
          else t.tile.requestFullscreen?.().catch(() => {});
        },
      }, '⛶');
      const tile = el('div', {
        class: `vtile${isScreen ? ' screen' : ''}`,
        dataset: isScreen ? { userId: p.userId } : { voiceId: p.socketId, userId: p.userId },
        onclick: () => { focusedTile = focusedTile === key ? null : key; renderVoiceView(); },
      },
      avatarBox, video, label, full,
      isScreen ? el('span', { class: 'vt-live' }, 'CANLI') : null);
      t = { tile, video, avatarBox, label };
      tiles.set(key, t);
      grid.append(tile);
      return t;
    };

    const setVideo = (t, stream) => {
      const track = stream?.getVideoTracks()[0];
      const shown = t.video.srcObject?.getVideoTracks?.()[0];
      if (track && shown !== track) {
        t.video.srcObject = stream;
        t.video.play().catch(() => {});
      }
      if (!track && t.video.srcObject) t.video.srcObject = null;
      t.tile.classList.toggle('has-video', !!track);
    };

    const seen = new Set();
    parts.forEach((p) => {
      const u = voiceUser(p);
      const isSelf = p.socketId === vs.selfId;

      seen.add(p.socketId);
      const t = ensureTile(p.socketId, p, false);
      t.tile.style.setProperty('--tile-bg', u.bannerColor || u.avatarColor || '#2a2a3a');
      t.tile.classList.toggle('self', isSelf);
      t.tile.classList.toggle('speaking', voice.isSpeaking(p.socketId));
      t.avatarBox.replaceChildren(avatar(u, { status: false }));
      t.label.replaceChildren(...[
        el('span', {}, u.displayName),
        p.deafened ? icon('deaf') : p.muted ? icon('mic-off') : null,
      ].filter(Boolean));
      setVideo(t, p.video ? voice.videoStream(p.socketId) : null);

      if (p.screen) {
        const key = `${p.socketId}:screen`;
        seen.add(key);
        const s = ensureTile(key, p, true);
        s.avatarBox.replaceChildren(el('div', { class: 'vt-wait' }, 'Ekran yükleniyor...'));
        s.label.replaceChildren(el('span', {}, isSelf ? 'Senin ekranın' : `${u.displayName} adlı kişinin ekranı`));
        setVideo(s, voice.screenStreamOf(p.socketId));
      }
    });
    tiles.forEach((t, id) => { if (!seen.has(id)) { t.tile.remove(); tiles.delete(id); } });

    tiles.forEach((t, id) => { if (id.endsWith(':screen') && grid.firstChild !== t.tile) grid.prepend(t.tile); });
    if (focusedTile && !tiles.has(focusedTile)) focusedTile = null;
    tiles.forEach((t, id) => t.tile.classList.toggle('focused', id === focusedTile));
    grid.classList.toggle('has-focus', !!focusedTile);
    grid.dataset.count = String(Math.min(tiles.size, 9));

    const ctrlBtn = (ic, label, onclick, { on = false, danger = false } = {}) => el('button', {
      class: `vv-btn${on ? ' on' : ''}${danger ? ' danger' : ''}`,
      'aria-label': label,
      dataset: { tip: label },
      onclick,
    }, icon(ic));
    box.querySelector('.vv-controls').replaceChildren(...[
      ctrlBtn('video', vs.video ? 'Kamerayı Kapat' : 'Kamerayı Aç', () => voice.toggleCamera(), { on: vs.video }),
      voice.canShareScreen()
        ? ctrlBtn('screen', vs.screen ? 'Paylaşımı Durdur' : 'Ekranını Paylaş', () => voice.toggleScreen(), { on: vs.screen })
        : null,
      ctrlBtn(vs.muted || vs.deafened ? 'mic-off' : 'mic', vs.muted || vs.deafened ? 'Sesi Aç' : 'Sesi Kapat', () => voice.toggleMute(), { danger: vs.muted || vs.deafened }),
      ctrlBtn(vs.deafened ? 'deaf' : 'headset', vs.deafened ? 'Sağırlaştırmayı Kaldır' : 'Sağırlaştır', () => voice.toggleDeafen(), { danger: vs.deafened }),
      ctrlBtn('noise', voice.prefs.noiseSuppression ? 'Gürültü Engelleme: Açık' : 'Gürültü Engelleme: Kapalı', toggleNoise, { on: voice.prefs.noiseSuppression }),
      ctrlBtn('hangup', 'Bağlantıyı Kes', () => voice.leave(), { danger: true }),
    ].filter(Boolean));
  }

  function onVoiceChange(type) {
    if (type === 'speaking') {
      $$('[data-voice-id]').forEach((n) => n.classList.toggle('speaking', voice.isSpeaking(n.dataset.voiceId)));
      return;
    }
    renderVoiceControls();
    if (state.view === 'server' && current()) renderChannels();
    renderVoiceView();
  }

  socket.on('voice:state', ({ serverId, channelId, participants }) => {
    const server = state.details[serverId];
    if (!server) return;
    server.voice ||= {};
    if (participants.length) server.voice[channelId] = participants;
    else delete server.voice[channelId];
    if (state.serverId === serverId) {
      renderChannels();
      renderVoiceView();
    }
  });

  renderVoiceControls();

  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') window.location.href = '/login';
  });

  socket.on('connect', () => {
    if (!booted) return;
    loadRelationships().catch(() => {});
    api('GET', '/api/dms').then(({ dms }) => dms.forEach(upsertDm)).catch(() => {});
  });

  socket.on('message:new', ({ serverId, message }) => {
    stopTyping(message.authorId);
    addMessage(message);
    if (message.authorId === me.id || !mentionsMe(message)) return;
    const viewing = state.convId === message.channelId && document.hasFocus();
    if (viewing) return;
    state.mentionCounts[message.channelId] = (state.mentionCounts[message.channelId] || 0) + 1;
    state.mentionServer[message.channelId] = serverId;
    renderServerList();
    if (state.serverId === serverId && state.view === 'server') renderChannels();
    const server = state.details[serverId];
    const channel = server?.channels.find((c) => c.id === message.channelId);
    notifyMessage(
      { ...message.author, displayName: `${message.author?.displayName}${channel ? ` (#${channel.name}, ${server.name})` : ''}` },
      plainText(message.content),
      `/channels/${serverId}/${message.channelId}`,
    );
  });

  window.addEventListener('focus', () => {
    if (state.view === 'server' && state.mentionCounts[state.convId]) {
      delete state.mentionCounts[state.convId];
      renderServerList();
      renderChannels();
    }
  });

  socket.on('message:updated', ({ message }) => applyMessageUpdate(message));

  socket.on('commands:updated', ({ serverId }) => commandCache.delete(serverId));

  socket.on('bans:updated', ({ serverId }) => {
    if (state.serverId === serverId && serverSettingsOpen() && ssSection === 'bans') refreshServerSettings();
  });

  socket.on('interaction:failed', ({ interactionId, channelId, command, bot }) => {
    addMessage({
      id: `failed-${interactionId}`,
      channelId,
      authorId: bot.id,
      author: bot,
      content: '',
      ephemeral: true,
      failed: true,
      interaction: { name: command, user: me },
      createdAt: new Date().toISOString(),
    });
  });
  socket.on('message:deleted', ({ channelId, messageId }) => removeMessage(channelId, messageId));

  socket.on('dm:message', ({ dm, message }) => {
    stopTyping(message.authorId);
    upsertDm(dm);
    addMessage(message);
    const viewing = state.view === 'dm' && state.convId === dm.id && document.hasFocus();
    if (message.authorId !== me.id && !viewing) {
      state.unread[dm.id] = (state.unread[dm.id] || 0) + 1;
      renderDmList();
      renderBadges();
      notifyMessage(message.author, message.content, `/channels/@me/${dm.id}`);
    }
  });

  window.addEventListener('focus', () => {
    if (state.view === 'dm' && state.unread[state.convId]) {
      delete state.unread[state.convId];
      renderDmList();
      renderBadges();
    }
  });

  socket.on('typing', ({ channelId, user }) => {
    if (channelId !== state.convId || user.id === me.id) return;
    const prev = typingUsers.get(user.id);
    if (prev) clearTimeout(prev.timer);
    typingUsers.set(user.id, { name: user.displayName, timer: setTimeout(() => stopTyping(user.id), 6000) });
    renderTyping();
  });

  socket.on('presence', ({ userId, presence }) => {
    state.presence[userId] = presence;
    paintPresence(userId);
    paintActivity(userId);
    if (state.view === 'friends') renderFriends();
    if (state.view === 'server' && current()?.members.some((u) => u.id === userId)) renderMembers();
  });

  socket.on('me:updated', ({ user }) => {
    me = { ...me, ...user };
    renderMe();
    const { email, birthDate, ...pub } = user;
    applyUserUpdate(pub);
    settingsRefresh();
  });

  socket.on('user:updated', ({ user }) => applyUserUpdate(user));

  socket.on('activity', ({ userId, activity }) => {
    state.activity[userId] = activity;
    paintActivity(userId);
    if (state.view === 'server' && current()?.members.some((u) => u.id === userId)) renderMembers();
  });

  socket.on('connections:changed', () => {
    if (settingsOpen() && settingsSection === 'connections') showSection('connections', { force: true });
  });

  socket.on('relationships:changed', async () => {
    await loadRelationships().catch(() => {});
    api('GET', '/api/dms').then(({ dms }) => {
      const ids = new Set(dms.map((d) => d.id));
      state.dms = state.dms.filter((d) => ids.has(d.id));
      dms.forEach(upsertDm);
      if (state.view === 'dm' && !ids.has(state.convId)) go('/channels/@me', { replace: true });
    }).catch(() => {});
    refreshProfiles();
  });

  function applyUserUpdate(u) {
    if (u.presence) state.presence[u.id] = u.presence;
    if ('activity' in u) state.activity[u.id] = u.activity;
    const patch = (obj) => { if (obj && obj.id === u.id) Object.assign(obj, u); };
    state.rel.friends.forEach(patch);
    state.rel.blocked.forEach(patch);
    state.rel.incoming.forEach((r) => patch(r.user));
    state.rel.outgoing.forEach((r) => patch(r.user));
    state.dms.forEach((d) => patch(d.user));
    Object.values(state.details).forEach((s) => s.members.forEach(patch));
    Object.values(state.messages).forEach((list) => list.forEach((m) => patch(m.author)));

    renderDmList();
    paintPresence(u.id);
    if (state.view === 'friends') renderFriends();
    if (state.view === 'server' && current()) renderMembers();
    const msgs = state.messages[state.convId];
    if (msgs?.some((m) => m.authorId === u.id) || currentDm()?.user.id === u.id) {
      const top = messagesEl.scrollTop;
      const atBottom = nearBottom();
      renderMessages();
      if (!atBottom) messagesEl.scrollTop = top;
    }
    if (currentDm()?.user.id === u.id) {
      $('#channel-title').textContent = u.displayName;
      renderDmProfile();
    }
  }

  let audioCtx = null;
  function playPing() {
    try {
      audioCtx ||= new AudioContext();
      const t = audioCtx.currentTime;
      [880, 1320].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.25);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t + i * 0.09);
        osc.stop(t + i * 0.09 + 0.3);
      });
    } catch {  }
  }

  function notifyMessage(author, text, path) {
    if (me.status === 'dnd') return;
    if (prefs.sound) playPing();
    const canNotify = prefs.desktop && 'Notification' in window && Notification.permission === 'granted';
    if (!canNotify || document.hasFocus()) return;
    try {
      const n = new Notification(author.displayName, { body: (text || 'Bir dosya gönderdi').slice(0, 140), icon: author.avatarUrl || '/img/logo.svg', tag: path });
      n.onclick = () => { window.focus(); go(path); n.close(); };
    } catch {  }
  }

  socket.on('channel:created', ({ channel }) => {
    const server = state.details[channel.serverId];
    if (!server || server.channels.some((c) => c.id === channel.id)) return;
    server.channels.push(channel);
    if (state.serverId === channel.serverId) renderChannels();
  });

  socket.on('channel:updated', ({ channel }) => {
    const server = state.details[channel.serverId];
    const existing = server?.channels.find((c) => c.id === channel.id);
    if (!existing) return;
    Object.assign(existing, channel);
    if (state.serverId !== channel.serverId || leaveIfHidden(channel.serverId)) return;
    renderChannels();
    if (state.convId === channel.id) {
      $('#channel-title').textContent = channel.name;
      if (channel.type === 'voice') renderVoiceView();
      updateComposerPermission();
      setTitle(`${channel.type === 'text' ? '#' : ''}${channel.name} | ${server.name}`);
      if (channel.type === 'text' && state.messages[channel.id]) rerenderMessages();
    }
  });

  socket.on('category:created', ({ category }) => {
    const server = state.details[category.serverId];
    if (!server || server.categories.some((c) => c.id === category.id)) return;
    server.categories.push(category);
    if (state.serverId === category.serverId) renderChannels();
  });

  socket.on('category:updated', ({ category }) => {
    const server = state.details[category.serverId];
    const existing = server?.categories.find((c) => c.id === category.id);
    if (!existing) return;
    Object.assign(existing, category);
    if (state.serverId === category.serverId) renderChannels();
  });

  socket.on('category:deleted', ({ serverId, categoryId }) => {
    const server = state.details[serverId];
    if (!server) return;
    server.categories = server.categories.filter((c) => c.id !== categoryId);
    server.channels.forEach((c) => { if (c.categoryId === categoryId) c.categoryId = null; });
    if (state.serverId === serverId) renderChannels();
  });

  socket.on('channel:deleted', ({ serverId, channelId }) => {
    const server = state.details[serverId];
    if (!server) return;
    server.channels = server.channels.filter((c) => c.id !== channelId);
    delete state.messages[channelId];
    if (state.serverId !== serverId) return;
    if (state.convId === channelId) go(`/channels/${serverId}`, { replace: true });
    else renderChannels();
  });

  socket.on('member:joined', ({ serverId, user }) => {
    const server = state.details[serverId];
    rememberPresence([user]);
    if (!server || server.members.some((u) => u.id === user.id)) return;
    server.members.push({ roles: [], ...user });
    if (state.serverId === serverId) { renderMembers(); refreshServerSettings(); }
  });

  socket.on('member:left', ({ serverId, userId }) => {
    const server = state.details[serverId];
    if (!server) return;
    server.members = server.members.filter((u) => u.id !== userId);
    if (state.serverId === serverId) { renderMembers(); refreshServerSettings(); }
  });

  socket.on('server:updated', ({ server }) => {
    const s = state.servers.find((x) => x.id === server.id);
    if (s) Object.assign(s, server);
    if (state.details[server.id]) Object.assign(state.details[server.id], server);
    renderServerList();
    if (state.serverId === server.id) {
      renderServerHeader();
      refreshServerSettings();
      const channel = currentChannel();
      if (channel) setTitle(`${channel.type === 'text' ? '#' : ''}${channel.name} | ${server.name}`);
    }
  });

  socket.on('server:deleted', ({ serverId }) => removeServerLocally(serverId, 'Sunucu silindi.'));

  socket.on('emojis:updated', ({ serverId, emojis }) => {
    const s = state.servers.find((x) => x.id === serverId);
    if (s) s.emojis = emojis;
    if (state.details[serverId]) state.details[serverId].emojis = emojis;
    if (state.serverId === serverId && serverSettingsOpen() && ssSection === 'emojis') refreshServerSettings();
  });
  socket.on('server:removed', ({ serverId, reason }) => removeServerLocally(serverId, reason, { always: true }));

  function leaveIfHidden(serverId) {
    const channel = currentChannel();
    if (state.serverId !== serverId || !channel || canIn(channel, 'VIEW_CHANNEL')) return false;
    toast('Bu kanalı görme iznin kaldırıldı.');
    go(`/channels/${serverId}`, { replace: true });
    return true;
  }

  function rerenderServer(serverId) {
    if (state.serverId !== serverId || state.view !== 'server') return;
    if (leaveIfHidden(serverId)) return;
    renderServerHeader();
    renderChannels();
    renderMembers();
    if (currentChannel()?.type === 'text' && state.messages[state.convId]) rerenderMessages();
    updateComposerPermission();
    refreshServerSettings();
  }

  socket.on('roles:updated', ({ serverId, roles, members }) => {
    const server = state.details[serverId];
    if (!server) return;
    server.roles = roles;
    (members || []).forEach(({ userId, roles: r }) => { const m = memberOf(server, userId); if (m) m.roles = r; });
    rerenderServer(serverId);
  });

  socket.on('member:roles', ({ serverId, userId, roles }) => {
    const server = state.details[serverId];
    const m = memberOf(server, userId);
    if (!m) return;
    m.roles = roles;
    rerenderServer(serverId);
  });

  function removeServerLocally(serverId, message, { always = false } = {}) {
    if (always && message) toast(message);
    if (always) message = null;
    const wasHere = state.serverId === serverId;
    if (wasHere && serverSettingsOpen()) { ssDraft = null; ovDraft = {}; ssEl.classList.add('hidden'); }
    state.servers = state.servers.filter((s) => s.id !== serverId);
    (state.details[serverId]?.channels || []).forEach((c) => delete state.messages[c.id]);
    delete state.details[serverId];
    renderServerList();
    if (wasHere) {
      if (message) toast(message);
      go('/channels/@me', { replace: true });
    }
  }

  function addServerLocally(server) {
    if (!state.servers.some((s) => s.id === server.id)) {
      const { channels, members, ...plain } = server;
      state.servers.push(plain);
    }
    rememberPresence(server.members);
    state.details[server.id] = server;
    renderServerList();
  }

  const backdrop = $('#modal-backdrop');
  const modal = $('#modal');

  function openModal(...children) {
    closeFloating();
    modal.replaceChildren(
      el('button', { class: 'icon-btn modal-close', 'aria-label': 'Kapat', onclick: closeModal }, icon('x')),
      ...children,
    );
    backdrop.classList.add('open');
    setTimeout(() => modal.querySelector('input:not([type=radio]), .btn-purple')?.focus(), 30);
  }

  function closeModal() {
    backdrop.classList.remove('open');
  }

  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeModal(); });
  modal.addEventListener('click', (e) => e.stopPropagation());

  function field(label, inputEl, hint) {
    const err = el('span', { class: 'err' });
    const f = el('div', { class: 'field' },
      el('label', {}, label, ' ', err),
      inputEl,
      hint ? el('div', { class: 'hint' }, hint) : null);
    f.setError = (msg) => { err.textContent = msg ? `- ${msg}` : ''; };
    return f;
  }

  function submitHandler(form, f, btn, action) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      f?.setError('');
      btn.disabled = true;
      try {
        await action();
      } catch (err) {
        if (f) f.setError(err.message); else toast(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function addServerModal() {
    openModal(
      el('div', { class: 'modal-head' },
        el('h2', {}, 'Sunucunu oluştur'),
        el('p', {}, 'Sunucun, sen ve arkadaşlarının takıldığı yerdir. Kendi sunucunu oluştur ve konuşmaya başla.')),
      el('div', { class: 'modal-body' },
        el('button', { class: 'option-card', onclick: createServerModal },
          el('span', { class: 'oc-icon' }, icon('plus')), el('span', {}, 'Kendi sunucumu oluştur'), icon('chevron')),
        el('div', { class: 'modal-sub' }, 'Zaten bir davetin var mı?'),
        el('button', { class: 'option-card', onclick: () => joinServerModal() },
          el('span', { class: 'oc-icon' }, icon('invite')), el('span', {}, 'Bir sunucuya katıl'), icon('chevron'))),
    );
  }

  function createServerModal() {
    const nameInput = el('input', { class: 'input-plain', maxlength: '100', value: `${me.displayName} sunucusu` });
    const preview = el('div', { class: 'icon-upload' }, acronym(nameInput.value));
    nameInput.addEventListener('input', () => { preview.textContent = acronym(nameInput.value) || '?'; });
    const f = field('Sunucu adı', nameInput, "Oluşturarak Cydlone'un Topluluk Kuralları'nı kabul etmiş olursun.");
    const btn = el('button', { class: 'btn-purple', type: 'submit' }, 'Oluştur');
    const form = el('form', {},
      el('div', { class: 'modal-head' },
        el('h2', {}, 'Sunucunu özelleştir'),
        el('p', {}, 'Yeni sunucuna bir isim vererek ona kişilik kazandır. İstediğin zaman değiştirebilirsin.')),
      el('div', { class: 'modal-body' }, preview, f),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn-ghost', type: 'button', onclick: addServerModal }, 'Geri'),
        el('span', { class: 'spacer' }), btn));
    submitHandler(form, f, btn, async () => {
      const { server } = await api('POST', '/api/servers', { name: nameInput.value });
      addServerLocally(server);
      closeModal();
      go(`/channels/${server.id}`);
    });
    openModal(form);
    setTimeout(() => nameInput.select(), 40);
  }

  function joinServerModal(code = '') {
    const codeInput = el('input', { class: 'input-plain', placeholder: `${location.origin}/invite/aBc12XyZ`, value: code });
    const f = field('Davet bağlantısı', codeInput, `Davetler şöyle görünür: aBc12XyZ veya ${location.origin}/invite/aBc12XyZ`);
    const btn = el('button', { class: 'btn-purple', type: 'submit' }, 'Sunucuya Katıl');
    const form = el('form', {},
      el('div', { class: 'modal-head' },
        el('h2', {}, 'Bir Sunucuya Katıl'),
        el('p', {}, 'Mevcut bir sunucuya katılmak için aşağıya bir davet gir.')),
      el('div', { class: 'modal-body' }, f),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn-ghost', type: 'button', onclick: addServerModal }, 'Geri'),
        el('span', { class: 'spacer' }), btn));
    submitHandler(form, f, btn, async () => {
      const { server, alreadyMember } = await api('POST', '/api/servers/join', { code: codeInput.value });
      addServerLocally(server);
      closeModal();
      if (alreadyMember) toast(`Zaten ${server.name} sunucusundasın.`);
      go(`/channels/${server.id}`);
    });
    openModal(form);
  }

  function createChannelModal(type, categoryId = null) {
    const radio = (value, title, desc, ic) => el('label', { class: 'type-option' },
      icon(ic),
      el('div', {}, el('strong', {}, title), el('small', {}, desc)),
      Object.assign(el('input', { type: 'radio', name: 'ctype', value }), { checked: value === type }));
    const nameInput = el('input', { class: 'input-plain', maxlength: '100', placeholder: 'yeni-kanal' });
    const prefixIcon = icon(type === 'voice' ? 'speaker' : 'hash');
    const f = field('Kanal adı', el('div', { class: 'prefixed' }, prefixIcon, nameInput));
    const btn = el('button', { class: 'btn-purple', type: 'submit' }, 'Kanal Oluştur');
    const categorySelect = el('select', { class: 'input-plain select-plain', 'aria-label': 'Kategori' },
      el('option', { value: '' }, 'Kategori yok'),
      current().categories.map((c) => el('option', { value: c.id }, c.name)));
    categorySelect.value = categoryId || '';
    const form = el('form', {},
      el('div', { class: 'modal-head left' }, el('h2', {}, 'Kanal Oluştur')),
      el('div', { class: 'modal-body' },
        el('div', { class: 'field' }, el('label', {}, 'Kanal türü'),
          radio('text', 'Yazı', 'Mesaj, resim, GIF, emoji, fikir ve şaka gönder', 'hash'),
          radio('voice', 'Ses', 'Sesli ve görüntülü olarak birlikte takılın', 'speaker')),
        f,
        el('div', { class: 'field' }, el('label', {}, 'Kategori'), categorySelect)),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn-ghost', type: 'button', onclick: closeModal }, 'İptal'), btn));

    const selectedType = () => form.querySelector('input[name=ctype]:checked').value;
    form.addEventListener('change', () => {
      prefixIcon.firstElementChild.setAttribute('href', selectedType() === 'voice' ? '#i-speaker' : '#i-hash');
    });
    nameInput.addEventListener('input', () => {
      if (selectedType() === 'text') nameInput.value = nameInput.value.toLocaleLowerCase('tr-TR').replace(/\s/g, '-');
      btn.disabled = !nameInput.value.trim();
    });
    btn.disabled = true;

    const serverId = state.serverId;
    submitHandler(form, f, btn, async () => {
      const { channel } = await api('POST', `/api/servers/${serverId}/channels`, {
        name: nameInput.value,
        type: selectedType(),
        categoryId: categorySelect.value || null,
      });
      const server = state.details[serverId];
      if (!server.channels.some((c) => c.id === channel.id)) server.channels.push(channel);
      closeModal();
      go(`/channels/${serverId}/${channel.id}`);
    });
    openModal(form);
  }

  function channelSettingsModal(channel, tab = 'overview') {
    const server = current();
    const canPerms = can('MANAGE_ROLES');
    if (!canPerms) tab = 'overview';
    const everyone = server.roles.find((r) => r.isEveryone);
    const defs = permDefs.filter((p) => p.channelTypes?.includes(channel.type));
    const mine = channelPermsOf(server, channel);
    const norm = (list) => JSON.stringify(list
      .map((o) => ({ roleId: o.roleId, allow: [...o.allow].sort(), deny: [...o.deny].sort() }))
      .sort((a, b) => a.roleId.localeCompare(b.roleId)));
    let saved = (channel.overwrites || []).map((o) => ({ ...o, allow: [...o.allow], deny: [...o.deny] }));
    let draft = saved.map((o) => ({ ...o, allow: [...o.allow], deny: [...o.deny] }));
    let selected = everyone.id;

    const editableRole = (role) => role.isEveryone || canManageRole(server, role);
    const overwriteOf = (roleId) => draft.find((o) => o.roleId === roleId);
    const stateOf = (roleId, p) => {
      const o = overwriteOf(roleId);
      return o?.allow.includes(p) ? 'allow' : o?.deny.includes(p) ? 'deny' : null;
    };
    const setState = (roleId, p, st) => {
      let o = overwriteOf(roleId);
      if (!o) { o = { roleId, allow: [], deny: [] }; draft.push(o); }
      o.allow = o.allow.filter((x) => x !== p);
      o.deny = o.deny.filter((x) => x !== p);
      if (st) o[st].push(p);
      render();
    };

    const root = el('div', { class: 'channel-settings' });

    function overviewTab() {
      const nameInput = el('input', { class: 'input-plain', maxlength: '100', value: channel.name });
      const f = field('Kanal adı', nameInput);
      const btn = el('button', { class: 'btn-purple', type: 'submit' }, 'Kaydet');
      const form = el('form', {}, el('div', { class: 'modal-body' }, f),
        el('div', { class: 'modal-foot' }, el('button', { class: 'btn-ghost', type: 'button', onclick: closeModal }, 'İptal'), btn));
      submitHandler(form, f, btn, async () => {
        await api('PATCH', `/api/channels/${channel.id}`, { name: nameInput.value });
        closeModal();
      });
      return form;
    }

    function permissionsTab() {
      const listed = server.roles.filter((r) => r.isEveryone || overwriteOf(r.id));
      const addable = server.roles.filter((r) => !r.isEveryone && !overwriteOf(r.id) && editableRole(r));
      if (!listed.some((r) => r.id === selected)) selected = everyone.id;
      const role = server.roles.find((r) => r.id === selected);
      const editable = editableRole(role);

      const privateInput = el('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Özel Kanal', disabled: !mine.has('VIEW_CHANNEL') });
      privateInput.checked = stateOf(everyone.id, 'VIEW_CHANNEL') === 'deny';
      privateInput.addEventListener('change', () => setState(everyone.id, 'VIEW_CHANNEL', privateInput.checked ? 'deny' : null));

      const addSelect = addable.length ? el('select', {
        class: 'input-plain select-plain cs-add',
        'aria-label': 'Rol ekle',
        onchange: (e) => {
          if (!e.target.value) return;
          draft.push({ roleId: e.target.value, allow: [], deny: [] });
          selected = e.target.value;
          render();
        },
      }, el('option', { value: '' }, '+ Rol ekle'), addable.map((r) => el('option', { value: r.id }, r.name))) : null;

      const roleList = el('div', { class: 'cs-roles' },
        el('div', { class: 'cs-roles-title' }, 'Roller'),
        listed.map((r) => el('div', {
          class: `cs-role${r.id === selected ? ' active' : ''}`,
          style: `--rc:${r.color || '#9a99ad'}`,
          role: 'button',
          tabindex: '0',
          onclick: () => { selected = r.id; render(); },
          onkeydown: (e) => { if (e.key === 'Enter') { selected = r.id; render(); } },
        },
        el('i', { class: 'role-dot' }),
        el('span', {}, r.name),
        !r.isEveryone && editableRole(r) ? el('button', {
          class: 'cs-role-remove',
          type: 'button',
          'aria-label': `${r.name} rolünü listeden çıkar`,
          dataset: { tip: 'Kaldır' },
          onclick: (e) => {
            e.stopPropagation();
            draft = draft.filter((o) => o.roleId !== r.id);
            render();
          },
        }, icon('x')) : null)),
        addSelect);

      const tri = (p) => {
        const cur = stateOf(role.id, p.id);
        const locked = !editable || !mine.has(p.id);
        const opt = (st, label, cls, ico) => el('button', {
          class: `tri-btn ${cls}${cur === st ? ' on' : ''}`,
          type: 'button',
          disabled: locked,
          'aria-label': label,
          'aria-pressed': String(cur === st),
          dataset: { tip: label },
          onclick: () => setState(role.id, p.id, st),
        }, ico);
        return el('div', { class: `cs-perm${locked ? ' locked' : ''}` },
          el('div', {}, el('strong', {}, p.name), el('small', {}, p.description)),
          el('div', { class: 'tri', role: 'group', 'aria-label': p.name },
            opt('deny', 'Reddet', 'deny', icon('x')),
            opt(null, 'Varsayılan', 'neutral', el('span', { class: 'tri-slash' })),
            opt('allow', 'İzin Ver', 'allow', icon('check'))));
      };

      const dirty = norm(draft) !== norm(saved);
      const saveBtn = el('button', { class: 'btn-purple', type: 'button', disabled: !dirty }, 'Değişiklikleri Kaydet');
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
          const { channel: updated } = await api('PUT', `/api/channels/${channel.id}/overwrites`, { overwrites: draft });
          Object.assign(channel, updated);
          saved = (updated.overwrites || []).map((o) => ({ ...o, allow: [...o.allow], deny: [...o.deny] }));
          draft = saved.map((o) => ({ ...o, allow: [...o.allow], deny: [...o.deny] }));
          toast('Kanal izinleri kaydedildi.');
          render();
        } catch (err) {
          toast(err.message);
          saveBtn.disabled = false;
        }
      });

      return [
        el('div', { class: 'modal-body' },
          el('div', { class: 'option-row cs-private' },
            el('span', { class: 'cs-private-icon' }, icon('lock')),
            el('div', {}, el('strong', {}, 'Özel Kanal'),
              el('small', {}, 'Açıkken bu kanalı sadece aşağıda "Kanalları Görüntüle" izni verdiğin roller (ve yöneticiler) görebilir.')),
            el('label', { class: 'switch-toggle' }, privateInput, el('span'))),
          el('div', { class: 'cs-layout' },
            roleList,
            el('div', { class: 'cs-perms' },
              el('div', { class: 'cs-perms-head' },
                el('i', { class: 'role-dot', style: `background:${role.color || '#9a99ad'}` }),
                el('strong', {}, role.name)),
              !editable ? el('p', { class: 'blocked-note' }, 'Bu rol senin en yüksek rolüne eşit ya da daha yüksek; iznini değiştiremezsin.') : null,
              role.isEveryone ? el('p', { class: 's-desc' }, 'Rolüne özel ayar yapılmamış herkes için geçerli.') : null,
              defs.map(tri)))),
        el('div', { class: 'modal-foot' },
          dirty ? el('span', { class: 'cs-unsaved' }, 'Kaydedilmemiş değişiklikler var') : null,
          el('span', { class: 'spacer' }),
          dirty ? el('button', {
            class: 'btn-ghost',
            type: 'button',
            onclick: () => { draft = saved.map((o) => ({ ...o, allow: [...o.allow], deny: [...o.deny] })); render(); },
          }, 'Sıfırla') : null,
          saveBtn),
      ];
    }

    function render() {
      const tabBtn = (id, label) => el('button', {
        class: `tab${tab === id ? ' active' : ''}`,
        type: 'button',
        onclick: () => { tab = id; render(); },
      }, label);
      root.replaceChildren(
        el('div', { class: 'modal-head left' },
          el('h2', {}, `${channel.type === 'text' ? '#' : ''}${channel.name}`),
          el('p', {}, channel.type === 'text' ? 'Yazı kanalı ayarları' : 'Ses kanalı ayarları')),
        canPerms ? el('div', { class: 'tabs cs-tabs' }, tabBtn('overview', 'Genel Bakış'), tabBtn('permissions', 'İzinler')) : null,
        ...[tab === 'permissions' ? permissionsTab() : overviewTab()].flat());
    }

    render();
    openModal(root);
  }

  function createCategoryModal() {
    const serverId = state.serverId;
    multiFieldForm({
      title: 'Kategori Oluştur',
      desc: 'Kanallarını düzenli tutmak için onları kategorilere ayırabilirsin.',
      fields: [{ name: 'name', label: 'Kategori adı', value: '', maxlength: 100 }],
      submitText: 'Kategori Oluştur',
      onSubmit: (v) => api('POST', `/api/servers/${serverId}/categories`, v),
    });
  }

  function renameCategoryModal(category) {
    multiFieldForm({
      title: 'Kategoriyi Düzenle',
      fields: [{ name: 'name', label: 'Kategori adı', value: category.name, maxlength: 100 }],
      submitText: 'Kaydet',
      onSubmit: (v) => api('PATCH', `/api/categories/${category.id}`, v),
    });
  }

  function deleteCategoryModal(category) {
    confirmModal({
      title: 'Kategoriyi Sil',
      body: `"${category.name}" kategorisini silmek istediğine emin misin? İçindeki kanallar silinmez, kategorisiz kalır.`,
      confirmText: 'Kategoriyi Sil',
      onConfirm: () => api('DELETE', `/api/categories/${category.id}`),
    });
  }

  async function inviteModal(server) {
    const details = state.details[server.id] || server;
    const vanity = details.verified && details.vanityCode;
    let code = vanity || details.inviteCode || server.inviteCode;
    if (!code) {
      try {
        code = (await api('GET', `/api/servers/${server.id}`)).server.inviteCode;
      } catch {  }
    }
    if (!code) return toast('Bu sunucu için davet oluşturma iznin yok.');
    server = { ...server, inviteCode: code };
    const link = `${location.origin}/invite/${server.inviteCode}`;
    const linkInput = el('input', { class: 'input-plain', readonly: true, value: link });
    const copyBtn = el('button', { class: 'btn-purple', type: 'button' }, 'Kopyala');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        linkInput.select();
        document.execCommand('copy');
      }
      copyBtn.textContent = 'Kopyalandı';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Kopyala'; copyBtn.classList.remove('copied'); }, 1500);
    });
    openModal(
      el('div', { class: 'modal-head left' },
        el('h2', {}, `Arkadaşlarını ${server.name} sunucusuna davet et`)),
      el('div', { class: 'modal-body' },
        el('div', { class: 'field' },
          el('label', {}, 'Ya da bir arkadaşına sunucu davet bağlantısı gönder'),
          el('div', { class: 'invite-row' }, linkInput, copyBtn),
          el('div', { class: 'hint' }, vanity ? 'Bu, sunucunun özel davet bağlantısı.' : `Davet kodu: ${server.inviteCode}`))),
    );
  }

  const ssEl = $('#server-settings');
  const ssContent = $('#ss-content');
  let ssSection = 'overview';
  let ssRoleId = null;
  let ssDraft = null;
  let ovDraft = {};
  let ssMemberQuery = '';

  const serverSettingsOpen = () => !ssEl.classList.contains('hidden');

  function openServerSettings(section) {
    closeFloating();
    const allowed = ssAllowed();
    if (!Object.values(allowed).some(Boolean)) return toast('Bu sunucunun ayarlarını görme iznin yok.');
    ssEl.classList.remove('hidden');
    showServerSection(section && allowed[section] ? section : Object.keys(allowed).find((k) => allowed[k]), { force: true });
  }

  function ssAllowed() {
    return {
      overview: can('MANAGE_SERVER') || isOwner(),
      roles: can('MANAGE_ROLES'),
      emojis: can('MANAGE_EMOJIS'),
      members: can('MANAGE_ROLES') || can('KICK_MEMBERS') || can('BAN_MEMBERS'),
      bans: can('BAN_MEMBERS'),
    };
  }

  function ssDirty() {
    if (ssSection === 'overview') return ovDirty();
    const role = current()?.roles.find((r) => r.id === ssRoleId);
    return !!(ssDraft && role && JSON.stringify(ssDraft) !== JSON.stringify(roleDraftOf(role)));
  }

  function ovDirty() {
    const server = current();
    if (!server) return false;
    const nameChanged = ovDraft.name !== undefined && ovDraft.name.trim() !== server.name;
    const iconChanged = ovDraft.icon !== undefined && !(ovDraft.icon === null && !server.iconUrl);
    return nameChanged || iconChanged;
  }

  function ssGuard() {
    if (!ssDirty()) return false;
    const bar = ssEl.querySelector('.unsaved-bar');
    bar?.classList.remove('shake');
    void bar?.offsetWidth;
    bar?.classList.add('shake');
    return true;
  }

  function closeServerSettings() {
    if (ssGuard()) return;
    ssDraft = null;
    ovDraft = {};
    ssEl.classList.add('hidden');
  }

  function showServerSection(section, { force = false } = {}) {
    if (!force && ssGuard()) return;
    if (section !== 'roles') ssDraft = null;
    if (section !== 'overview') ovDraft = {};
    ssSection = section;
    const allowed = ssAllowed();
    $('#ss-server-name').textContent = current().name;
    ssEl.querySelectorAll('[data-ssection]').forEach((b) => {
      b.classList.toggle('active', b.dataset.ssection === section);
      b.classList.toggle('hidden', !allowed[b.dataset.ssection]);
    });
    $('#ss-delete').classList.toggle('hidden', !isOwner());
    ssEl.querySelector('.unsaved-bar')?.remove();
    const render = { overview: ssOverview, roles: ssRoles, emojis: ssEmojis, members: ssMembers, bans: ssBans }[section];
    ssContent.replaceChildren(...[render()].flat().filter(Boolean));
  }

  function refreshServerSettings() {
    if (!serverSettingsOpen()) return;
    if (!current()) return closeServerSettings();
    const allowed = ssAllowed();
    if (!allowed[ssSection]) {
      const next = Object.keys(allowed).find((k) => allowed[k]);
      if (!next) { ssDraft = null; ssEl.classList.add('hidden'); return; }
      return showServerSection(next, { force: true });
    }
    if (ssDirty()) return;
    showServerSection(ssSection, { force: true });
  }

  ssEl.querySelectorAll('[data-ssection]').forEach((b) => b.addEventListener('click', () => showServerSection(b.dataset.ssection)));
  $('#ss-close').addEventListener('click', closeServerSettings);
  $('#ss-delete').addEventListener('click', () => deleteServerModal(current()));

  function ssOverview() {
    const server = current();
    const nameInput = el('input', { class: 'input-plain', maxlength: '100', value: ovDraft.name ?? server.name, disabled: !can('MANAGE_SERVER') });
    const err = el('div', { class: 'err' });
    nameInput.addEventListener('input', () => {
      ovDraft.name = nameInput.value;
      ovUnsavedBar(err);
    });
    setTimeout(() => ovUnsavedBar(err), 0);
    return [
      el('h1', {}, 'Sunucuya Genel Bakış'),
      server.verified ? el('div', { class: 'verified-note' }, verifiedMark(),
        el('div', {}, el('strong', {}, 'Doğrulanmış Sunucu'),
          el('small', {}, 'Bu, Cydlone tarafından onaylanmış resmi bir sunucu.'))) : null,
      el('div', { class: 'ss-overview' },
        serverIconEditor(server),
        el('div', { class: 'pe-section', style: 'flex:1;border:0' },
          el('label', { class: 'title' }, 'Sunucu Adı'),
          el('div', { class: 'pe-row' }, nameInput),
          err)),
      ...(can('MANAGE_SERVER') ? vanitySection(server) : []),
      el('div', { class: 's-sep' }),
      el('h2', {}, 'Özet'),
      el('p', { class: 's-desc' }, `${server.members.length} üye • ${server.roles.length - 1} rol • ${server.channels.length} kanal`),
    ];
  }

  function ovUnsavedBar(err) {
    ssEl.querySelector('.unsaved-bar')?.remove();
    if (!ovDirty()) return;
    const server = current();
    const reset = () => { ovDraft = {}; showServerSection('overview', { force: true }); };
    const save = async () => {
      if (err) err.textContent = '';
      try {
        if (ovDraft.name !== undefined && ovDraft.name.trim() !== server.name) {
          await api('PATCH', `/api/servers/${server.id}`, { name: ovDraft.name });
        }
        if (ovDraft.icon) await api('POST', `/api/servers/${server.id}/icon`, { dataUrl: ovDraft.icon });
        else if (ovDraft.icon === null && server.iconUrl) await api('DELETE', `/api/servers/${server.id}/icon`);
        ovDraft = {};
        showServerSection('overview', { force: true });
        toast('Değişiklikler kaydedildi.');
      } catch (e) {
        if (err) err.textContent = e.message;
        toast(e.message);
      }
    };
    ssEl.append(el('div', { class: 'unsaved-bar' },
      el('span', {}, 'Dikkat — kaydedilmemiş değişikliklerin var!'),
      el('button', { class: 'btn-ghost', onclick: reset }, 'Sıfırla'),
      el('button', { class: 'btn-purple', onclick: save }, 'Değişiklikleri Kaydet')));
  }

  function serverIconEditor(server) {
    const iconUrl = ovDraft.icon === undefined ? server.iconUrl : ovDraft.icon;
    const preview = { ...server, name: ovDraft.name?.trim() || server.name, iconUrl };
    const node = serverIconFill(el('div', { class: 'ss-icon' }), preview);
    if (!can('MANAGE_SERVER')) return node;
    const setIcon = (v) => { ovDraft.icon = v; showServerSection('overview', { force: true }); };
    const pick = () => pickImage((file) => cropImageModal(file, {
      title: 'Sunucu Fotoğrafını Düzenle',
      upload: async (dataUrl) => setIcon(dataUrl),
    }));
    node.classList.add('editable-avatar');
    Object.assign(node, { role: 'button', tabIndex: 0 });
    node.setAttribute('aria-label', 'Sunucu fotoğrafını değiştir');
    node.append(el('span', { class: 'avatar-edit' }, 'Fotoğrafı Değiştir'));
    node.addEventListener('click', pick);
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    return el('div', { class: 'ss-icon-col' },
      node,
      el('div', { class: 'ss-icon-actions' },
        el('button', { class: 'btn-soft ss-icon-btn', type: 'button', onclick: pick }, icon(iconUrl ? 'edit' : 'upload'), iconUrl ? 'Değiştir' : 'Fotoğraf Yükle'),
        iconUrl ? el('button', {
          class: 'btn-soft danger ss-icon-btn',
          type: 'button',
          onclick: () => setIcon(null),
        }, icon('trash'), 'Kaldır') : null),
      iconUrl ? null : el('small', { class: 'ss-icon-hint' }, 'En az 128x128 önerilir'));
  }

  function vanitySection(server) {
    const head = [el('div', { class: 's-sep' }), el('h2', {}, 'Özel Davet Bağlantısı')];
    if (!server.verified) {
      return [...head, el('div', { class: 'vanity-locked' },
        verifiedMark(),
        el('div', {},
          el('strong', {}, 'Doğrulanmış sunuculara özel'),
          el('small', {}, `Sunucun doğrulandığında ${location.host}/invite/sunucun gibi akılda kalıcı bir bağlantı alabilirsin.`)))];
    }
    const codeInput = el('input', {
      class: 'vanity-input',
      maxlength: '32',
      value: server.vanityCode || '',
      placeholder: 'sunucun',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Özel davet bağlantısı',
    });
    codeInput.addEventListener('input', () => {
      const clean = codeInput.value.toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (clean !== codeInput.value) codeInput.value = clean;
    });
    const err = el('div', { class: 'err' });
    const save = el('button', { class: 'btn-purple', type: 'button' }, 'Kaydet');
    const link = () => `${location.origin}/invite/${server.vanityCode}`;
    const copy = server.vanityCode ? el('button', {
      class: 'btn-soft',
      type: 'button',
      onclick: () => copyText(link()),
    }, icon('link'), 'Bağlantıyı Kopyala') : null;
    save.addEventListener('click', async () => {
      err.textContent = '';
      save.disabled = true;
      try {
        await api('PUT', `/api/servers/${server.id}/vanity`, { code: codeInput.value });
        toast(codeInput.value ? 'Özel davet bağlantısı kaydedildi.' : 'Özel davet bağlantısı kaldırıldı.');
      } catch (e) {
        err.textContent = e.errors?.code || e.message;
      } finally {
        save.disabled = false;
      }
    });
    return [...head,
      el('p', { class: 's-desc' }, 'Bu bağlantıyı kullanan herkes doğrudan sunucuna katılabilir. Boş bırakıp kaydedersen bağlantı kaldırılır.'),
      el('div', { class: 'pe-row' },
        el('label', { class: 'vanity-field' }, el('span', { class: 'vanity-prefix' }, `${location.host}/invite/`), codeInput),
        save),
      err,
      server.vanityCode ? el('div', { class: 'vanity-current' },
        icon('link'),
        el('span', {}, link()),
        copy) : null];
  }

  const ROLE_COLORS = ['#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f2416b', '#f97316', '#f0b232', '#3ccf91', '#14b8a6', '#3b82f6', '#6366f1', '#9a99ad'];

  function roleDraftOf(role) {
    return {
      name: role.name,
      color: role.color,
      hoist: !!role.hoist,
      mentionable: !!role.mentionable,
      permissions: [...(role.permissions || [])].sort(),
    };
  }

  function ssRoles() {
    const server = current();
    const roles = server.roles;
    if (!roles.some((r) => r.id === ssRoleId)) { ssRoleId = roles[0]?.id; ssDraft = null; }
    const role = roles.find((r) => r.id === ssRoleId);
    if (!ssDraft && role) ssDraft = roleDraftOf(role);
    const editable = role && (role.isEveryone || canManageRole(server, role));
    const memberCount = (r) => (r.isEveryone ? server.members.length : server.members.filter((m) => m.roles.includes(r.id)).length);

    const list = el('div', { class: 'role-list' },
      el('button', {
        class: 'btn-purple role-create',
        type: 'button',
        onclick: async () => {
          if (ssGuard()) return;
          try {
            const { role: created } = await api('POST', `/api/servers/${server.id}/roles`, { name: 'yeni rol' });
            ssRoleId = created.id;
            ssDraft = null;
            showServerSection('roles', { force: true });
          } catch (e) { toast(e.message); }
        },
      }, '+ Rol Oluştur'),
      enableRoleDrag(el('div', { class: 'role-rows' }, roles.map((r) => {
        const draggable = !r.isEveryone && canManageRole(server, r);
        return el('div', {
          class: `role-row${r.id === ssRoleId ? ' active' : ''}${draggable ? ' draggable' : ''}${r.isEveryone ? ' everyone' : ''}`,
          dataset: { roleId: r.id },
          onclick: () => {
            if (roleDragJustEnded || r.id === ssRoleId || ssGuard()) return;
            ssRoleId = r.id;
            ssDraft = null;
            showServerSection('roles', { force: true });
          },
        },
        el('span', { class: 'role-grip', 'aria-hidden': 'true' }, draggable ? '⠿' : ''),
        el('i', { class: 'role-dot', style: `background:${r.color || '#9a99ad'}` }),
        el('span', { class: 'role-name' }, r.name),
        el('small', {}, memberCount(r)));
      })), server),
      el('p', { class: 's-desc', style: 'margin-top:10px' },
        'Üstteki roller daha güçlüdür. Sırayı değiştirmek için rolü basılı tutup sürükle; kendi en yüksek rolünün üstüne taşıyamazsın.'));

    if (!role) return [el('h1', {}, 'Roller'), list];

    const d = ssDraft;
    const update = (changes) => { Object.assign(d, changes); showServerSection('roles', { force: true }); };
    const myPerms = permsOf(server);
    const nameInput = el('input', { class: 'input-plain', maxlength: '100', value: d.name, disabled: role.isEveryone || !editable });
    nameInput.addEventListener('change', () => update({ name: nameInput.value }));

    const permRows = permDefs.map((p) => {
      const on = d.permissions.includes(p.id);
      const locked = !editable || (!on && !myPerms.has(p.id));
      const input = el('input', { type: 'checkbox', role: 'switch', 'aria-label': p.name, disabled: locked });
      input.checked = on;
      input.addEventListener('change', () => update({
        permissions: (input.checked ? [...d.permissions, p.id] : d.permissions.filter((x) => x !== p.id)).sort(),
      }));
      return el('div', { class: `option-row${locked ? ' locked' : ''}` },
        el('div', {}, el('strong', {}, p.name), el('small', {}, p.description)),
        el('label', { class: 'switch-toggle' }, input, el('span')));
    });

    const toggle = (key, title, desc) => {
      const input = el('input', { type: 'checkbox', role: 'switch', 'aria-label': title, disabled: !editable });
      input.checked = d[key];
      input.addEventListener('change', () => update({ [key]: input.checked }));
      return el('div', { class: 'option-row' }, el('div', {}, el('strong', {}, title), el('small', {}, desc)), el('label', { class: 'switch-toggle' }, input, el('span')));
    };

    const editor = el('div', { class: 'role-editor' },
      el('h2', { style: 'margin-top:0' }, `Rolü Düzenle — ${role.name}`),
      !editable ? el('p', { class: 'blocked-note' }, 'Bu rol senin en yüksek rolüne eşit ya da daha yüksek; düzenleyemezsin.') : null,
      role.isEveryone ? el('p', { class: 's-desc' }, '@everyone rolünün izinleri sunucudaki herkese uygulanır.') : [
        el('div', { class: 'pe-section' }, el('label', { class: 'title' }, 'Rol Adı'), nameInput),
        el('div', { class: 'pe-section' },
          el('label', { class: 'title' }, 'Rol Rengi'),
          el('div', { class: 'swatches' },
            el('button', {
              class: `swatch default-color${!d.color ? ' selected' : ''}`,
              type: 'button',
              disabled: !editable,
              dataset: { tip: 'Varsayılan' },
              'aria-label': 'Varsayılan renk',
              onclick: () => update({ color: null }),
            }),
            ROLE_COLORS.map((c) => el('button', {
              class: `swatch${d.color === c ? ' selected' : ''}`,
              type: 'button',
              disabled: !editable,
              style: `background:${c};--swc:${c}`,
              'aria-label': c,
              onclick: () => update({ color: c }),
            })))),
        toggle('hoist', 'Rol üyelerini çevrimiçi üyelerden ayrı göster', 'Üye listesinde bu rol için ayrı bir başlık açılır.'),
        toggle('mentionable', 'Herkesin bu rolden @bahsetmesine izin ver', 'Kapalıyken bu rolden sadece "@everyone" izni olanlar bildirimle bahsedebilir.'),
      ],
      el('h2', {}, 'İzinler'),
      permRows,
      !role.isEveryone && editable ? el('div', { style: 'margin-top:20px' },
        el('button', {
          class: 'btn-purple btn-danger',
          type: 'button',
          onclick: () => confirmModal({
            title: 'Rolü Sil',
            body: `"${role.name}" rolünü silmek istediğine emin misin? Bu rol tüm üyelerden kaldırılır.`,
            confirmText: 'Rolü Sil',
            onConfirm: async () => {
              await api('DELETE', `/api/roles/${role.id}`);
              ssDraft = null;
              showServerSection('roles', { force: true });
            },
          }),
        }, 'Rolü Sil')) : null);

    ssEl.querySelector('.unsaved-bar')?.remove();
    if (ssDirty()) {
      ssEl.append(el('div', { class: 'unsaved-bar' },
        el('span', {}, 'Dikkat — kaydedilmemiş değişikliklerin var!'),
        el('button', { class: 'btn-ghost', onclick: () => { ssDraft = null; showServerSection('roles', { force: true }); } }, 'Sıfırla'),
        el('button', {
          class: 'btn-purple',
          onclick: async () => {
            try {
              const body = role.isEveryone ? { permissions: d.permissions } : d;
              await api('PATCH', `/api/roles/${role.id}`, body);
              ssDraft = null;
              showServerSection('roles', { force: true });
              toast('Rol kaydedildi.');
            } catch (e) { toast(e.message); }
          },
        }, 'Değişiklikleri Kaydet')));
    }

    return [el('h1', {}, 'Roller'), el('div', { class: 'roles-layout' }, list, editor)];
  }

  let roleDragJustEnded = false;

  function enableRoleDrag(container, server) {
    let drag = null;

    const rows = () => [...container.querySelectorAll('.role-row')];
    const order = () => rows().filter((r) => !r.classList.contains('everyone')).map((r) => r.dataset.roleId);

    container.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.role-row.draggable');
      if (!row || e.button !== 0) return;
      drag = { row, startY: e.clientY, active: false, before: order(), ghost: null, grabY: 0 };
    });

    const startGhost = (e) => {
      const r = drag.row.getBoundingClientRect();
      drag.grabY = e.clientY - r.top;
      drag.ghost = drag.row.cloneNode(true);
      drag.ghost.classList.remove('dragging', 'active');
      drag.ghost.classList.add('role-ghost');
      Object.assign(drag.ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
      document.body.append(drag.ghost);
    };
    const moveGhost = (e) => { if (drag?.ghost) drag.ghost.style.top = `${e.clientY - drag.grabY}px`; };

    const onMove = (e) => {
      if (!drag) return;
      if (!drag.active) {
        if (Math.abs(e.clientY - drag.startY) < 5) return;
        if (ssGuard()) { drag = null; return; }
        drag.active = true;
        startGhost(e);
        drag.row.classList.add('dragging');
        container.classList.add('sorting');
      }
      e.preventDefault();
      moveGhost(e);
      const all = rows();
      const firstFree = all.findIndex((r) => r.classList.contains('draggable') || r.classList.contains('everyone'));
      const everyone = all.find((r) => r.classList.contains('everyone'));
      const others = all.filter((r) => r !== drag.row);
      let target = others.find((r) => {
        const b = r.getBoundingClientRect();
        return e.clientY < b.top + b.height / 2;
      }) || null;
      const minRow = all[firstFree] === drag.row ? all[firstFree + 1] : all[firstFree];
      if (target && others.indexOf(target) < others.indexOf(minRow)) target = minRow;
      if (!target || target === everyone?.nextSibling) target = everyone;
      if (target !== drag.row.nextSibling) container.insertBefore(drag.row, target);
    };

    const onUp = async () => {
      if (!drag) return;
      const { active, row, before, ghost } = drag;
      drag = null;
      ghost?.remove();
      if (!active) return;
      row.classList.remove('dragging');
      container.classList.remove('sorting');
      roleDragJustEnded = true;
      setTimeout(() => { roleDragJustEnded = false; }, 0);
      const after = order();
      if (after.join() === before.join()) return;
      try {
        await api('PUT', `/api/servers/${server.id}/roles/order`, { roles: after });
      } catch (err) {
        toast(err.message);
        showServerSection('roles', { force: true });
      }
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    const stop = new MutationObserver(() => {
      if (container.isConnected) return;
      drag?.ghost?.remove();
      drag = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      stop.disconnect();
    });
    stop.observe(document.body, { childList: true, subtree: true });
    return container;
  }

  const EMOJI_LIMIT = 50;
  const EMOJI_MAX_BYTES = 256 * 1024;

  function ssEmojis() {
    const server = current();
    const list = server.emojis || [];
    const statics = list.filter((e) => !e.animated);
    const animated = list.filter((e) => e.animated);

    const readAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Dosya okunamadı.'));
      reader.readAsDataURL(file);
    });

    const upload = () => {
      const picker = el('input', { type: 'file', multiple: true, accept: 'image/png,image/gif,image/jpeg,image/webp' });
      picker.addEventListener('change', async () => {
        let added = 0;
        for (const file of picker.files) {
          if (file.size > EMOJI_MAX_BYTES) { toast(`${file.name} çok büyük; emojiler en fazla 256 KB olabilir.`); continue; }
          try {
            await api('POST', `/api/servers/${server.id}/emojis`, { name: file.name, dataUrl: await readAsDataUrl(file) });
            added++;
          } catch (err) { toast(`${file.name}: ${err.message}`); }
        }
        if (added) toast(added === 1 ? 'Emoji eklendi.' : `${added} emoji eklendi.`);
      });
      picker.click();
    };

    const row = (e) => {
      const nameInput = el('input', { class: 'input-plain em-name', value: e.name, maxlength: '32', 'aria-label': 'Emoji adı', spellcheck: 'false' });
      const save = async () => {
        const name = nameInput.value.trim();
        if (name === e.name) return;
        try { await api('PATCH', `/api/emojis/${e.id}`, { name }); } catch (err) { toast(err.message); nameInput.value = e.name; }
      };
      nameInput.addEventListener('input', () => { nameInput.value = nameInput.value.replace(/[^A-Za-z0-9_]/g, '_'); });
      nameInput.addEventListener('blur', save);
      nameInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); nameInput.blur(); } if (ev.key === 'Escape') { nameInput.value = e.name; nameInput.blur(); } });
      const creator = knownUser(e.creatorId);
      return el('div', { class: 'em-row' },
        el('span', { class: 'em-img' }, customEmojiImg(e, 'ep-img')),
        el('div', { class: 'em-name-wrap' }, nameInput),
        el('div', { class: 'em-creator' }, creator ? [avatar(creator, { status: false }), el('span', {}, creator.displayName)] : el('span', {}, 'Bilinmeyen kullanıcı')),
        el('button', {
          class: 'icon-btn em-delete',
          type: 'button',
          'aria-label': `:${e.name}: emojisini sil`,
          dataset: { tip: 'Sil' },
          onclick: () => confirmModal({
            title: 'Emojiyi Sil',
            body: `:${e.name}: emojisini silmek istediğine emin misin? Daha önce gönderilen mesajlarda yazı olarak görünür.`,
            confirmText: 'Sil',
            onConfirm: () => api('DELETE', `/api/emojis/${e.id}`),
          }),
        }, icon('trash')));
    };

    const group = (title, items) => [
      el('h2', { class: 'em-group-title' }, title, el('span', {}, `— ${EMOJI_LIMIT - items.length} kalan`)),
      items.length
        ? el('div', { class: 'em-table' },
          el('div', { class: 'em-row em-head' }, el('span', {}, 'Resim'), el('span', {}, 'Ad'), el('span', {}, 'Yükleyen'), el('span')),
          items.map(row))
        : el('p', { class: 's-desc' }, 'Henüz yok.'),
    ];

    return [
      el('h1', {}, 'Emojiler'),
      el('p', { class: 's-desc' }, 'Sunucuna en fazla 50 sabit ve 50 hareketli emoji ekleyebilirsin. Üyeler bu emojileri mesajlarda :ad: yazarak ya da emoji seçiciden kullanabilir.'),
      el('div', { class: 'em-upload' },
        el('div', {},
          el('strong', {}, 'Yükleme kuralları'),
          el('ul', {},
            el('li', {}, 'PNG, JPG ve WEBP sabit; GIF hareketli emoji olur'),
            el('li', {}, 'En fazla 256 KB'),
            el('li', {}, 'En iyi görünüm için 128x128 piksel'),
            el('li', {}, 'Ad 2-32 karakter; harf, rakam ve _'))),
        el('button', { class: 'btn-purple', type: 'button', onclick: upload }, 'Emoji Yükle')),
      el('div', { class: 's-sep' }),
      ...group('Emoji', statics),
      ...group('Hareketli Emoji', animated),
    ];
  }

  function ssBans() {
    const server = current();
    const search = el('input', { class: 'input-plain', type: 'search', placeholder: 'Yasaklı kullanıcı ara', 'aria-label': 'Yasaklı kullanıcı ara' });
    const list = el('div', { class: 'ban-list' }, el('p', { class: 's-desc' }, 'Yükleniyor...'));
    let bans = [];
    const draw = () => {
      const q = search.value.trim().toLocaleLowerCase('tr-TR');
      const shown = bans.filter((b) => !q || `${b.user.displayName} ${b.user.username}`.toLocaleLowerCase('tr-TR').includes(q));
      if (!bans.length) return list.replaceChildren(el('div', { class: 'ban-empty' }, el('strong', {}, 'Yasaklı kimse yok'), el('p', {}, 'Bir üyeyi yasaklamak için ona sağ tıkla ya da Üyeler sayfasındaki "Yasakla" düğmesini kullan.')));
      if (!shown.length) return list.replaceChildren(el('p', { class: 's-desc' }, 'Eşleşen yasaklı kullanıcı yok.'));
      list.replaceChildren(...shown.map((b) => el('div', { class: 'ban-row' },
        avatar(b.user, { status: false }),
        el('div', { class: 'ban-info' },
          el('div', { class: 'ban-name' }, b.user.displayName, botTag(b.user), el('small', {}, tagOf(b.user))),
          el('div', { class: 'ban-meta' },
            b.reason ? el('span', { class: 'ban-reason' }, `Sebep: ${b.reason}`) : el('span', { class: 'ban-reason empty' }, 'Sebep belirtilmedi'),
            el('span', {}, `${shortDate(b.createdAt)}${b.bannedByUser ? ` • ${b.bannedByUser.displayName} yasakladı` : ''}`))),
        el('button', {
          class: 'btn-soft',
          type: 'button',
          onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              await api('DELETE', `/api/servers/${server.id}/bans/${b.user.id}`);
              toast(`${b.user.displayName} kişisinin yasağı kaldırıldı.`);
            } catch (err) { toast(err.message); btn.disabled = false; }
          },
        }, 'Yasağı Kaldır'))));
    };
    search.addEventListener('input', draw);
    api('GET', `/api/servers/${server.id}/bans`).then((r) => { bans = r.bans; draw(); }, (err) => list.replaceChildren(el('p', { class: 'err' }, err.message)));
    return [
      el('h1', {}, 'Yasaklar'),
      el('p', { class: 's-desc' }, 'Yasaklı kullanıcılar sunucuya davetle tekrar katılamaz; yasaklı botlar da eklenemez.'),
      el('div', { class: 'ban-search' }, search),
      list,
    ];
  }

  function ssMembers() {
    const server = current();
    const search = el('input', { class: 'input-plain', placeholder: 'Üye ara', value: ssMemberQuery });
    const list = el('div', { class: 'ss-member-list' });
    const draw = () => {
      const q = ssMemberQuery.toLocaleLowerCase('tr-TR');
      const members = server.members
        .filter((u) => !q || u.displayName.toLocaleLowerCase('tr-TR').includes(q) || tagOf(u).toLowerCase().includes(q))
        .sort((a, b) => highestPos(server, b.id) - highestPos(server, a.id) || a.displayName.localeCompare(b.displayName, 'tr'));
      list.replaceChildren(...members.map((u) => {
        return el('div', { class: 'ss-member', dataset: { userId: u.id } },
          avatar(u),
          el('div', { class: 'ssm-text' },
            el('span', { class: 'ssm-name', style: roleColor(server, u.id) ? `color:${roleColor(server, u.id)}` : '' },
              u.displayName, u.id === server.ownerId ? el('span', { class: 'crown', 'aria-label': 'Sunucu Sahibi', dataset: { tip: 'Sunucu Sahibi' } }, icon('crown')) : null),
            el('small', {}, tagOf(u))),
          el('div', { class: 'role-chips' }, rolesOf(server, u.id).filter((r) => !r.isEveryone).map(roleChip)),
          el('div', { class: 'ssm-actions' },
            can('MANAGE_ROLES') ? el('button', { class: 'btn-soft', type: 'button', onclick: () => editMemberRolesModal(server, u) }, 'Roller') : null,
            can('KICK_MEMBERS') && u.id !== me.id && canManageMember(server, u.id)
              ? el('button', { class: 'btn-soft danger', type: 'button', onclick: () => confirmKick(server, u) }, 'At') : null,
            can('BAN_MEMBERS') && u.id !== me.id && u.id !== server.ownerId && canManageMember(server, u.id)
              ? el('button', { class: 'btn-soft danger', type: 'button', onclick: () => confirmBan(server, u) }, 'Yasakla') : null));
      }));
    };
    search.addEventListener('input', () => { ssMemberQuery = search.value; draw(); });
    draw();
    return [el('h1', {}, `Üyeler — ${server.members.length}`), search, list];
  }

  function editMemberRolesModal(server, user) {
    const owned = new Set(memberOf(server, user.id)?.roles || []);
    const rows = server.roles.filter((r) => !r.isEveryone).map((r) => {
      const input = el('input', { type: 'checkbox', value: r.id, disabled: !canManageRole(server, r) });
      input.checked = owned.has(r.id);
      return el('label', { class: `role-pick${input.disabled ? ' locked' : ''}`, style: `--rc:${r.color || '#9a99ad'}` },
        el('i', { class: 'role-dot' }),
        el('span', { class: 'rp-name' }, r.name),
        input.disabled ? el('small', {}, 'senin rolünden yüksek') : null,
        input, el('span', { class: 'rp-check' }, icon('check')));
    });
    const btn = el('button', { class: 'btn-purple', type: 'submit' }, 'Kaydet');
    const form = el('form', {},
      el('div', { class: 'modal-head left' },
        el('h2', {}, `${user.displayName} — Roller`),
        el('p', {}, 'Bu üyenin sahip olacağı rolleri seç.')),
      el('div', { class: 'modal-body' },
        rows.length ? el('div', { class: 'role-pick-list' }, rows)
          : el('p', { class: 's-desc' }, 'Bu sunucuda henüz rol yok. Sunucu Ayarları > Roller bölümünden oluşturabilirsin.')),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn-ghost', type: 'button', onclick: closeModal }, 'İptal'), btn));
    submitHandler(form, null, btn, async () => {
      const roles = [...form.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
      await api('PUT', `/api/servers/${server.id}/members/${user.id}/roles`, { roles });
      closeModal();
    });
    openModal(form);
  }

  function confirmKick(server, user) {
    confirmModal({
      title: `'${user.displayName}' adlı kişiyi at`,
      body: `${user.displayName} adlı kişiyi ${server.name} sunucusundan atmak istediğine emin misin? Bir davetle tekrar katılabilir.`,
      confirmText: 'At',
      onConfirm: () => api('POST', `/api/servers/${server.id}/members/${user.id}/kick`),
    });
  }

  function confirmBan(server, user) {
    const reason = el('textarea', { class: 'textarea', maxlength: '512', rows: '3', placeholder: 'İsteğe bağlı; yasaklar listesinde görünür.' });
    const hours = el('select', { class: 'input-plain select-plain', 'aria-label': 'Mesaj geçmişini sil' },
      el('option', { value: '0' }, 'Hiçbirini silme'),
      el('option', { value: '1' }, 'Son 1 saat'),
      el('option', { value: '24' }, 'Son 24 saat'),
      el('option', { value: '168' }, 'Son 7 gün'));
    const btn = el('button', { class: 'btn-purple btn-danger', type: 'submit' }, 'Yasakla');
    const form = el('form', {},
      el('div', { class: 'modal-head left' },
        el('h2', {}, `'${user.displayName}' yasaklansın mı?`),
        el('p', {}, `${user.displayName} ${server.name} sunucusundan çıkarılır ve davetle tekrar katılamaz. Yasağı Sunucu Ayarları → Yasaklar'dan kaldırabilirsin.`)),
      el('div', { class: 'modal-body' },
        el('div', { class: 'field' }, el('label', {}, 'Mesaj geçmişini sil'), hours),
        el('div', { class: 'field' }, el('label', {}, 'Yasaklama sebebi'), reason)),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn-ghost', type: 'button', onclick: closeModal }, 'İptal'), btn));
    submitHandler(form, null, btn, async () => {
      await api('POST', `/api/servers/${server.id}/bans/${user.id}`, { reason: reason.value, deleteMessages: Number(hours.value) });
      closeModal();
      toast(`${user.displayName} yasaklandı.`);
    });
    openModal(form);
  }

  function confirmModal({ title, body, confirmText, onConfirm }) {
    const btn = el('button', { class: 'btn-purple btn-danger', type: 'submit' }, confirmText);
    const form = el('form', {},
      el('div', { class: 'modal-head left' }, el('h2', {}, title), el('p', {}, body)),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn-ghost', type: 'button', onclick: closeModal }, 'İptal'), btn));
    submitHandler(form, null, btn, async () => { await onConfirm(); closeModal(); });
    openModal(form);
  }

  function deleteServerModal(server) {
    confirmModal({
      title: `'${server.name}' sunucusunu sil`,
      body: `${server.name} sunucusunu silmek istediğine emin misin? Bu işlem geri alınamaz; tüm kanallar ve mesajlar silinir.`,
      confirmText: 'Sunucuyu Sil',
      onConfirm: async () => {
        await api('DELETE', `/api/servers/${server.id}`);
        removeServerLocally(server.id);
      },
    });
  }

  function leaveServerModal(server) {
    confirmModal({
      title: `'${server.name}' sunucusundan ayrıl`,
      body: `${server.name} sunucusundan ayrılmak istediğine emin misin? Tekrar davet edilmedikçe geri katılamazsın.`,
      confirmText: 'Sunucudan Ayrıl',
      onConfirm: async () => {
        await api('POST', `/api/servers/${server.id}/leave`);
        removeServerLocally(server.id);
      },
    });
  }

  function deleteChannelModal(channel) {
    confirmModal({
      title: 'Kanalı Sil',
      body: `${channel.type === 'text' ? '#' : ''}${channel.name} kanalını silmek istediğine emin misin? Bu işlem geri alınamaz.`,
      confirmText: 'Kanalı Sil',
      onConfirm: () => api('DELETE', `/api/channels/${channel.id}`),
    });
  }

  $('#add-server').addEventListener('click', (e) => { e.stopPropagation(); addServerModal(); });

  const PREF_DEFAULTS = { accent: '#8b5cf6', density: 'cozy', fontSize: 15, desktop: false, sound: true };
  const prefs = { ...PREF_DEFAULTS, ...JSON.parse(store.get('cydlone:prefs') || '{}') };
  const ACCENTS = [
    ['#8b5cf6', 'Cydlone Moru'], ['#a855f7', 'Ametist'], ['#7c3aed', 'Gece Moru'],
    ['#c026d3', 'Fuşya'], ['#d946ef', 'Orkide'], ['#6366f1', 'İndigo'], ['#ec4899', 'Gül'],
  ];
  const PROFILE_COLORS = ['#8b5cf6', '#a855f7', '#7c3aed', '#6d28d9', '#c026d3', '#d946ef', '#6366f1', '#ec4899', '#3ccf91', '#f0b232', '#f2416b', '#3b82f6'];

  function savePrefs() { store.set('cydlone:prefs', JSON.stringify(prefs)); }

  function applyAppearance() {
    const root = document.documentElement.style;
    const a = prefs.accent;
    root.setProperty('--purple', a);
    root.setProperty('--purple-hover', `color-mix(in srgb, ${a} 82%, black)`);
    root.setProperty('--purple-active', `color-mix(in srgb, ${a} 70%, black)`);
    root.setProperty('--purple-soft', `color-mix(in srgb, ${a} 60%, white)`);
    root.setProperty('--purple-glow', `color-mix(in srgb, ${a} 45%, transparent)`);
    root.setProperty('--bg-hover', `color-mix(in srgb, ${a} 10%, transparent)`);
    root.setProperty('--bg-active', `color-mix(in srgb, ${a} 20%, transparent)`);
    root.setProperty('--chat-font', `${prefs.fontSize}px`);
    messagesEl.classList.toggle('compact', prefs.density === 'compact');
  }
  applyAppearance();

  const settingsEl = $('#settings');
  const settingsContent = $('#settings-content');
  let settingsSection = 'account';
  let profileDraft = null;

  const settingsOpen = () => !settingsEl.classList.contains('hidden');

  function openSettings(section = 'account') {
    closeFloating();
    settingsEl.classList.remove('hidden');
    showSection(section, { force: true });
  }

  function guardUnsaved() {
    if (!profileDraft?.dirty()) return false;
    const bar = $('.unsaved-bar');
    bar?.classList.remove('shake');
    void bar?.offsetWidth;
    bar?.classList.add('shake');
    return true;
  }

  let sectionCleanup = null;
  function runSectionCleanup() {
    sectionCleanup?.();
    sectionCleanup = null;
  }

  function closeSettings() {
    if (guardUnsaved()) return;
    profileDraft = null;
    runSectionCleanup();
    settingsEl.classList.add('hidden');
  }

  function showSection(section, { force = false } = {}) {
    if (!force && section !== settingsSection && guardUnsaved()) return;
    if (section !== 'profile') profileDraft = null;
    runSectionCleanup();
    settingsSection = section;
    $$('.sn-item[data-section]').forEach((b) => b.classList.toggle('active', b.dataset.section === section));
    const render = {
      account: accountSection,
      profile: profileSection,
      connections: connectionsSection,
      applications: applicationsSection,
      voice: voiceSection,
      appearance: appearanceSection,
      language: languageSection,
      notifications: notificationsSection,
    }[section];
    settingsContent.replaceChildren(...[render()].flat());
    settingsEl.querySelector('.settings-main').scrollTop = 0;
  }

  function settingsRefresh() {
    if (!settingsOpen()) return;
    if (settingsSection === 'profile' && profileDraft?.dirty()) return profileDraft.refreshPreview();
    showSection(settingsSection, { force: true });
  }

  $$('.sn-item[data-section]').forEach((b) => b.addEventListener('click', () => showSection(b.dataset.section)));
  $('#settings-close').addEventListener('click', closeSettings);
  $('#settings-logout').addEventListener('click', () => confirmModal({
    title: 'Çıkış Yap',
    body: 'Çıkış yapmak istediğine emin misin?',
    confirmText: 'Çıkış Yap',
    onConfirm: logout,
  }));

  function multiFieldForm({ title, desc, fields, submitText, danger, onSubmit }) {
    const inputs = {};
    const fieldEls = {};
    fields.forEach((f) => {
      inputs[f.name] = el('input', {
        class: 'input-plain',
        type: f.type || 'text',
        value: f.value ?? '',
        maxlength: f.maxlength,
        autocomplete: f.autocomplete || 'off',
      });
      fieldEls[f.name] = field(f.label, inputs[f.name]);
    });
    const btn = el('button', { class: `btn-purple${danger ? ' btn-danger' : ''}`, type: 'submit' }, submitText);
    const form = el('form', {},
      el('div', { class: 'modal-head' }, el('h2', {}, title), desc ? el('p', {}, desc) : null),
      el('div', { class: 'modal-body' }, Object.values(fieldEls)),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn-ghost', type: 'button', onclick: closeModal }, 'İptal'), btn));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Object.values(fieldEls).forEach((f) => f.setError(''));
      const values = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
      btn.disabled = true;
      try {
        await onSubmit(values);
        closeModal();
      } catch (err) {
        const errors = err.errors || { [fields[0].name]: err.message };
        Object.entries(errors).forEach(([k, msg]) => (fieldEls[k] || fieldEls[fields[0].name]).setError(msg));
      } finally {
        btn.disabled = false;
      }
    });
    openModal(form);
  }

  function maskEmail(email) {
    const [name, domain] = email.split('@');
    return `${'*'.repeat(Math.max(name.length, 4))}@${domain}`;
  }

  function accountSection() {
    let revealed = false;
    const emailValue = el('span', {}, maskEmail(me.email));
    const reveal = el('button', { class: 'link-btn' }, 'Göster');
    reveal.addEventListener('click', () => {
      revealed = !revealed;
      emailValue.textContent = revealed ? me.email : maskEmail(me.email);
      reveal.textContent = revealed ? 'Gizle' : 'Göster';
    });

    const row = (label, value, onEdit) => el('div', { class: 'ac-row' },
      el('div', {}, el('div', { class: 'ac-label' }, label), el('div', { class: 'ac-value' }, value)),
      el('button', { class: 'btn-soft', onclick: onEdit }, 'Düzenle'));

    return [
      el('h1', {}, 'Hesabım'),
      el('div', { class: 'account-card' },
        paintBanner(el('div', { class: 'ac-banner profile-banner' }), me),
        el('div', { class: 'ac-head' },
          editableAvatar(avatar(me)),
          el('div', { class: 'ac-name' }, nameTag(me), badgeRow(me, 'inline')),
          el('button', { class: 'btn-purple', onclick: () => showSection('profile') }, 'Kullanıcı Profilini Düzenle')),
        el('div', { class: 'ac-rows' },
          row('Görünen Ad', me.displayName, () => multiFieldForm({
            title: 'Görünen adını değiştir',
            fields: [{ name: 'displayName', label: 'Görünen ad', value: me.displayName, maxlength: 32 }],
            submitText: 'Bitti',
            onSubmit: (v) => api('PATCH', '/api/users/me', v),
          })),
          row('Kullanıcı Adı', nameTag(me), () => multiFieldForm({
            title: 'Kullanıcı adını değiştir',
            desc: 'Yeni bir kullanıcı adı ve mevcut şifreni gir.',
            fields: [
              { name: 'username', label: 'Kullanıcı adı', value: me.username, maxlength: 32 },
              { name: 'password', label: 'Mevcut şifre', type: 'password', autocomplete: 'current-password' },
            ],
            submitText: 'Bitti',
            onSubmit: (v) => api('PATCH', '/api/users/me/account', v),
          })),
          row('E-posta', [emailValue, reveal], () => multiFieldForm({
            title: 'E-posta adresini değiştir',
            desc: 'Yeni bir e-posta adresi ve mevcut şifreni gir.',
            fields: [
              { name: 'email', label: 'E-posta', type: 'email', value: me.email },
              { name: 'password', label: 'Mevcut şifre', type: 'password', autocomplete: 'current-password' },
            ],
            submitText: 'Bitti',
            onSubmit: (v) => api('PATCH', '/api/users/me/account', v),
          })))),

      el('div', { class: 's-sep' }),
      el('h1', {}, 'Şifre ve Kimlik Doğrulama'),
      el('button', { class: 'btn-purple', onclick: changePasswordModal }, 'Şifreyi Değiştir'),

      el('div', { class: 's-sep' }),
      el('h2', {}, 'Hesabı Kaldırma'),
      el('p', { class: 's-desc' }, 'Hesabını silersen sahibi olduğun sunucular, arkadaşlıkların ve direkt mesajların kalıcı olarak silinir. Sunuculara yazdığın mesajlar "Silinmiş Kullanıcı" adıyla kalır.'),
      el('button', { class: 'btn-purple btn-danger', onclick: deleteAccountModal }, 'Hesabı Sil'),
    ];
  }

  function changePasswordModal() {
    multiFieldForm({
      title: 'Şifreni güncelle',
      desc: 'Mevcut şifreni ve yeni şifreni gir.',
      fields: [
        { name: 'current', label: 'Mevcut şifre', type: 'password', autocomplete: 'current-password' },
        { name: 'next', label: 'Yeni şifre', type: 'password', autocomplete: 'new-password' },
        { name: 'confirm', label: 'Yeni şifreyi onayla', type: 'password', autocomplete: 'new-password' },
      ],
      submitText: 'Bitti',
      onSubmit: async ({ current, next, confirm }) => {
        if (next !== confirm) throw Object.assign(new Error(''), { errors: { confirm: 'Şifreler eşleşmiyor.' } });
        await api('POST', '/api/users/me/password', { current, next });
        toast('Şifren güncellendi.');
      },
    });
  }

  function deleteAccountModal() {
    multiFieldForm({
      title: 'Hesabı Sil',
      desc: 'Hesabını silmek istediğine emin misin? Bu işlem geri alınamaz.',
      fields: [{ name: 'password', label: 'Şifre', type: 'password', autocomplete: 'current-password' }],
      submitText: 'Hesabı Sil',
      danger: true,
      onSubmit: async (v) => {
        await api('DELETE', '/api/users/me', v);
        window.location.href = '/login';
      },
    });
  }

  function swatchPicker(colors, value, onPick) {
    const wrap = el('div', { class: 'swatches' });
    const custom = el('input', { type: 'color', value: value || colors[0], 'aria-label': 'Özel renk' });
    const draw = (selected) => {
      wrap.querySelectorAll('.swatch:not(.custom)').forEach((s) => s.classList.toggle('selected', s.dataset.color === selected));
      customBtn.classList.toggle('selected', !colors.includes(selected));
      customBtn.style.setProperty('--swc', selected);
    };
    colors.forEach((c) => wrap.append(el('button', {
      class: 'swatch',
      type: 'button',
      style: `background:${c};--swc:${c}`,
      dataset: { color: c, tip: c },
      'aria-label': c,
      onclick: () => { onPick(c); draw(c); },
    })));
    const customBtn = el('label', { class: 'swatch custom', dataset: { tip: 'Özel renk' } }, custom);
    custom.addEventListener('input', () => { onPick(custom.value); draw(custom.value); });
    wrap.append(customBtn);
    draw(value);
    return wrap;
  }

  function pickImage(onFile) {
    const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) return toast('Lütfen bir resim dosyası seç.');
      if (file.size > 10 * 1024 * 1024) return toast('Resim en fazla 10 MB olabilir.');
      onFile(file);
    });
    fileInput.click();
  }

  function pickAvatar() {
    pickImage((file) => cropImageModal(file, {
      upload: (dataUrl) => api('POST', '/api/users/me/avatar', { dataUrl }),
      done: 'Profil fotoğrafın güncellendi.',
    }));
  }

  function removeAvatar() {
    api('DELETE', '/api/users/me/avatar').then(() => toast('Profil fotoğrafı kaldırıldı.'), (err) => toast(err.message));
  }

  function pickBanner() {
    pickImage((file) => cropImageModal(file, {
      title: 'Afişi Düzenle',
      width: 960,
      height: 340,
      shape: 'banner',
      upload: (dataUrl) => api('POST', '/api/users/me/banner', { dataUrl }),
      done: 'Profil afişin güncellendi.',
    }));
  }

  function removeBanner() {
    api('DELETE', '/api/users/me/banner').then(() => toast('Profil afişi kaldırıldı.'), (err) => toast(err.message));
  }

  function cropImageModal(file, { title = 'Resmi Düzenle', upload, done, width = 256, height = 256, shape = 'circle' }) {
    const SW = shape === 'banner' ? 400 : 280;
    const SH = Math.round((SW * height) / width);
    const url = URL.createObjectURL(file);
    const img = el('img', { class: 'crop-img', alt: '', draggable: 'false' });
    const stage = el('div', {
      class: `crop-stage ${shape}`,
      style: `width:${SW}px;height:${SH}px`,
      'aria-label': 'Resmi sürükleyerek konumlandır',
    }, img, el('div', { class: 'crop-mask' }));
    const zoomInput = el('input', { class: 'range', type: 'range', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'Yakınlaştır' });
    const btn = el('button', { class: 'btn-purple', type: 'button' }, 'Uygula');
    let base = 1, zoom = 1, x = 0, y = 0, w = 0, h = 0;

    const clamp = () => {
      const s = base * zoom;
      x = Math.min(0, Math.max(SW - w * s, x));
      y = Math.min(0, Math.max(SH - h * s, y));
    };
    const draw = () => {
      clamp();
      const s = base * zoom;
      Object.assign(img.style, { width: `${w * s}px`, height: `${h * s}px`, transform: `translate(${x}px, ${y}px)` });
    };
    const setZoom = (z) => {
      const prev = base * zoom;
      zoom = Math.min(4, Math.max(1, z));
      const next = base * zoom;
      const cx = SW / 2, cy = SH / 2;
      x = cx - ((cx - x) / prev) * next;
      y = cy - ((cy - y) / prev) * next;
      zoomInput.value = String(zoom);
      draw();
    };

    img.onload = () => {
      w = img.naturalWidth;
      h = img.naturalHeight;
      base = Math.max(SW / w, SH / h);
      x = (SW - w * base) / 2;
      y = (SH - h * base) / 2;
      draw();
    };
    img.onerror = () => { closeModal(); toast('Resim okunamadı.'); };
    img.src = url;

    let drag = null;
    stage.addEventListener('pointerdown', (e) => {
      drag = { px: e.clientX, py: e.clientY, x, y };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('dragging');
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      x = drag.x + e.clientX - drag.px;
      y = drag.y + e.clientY - drag.py;
      draw();
    });
    const endDrag = () => { drag = null; stage.classList.remove('dragging'); };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom - e.deltaY * 0.002); }, { passive: false });
    zoomInput.addEventListener('input', () => setZoom(Number(zoomInput.value)));

    btn.addEventListener('click', async () => {
      const s = base * zoom;
      const canvas = Object.assign(document.createElement('canvas'), { width, height });
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, -x / s, -y / s, SW / s, SH / s, 0, 0, width, height);
      let dataUrl = canvas.toDataURL('image/webp', 0.88);
      if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/png');
      btn.disabled = true;
      try {
        await upload(dataUrl);
        URL.revokeObjectURL(url);
        closeModal();
        if (done) toast(done);
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
    });

    openModal(
      el('div', { class: 'modal-head left' },
        el('h2', {}, title),
        el('p', {}, 'Konumlandırmak için sürükle, yakınlaştırmak için kaydırıcıyı ya da fare tekerleğini kullan.')),
      el('div', { class: 'modal-body crop-body' },
        stage,
        el('div', { class: 'crop-zoom', style: `width:${SW}px` }, el('span', { 'aria-hidden': 'true' }, '−'), zoomInput, el('span', { 'aria-hidden': 'true' }, '+'))),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn-ghost', type: 'button', onclick: () => { URL.revokeObjectURL(url); closeModal(); } }, 'İptal'),
        btn),
    );
    setTimeout(() => btn.focus(), 40);
  }

  function editableBanner(node) {
    node.classList.add('editable-banner');
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', 'Profil afişini değiştir');
    node.append(el('span', { class: 'banner-edit' }, icon('edit'), me.bannerUrl ? 'Afişi Değiştir' : 'Afiş Yükle'));
    node.addEventListener('click', (e) => { e.stopPropagation(); pickBanner(); });
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickBanner(); } });
    return node;
  }

  function editableAvatar(node) {
    node.classList.add('editable-avatar');
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', 'Profil fotoğrafını değiştir');
    node.append(el('span', { class: 'avatar-edit' }, 'Avatarı Değiştir'));
    node.addEventListener('click', (e) => { e.stopPropagation(); pickAvatar(); });
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickAvatar(); } });
    return node;
  }

  function profileSection() {
    const original = {
      displayName: me.displayName,
      pronouns: me.pronouns || '',
      bio: me.bio || '',
      avatarColor: me.avatarColor,
      bannerColor: me.bannerColor || me.avatarColor,
    };
    const draft = { ...original };
    const preview = el('div', { class: 'preview-card' });
    let bar = null;

    const dirty = () => Object.keys(original).some((k) => draft[k] !== original[k]);
    const refreshPreview = () => {
      preview.replaceChildren(profileView({ ...me, ...draft }));
      editableAvatar(preview.querySelector('.avatar.large'));
      editableBanner(preview.querySelector('.profile-banner'));
      if (dirty() && !bar) {
        bar = el('div', { class: 'unsaved-bar' },
          el('span', {}, 'Dikkat — kaydedilmemiş değişikliklerin var!'),
          el('button', { class: 'btn-ghost', onclick: reset }, 'Sıfırla'),
          el('button', { class: 'btn-purple', onclick: save }, 'Değişiklikleri Kaydet'));
        settingsEl.append(bar);
      } else if (!dirty() && bar) {
        bar.remove();
        bar = null;
      }
    };
    profileDraft = { dirty, refreshPreview };

    const errBox = el('div', { class: 'err' });
    const nameInput = el('input', { class: 'input-plain', maxlength: '32', value: draft.displayName });
    const pronounsInput = el('input', { class: 'input-plain', maxlength: '40', value: draft.pronouns, placeholder: 'Zamirlerini ekle' });
    const bioInput = el('textarea', { class: 'textarea', maxlength: '190', placeholder: 'Kendinden biraz bahset' });
    bioInput.value = draft.bio;
    const counter = el('div', { class: 'counter' }, `${190 - draft.bio.length}`);

    const bind = (input, key, after) => input.addEventListener('input', () => {
      draft[key] = input.value;
      after?.();
      refreshPreview();
    });
    bind(nameInput, 'displayName');
    bind(pronounsInput, 'pronouns');
    bind(bioInput, 'bio', () => { counter.textContent = `${190 - bioInput.value.length}`; });

    async function save() {
      errBox.textContent = '';
      const changes = Object.fromEntries(Object.keys(original).filter((k) => draft[k] !== original[k]).map((k) => [k, draft[k].trim?.() ?? draft[k]]));
      try {
        await api('PATCH', '/api/users/me', changes);
        Object.assign(original, draft);
        bar?.remove();
        bar = null;
        toast('Profil kaydedildi.');
      } catch (err) {
        errBox.textContent = err.message;
      }
    }

    function reset() {
      Object.assign(draft, original);
      profileDraft = null;
      bar?.remove();
      showSection('profile', { force: true });
    }

    const avatarButtons = el('div', { class: 'pe-row' },
      el('button', { class: 'btn-purple', type: 'button', onclick: pickAvatar }, me.avatarUrl ? 'Fotoğrafı Değiştir' : 'Fotoğraf Yükle'),
      me.avatarUrl ? el('button', { class: 'btn-ghost', type: 'button', onclick: removeAvatar }, 'Fotoğrafı Kaldır') : null);

    const bannerButtons = el('div', { class: 'pe-row' },
      el('button', { class: 'btn-purple', type: 'button', onclick: pickBanner }, me.bannerUrl ? 'Afişi Değiştir' : 'Afiş Yükle'),
      me.bannerUrl ? el('button', { class: 'btn-ghost', type: 'button', onclick: removeBanner }, 'Afişi Kaldır') : null);

    refreshPreview();

    return [
      el('h1', {}, 'Profiller'),
      el('div', { class: 'profile-editor' },
        el('div', { class: 'pe-form' },
          el('div', { class: 'pe-section' }, el('label', { class: 'title' }, 'Görünen Ad'), nameInput),
          el('div', { class: 'pe-section' }, el('label', { class: 'title' }, 'Zamirler'), pronounsInput),
          el('div', { class: 'pe-section' },
            el('label', { class: 'title' }, 'Profil Fotoğrafı'),
            el('p', { class: 's-desc' }, 'PNG, JPG, WEBP ya da GIF (GIF hareketsiz kaydedilir). Önizlemedeki avatara tıklayarak da değiştirebilirsin.'),
            avatarButtons),
          el('div', { class: 'pe-section' },
            el('label', { class: 'title' }, 'Avatar Rengi'),
            el('p', { class: 's-desc' }, 'Resim yüklemediğinde avatarının arka plan rengi.'),
            swatchPicker(PROFILE_COLORS, draft.avatarColor, (c) => { draft.avatarColor = c; refreshPreview(); })),
          el('div', { class: 'pe-section' },
            el('label', { class: 'title' }, 'Profil Afişi'),
            el('p', { class: 's-desc' }, 'En az 680x240 boyutunda bir resim önerilir. Önizlemedeki afişe tıklayarak da değiştirebilirsin.'),
            bannerButtons),
          el('div', { class: 'pe-section' },
            el('label', { class: 'title' }, 'Profil Afişi Rengi'),
            el('p', { class: 's-desc' }, me.bannerUrl ? 'Afiş resmin yüklenirken ve kaldırırsan kullanılır.' : 'Afiş resmi yüklemediğinde kullanılır.'),
            swatchPicker(PROFILE_COLORS, draft.bannerColor, (c) => { draft.bannerColor = c; refreshPreview(); })),
          el('div', { class: 'pe-section' }, el('label', { class: 'title' }, 'Hakkımda'), bioInput, counter),
          errBox),
        el('div', { class: 'pe-preview' }, el('h2', { style: 'margin-top:0' }, 'Önizleme'), preview)),
    ];
  }

  let openAppId = null;

  function applicationsSection() {
    const box = el('div', { class: 'apps-wrap' }, el('p', { class: 's-desc' }, 'Yükleniyor...'));
    (async () => {
      try {
        if (openAppId) {
          const { application } = await api('GET', `/api/applications/${openAppId}`);
          box.replaceChildren(...appDetail(application));
        } else {
          const { applications } = await api('GET', '/api/applications');
          box.replaceChildren(...appList(applications));
        }
      } catch (err) {
        openAppId = null;
        box.replaceChildren(el('p', { class: 'err' }, err.message));
      }
    })();
    return [
      el('h1', {}, 'Uygulamalar'),
      el('p', { class: 's-desc' }, 'Kendi botlarını oluştur, sunucularına ekle ve API ile yönet. ',
        el('a', { class: 'apps-docs-link', href: '/developers', target: '_blank', rel: 'noopener' }, 'Geliştirici belgelerine göz at →')),
      box,
    ];
  }

  const reopenApps = (id = openAppId) => { openAppId = id; showSection('applications', { force: true }); };

  function appList(apps) {
    const create = el('button', { class: 'btn-purple', type: 'button', onclick: createAppModal }, 'Yeni Uygulama');
    if (!apps.length) {
      return [
        el('div', { class: 'apps-empty' },
          el('div', { class: 'apps-empty-icon' }, icon('chat')),
          el('strong', {}, 'Henüz bir uygulaman yok'),
          el('p', {}, 'Bir uygulama oluşturunca ona ait bir bot hesabı da açılır. Botunu sunucuna ekleyip Python ya da Node.js ile çalıştırabilirsin.'),
          create),
      ];
    }
    return [
      el('div', { class: 'apps-head' }, el('h2', {}, `Uygulamaların — ${apps.length}`), create),
      el('div', { class: 'apps-grid' }, apps.map((a) => el('button', {
        class: 'app-card',
        type: 'button',
        onclick: () => reopenApps(a.id),
      },
      a.bot ? avatar(a.bot, { status: false }) : null,
      el('strong', {}, a.name),
      el('small', {}, a.serverCount ? `${a.serverCount} sunucuda` : 'Henüz bir sunucuda değil')))),
    ];
  }

  function createAppModal() {
    const nameInput = el('input', { class: 'input-plain', maxlength: '32', placeholder: 'Örn. Müzik Botu' });
    const f = field('Uygulama adı', nameInput, 'Botunun adı da bu olur; sonradan değiştirebilirsin.');
    const btn = el('button', { class: 'btn-purple', type: 'submit' }, 'Oluştur');
    const form = el('form', {},
      el('div', { class: 'modal-head' }, el('h2', {}, 'Uygulama Oluştur'), el('p', {}, 'Uygulamanla birlikte ona ait bir bot hesabı da oluşturulur.')),
      el('div', { class: 'modal-body' }, f),
      el('div', { class: 'modal-foot' }, el('button', { class: 'btn-ghost', type: 'button', onclick: closeModal }, 'İptal'), el('span', { class: 'spacer' }), btn));
    submitHandler(form, f, btn, async () => {
      const { application, token } = await api('POST', '/api/applications', { name: nameInput.value });
      reopenApps(application.id);
      showTokenModal(token, true);
    });
    openModal(form);
    setTimeout(() => nameInput.focus(), 40);
  }

  function showTokenModal(token, fresh = false) {
    const input = el('input', { class: 'input-plain token-input', value: token, readonly: true, spellcheck: 'false', 'aria-label': 'Bot token' });
    input.addEventListener('focus', () => input.select());
    openModal(
      el('div', { class: 'modal-head left' },
        el('h2', {}, fresh ? 'Botun hazır! 🎉' : 'Yeni token'),
        el('p', {}, 'Bu token botunun şifresidir. Sadece şimdi görebilirsin; kopyalayıp güvenli bir yere kaydet ve kimseyle paylaşma.')),
      el('div', { class: 'modal-body' },
        el('div', { class: 'token-row' }, input,
          el('button', { class: 'btn-purple', type: 'button', onclick: () => copyText(token, 'Token kopyalandı.') }, 'Kopyala')),
        el('p', { class: 'token-warn' }, icon('lock'), 'Token sızarsa uygulama sayfasından hemen sıfırla; eskisi çalışmaz olur.')),
      el('div', { class: 'modal-foot' }, el('span', { class: 'spacer' }), el('button', { class: 'btn-purple', type: 'button', onclick: closeModal }, 'Tamam')));
    setTimeout(() => input.select(), 40);
  }

  function appDetail(app) {
    const nameInput = el('input', { class: 'input-plain', maxlength: '32', value: app.name });
    const descInput = el('textarea', { class: 'textarea', maxlength: '400', placeholder: 'Botun ne işe yarıyor? Profilinde "Hakkımda" olarak görünür.' });
    descInput.value = app.description;
    const err = el('div', { class: 'err' });
    const save = el('button', { class: 'btn-purple', type: 'button' }, 'Değişiklikleri Kaydet');
    save.addEventListener('click', async () => {
      err.textContent = '';
      save.disabled = true;
      try {
        await api('PATCH', `/api/applications/${app.id}`, { name: nameInput.value, description: descInput.value });
        toast('Uygulama kaydedildi.');
        reopenApps();
      } catch (e) { err.textContent = e.message; save.disabled = false; }
    });

    const chosen = new Set(['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES']);
    const linkInput = el('input', { class: 'input-plain invite-link-input', readonly: true, 'aria-label': 'Davet bağlantısı' });
    const inviteUrl = () => `${location.origin}/oauth2/authorize?client_id=${app.id}${chosen.size ? `&permissions=${[...chosen].join(',')}` : ''}`;
    const paintLink = () => { linkInput.value = inviteUrl(); };
    const permGrid = el('div', { class: 'perm-grid' }, permDefs.map((p) => {
      const box = el('input', { type: 'checkbox', checked: chosen.has(p.id) });
      box.addEventListener('change', () => { if (box.checked) chosen.add(p.id); else chosen.delete(p.id); paintLink(); });
      return el('label', { class: 'perm-check', title: p.description }, box, el('span', {}, p.name));
    }));
    paintLink();

    const resetToken = () => confirmModal({
      title: 'Token sıfırlansın mı?',
      body: 'Eski token hemen geçersiz olur ve çalışan botun bağlantısı kesilir. Botu yeni tokenla yeniden başlatman gerekir.',
      confirmText: 'Sıfırla',
      onConfirm: async () => {
        const { token } = await api('POST', `/api/applications/${app.id}/token`);
        setTimeout(() => showTokenModal(token), 0);
      },
    });
    const removeApp = () => confirmModal({
      title: `${app.name} silinsin mi?`,
      body: 'Uygulama ve botu kalıcı olarak silinir, bot bütün sunuculardan çıkar. Bu işlem geri alınamaz.',
      confirmText: 'Uygulamayı Sil',
      onConfirm: async () => {
        await api('DELETE', `/api/applications/${app.id}`);
        toast('Uygulama silindi.');
        reopenApps(null);
      },
    });

    return [
      el('button', { class: 'link-btn apps-back', type: 'button', onclick: () => reopenApps(null) }, '← Tüm uygulamalar'),
      el('div', { class: 'app-hero' },
        app.bot ? avatar(app.bot, { status: false, cls: 'large' }) : null,
        el('div', {},
          el('div', { class: 'app-hero-name' }, app.name, botTag(app.bot)),
          app.bot ? el('div', { class: 'app-hero-tag' }, tagOf(app.bot)) : null,
          el('div', { class: 'app-hero-meta' }, `${app.serverCount} sunucuda • ${shortDate(app.createdAt)} tarihinde oluşturuldu`))),

      el('h2', {}, 'Genel Bilgiler'),
      el('div', { class: 'pe-section' }, el('label', { class: 'title' }, 'Ad'), nameInput),
      el('div', { class: 'pe-section' }, el('label', { class: 'title' }, 'Açıklama'), descInput),
      el('div', { class: 'pe-section' },
        el('label', { class: 'title' }, 'Uygulama Kimliği'),
        el('div', { class: 'id-row' }, el('code', {}, app.id),
          el('button', { class: 'btn-soft', type: 'button', onclick: () => copyText(app.id, 'Kimlik kopyalandı.') }, 'Kopyala'))),
      err,
      el('div', { class: 'pe-row' }, save),

      el('div', { class: 's-sep' }),
      el('h2', {}, 'Bot Token'),
      el('p', { class: 's-desc' }, 'Botun API\'ye ve canlı olaylara bu tokenla bağlanır. Güvenlik için token kayıtlı tutulmaz; kaybettiysen sıfırlayıp yenisini al.'),
      el('button', { class: 'btn-purple', type: 'button', onclick: resetToken }, 'Token\'ı Sıfırla'),

      el('div', { class: 's-sep' }),
      el('h2', {}, 'Botu Sunucuya Ekle'),
      el('p', { class: 's-desc' }, 'Botunun ihtiyaç duyduğu izinleri seç, oluşan bağlantıyı aç ya da paylaş. Bağlantıyı açan kişi "Sunucuyu Yönet" izni olduğu bir sunucuyu seçerek botu ekler.'),
      permGrid,
      el('div', { class: 'invite-row' }, linkInput,
        el('button', { class: 'btn-soft', type: 'button', onclick: () => copyText(linkInput.value, 'Davet bağlantısı kopyalandı.') }, 'Kopyala'),
        el('a', { class: 'btn-purple', href: linkInput.value, target: '_blank', rel: 'noopener', onclick: (e) => { e.currentTarget.href = inviteUrl(); } }, 'Aç')),

      el('div', { class: 's-sep' }),
      el('div', { class: 'danger-zone' },
        el('div', {}, el('strong', {}, 'Uygulamayı Sil'), el('small', {}, 'Uygulama ve botu kalıcı olarak silinir.')),
        el('button', { class: 'btn-purple btn-danger', type: 'button', onclick: removeApp }, 'Sil')),
    ];
  }

  function connectionsSection() {
    const box = el('div', { class: 'conn-list' }, el('div', { class: 'conn-card' }, el('p', { class: 's-desc' }, 'Yükleniyor...')));
    api('GET', '/api/connections')
      .then(({ spotify }) => box.replaceChildren(spotifyCard(spotify)))
      .catch((err) => box.replaceChildren(el('p', { class: 'err' }, err.message)));
    return [
      el('h1', {}, 'Bağlantılar'),
      el('p', { class: 's-desc' }, 'Hesaplarını bağla; arkadaşların ve sunucudaki üyeler ne dinlediğini görsün.'),
      box,
    ];
  }

  function spotifyCard(sp) {
    const head = el('div', { class: 'conn-head' },
      el('span', { class: 'conn-logo' }, icon('spotify')),
      el('div', { class: 'conn-title' },
        el('strong', {}, 'Spotify'),
        sp.connected
          ? (sp.profileUrl ? el('a', { href: sp.profileUrl, target: '_blank', rel: 'noopener noreferrer' }, sp.displayName) : el('span', {}, sp.displayName))
          : el('span', {}, 'Dinlediğin şarkı profilinde ve üye listesinde görünür')));
    const card = el('div', { class: `conn-card${sp.connected ? ' connected' : ''}` }, head);

    if (!sp.available) {
      card.append(el('p', { class: 'conn-note' },
        'Bu Cydlone sunucusunda Spotify ayarlanmamış. Sunucuyu çalıştıran kişinin config.json dosyasına Spotify uygulama anahtarlarını eklemesi gerekiyor.'));
      return card;
    }
    if (!sp.connected) {
      head.append(el('button', { class: 'btn-purple conn-connect', type: 'button', onclick: () => { location.href = '/connections/spotify'; } }, 'Bağla'));
      return card;
    }

    head.append(el('button', {
      class: 'icon-btn conn-remove',
      type: 'button',
      'aria-label': 'Spotify bağlantısını kaldır',
      dataset: { tip: 'Bağlantıyı Kaldır' },
      onclick: () => confirmModal({
        title: 'Spotify bağlantısını kaldır',
        body: 'Spotify hesabının bağlantısı kaldırılacak ve dinlediğin şarkı artık görünmeyecek.',
        confirmText: 'Bağlantıyı Kaldır',
        onConfirm: async () => {
          await api('DELETE', '/api/connections/spotify');
          toast('Spotify bağlantısı kaldırıldı.');
          if (settingsSection === 'connections') showSection('connections', { force: true });
        },
      }),
    }, icon('x')));
    card.append(
      toggleRow('Profilimde Spotify\'ı etkinlik olarak göster', 'Kapalıyken dinlediğin şarkı kimseye görünmez.', sp.showActivity, async (on, input) => {
        try { await api('PATCH', '/api/connections/spotify', { showActivity: on }); } catch (err) { toast(err.message); input.checked = !on; }
      }),
      activitySlot(me.id));
    return card;
  }

  function toggleRow(title, desc, checked, onChange) {
    const input = el('input', { type: 'checkbox', role: 'switch', 'aria-label': title });
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked, input));
    return el('div', { class: 'option-row' },
      el('div', {}, el('strong', {}, title), el('small', {}, desc)),
      el('label', { class: 'switch-toggle' }, input, el('span')));
  }

  function voiceSection() {
    const p = voice.prefs;
    const select = (kind, key, label) => {
      const s = el('select', { class: 'input-plain select-plain', 'aria-label': label }, el('option', { value: '' }, 'Varsayılan'));
      s.value = '';
      voice.listDevices().then((devices) => {
        devices.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default').forEach((d, i) => {
          s.append(el('option', { value: d.deviceId }, d.label || `${label} ${i + 1}`));
        });
        s.value = p[key] || '';
      });
      s.addEventListener('change', () => voice.setPref(key, s.value));
      return s;
    };

    const meterFill = el('div', { class: 'mic-meter-fill' });
    const meter = el('div', { class: 'mic-meter' }, meterFill);
    const testBtn = el('button', { class: 'btn-soft', type: 'button' }, 'Mikrofonu Test Et');
    const camBox = el('div', { class: 'cam-preview' }, el('span', {}, 'Kamera önizlemesi kapalı'));
    const camBtn = el('button', { class: 'btn-soft', type: 'button' }, 'Kamerayı Test Et');
    let micTest = null;
    let camTest = null;

    const stopMic = () => {
      if (!micTest) return;
      clearInterval(micTest.timer);
      micTest.stream.getTracks().forEach((t) => t.stop());
      micTest.ctx.close();
      micTest = null;
      meterFill.style.width = '0%';
      testBtn.textContent = 'Mikrofonu Test Et';
    };
    const stopCam = () => {
      if (!camTest) return;
      camTest.getTracks().forEach((t) => t.stop());
      camTest = null;
      camBox.replaceChildren(el('span', {}, 'Kamera önizlemesi kapalı'));
      camBtn.textContent = 'Kamerayı Test Et';
    };
    sectionCleanup = () => { stopMic(); stopCam(); };

    testBtn.addEventListener('click', async () => {
      if (micTest) return stopMic();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: voice.prefs.micId ? { exact: voice.prefs.micId } : undefined, noiseSuppression: voice.prefs.noiseSuppression, echoCancellation: voice.prefs.echoCancellation },
        });
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
          const db = rms > 0 ? 20 * Math.log10(rms) : -100;
          meterFill.style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
        }, 60);
        micTest = { stream, ctx, timer };
        testBtn.textContent = 'Testi Durdur';
        showSectionDevicesAgain();
      } catch {
        toast('Mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.');
      }
    });

    camBtn.addEventListener('click', async () => {
      if (camTest) return stopCam();
      try {
        camTest = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: voice.prefs.camId ? { exact: voice.prefs.camId } : undefined, width: { ideal: 640 }, height: { ideal: 360 } },
        });
        const v = el('video', { autoplay: true, playsinline: true });
        v.muted = true;
        v.srcObject = camTest;
        camBox.replaceChildren(v);
        camBtn.textContent = 'Önizlemeyi Kapat';
      } catch {
        toast('Kameraya erişilemedi. Tarayıcı izinlerini kontrol et.');
      }
    });

    const selects = el('div', { class: 'device-grid' });
    const drawSelects = () => selects.replaceChildren(...[
      el('div', { class: 'field' }, el('label', {}, 'Giriş Aygıtı'), select('audioinput', 'micId', 'Mikrofon')),
      'setSinkId' in HTMLMediaElement.prototype
        ? el('div', { class: 'field' }, el('label', {}, 'Çıkış Aygıtı'), select('audiooutput', 'outputId', 'Hoparlör'))
        : null,
      el('div', { class: 'field' }, el('label', {}, 'Kamera'), select('videoinput', 'camId', 'Kamera')),
    ].filter(Boolean));
    const showSectionDevicesAgain = drawSelects;
    drawSelects();

    return [
      el('h1', {}, 'Ses ve Görüntü'),
      selects,
      el('h2', {}, 'Mikrofon Testi'),
      el('p', { class: 's-desc' }, 'Konuş ve çubuğun hareket ettiğini gör. Test sırasında gürültü ve yankı engelleme ayarların uygulanır.'),
      el('div', { class: 'pe-row' }, testBtn, meter),
      el('div', { class: 's-sep' }),
      el('h2', {}, 'Ses İşleme'),
      toggleRow('Gürültü Engelleme', 'Klavye, fan ve arka plan seslerini bastırır; konuşmadığın anlarda mikrofonunu otomatik susturur.',
        p.noiseSuppression, (on) => voice.setPref('noiseSuppression', on)),
      toggleRow('Yankı Engelleme', 'Hoparlörden çıkan sesin mikrofonuna geri girmesini önler.',
        p.echoCancellation, (on) => voice.setPref('echoCancellation', on)),
      el('div', { class: 's-sep' }),
      el('h2', {}, 'Kamera'),
      camBox,
      el('div', { class: 'pe-row', style: 'margin-top:10px' }, camBtn),
    ];
  }

  function appearanceSection() {
    const update = (key, value) => { prefs[key] = value; savePrefs(); applyAppearance(); };
    const density = (value, title, desc) => el('label', { class: 'type-option' },
      el('div', {}, el('strong', {}, title), el('small', {}, desc)),
      Object.assign(el('input', { type: 'radio', name: 'density', value }), {
        checked: prefs.density === value,
        onchange: () => update('density', value),
      }));
    const range = el('input', { class: 'range', type: 'range', min: '12', max: '20', step: '1', value: String(prefs.fontSize), 'aria-label': 'Sohbet yazı boyutu' });
    const rangeValue = el('strong', {}, `${prefs.fontSize}px`);
    range.addEventListener('input', () => { update('fontSize', Number(range.value)); rangeValue.textContent = `${range.value}px`; });

    return [
      el('h1', {}, 'Görünüm'),
      el('h2', {}, 'Vurgu Rengi'),
      el('p', { class: 's-desc' }, "Cydlone'un butonlarında ve vurgularında kullanılan mor tonunu seç. Bu ayar sadece bu cihazda geçerli."),
      swatchPicker(ACCENTS.map(([c]) => c), prefs.accent, (c) => update('accent', c)),
      el('h2', {}, 'Mesaj Görünümü'),
      el('div', { class: 'density-options' },
        density('cozy', 'Rahat', 'Avatarlar ve geniş boşluklar'),
        density('compact', 'Kompakt', 'Ekrana daha çok mesaj sığar')),
      el('h2', {}, 'Sohbet Yazı Boyutu'),
      el('div', { class: 'pe-row', style: 'justify-content:space-between' }, el('span', { class: 's-desc', style: 'margin:0' }, 'Mesaj metninin boyutu'), rangeValue),
      range,
      el('div', { class: 'range-labels' }, el('span', {}, '12px'), el('span', {}, '20px')),
      el('div', { class: 's-sep' }),
      el('button', {
        class: 'btn-soft',
        onclick: () => { Object.assign(prefs, { accent: PREF_DEFAULTS.accent, density: PREF_DEFAULTS.density, fontSize: PREF_DEFAULTS.fontSize }); savePrefs(); applyAppearance(); showSection('appearance', { force: true }); },
      }, 'Varsayılana Dön'),
    ];
  }

  function languageSection() {
    const { languages, lang, setLang } = window.I18N;
    const option = ([code, { name }]) => el('label', { class: 'type-option' },
      el('div', {}, el('strong', { translate: 'no' }, name)),
      Object.assign(el('input', { type: 'radio', name: 'language', value: code }), {
        checked: code === lang,
        onchange: () => setLang(code),
      }));
    return [
      el('h1', {}, 'Dil'),
      el('p', { class: 's-desc' }, 'Cydlone arayüzünün dilini seç. Bu ayar sadece bu cihazda geçerli.'),
      el('div', { class: 'density-options' }, Object.entries(languages).map(option)),
    ];
  }

  function notificationsSection() {
    const supported = 'Notification' in window;
    const note = el('p', { class: 's-desc' });
    const explain = () => {
      if (!supported) note.textContent = 'Bu tarayıcı masaüstü bildirimlerini desteklemiyor.';
      else if (Notification.permission === 'denied') note.textContent = 'Bildirim izni tarayıcıda engellenmiş. Açmak için adres çubuğundaki site ayarlarından izin ver.';
      else note.textContent = '';
    };
    explain();

    return [
      el('h1', {}, 'Bildirimler'),
      toggleRow('Masaüstü bildirimlerini etkinleştir', 'Pencere arka plandayken gelen direkt mesajlar için bildirim göster.',
        prefs.desktop && supported && Notification.permission === 'granted',
        async (on, input) => {
          if (on && supported && Notification.permission !== 'granted') {
            const result = await Notification.requestPermission();
            if (result !== 'granted') { input.checked = false; on = false; }
          }
          if (!supported) { input.checked = false; on = false; }
          prefs.desktop = on;
          savePrefs();
          explain();
        }),
      note,
      toggleRow('Bildirim sesi', 'Yeni bir direkt mesaj geldiğinde kısa bir ses çal.', prefs.sound, (on) => {
        prefs.sound = on;
        savePrefs();
        if (on) playPing();
      }),
      el('p', { class: 's-desc', style: 'margin-top:16px' }, 'Durumun "Rahatsız Etmeyin" iken ses ve bildirimler kapalıdır.'),
    ];
  }

  const tip = $('#tooltip');
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tip]');
    if (!target) return tip.classList.remove('show');
    tip.replaceChildren(...(target.dataset.tipVerified !== undefined
      ? [el('span', { class: 'tip-verified' }, icon('verified')), target.dataset.tip]
      : [target.dataset.tip]));
    const r = target.getBoundingClientRect();
    tip.classList.add('show');
    const tr = tip.getBoundingClientRect();
    if (target.closest('.servers')) {
      tip.style.left = `${r.right + 12}px`;
      tip.style.top = `${r.top + r.height / 2 - tr.height / 2}px`;
    } else {
      const left = Math.min(window.innerWidth - tr.width - 8, Math.max(8, r.left + r.width / 2 - tr.width / 2));
      tip.style.left = `${left}px`;
      const above = r.top - tr.height - 8;
      tip.style.top = `${above >= 8 ? above : r.bottom + 8}px`;
    }
  });
  document.addEventListener('click', () => tip.classList.remove('show'), true);

  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }
  $$('[data-soon]').forEach((b) => b.addEventListener('click', () => toast('Bu özellik yakında geliyor ✨')));

  let booted = false;
  const [{ servers }, { dms }] = await Promise.all([
    api('GET', '/api/servers'),
    api('GET', '/api/dms'),
    loadRelationships(),
  ]);
  state.servers = servers;
  dms.forEach(upsertDm);
  renderServerList();
  booted = true;

  const connResult = new URLSearchParams(location.search).get('connection');
  if (connResult) {
    history.replaceState({}, '', location.pathname);
    const messages = {
      spotify: 'Spotify hesabın bağlandı. Dinlediğin şarkı birkaç saniye içinde görünür.',
      'spotify-cancelled': 'Spotify bağlantısı iptal edildi.',
      'spotify-error': 'Spotify bağlanırken bir sorun oldu. Tekrar dene.',
      'spotify-missing': 'Bu sunucuda Spotify ayarlanmamış.',
    };
    if (messages[connResult]) toast(messages[connResult]);
    openSettings('connections');
  }

  const inviteCode = new URLSearchParams(location.search).get('davet');
  if (inviteCode) {
    history.replaceState({}, '', location.pathname);
    joinServerModal(inviteCode);
  }

  route();
})();
