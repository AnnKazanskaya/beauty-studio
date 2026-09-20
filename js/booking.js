/* Страница бронирования */
(async () => {
  const ctx = await BS.init(); if (!ctx) return;
  const { user, settings } = ctx;
  const { $, $$, esc, iso, parse, today, addDays, fmtDate, fmtHour, money, plural, dayHours, calcPrice, hoursToRanges, toast, modal, closeModal } = BS;

  const SEL_KEY = 'bs_booking_selection';
  const state = {
    month: parse(today()), // первый день показываемого месяца
    date: today(),
    sel: new Map(), // "date|hour|seat" → {date,hour,seat}
    occ: [], closed: [], mine: [],
    rangeFrom: null, rangeTo: null,
  };
  state.month.setDate(1);
  const maxDate = addDays(today(), settings.rules.maxDaysAhead);
  const minMonth = parse(today()); minMonth.setDate(1);
  const maxMonth = parse(maxDate); maxMonth.setDate(1);

  // восстановить выбор после логина
  try { const saved = JSON.parse(sessionStorage.getItem(SEL_KEY) || '[]'); saved.forEach((s) => s.date >= today() && state.sel.set(key(s), s)); sessionStorage.removeItem(SEL_KEY); } catch (e) {}
  function key(s) { return `${s.date}|${s.hour}|${s.seat}`; }

  // Первый рабочий день начиная с сегодня
  for (let i = 0; i <= settings.rules.maxDaysAhead; i++) { const d = addDays(today(), i); const hs = dayHours(settings, d); if (hs.length && (i > 0 || hs.some((h) => h > new Date().getHours()))) { state.date = d; break; } }
  if (state.sel.size) state.date = [...state.sel.values()].sort((a, b) => a.date.localeCompare(b.date))[0].date;
  state.month = parse(state.date); state.month.setDate(1);

  $('#head-badges').innerHTML = `<span class="badge"><b>${settings.seats}</b>&nbsp;места</span><span class="badge gray">от ${money(settings.prices.hour)} / час</span>`;
  if (!settings.bookingOpen) $('#notice').innerHTML = `<div class="card" style="border-color:var(--warn);margin-bottom:20px"><b>Бронирование временно закрыто</b><p class="muted small mt-1">Администратор приостановил приём броней. Загляните позже или позвоните нам.</p></div>`;
  else if (user && user.blocked) $('#notice').innerHTML = `<div class="card" style="border-color:var(--danger);margin-bottom:20px"><b>Аккаунт заблокирован</b><p class="muted small mt-1">Бронирование недоступно. Свяжитесь с администратором студии.</p></div>`;
  const canBook = settings.bookingOpen && !(user && user.blocked);

  async function loadRange() {
    const from = iso(state.month); const last = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0); const to = iso(last);
    if (state.rangeFrom === from) return;
    state.rangeFrom = from; state.rangeTo = to;
    try { [state.occ, state.closed] = await Promise.all([DB.slots.occupied(from, to), DB.slots.closed(from, to)]); }
    catch (e) { toast(e.message, 'error'); }
  }
  const isDayClosed = (d) => !dayHours(settings, d).length || state.closed.some((c) => c.date === d && c.hour === null && c.seat === null);
  const slotClosed = (d, h, s) => state.closed.some((c) => c.date === d && (c.hour === null || c.hour === h) && (c.seat === null || c.seat === s));
  const slotOcc = (d, h, s) => state.occ.find((o) => o.date === d && o.hour === h && o.seat === s);
  const isPast = (d, h) => BS.slotStart(d, h).getTime() <= Date.now();

  /* ---------- календарь ---------- */
  function renderCal() {
    const y = state.month.getFullYear(), m = state.month.getMonth();
    const first = new Date(y, m, 1); const startDow = (first.getDay() + 6) % 7; const days = new Date(y, m + 1, 0).getDate();
    let cells = BS.DOW.map((d) => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < startDow; i++) cells += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const ds = iso(new Date(y, m, d));
      const disabled = ds < today() || ds > maxDate;
      const closed = isDayClosed(ds);
      const mineCnt = state.occ.filter((o) => o.date === ds && o.mine).length;
      const selCnt = [...state.sel.values()].filter((s) => s.date === ds).length;
      cells += `<button class="cal-day ${ds === today() ? 'today' : ''} ${ds === state.date ? 'selected' : ''} ${closed ? 'closed' : ''}" data-d="${ds}" ${disabled ? 'disabled' : ''}>
        ${d}${selCnt ? `<span class="cnt">${selCnt}</span>` : ''}<span class="m">${mineCnt ? '<i></i>' : ''}</span></button>`;
    }
    $('#cal').innerHTML = `<div class="cal-head"><b>${BS.MONTHS_NOM[m]} ${y}</b><div class="cal-nav"><button id="cal-prev" ${state.month <= minMonth ? 'disabled' : ''} aria-label="Предыдущий месяц">‹</button><button id="cal-next" ${state.month >= maxMonth ? 'disabled' : ''} aria-label="Следующий месяц">›</button></div></div>
      <div class="cal-grid">${cells}</div>
      <div class="legend mt-2"><span><i class="mine"></i> мои брони</span><span><i class="sel"></i> выбрано</span><span><i class="closed"></i> закрыто</span></div>`;
    $('#cal-prev').onclick = async () => { state.month = new Date(y, m - 1, 1); await loadRange(); renderCal(); };
    $('#cal-next').onclick = async () => { state.month = new Date(y, m + 1, 1); await loadRange(); renderCal(); };
    $$('.cal-day', $('#cal')).forEach((b) => (b.onclick = () => { state.date = b.dataset.d; renderCal(); renderSlots(); }));
  }

  /* ---------- сетка слотов ---------- */
  function renderSlots() {
    const d = state.date; const hours = dayHours(settings, d);
    const root = $('#slots'); root.style.setProperty('--seats', settings.seats);
    const wholeDayClosed = state.closed.find((c) => c.date === d && c.hour === null && c.seat === null);
    let head = `<div class="slots-head"><b>${fmtDate(d, true)}</b>
      <div class="legend"><span><i class="free"></i> свободно</span><span><i class="busy"></i> занято</span><span><i class="closed"></i> закрыто</span><span><i class="mine"></i> моя бронь</span><span><i class="sel"></i> выбрано</span></div></div>`;
    if (!hours.length) { root.innerHTML = head + `<div class="empty"><b>Выходной</b>В этот день студия не работает.</div>`; return; }
    if (wholeDayClosed) { root.innerHTML = head + `<div class="empty"><b>День закрыт</b>${esc(wholeDayClosed.reason || 'Студия не принимает брони в этот день.')}</div>`; return; }
    let grid = `<div class="slot-table"><div class="th"></div>`;
    for (let s = 1; s <= settings.seats; s++) grid += `<div class="th">Место ${s}</div>`;
    hours.forEach((h) => {
      grid += `<div class="time">${fmtHour(h)}</div>`;
      for (let s = 1; s <= settings.seats; s++) {
        const k = `${d}|${h}|${s}`; const occ = slotOcc(d, h, s);
        let cls = '', label = 'свободно', dis = false;
        if (isPast(d, h)) { cls = 'past'; label = '—'; dis = true; }
        else if (occ && occ.mine) { cls = 'mine'; label = 'моя бронь'; dis = true; }
        else if (occ) { cls = 'busy'; label = 'занято'; dis = true; }
        else if (slotClosed(d, h, s)) { cls = 'closed'; label = 'закрыто'; dis = true; }
        else if (state.sel.has(k)) { cls = 'sel'; label = 'выбрано'; }
        if (!canBook && !dis && cls !== 'sel') dis = true;
        grid += `<button class="slot ${cls}" data-k="${k}" ${dis ? 'disabled' : ''}>${label}</button>`;
      }
    });
    grid += '</div>';
    const free = hours.filter((h) => !isPast(d, h)).reduce((n, h) => { for (let s = 1; s <= settings.seats; s++) if (!slotOcc(d, h, s) && !slotClosed(d, h, s)) n++; return n; }, 0);
    root.innerHTML = head + grid + `<p class="muted small mt-2">Свободно сегодня: ${plural(free, 'слот', 'слота', 'слотов')} · Все часы одного места за день — тариф «день» ${money(settings.prices.day)}.</p>`;
    $$('.slot:not(:disabled)', root).forEach((b) => (b.onclick = () => toggle(b.dataset.k)));
  }
  function toggle(k) {
    if (state.sel.has(k)) state.sel.delete(k);
    else {
      if (state.sel.size >= settings.rules.maxSlotsPerBooking) { toast(`Не больше ${settings.rules.maxSlotsPerBooking} слотов за одну бронь`, 'error'); return; }
      const [date, hour, seat] = k.split('|'); state.sel.set(k, { date, hour: +hour, seat: +seat });
    }
    renderSlots(); renderCal(); renderBar();
  }

  /* ---------- нижняя панель ---------- */
  function renderBar() {
    const items = [...state.sel.values()]; const bar = $('#bookbar');
    if (!items.length) { bar.classList.remove('show'); return; }
    const { total, lines } = calcPrice(items.map((i) => ({ ...i })), settings);
    const days = new Set(items.map((i) => i.date)).size;
    $('#bar-sub').textContent = `Выбрано ${plural(items.length, 'слот', 'слота', 'слотов')}${days > 1 ? ` · ${plural(days, 'день', 'дня', 'дней')}` : ''}${lines.some((l) => l.isDay) ? ' · применён тариф «день»' : ''}`;
    $('#bar-total').textContent = money(total);
    bar.classList.add('show');
  }
  $('#bar-clear').onclick = () => { state.sel.clear(); renderSlots(); renderCal(); renderBar(); };
  $('#bar-book').onclick = () => {
    if (!user) { sessionStorage.setItem(SEL_KEY, JSON.stringify([...state.sel.values()])); location.href = 'login.html?next=booking.html'; return; }
    openConfirm();
  };

  function openConfirm() {
    const items = [...state.sel.values()].map((i) => ({ ...i }));
    const { total, lines } = calcPrice(items, settings);
    const rows = lines.map((l) => `<div class="row" style="justify-content:space-between"><span><b>${fmtDate(l.date)}</b> · место ${l.seat}<br><span class="muted small">${hoursToRanges(l.hours)}${l.isDay ? ' · тариф «день»' : ''}</span></span><b>${money(l.sum)}</b></div>`).join('');
    modal(`<h3>Подтвердите бронь</h3><p class="muted small">Оплата на месте перед началом работы. Отмена без штрафа — за ${settings.rules.cancelHours} ч и более.</p>
      <div class="summary">${rows}<div class="row total" style="justify-content:space-between"><span>Итого</span><span>${money(total)}</span></div></div>
      <div class="form-msg" id="cf-msg"></div>
      <div class="actions"><button class="btn light" data-close>Назад</button><button class="btn pink" id="cf-ok">Забронировать</button></div>`,
      { onOpen: (m) => { $('#cf-ok', m).onclick = () => submit(items, total, m); } });
  }
  async function submit(items, total, m) {
    const btn = $('#cf-ok', m); BS.busy(btn, true, 'Бронируем…');
    try {
      await DB.bookings.create(items);
      closeModal(); state.sel.clear(); state.rangeFrom = null; await loadRange(); renderCal(); renderSlots(); renderBar();
      modal(`<div style="text-align:center"><div class="avatar lg" style="background:var(--pink);margin:0 auto 14px">✓</div><h3>Место забронировано</h3><p class="muted mt-1">${plural(items.length, 'слот', 'слота', 'слотов')} на сумму <b>${money(total)}</b>. Ждём вас — оплата на месте.</p>
        <div class="actions" style="justify-content:center"><button class="btn light" data-close>Ещё бронь</button><a class="btn" href="account.html">Мои записи</a></div></div>`);
    } catch (e) { BS.showMsg($('#cf-msg', m), e.message); BS.busy(btn, false); state.rangeFrom = null; await loadRange(); renderSlots(); }
  }

  await loadRange(); renderCal(); renderSlots(); renderBar();
})();
