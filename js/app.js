/* Общий код для всех публичных страниц */
window.BS = (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- даты ---------- */
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DOW_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const dowIdx = (s) => (parse(s).getDay() + 6) % 7;
  const fmtDate = (s, withDow = false) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}${withDow ? ', ' + DOW_FULL[dowIdx(s)].toLowerCase() : ''}`; };
  const fmtDateDow = (s) => { const d = parse(s); return `${DOW_FULL[dowIdx(s)]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  const fmtDateNum = (s) => { const d = parse(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
  const fmtHour = (h) => `${pad(h)}:00`;
  const fmtRange = (h1, h2) => `${fmtHour(h1)} — ${fmtHour(h2 + 1)}`;
  const slotStart = (date, hour) => { const d = parse(date); d.setHours(hour, 0, 0, 0); return d; };
  const money = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
  const rel = (isoStr) => {
    const diff = (Date.now() - new Date(isoStr).getTime()) / 6e4;
    if (diff < 1) return 'только что';
    if (diff < 60) return `${Math.floor(diff)} мин назад`;
    if (diff < 60 * 24) return `${Math.floor(diff / 60)} ч назад`;
    return `${Math.floor(diff / 1440)} дн назад`;
  };
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c); };

  /* ---------- расписание, места и цены ---------- */
  const seats = (settings) => (settings.seatNames || []).length || 1;
  const seatName = (settings, i) => (settings.seatNames && settings.seatNames[i - 1]) || `Место ${i}`;
  function dayHours(settings) {
    const out = []; for (let h = settings.hours.open; h < settings.hours.close; h++) out.push(h); return out;
  }
  function calcPrice(items, settings) {
    const groups = {};
    items.forEach((it) => { const k = it.date + '|' + it.seat; (groups[k] ||= []).push(it); });
    let total = 0; const lines = [];
    Object.entries(groups).forEach(([k, arr]) => {
      const [date, seat] = k.split('|');
      const all = dayHours(settings).length;
      const isDay = all > 0 && arr.length >= all;
      const sum = isDay ? settings.prices.day : arr.length * settings.prices.hour;
      total += sum;
      arr.forEach((it) => (it.price = Math.round(sum / arr.length)));
      const hours = arr.map((a) => a.hour).sort((a, b) => a - b);
      lines.push({ date, seat: Number(seat), hours, isDay, sum });
    });
    return { total, lines: lines.sort((a, b) => a.date.localeCompare(b.date) || a.seat - b.seat) };
  }
  function hoursToRanges(hours) {
    const out = []; let start = null, prev = null;
    hours.forEach((h) => { if (start === null) { start = prev = h; return; } if (h === prev + 1) { prev = h; return; } out.push(fmtRange(start, prev)); start = prev = h; });
    if (start !== null) out.push(fmtRange(start, prev));
    return out.join(', ');
  }
  const canCancel = (b, settings) => slotStart(b.date, b.hour).getTime() - Date.now() >= settings.rules.cancelHours * 36e5;

  /* ---------- UI ---------- */
  function toast(msg, type = 'ok') {
    let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, 3200);
  }
  function modal(html, { onOpen } = {}) {
    let bg = $('#modal-bg');
    if (!bg) { bg = document.createElement('div'); bg.id = 'modal-bg'; bg.className = 'modal-bg'; document.body.appendChild(bg); bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); }); }
    bg.innerHTML = `<div class="modal" role="dialog">${html}</div>`; bg.classList.add('open');
    $$('[data-close]', bg).forEach((b) => b.addEventListener('click', closeModal));
    onOpen && onOpen(bg.firstElementChild);
    return bg.firstElementChild;
  }
  function closeModal() { const bg = $('#modal-bg'); bg && bg.classList.remove('open'); }
  function confirmDlg(title, text, { ok = 'Подтвердить', danger = false } = {}) {
    return new Promise((res) => {
      modal(`<h3>${esc(title)}</h3><p class="muted">${text}</p><div class="actions"><button class="btn outline" data-close>Отмена</button><button class="btn ${danger ? 'outline red' : ''}" id="dlg-ok">${esc(ok)}</button></div>`,
        { onOpen: (m) => { $('#dlg-ok', m).onclick = () => { closeModal(); res(true); }; $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => res(false))); } });
    });
  }
  function pwToggles(root = document) {
    $$('.pw-toggle', root).forEach((btn) => { if (!btn.textContent.trim()) btn.textContent = 'показать'; btn.addEventListener('click', () => {
      const inp = btn.parentElement.querySelector('input'); const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password'; btn.textContent = show ? 'скрыть' : 'показать';
    }); });
  }
  function phoneMask(input) {
    const fmt = (v) => {
      let d = v.replace(/\D/g, ''); if (d.startsWith('8')) d = '7' + d.slice(1); if (!d.startsWith('7')) d = '7' + d; d = d.slice(0, 11);
      let r = '+7'; if (d.length > 1) r += ' (' + d.slice(1, 4); if (d.length >= 4) r += ') ' + d.slice(4, 7); if (d.length >= 7) r += '-' + d.slice(7, 9); if (d.length >= 9) r += '-' + d.slice(9, 11);
      return r;
    };
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '') ? fmt(input.value) : ''; });
    input.addEventListener('focus', () => { if (!input.value) input.value = '+7 ('; });
    input.addEventListener('blur', () => { if (input.value === '+7 (' || input.value === '+7') input.value = ''; });
  }
  const setErr = (field, msg) => { field.classList.toggle('has-error', !!msg); const e = $('.err', field); if (e) e.textContent = msg || ''; $('.input', field)?.classList.toggle('error', !!msg); };
  const showMsg = (el, msg, type = 'error') => { el.className = 'form-msg show ' + type; el.textContent = msg; };
  const busy = (btn, on, label) => { if (!btn) return; if (on) { btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = label || 'Подождите…'; } else { btn.disabled = false; btn.innerHTML = btn.dataset.l || btn.innerHTML; } };

  /* ---------- шапка / подвал ---------- */
  function page() { return location.pathname.split('/').pop() || 'index.html'; }
  function renderHeader(user) {
    const h = $('#site-header'); if (!h) return;
    const cur = page();
    const items = [['index.html', 'Главная'], ['booking.html', 'Бронирование']];
    if (user) items.push(['account.html', 'Мои записи']);
    items.push(['prices.html', 'Цены'], ['contacts.html', 'Контакты']);
    const nav = items.map(([href, t]) => `<a href="${href}" class="${cur === href ? 'active' : ''}">${t}</a>`).join('');
    const right = user
      ? `<div class="user-menu" id="user-menu"><button class="avatar" aria-label="Меню">${esc((user.name || user.email || '?').trim()[0].toUpperCase())}</button>
           <div class="dropdown"><div style="padding:8px 14px 4px"><b>${esc(user.name || 'Мастер')}</b><div class="small muted">${esc(user.email)}</div></div><div class="sep"></div>
           <a href="account.html">Мои записи</a><a href="profile.html">Мой профиль</a>${user.role === 'admin' ? '<a href="admin/index.html">Админ‑панель</a>' : ''}<div class="sep"></div><button class="danger" id="logout-btn">Выйти</button></div></div>`
      : `<a class="link" href="login.html">Войти</a><a class="btn sm" href="register.html">Регистрация</a>`;
    h.className = 'header';
    h.innerHTML = `<div class="container"><a class="logo" href="index.html"><i></i>INBEAUTY</a><nav class="nav">${nav}</nav>
      <div class="header-right">${right}<button class="burger" aria-label="Меню"><span></span><span></span><span></span></button></div></div>
      <div class="mobile-nav" id="mobile-nav">${nav}${user ? '<a href="profile.html">Мой профиль</a>' : '<a href="login.html">Войти</a>'}</div>`;
    $('.burger', h).onclick = () => $('#mobile-nav').classList.toggle('open');
    const um = $('#user-menu');
    if (um) {
      $('.avatar', um).onclick = (e) => { e.stopPropagation(); um.classList.toggle('open'); };
      document.addEventListener('click', () => um.classList.remove('open'));
      $('#logout-btn').onclick = async () => { await DB.auth.signOut(); toast('Вы вышли из аккаунта'); location.href = 'index.html'; };
    }
  }
  function renderSimpleHeader() {
    const h = $('#site-header'); if (!h) return;
    h.className = 'header simple';
    h.innerHTML = `<div class="container"><a class="logo" href="index.html"><i></i>INBEAUTY</a><a class="back" href="index.html">‹ На главную</a></div>`;
  }
  function renderFooter(settings) {
    const f = $('#site-footer'); if (!f) return; const c = settings.contacts;
    f.className = 'footer';
    f.innerHTML = `<div class="container"><div><b style="color:var(--ink)">INBEAUTY</b> · ${esc(c.address)}</div>
      <div class="links"><a href="prices.html">Цены</a><a href="contacts.html">Контакты</a><a href="login.html">Вход</a><a href="admin/login.html">Админ</a></div>
      <div>© ${new Date().getFullYear()} InBeauty</div></div>`;
  }

  async function init({ auth = false, redirectIfAuthed = false, simple = false } = {}) {
    let user = null, settings = DB.DEFAULT_SETTINGS;
    try { [user, settings] = await Promise.all([DB.auth.me(), DB.settings.get()]); } catch (e) { console.error(e); }
    if (auth && !user) { location.replace('login.html?next=' + encodeURIComponent(page())); return null; }
    if (redirectIfAuthed && user) { location.replace(new URLSearchParams(location.search).get('next') || 'account.html'); return null; }
    if (simple) renderSimpleHeader(); else renderHeader(user);
    renderFooter(settings); pwToggles();
    return { user, settings };
  }

  return { $, $$, esc, pad, iso, parse, today, addDays, dowIdx, fmtDate, fmtDateDow, fmtDateNum, fmtHour, fmtRange, slotStart, money, rel, plural,
    MONTHS, MONTHS_NOM, MONTHS_SHORT, DOW, DOW_FULL, seats, seatName, dayHours, calcPrice, hoursToRanges, canCancel,
    toast, modal, closeModal, confirmDlg, pwToggles, phoneMask, setErr, showMsg, busy, init, page };
})();
