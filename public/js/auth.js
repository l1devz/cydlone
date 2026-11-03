const Auth = (() => {
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz',
    'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  function clearErrors(form) {
    form.querySelectorAll('.field').forEach((f) => {
      f.classList.remove('has-error');
      const err = f.querySelector('.err');
      if (err) err.textContent = '';
    });
    const box = document.getElementById('form-error');
    if (box) box.classList.remove('show');
  }

  function showErrors(form, errors) {
    Object.entries(errors).forEach(([name, msg]) => {
      const field = form.querySelector(`.field[data-field="${name}"]`);
      if (!field) return showFormError(msg);
      field.classList.add('has-error');
      field.querySelector('.err').textContent = `- ${msg}`;
    });
  }

  function showFormError(msg) {
    const box = document.getElementById('form-error');
    if (!box) return;
    box.textContent = msg;
    box.classList.add('show');
  }

  function bindForm(form, url, collect) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(form);
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(collect(form)),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const davet = new URLSearchParams(window.location.search).get('davet');
          window.location.href = davet ? `/channels/@me?davet=${encodeURIComponent(davet)}` : '/channels/@me';
          return;
        }
        if (data.errors) showErrors(form, data.errors);
        else showFormError(data.error || 'Bir şeyler ters gitti. Tekrar dene.');
      } catch {
        showFormError('Sunucuya ulaşılamadı. Bağlantını kontrol et.');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function fillBirthSelects(form) {
    const month = form.month, day = form.day, year = form.year;
    MONTHS.forEach((m, i) => month.add(new Option(m, String(i + 1))));
    for (let d = 1; d <= 31; d++) day.add(new Option(String(d), String(d)));
    const now = new Date().getFullYear();
    for (let y = now - 3; y >= now - 120; y--) year.add(new Option(String(y), String(y)));
  }

  function drawQr(svg) {
    const N = 25;
    const parts = [];
    const finder = (x, y) => {
      parts.push(`<rect x="${x}" y="${y}" width="7" height="7" fill="#13131a"/>`,
        `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/>`,
        `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#13131a"/>`);
    };
    const inFinder = (x, y) => (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
    const inLogo = (x, y) => x > 8 && x < 16 && y > 8 && y < 16;
    let seed = 7;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!inFinder(x, y) && !inLogo(x, y) && rand() > 0.5) {
          parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#13131a"/>`);
        }
      }
    }
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    svg.innerHTML = parts.join('');
  }

  return { bindForm, fillBirthSelects, drawQr, showFormError };
})();
