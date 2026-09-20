/* Страница бронирования */
(async () => {
  const ctx = await BS.init(); if (!ctx) return;
  const { user, settings } = ctx;
  const { $, $$, esc, iso, parse, today, addDays, fmtDate, fmtDateDow, fmtHour, money, plural, dayHours, calcPrice, hoursToRanges, toast, modal, closeModal, seats, seatName } = BS;

  const SEL_KEY = 'bs_booking_selection';
  const nSeats = seats(settings); const hours = dayHours(settings);
  const state = { month: parse(today()), date: today(), sel: new Map(), occ: [], closed: [], rangeFrom: null };
  state.month.setDate(1);
  const maxDate = addDays(today(), settings.rules.maxDaysAhead);
  const minMonth = parse(today()); minMonth.setDate(1);
  const maxMonth = parse(maxDate); maxMonth.setDate(1);

  try { const saved = JSON.parse(sessionStorage.getItem(SEL_KEY) || '[]'); saved.forEach((s) => s.date >= today() && state.sel.set(key(s), s)); sessionStorage.removeItem(SEL_KEY); } catch (e) {}
  function key(s) { return `${s.date}|${s.hour}|${s.seat}`; }

  // Первый день, где ещё есть будущие часы
  for (let i = 0; i <= settings.rules.maxDaysAhead; i++) { const d = addDays(today(), i); if (i > 0 || hours.some((h) => h > new Date().getHours())) { state.date = d; break; } }
  if (state.sel.size) state.date = [...state.sel.values()].sort((a, b) => a.date.localeCompare(b.date))[0].date;
  state.month = parse(state.date); state.month.setDate(1);

  if (!settings.bookingOpen) $('#notice').innerHTML = `<div class="card mb-3" style="border-color:var(--yellow)"><b>Бронирование временно закрыто</b><p class="muted small mt-1">Администратор приостановил приём броней. Загляните позже или позвоните нам.</p></div>`;
  else if (user && user.blocked) $('#notice').innerHTML = `<div class="card mb-3" style="border-color:var(--danger)"><b>Аккаунт заблокирован</b><p class="muted small mt-1">Бронирование недоступно. Свяжитесь с администратором салона.</p></div>`;
  const canBook = settings.bookingOpen && !(user && user.blocked);

  async function loadRange() {
    const from = iso(state.month); const to = iso(new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0));
    if (state.rangeFrom === from) return;
    state.rangeFrom = from;
    try { [state.occ, state.closed] = await Promise.all([DB.slots.occupied(from, to), DB.slots.closed(from, to)]); }
    catch (e) { toast(e.message, 'error'); }
  }
  const isDayClosed = (d) => state.closed.some((c) => c.date === d && c.hour === null && c.seat === null);
  const slotClosed = (d, h, s) => state.closed.some((c) => c.date === d && (c.hour === null || c.hour === h) && (c.seat === null || c.seat === s));
  const slotOcc = (d, h, s) => state.occ.find((o) => o.date === d && o.hour === h && o.seat === s);
  const isPast = (d, h) => BS.slotStart(d, h).getTime() <= Date.now();

  function renderCal() {
    const y = state.month.getFullYear(), m = state.month.getMonth();
    const startDow = (new Date(y, m, 1).getDay() + 6) % 7; const days = new Date(y, m + 1, 0).getDate();
    let cells = BS.DOW.map((d, i) => `<div class="dow ${i >= 5 ? 'we' : ''}">${d}</div>`).join('');
    for (let i = 0; i < startDow; i++) cells += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const ds = iso(new Date(y, m, d));
      const disabled = ds < today() || ds > maxDate;
      const selCnt = [...state.sel.values()].filter((s) => s.date === ds).length;
      cells += `<button class="cal-day ${ds === state.date ? 'selected' : ''} ${isDayClosed(ds) ? 'closed' : ''}" data-d="${ds}" ${disabled ? 'disabled' : ''}>${d}${ds === today() ? '<span class="m"></span>' : ''}${selCnt ? `<span class="cnt">${selCnt}</span>` : ''}</button>`;
    }
    $('#cal').innerHTML = `<div class="cal-head"><b>${BS.MONTHS_NOM[m]} ${y}</b><div class="cal-nav"><button id="cal-prev" ${state.month <= minMonth ? 'disabled' : ''} aria-label="Предыдущий месяц">‹</button><button id="cal-next" ${state.month >= maxMonth ? 'disabled' : ''} aria-label="Следующий месяц">›</button></div></div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend"><span><i style="background:var(--pink)"></i> Сегодня</span><span><i style="background:var(--ink)"></i> Выбранный день</span><span><i style="background:var(--line-2)"></i> День закрыт</span></div>`;
    $('#cal-prev').onclick = async () => { state.month = new Date(y, m - 1, 1); await loadRange(); renderCal(); };
    $('#cal-next').onclick = async () => { state.month = new Date(y, m + 1, 1); await loadRange(); renderCal(); };
    $$('.cal-day', $('#cal')).forEach((b) => (b.onclick = () => { state.date = b.dataset.d; renderCal(); renderSlots(); }));
  }

  function renderSlots() {
    const d = state.date; const root = $('#slots'); root.style.setProperty('--hours', hours.length);
    const wholeDayClosed = state.closed.find((c) => c.date === d && c.hour === null && c.seat === null);
    const head = `<div class="slots-head"><div><h3>Свободные слоты</h3><div class="muted">${fmtDateDow(d)}</div></div>
      <div class="legend"><span><i class="free"></i> Свободно</span><span><i class="busy"></i> Занято</span><span><i class="mine"></i> Моя бронь</span><span><i class="closed"></i> Закрыто</span><span><i class="sel"></i> Выбрано</span></div></div>`;
    if (wholeDayClosed) { root.innerHTML = head + `<div class="empty"><b>День закрыт</b>${esc(wholeDayClosed.reason || 'Салон не принимает брони в этот день.')}</div>`; return; }
    let grid = `<div class="slot-scroll"><div class="slot-table"><div></div>${hours.map((h) => `<div class="th">${fmtHour(h)}</div>`).join('')}`;
    let free = 0;
    for (let s = 1; s <= nSeats; s++) {
      grid += `<div class="seat">${esc(seatName(settings, s))}</div>`;
      hours.forEach((h) => {
        const k = `${d}|${h}|${s}`; const occ = slotOcc(d, h, s);
        let cls = '', dis = false;
        if (isPast(d, h)) { cls = 'past'; dis = true; }
        else if (occ && occ.mine) { cls = 'mine'; dis = true; }
        else if (occ) { cls = 'busy'; dis = true; }
        else if (slotClosed(d, h, s)) { cls = 'closed'; dis = true; }
        else if (state.sel.has(k)) cls = 'sel';
        if (!dis && cls !== 'sel') free++;
        if (!canBook && !dis && cls !== 'sel') dis = true;
        grid += `<button class="slot ${cls}" data-k="${k}" ${dis ? 'disabled' : ''}>${fmtHour(h)}</button>`;
      });
    }
    grid += '</div></div>';
    root.innerHTML = head + grid + `<p class="muted small mt-3">Свободно: ${plural(free, 'слот', 'слота', 'слотов')} · все часы дня за одним местом — тариф «день» ${money(settings.prices.day)}.</p>`;
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
    const rows = lines.map((l) => `<div class="row between"><span><b>${fmtDate(l.date)}</b> · ${esc(seatName(settings, l.seat))}<br><span class="muted small">${hoursToRanges(l.hours)}${l.isDay ? ' · тариф «день»' : ''}</span></span><b>${money(l.sum)}</b></div>`).join('');
    modal(`<h3>Подтвердите <span class="ac">бронь</span></h3><p class="muted small">Оплата на месте перед началом работы. Отмена без штрафа — за ${settings.rules.cancelHours} ч и более.</p>
      <div class="summary">${rows}<div class="row between total"><span>Итого</span><span>${money(total)}</span></div></div>
      <div class="form-msg" id="cf-msg"></div>
      <div class="actions"><button class="btn outline" data-close>Назад</button><button class="btn" id="cf-ok">Забронировать</button></div>`,
      { onOpen: (m) => { $('#cf-ok', m).onclick = () => submit(items, total, m); } });
  }
  async function submit(items, total, m) {
    const btn = $('#cf-ok', m); BS.busy(btn, true, 'Бронируем…');
    try {
      await DB.bookings.create(items);
      closeModal(); state.sel.clear(); state.rangeFrom = null; await loadRange(); renderCal(); renderSlots(); renderBar();
      modal(`<div class="center"><div class="avatar lg solid" style="margin:0 auto 18px">✓</div><h3>Место забронировано</h3><p class="muted mt-1">${plural(items.length, 'слот', 'слота', 'слотов')} на сумму <b>${money(total)}</b>. Ждём вас — оплата на месте.</p>
        <div class="actions" style="justify-content:center"><button class="btn outline" data-close>Ещё бронь</button><a class="btn" href="account.html">Мои записи</a></div></div>`);
    } catch (e) { BS.showMsg($('#cf-msg', m), e.message); BS.busy(btn, false); state.rangeFrom = null; await loadRange(); renderSlots(); }
  }

  await loadRange(); renderCal(); renderSlots(); renderBar();
})();
