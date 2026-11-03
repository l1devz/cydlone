(() => {
  document.querySelectorAll('[data-tabs]').forEach((tabs) => {
    const buttons = tabs.querySelectorAll('[data-tab]');
    buttons.forEach((btn) => btn.addEventListener('click', () => {
      buttons.forEach((b) => { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
      tabs.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
    }));
  });

  document.querySelectorAll('.dx-code').forEach((pre) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dx-copy';
    btn.textContent = 'Kopyala';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code').textContent);
        btn.textContent = 'Kopyalandı!';
        btn.classList.add('done');
      } catch {
        btn.textContent = 'Kopyalanamadı';
      }
      setTimeout(() => { btn.textContent = 'Kopyala'; btn.classList.remove('done'); }, 1500);
    });
    pre.append(btn);
  });

  fetch('/api/gelistirici/izinler').then((r) => r.json()).then(({ permissions }) => {
    const body = document.querySelector('#perm-table tbody');
    body.replaceChildren(...permissions.map((p) => {
      const tr = document.createElement('tr');
      [p.id, p.name, p.description].forEach((text, i) => {
        const td = document.createElement('td');
        if (i === 0) { const code = document.createElement('code'); code.textContent = text; td.append(code); } else td.textContent = text;
        tr.append(td);
      });
      return tr;
    }));
  }).catch(() => {
    document.querySelector('#perm-table tbody').innerHTML = '<tr><td colspan="3">İzinler yüklenemedi.</td></tr>';
  });

  const links = [...document.querySelectorAll('.dx-side a')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const mark = () => {
    const y = window.scrollY + 120;
    let current = sections[0];
    sections.forEach((s) => { if (s.offsetTop <= y) current = s; });
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${current.id}`));
  };
  window.addEventListener('scroll', mark, { passive: true });
  mark();
})();
