/* Слой данных Beauty Studio.
   Два режима с одинаковым API:
   - demo:     всё хранится в localStorage браузера (для просмотра без бэкенда)
   - supabase: настоящая база (аккаунты, брони, админка) */
(function () {
  const cfg = window.BS_CONFIG || {};
  // Для локального просмотра без базы: в консоли localStorage.bs_force_demo = '1'
  let forceDemo = false; try { forceDemo = localStorage.getItem('bs_force_demo') === '1'; } catch (e) {}
  const useSupabase = !forceDemo && !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  const DEFAULT_SETTINGS = {
    hours: { open: 10, close: 20 },
    seatNames: ['У окна', 'У зеркала'],
    prices: { hour: 500, day: 3500, subscription: 25000, subscriptionHours: 80 },
    rules: { cancelHours: 12, maxDaysAhead: 30, maxSlotsPerBooking: 20 },
    bookingOpen: true,
    contacts: {
      name: 'Beauty Studio',
      address: 'г. Пермь, ул. Тихоокеанская, 38',
      addressNote: '5 минут от метро • парковка во дворе',
      phone: '+7 (900) 000-00-00',
      email: 'hello@beautystudio.ru',
      mapUrl: 'https://yandex.ru/maps/?text=Пермь,%20ул.%20Тихоокеанская,%2038',
      socials: { instagram: '', telegram: '', vk: '', tiktok: '' },
    },
    emails: {
      confirm: 'Здравствуйте, {name}! Ваша бронь подтверждена: {date}, {time}, место «{seat}». Оплата на месте. До встречи в Beauty Studio!',
      cancel: 'Здравствуйте, {name}. Бронь на {date}, {time}, место «{seat}» отменена.',
      reminder: 'Напоминаем: завтра в {time} вас ждёт рабочее место «{seat}» в Beauty Studio. Адрес: {address}.',
    },
    notify: { newBooking: true, cancel: true, newMaster: true },
  };

  const deepMerge = (a, b) => {
    const out = Array.isArray(a) ? [...a] : { ...a };
    for (const k in b || {}) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object' && !Array.isArray(a[k])) out[k] = deepMerge(a[k], b[k]);
      else out[k] = b[k];
    }
    return out;
  };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const nowIso = () => new Date().toISOString();

  /* ======================= DEMO (localStorage) ======================= */
  const KEY = 'beauty_studio_demo_v2';
  function demoBackend() {
    let state;
    const load = () => {
      try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
      if (!state) { state = seed(); save(); }
    };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

    function seed() {
      const d = (offset) => { const x = new Date(); x.setDate(x.getDate() + offset); return x.toISOString().slice(0, 10); };
      const users = [
        { id: 'u-admin', email: 'admin@beauty.studio', password: 'admin123', name: 'Администратор', phone: '+7 (342) 000-00-00', role: 'admin', blocked: false, created_at: nowIso() },
        { id: 'u-1', email: 'anna@example.com', password: '123456', name: 'Анна Казанская', phone: '+7 (912) 000-11-22', role: 'master', blocked: false, created_at: new Date(Date.now() - 40 * 864e5).toISOString() },
        { id: 'u-2', email: 'maria@example.com', password: '123456', name: 'Мария Соколова', phone: '+7 (912) 333-44-55', role: 'master', blocked: false, created_at: new Date(Date.now() - 20 * 864e5).toISOString() },
        { id: 'u-3', email: 'olga@example.com', password: '123456', name: 'Ольга Петрова', phone: '+7 (912) 666-77-88', role: 'master', blocked: false, created_at: new Date(Date.now() - 9 * 864e5).toISOString() },
        { id: 'u-4', email: 'kate@example.com', password: '123456', name: 'Екатерина Лис', phone: '+7 (912) 999-00-11', role: 'master', blocked: true, created_at: new Date(Date.now() - 60 * 864e5).toISOString() },
      ];
      const bookings = [];
      const add = (user, date, hours, seat, daysAgo) => hours.forEach((h) => bookings.push({
        id: uid(), user_id: user, date, hour: h, seat, status: 'active', price: 500,
        created_at: new Date(Date.now() - daysAgo * 864e5).toISOString(), cancelled_at: null,
      }));
      add('u-2', d(0), [12, 13, 14], 1, 3);
      add('u-3', d(0), [16, 17], 2, 2);
      add('u-2', d(1), [10, 11, 12, 13], 2, 1);
      add('u-1', d(1), [15, 16], 1, 1);
      add('u-3', d(2), [11, 12, 13, 14, 15], 1, 0.5);
      add('u-1', d(3), [10, 11], 2, 0.2);
      add('u-2', d(5), [14, 15, 16], 1, 0.1);
      add('u-1', d(-3), [12, 13, 14], 1, 6);
      add('u-1', d(-10), [10, 11], 2, 12);
      bookings.push({ id: uid(), user_id: 'u-3', date: d(4), hour: 12, seat: 2, status: 'cancelled', price: 500, created_at: new Date(Date.now() - 2 * 864e5).toISOString(), cancelled_at: new Date(Date.now() - 1 * 864e5).toISOString() });
      const closed = [{ id: uid(), date: d(2), hour: 18, seat: null, reason: 'Техобслуживание' }];
      return { users, bookings, closed, settings: {}, session: null };
    }

    load();
    const me = () => state.users.find((u) => u.id === state.session) || null;
    const pub = (u) => u && { id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, blocked: u.blocked, created_at: u.created_at };
    const requireUser = () => { const u = me(); if (!u) throw new Error('Нужно войти в аккаунт'); return u; };
    const requireAdmin = () => { const u = requireUser(); if (u.role !== 'admin') throw new Error('Только для администратора'); return u; };
    const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

    return {
      mode: 'demo',
      auth: {
        async signUp({ email, password, name, phone }) {
          email = email.trim().toLowerCase();
          if (state.users.some((u) => u.email === email)) throw new Error('Пользователь с таким email уже зарегистрирован');
          const u = { id: uid(), email, password, name, phone, role: 'master', blocked: false, created_at: nowIso() };
          state.users.push(u); state.session = u.id; save();
          return { needsConfirm: false, user: pub(u) };
        },
        async signIn(email, password) {
          const u = state.users.find((x) => x.email === email.trim().toLowerCase());
          if (!u || u.password !== password) throw new Error('Неверный email или пароль');
          state.session = u.id; save(); return pub(u);
        },
        async signOut() { state.session = null; save(); },
        async me() { return pub(me()); },
        async updateProfile(patch) { const u = requireUser(); Object.assign(u, { name: patch.name ?? u.name, phone: patch.phone ?? u.phone }); save(); return pub(u); },
        async changePassword(pw) { const u = requireUser(); u.password = pw; save(); },
        async resetPassword() { return { demo: true }; },
        async deleteAccount() {
          const u = requireUser();
          state.bookings = state.bookings.filter((b) => b.user_id !== u.id);
          state.users = state.users.filter((x) => x.id !== u.id);
          state.session = null; save();
        },
      },
      settings: {
        async get() { return deepMerge(DEFAULT_SETTINGS, state.settings); },
        async save(s) { requireAdmin(); state.settings = s; save(); return s; },
      },
      slots: {
        async occupied(from, to) {
          const meId = state.session;
          return state.bookings.filter((b) => b.status === 'active' && inRange(b.date, from, to))
            .map((b) => ({ date: b.date, hour: b.hour, seat: b.seat, mine: b.user_id === meId }));
        },
        async closed(from, to) { return state.closed.filter((c) => inRange(c.date, from, to)); },
        async close({ date, hour = null, seat = null, reason = '' }) { requireAdmin(); const c = { id: uid(), date, hour, seat, reason }; state.closed.push(c); save(); return c; },
        async open(id) { requireAdmin(); state.closed = state.closed.filter((c) => c.id !== id); save(); },
        async closeDay(date, reason = 'Салон закрыт') { requireAdmin(); state.closed = state.closed.filter((c) => c.date !== date); state.closed.push({ id: uid(), date, hour: null, seat: null, reason }); save(); },
        async openDay(date) { requireAdmin(); state.closed = state.closed.filter((c) => c.date !== date); save(); },
      },
      bookings: {
        async mine() { const u = requireUser(); return state.bookings.filter((b) => b.user_id === u.id).sort((a, b) => (a.date + a.hour).localeCompare(b.date + b.hour)); },
        async create(items) {
          const u = requireUser();
          if (u.blocked) throw new Error('Аккаунт заблокирован. Свяжитесь с администратором.');
          for (const it of items) {
            const taken = state.bookings.some((b) => b.status === 'active' && b.date === it.date && b.hour === it.hour && b.seat === it.seat);
            if (taken) throw new Error(`Слот ${it.date} ${it.hour}:00, место ${it.seat} уже занят`);
            const closed = state.closed.some((c) => c.date === it.date && (c.hour === null || c.hour === it.hour) && (c.seat === null || c.seat === it.seat));
            if (closed) throw new Error(`Слот ${it.date} ${it.hour}:00 закрыт`);
          }
          const created = items.map((it) => ({ id: uid(), user_id: u.id, date: it.date, hour: it.hour, seat: it.seat, price: it.price || 0, status: 'active', created_at: nowIso(), cancelled_at: null }));
          state.bookings.push(...created); save(); return created;
        },
        async cancel(id) {
          const u = requireUser(); const b = state.bookings.find((x) => x.id === id && x.user_id === u.id);
          if (!b) throw new Error('Бронь не найдена');
          b.status = 'cancelled'; b.cancelled_at = nowIso(); save(); return b;
        },
        async all({ from, to } = {}) {
          requireAdmin();
          return state.bookings.filter((b) => inRange(b.date, from, to)).map((b) => ({ ...b, profile: pub(state.users.find((u) => u.id === b.user_id)) || { name: 'Удалённый аккаунт' } }));
        },
        async adminCancel(id) { requireAdmin(); const b = state.bookings.find((x) => x.id === id); if (!b) throw new Error('Бронь не найдена'); b.status = 'cancelled'; b.cancelled_at = nowIso(); save(); return b; },
      },
      masters: {
        async list() { requireAdmin(); return state.users.filter((u) => u.role === 'master').map(pub); },
        async setBlocked(id, blocked) { requireAdmin(); const u = state.users.find((x) => x.id === id); if (u) { u.blocked = blocked; save(); } return pub(u); },
      },
      demo: { reset() { localStorage.removeItem(KEY); load(); } },
    };
  }

  /* ======================= SUPABASE ======================= */
  function supabaseBackend() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const ru = (e) => {
      const m = (e && e.message) || String(e);
      const map = {
        'Invalid login credentials': 'Неверный email или пароль',
        'User already registered': 'Пользователь с таким email уже зарегистрирован',
        'Email not confirmed': 'Подтвердите email — письмо уже у вас в почте',
        'Password should be at least 6 characters': 'Пароль должен быть не короче 6 символов',
        'New password should be different from the old password.': 'Новый пароль должен отличаться от старого',
      };
      for (const k in map) if (m.includes(k)) return new Error(map[k]);
      if (m.includes('duplicate key') || m.includes('unique')) return new Error('Один из выбранных слотов уже занят. Обновите страницу.');
      if (m.includes('row-level security') || m.includes('permission denied')) return new Error('Нет доступа для этого действия');
      return new Error(m);
    };
    const wrap = async (p) => { const { data, error } = await p; if (error) throw ru(error); return data; };
    let profileCache = null;

    async function loadProfile() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { profileCache = null; return null; }
      let prof = await wrap(sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
      if (!prof) {
        const meta = session.user.user_metadata || {};
        prof = await wrap(sb.from('profiles').upsert({ id: session.user.id, email: session.user.email, name: meta.name || '', phone: meta.phone || '' }).select().single());
      }
      profileCache = prof; return prof;
    }
    sb.auth.onAuthStateChange(() => { profileCache = null; });
    const requireUser = async () => { const p = profileCache || (await loadProfile()); if (!p) throw new Error('Нужно войти в аккаунт'); return p; };

    return {
      mode: 'supabase',
      client: sb,
      auth: {
        async signUp({ email, password, name, phone }) {
          const data = await wrap(sb.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { name, phone }, emailRedirectTo: location.origin + location.pathname.replace(/[^/]*$/, '') + 'login.html' } }));
          return { needsConfirm: !data.session, user: data.user };
        },
        async signIn(email, password) { await wrap(sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })); return loadProfile(); },
        async signOut() { await sb.auth.signOut(); profileCache = null; },
        async me() { return loadProfile(); },
        async updateProfile(patch) { const p = await requireUser(); const d = await wrap(sb.from('profiles').update({ name: patch.name ?? p.name, phone: patch.phone ?? p.phone }).eq('id', p.id).select().single()); profileCache = d; return d; },
        async changePassword(pw) { await wrap(sb.auth.updateUser({ password: pw })); },
        async resetPassword(email) { await wrap(sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: location.origin + location.pathname.replace(/[^/]*$/, '') + 'profile.html' })); },
        async deleteAccount() { await wrap(sb.rpc('delete_own_account')); await sb.auth.signOut(); profileCache = null; },
      },
      settings: {
        async get() { const rows = await wrap(sb.from('settings').select('key,value')); const o = {}; (rows || []).forEach((r) => (o[r.key] = r.value)); return deepMerge(DEFAULT_SETTINGS, o); },
        async save(s) { const rows = Object.keys(s).map((k) => ({ key: k, value: s[k] })); await wrap(sb.from('settings').upsert(rows)); return s; },
      },
      slots: {
        async occupied(from, to) { return (await wrap(sb.rpc('occupied_slots', { p_from: from, p_to: to }))) || []; },
        async closed(from, to) { return (await wrap(sb.from('closed_slots').select('*').gte('date', from).lte('date', to))) || []; },
        async close({ date, hour = null, seat = null, reason = '' }) { return wrap(sb.from('closed_slots').insert({ date, hour, seat, reason }).select().single()); },
        async open(id) { await wrap(sb.from('closed_slots').delete().eq('id', id)); },
        async closeDay(date, reason = 'Салон закрыт') { await wrap(sb.from('closed_slots').delete().eq('date', date)); await wrap(sb.from('closed_slots').insert({ date, hour: null, seat: null, reason })); },
        async openDay(date) { await wrap(sb.from('closed_slots').delete().eq('date', date)); },
      },
      bookings: {
        async mine() { const p = await requireUser(); return (await wrap(sb.from('bookings').select('*').eq('user_id', p.id).order('date').order('hour'))) || []; },
        async create(items) {
          const p = await requireUser();
          if (p.blocked) throw new Error('Аккаунт заблокирован. Свяжитесь с администратором.');
          return wrap(sb.from('bookings').insert(items.map((it) => ({ user_id: p.id, date: it.date, hour: it.hour, seat: it.seat, price: it.price || 0 }))).select());
        },
        async cancel(id) { return wrap(sb.from('bookings').update({ status: 'cancelled', cancelled_at: nowIso() }).eq('id', id).select().single()); },
        async all({ from, to } = {}) {
          let q = sb.from('bookings').select('*, profile:profiles(id,name,phone,email,blocked)').order('date').order('hour');
          if (from) q = q.gte('date', from); if (to) q = q.lte('date', to);
          return (await wrap(q)) || [];
        },
        async adminCancel(id) { return wrap(sb.from('bookings').update({ status: 'cancelled', cancelled_at: nowIso() }).eq('id', id).select().single()); },
      },
      masters: {
        async list() { return (await wrap(sb.from('profiles').select('*').eq('role', 'master').order('created_at', { ascending: false }))) || []; },
        async setBlocked(id, blocked) { return wrap(sb.from('profiles').update({ blocked }).eq('id', id).select().single()); },
      },
    };
  }

  window.DB = useSupabase ? supabaseBackend() : demoBackend();
  window.DB.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
})();
