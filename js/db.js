/* Слой данных InBeauty: Supabase (аккаунты, брони, настройки, админка) */
(function () {
  const cfg = window.BS_CONFIG || {};
  if (!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase)) {
    console.error('InBeauty: не заданы ключи Supabase в js/config.js');
  }

  const DEFAULT_SETTINGS = {
    hours: { open: 10, close: 20 },
    seatNames: ['У окна', 'У зеркала'],
    prices: { hour: 500, day: 3500, subscription: 25000, subscriptionHours: 80 },
    rules: { cancelHours: 12, maxDaysAhead: 30, maxSlotsPerBooking: 20 },
    bookingOpen: true,
    contacts: {
      name: 'InBeauty',
      address: 'г. Пермь, ул. Тихоокеанская, 38',
      addressNote: '5 минут от метро • парковка во дворе',
      phone: '+7 (900) 000-00-00',
      email: 'hello@inbeauty.ru',
      mapUrl: 'https://yandex.ru/maps/?text=Пермь,%20ул.%20Тихоокеанская,%2038',
      socials: { instagram: '', telegram: '', vk: '', tiktok: '' },
    },
    emails: {
      confirm: 'Здравствуйте, {name}! Ваша бронь подтверждена: {date}, {time}, место «{seat}». Оплата на месте. До встречи в InBeauty!',
      cancel: 'Здравствуйте, {name}. Бронь на {date}, {time}, место «{seat}» отменена.',
      reminder: 'Напоминаем: завтра в {time} вас ждёт рабочее место «{seat}» в InBeauty. Адрес: {address}.',
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

  window.DB = supabaseBackend();
  window.DB.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
})();
