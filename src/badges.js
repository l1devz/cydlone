const BADGES = [
  {
    id: 'staff',
    name: 'Cydlone Ekibi',
    description: "Cydlone'u geliştiren ekibin bir üyesi",
    color: '#5b6cf2',
    svg: '<g transform="rotate(-45 12 12)">'
      + '<rect x="10.7" y="8.5" width="2.6" height="13.5" rx="1.3" fill="#4655d4"/>'
      + '<path d="M6.3 3.6c0-.7.5-1.2 1.2-1.2h9c.7 0 1.2.5 1.2 1.2v3.9c0 .7-.5 1.2-1.2 1.2h-9c-.7 0-1.2-.5-1.2-1.2Z" fill="#4655d4"/>'
      + '<path d="M17.7 3.4h1.6c.4 0 .7.3.7.7v2.8c0 .4-.3.7-.7.7h-1.6Z" fill="#3643b8"/></g>'
      + '<g transform="rotate(45 12 12)">'
      + '<rect x="10.6" y="8.2" width="2.8" height="14" rx="1.4" fill="#6c7cff"/>'
      + '<path d="M8 5.3a4 4 0 0 1 2.6-3.7v3.9h2.8V1.6A4 4 0 0 1 13.4 9v1.2h-2.8V9A4 4 0 0 1 8 5.3Z" fill="#6c7cff"/></g>',
  },
  {
    id: 'partner',
    name: 'Partner Sunucu Sahibi',
    description: "Cydlone'un partner programındaki bir sunucunun sahibi",
    color: '#5b6cf2',
    svg: '<rect x="1.6" y="8.2" width="12.6" height="7.6" rx="3.8" transform="rotate(-28 7.9 12)" fill="none" stroke="#6c7cff" stroke-width="2.8"/>'
      + '<rect x="9.8" y="8.2" width="12.6" height="7.6" rx="3.8" transform="rotate(-28 16.1 12)" fill="none" stroke="#4655d4" stroke-width="2.8"/>'

  },
  {
    id: 'moderator',
    name: 'Cydlone Moderatör',
    description: 'Topluluğun güvenliğini ve düzenini sağlayan resmi moderatör',
    color: '#f57c22',
    svg: '<path d="M12 1.8 4 4.6c-.5.2-.8.6-.8 1.1v5.5c0 5.2 3.6 9.5 8.4 11 .3.1.5.1.8 0 4.8-1.5 8.4-5.8 8.4-11V5.7c0-.5-.3-.9-.8-1.1Z" fill="#f57c22"/>'
      + '<path d="M12 1.8v20.4h.4c4.8-1.5 8.4-5.8 8.4-11V5.7c0-.5-.3-.9-.8-1.1Z" fill="#de5f0b"/>'
      + '<path d="M12 4.6 6.2 6.7v4.5c0 3.9 2.4 7.3 5.8 8.6Z" fill="#fff4e8"/>'
      + '<path d="M12 4.6v15.2c3.4-1.3 5.8-4.7 5.8-8.6V6.7Z" fill="#ffb26b"/>',
  },
  {
    id: 'events',
    name: 'Etkinlik Ekibi',
    description: 'Cydlone etkinliklerini düzenleyen ve topluluğu bir araya getiren ekipten',
    color: '#f5a524',
    svg: '<path d="M1.5 7.6 7 10.4l1.4-2.6L12 12.2l3.6-4.4 1.4 2.6 5.5-2.8-3.4 8.2-4.9 1.5L12 21l-2.2-3.7-4.9-1.5Z" fill="#f5a524"/>'
      + '<path d="M12 12.2 15.6 7.8l1.4 2.6 5.5-2.8-3.4 8.2-4.9 1.5L12 21Z" fill="#e08a0b"/>'
      + '<path d="m12 14.4 1.6 2-1.6 2.6-1.6-2.6Z" fill="#fff1c7"/>'
      + '<path d="m12 1.8 1.2 2.6 2.8.3-2.1 1.9.6 2.8L12 8l-2.5 1.4.6-2.8L8 4.7l2.8-.3Z" fill="#ffd43b"/>',
  },
  {
    id: 'bug_hunter',
    name: 'Hata Avcısı',
    description: "Cydlone'da hata bulup bildirerek gelişimine katkı sağladı",
    color: '#23a55a',
    svg: '<path d="M10.2 13.8 3 21" stroke="#1a8a49" stroke-width="2.6" stroke-linecap="round"/>'
      + '<path d="M9 14.4c-.6-2.4.1-5.8 2.6-8.3 2.9-2.9 6.8-3.6 9-1.4 2.2 2.2 1.5 6.1-1.4 9-2.5 2.5-5.9 3.2-8.3 2.6Z" fill="#7fe0a4"/>'
      + '<path d="M20.6 4.7c2.2 2.2 1.5 6.1-1.4 9-2.5 2.5-5.9 3.2-8.3 2.6l-.3-.3Z" fill="#4cc77d"/>'
      + '<path d="M9 14.4c-.6-2.4.1-5.8 2.6-8.3 2.9-2.9 6.8-3.6 9-1.4" fill="none" stroke="#23a55a" stroke-width="1.6" stroke-linecap="round"/>',
  },
  {
    id: 'bug_hunter_gold',
    name: 'Altın Hata Avcısı',
    description: 'Çok sayıda ya da çok önemli hatayı bularak Cydlone\'a büyük katkı sağladı',
    rarity: 'Nadir',
    color: '#f2b63c',
    svg: '<path d="M10.2 13.8 3 21" stroke="#d8941a" stroke-width="2.6" stroke-linecap="round"/>'
      + '<path d="M9 14.4c-.6-2.4.1-5.8 2.6-8.3 2.9-2.9 6.8-3.6 9-1.4 2.2 2.2 1.5 6.1-1.4 9-2.5 2.5-5.9 3.2-8.3 2.6Z" fill="#ffe08a"/>'
      + '<path d="M20.6 4.7c2.2 2.2 1.5 6.1-1.4 9-2.5 2.5-5.9 3.2-8.3 2.6l-.3-.3Z" fill="#f7c64d"/>'
      + '<path d="M9 14.4c-.6-2.4.1-5.8 2.6-8.3 2.9-2.9 6.8-3.6 9-1.4" fill="none" stroke="#e8a42a" stroke-width="1.6" stroke-linecap="round"/>'
      + '<path d="M4.4 3.2 4.9 4.5l1.3.5-1.3.5-.5 1.3-.5-1.3L2.6 5l1.3-.5Z" fill="#ffd43b">'
      + '<animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/></path>',
  },
  {
    id: 'bot_dev',
    name: 'Erken Doğrulanmış Bot Geliştiricisi',
    description: "Cydlone'un ilk doğrulanmış botlarından birini geliştirdi",
    color: '#5b6cf2',
    svg: '<path d="M12 1.5c.4 0 .8.1 1.1.3l7.6 4.4c.7.4 1.1 1.1 1.1 1.9v7.8c0 .8-.4 1.5-1.1 1.9l-7.6 4.4c-.7.4-1.5.4-2.2 0l-7.6-4.4c-.7-.4-1.1-1.1-1.1-1.9V8.1c0-.8.4-1.5 1.1-1.9l7.6-4.4c.3-.2.7-.3 1.1-.3Z" fill="#6c7cff"/>'
      + '<path d="M12 1.5c.4 0 .8.1 1.1.3l7.6 4.4c.7.4 1.1 1.1 1.1 1.9v7.8c0 .8-.4 1.5-1.1 1.9l-7.6 4.4c-.3.2-.7.3-1.1.3Z" fill="#4f5fe6"/>'
      + '<path d="M8.6 8.6 5.2 12l3.4 3.4M15.4 8.6l3.4 3.4-3.4 3.4" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="m13.3 7.4-2.6 9.2" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/>',
  },
  {
    id: 'plus',
    name: 'Cydlone+',
    description: "Cydlone+ ile Cydlone'u destekliyor",
    color: '#7c5cff',
    svg: '<path d="M2 8.6h4.6M3.4 12h3.4M2 15.4h4.6" stroke="#9b85ff" stroke-width="1.8" stroke-linecap="round"/>'
      + '<circle cx="14.6" cy="12" r="6.6" fill="none" stroke="#7c5cff" stroke-width="3.2"/>'
      + '<path d="M14.6 5.4a6.6 6.6 0 0 1 0 13.2" fill="none" stroke="#5d3ee6" stroke-width="3.2"/>'
      + '<circle cx="14.6" cy="12" r="2.4" fill="#d9d0ff"/>',
  },
  {
    id: 'early',
    name: 'Erken Dönem Destekçisi',
    description: "Cydlone'a daha ilk günlerinde katılıp yolculuğun başından beri yanında olan kullanıcı.",
    note: 'Erken dönem kapandığında bu rozet bir daha verilmeyecek.',
    rarity: 'Nadir',
    color: '#8f7bff',
    svg: '<path d="M16.6 5.6 21.9 3.6c.4-.1.7.2.6.6l-1.9 5Z" fill="#ff9f43"/>'
      + '<circle cx="12" cy="12.6" r="9" fill="#eceaf6"/>'
      + '<path d="M12 3.6a9 9 0 0 1 0 18Z" fill="#cfcae4"/>'
      + '<path d="M5 7.6a9 9 0 0 1 14 0l-1.3 1.2a7.2 7.2 0 0 0-11.4 0Z" fill="#ff9f43"/>'
      + '<rect x="4.6" y="9.6" width="14.8" height="8" rx="4" fill="#5b45d9"/>'
      + '<path d="M12 9.6h3.4a4 4 0 0 1 0 8H12Z" fill="#4733c2"/>'
      + '<circle cx="9.2" cy="13.6" r="1.1" fill="#fff"/><circle cx="14.8" cy="13.6" r="1.1" fill="#fff"/>'
      + '<path d="M6.6 11.4c.6-.7 1.5-1 2.4-1" stroke="#a99bff" stroke-width=".9" stroke-linecap="round" fill="none"/>'
      + '<path d="M2.2 19.4 2.6 20.4l1 .4-1 .4-.4 1-.4-1-1-.4 1-.4Z" fill="#ffd9ff">'
      + '<animate attributeName="opacity" values="0;1;0" dur="2.2s" repeatCount="indefinite"/></path>',
  },
];

const AUTO_BADGES = ['early'];

const byId = Object.fromEntries(BADGES.map((b) => [b.id, b]));

function findBadge(idOrName) {
  const q = String(idOrName || '').trim().toLowerCase();
  return byId[q] || BADGES.find((b) => b.name.toLowerCase() === q) || null;
}

function normalizeBadges(ids) {
  const set = new Set(ids || []);
  return BADGES.filter((b) => set.has(b.id)).map((b) => b.id);
}

module.exports = { BADGES, AUTO_BADGES, findBadge, normalizeBadges };
