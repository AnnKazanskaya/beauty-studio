/* Общий каркас админ‑панели */
window.ADMIN = (function () {
  const { $, $$, esc } = BS;
  const NAV = [['index.html', 'Дашборд', '▦'], ['schedule.html', 'Расписание', '▤'], ['masters.html', 'Мастера', '◉'], ['settings.html', 'Настройки', '⚙']];

  async function init() {
    let user = null, settings = DB.DEFAULT_SETTINGS;
    try { [user, settings] = await Promise.all([DB.auth.me(), DB.settings.get()]); } catch (e) { console.error(e); }
    if (!user || user.role !== 'admin') { location.replace('login.html'); return null; }
    const cur = BS.page();
    const links = NAV.map(([h, t, i]) => `<a href="${h}" class="${cur === h ? 'active' : ''}"><span style="width:18px;text-align:center">${i}</span>${t}</a>`).join('');
    $('#sidebar').innerHTML = `<a class="logo" href="../index.html"><i></i>BEAUTY STUDIO <span class="badge pink" style="padding:2px 8px;font-size:10px;margin-left:6px">Admin</span></a>${links}
      <div class="spacer"></div><a href="../index.html">‹ На сайт</a>
      <div class="who"><b>${esc(user.name || 'Администратор')}</b>${esc(user.email)}<button class="btn light sm block" id="adm-logout">Выйти</button></div>`;
    $('#adm-logout').onclick = async () => { await DB.auth.signOut(); location.href = '../index.html'; };
    const tb = $('#topbar');
    if (tb) { tb.innerHTML = `<b style="letter-spacing:.14em;font-size:13px">BEAUTY STUDIO · ADMIN</b><button class="burger" style="background:transparent;border-color:rgba(255,255,255,.3)" id="sb-toggle"><span style="background:#fff"></span><span style="background:#fff"></span><span style="background:#fff"></span></button>`;
      $('#sb-toggle').onclick = () => $('#sidebar').classList.toggle('open'); }
    if (DB.mode === 'demo') { const b = document.createElement('div'); b.className = 'demo-banner'; b.textContent = 'Демо‑режим: изменения сохраняются только в этом браузере.'; $('.admin-main').prepend(b); }
    return { user, settings };
  }

  // Меню действий «···»
  function actionsMenu(items) {
    const id = 'am-' + Math.random().toString(36).slice(2, 8);
    return `<div class="actions-menu" id="${id}"><button class="dots" aria-label="Действия">···</button><div class="menu">${items.map((it) => `<button class="${it.danger ? 'danger' : ''}" data-act="${it.act}">${it.label}</button>`).join('')}</div></div>`;
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

  return { init, actionsMenu, bindMenus, groupBookings };
})();
