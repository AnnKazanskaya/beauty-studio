/* Общий каркас админ‑панели */
window.ADMIN = (function () {
  const { $, $$, esc } = BS;
  const NAV = [['index.html', 'Дашборд', '◉'], ['schedule.html', 'Расписание', '▦'], ['masters.html', 'Мастера', '◐'], ['settings.html', 'Настройки', '✦']];

  async function init() {
    let user = null, settings = DB.DEFAULT_SETTINGS;
    try { [user, settings] = await Promise.all([DB.auth.me(), DB.settings.get()]); } catch (e) { console.error(e); }
    if (!user || user.role !== 'admin') { location.replace('login.html'); return null; }
    const cur = BS.page();
    const links = NAV.map(([h, t, i]) => `<a href="${h}" class="nav-item ${cur === h ? 'active' : ''}"><span class="ic">${i}</span>${t}</a>`).join('');
    $('#sidebar').innerHTML = `<div class="brand"><a class="logo" href="../index.html"><i></i><span>BEAUTY<br>STUDIO</span></a><span class="badge tag">Admin</span></div>${links}
      <div class="spacer"></div><a href="../index.html" class="nav-item"><span class="ic">‹</span>На сайт</a>
      <div class="who"><span class="avatar sm">${esc((user.name || 'A')[0].toUpperCase())}</span><div class="meta"><b>${esc(user.name || 'Администратор')}</b><span>${esc(user.email)}</span></div><button id="adm-logout" title="Выйти" aria-label="Выйти">⏻</button></div>`;
    $('#adm-logout').onclick = async () => { await DB.auth.signOut(); location.href = '../index.html'; };
    const tb = $('#topbar');
    if (tb) { tb.innerHTML = `<span class="logo" style="color:#fff;font-size:16px"><i></i>BEAUTY STUDIO <span class="badge tag" style="margin-left:8px">Admin</span></span><button class="burger" id="sb-toggle" aria-label="Меню"><span></span><span></span><span></span></button>`;
      $('#sb-toggle').onclick = () => $('#sidebar').classList.toggle('open'); }
    return { user, settings };
  }

  function actionsMenu(items) {
    return `<div class="actions-menu"><button class="dots" aria-label="Действия">···</button><div class="menu">${items.map((it) => `<button class="${it.danger ? 'danger' : ''}" data-act="${it.act}">${it.label}</button>`).join('')}</div></div>`;
  }
  function bindMenus(root, handler) {
    $$('.actions-menu', root).forEach((m) => {
      $('.dots', m).onclick = (e) => { e.stopPropagation(); $$('.actions-menu.open').forEach((x) => x !== m && x.classList.remove('open')); m.classList.toggle('open'); };
      $$('.menu button', m).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); m.classList.remove('open'); handler(b.dataset.act, m); }));
    });
  }
  document.addEventListener('click', () => $$('.actions-menu.open').forEach((x) => x.classList.remove('open')));

  const groupBookings = (list) => {
    const g = {};
    list.forEach((b) => { const k = b.date + '|' + b.seat + '|' + b.user_id + '|' + b.status; (g[k] ||= { date: b.date, seat: b.seat, user_id: b.user_id, status: b.status, profile: b.profile, created_at: b.created_at, items: [] }).items.push(b); });
    return Object.values(g).map((x) => ({ ...x, items: x.items.sort((a, b) => a.hour - b.hour), sum: x.items.reduce((s, i) => s + (i.price || 0), 0), ids: x.items.map((i) => i.id) }));
  };
  const initial = (name) => esc(((name || '?').trim()[0] || '?').toUpperCase());

  return { init, actionsMenu, bindMenus, groupBookings, initial };
})();
