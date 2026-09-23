-- InBeauty: схема базы данных для Supabase.
-- Как применить: Supabase → твой проект → SQL Editor → New query → вставить весь файл → Run.
-- Выполнять можно повторно (команды идемпотентные).

-- ========== 1. Профили мастеров ==========
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text not null default '',
  phone       text not null default '',
  role        text not null default 'master' check (role in ('master', 'admin')),
  blocked     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Профиль создаётся автоматически при регистрации (имя и телефон берутся из формы)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, phone)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), coalesce(new.raw_user_meta_data->>'phone', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Проверка «текущий пользователь — админ»
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ========== 2. Брони ==========
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  date          date not null,
  hour          smallint not null check (hour between 0 and 23),
  seat          smallint not null check (seat >= 1),
  price         integer not null default 0,
  status        text not null default 'active' check (status in ('active', 'cancelled')),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);
-- Один активный слот — один мастер (защита от двойной брони на уровне базы)
create unique index if not exists bookings_active_slot_uidx
  on public.bookings (date, hour, seat) where status = 'active';
create index if not exists bookings_user_idx on public.bookings (user_id, date);
create index if not exists bookings_date_idx on public.bookings (date);

-- ========== 3. Закрытые слоты / дни ==========
create table if not exists public.closed_slots (
  id      uuid primary key default gen_random_uuid(),
  date    date not null,
  hour    smallint,          -- null = весь день
  seat    smallint,          -- null = все места
  reason  text not null default ''
);
create index if not exists closed_slots_date_idx on public.closed_slots (date);

-- ========== 4. Настройки салона (ключ → JSON) ==========
create table if not exists public.settings (
  key    text primary key,
  value  jsonb not null
);

-- ========== 5. Занятость слотов для всех (без имён мастеров) ==========
create or replace function public.occupied_slots(p_from date, p_to date)
returns table (date date, hour smallint, seat smallint, mine boolean)
language sql stable security definer set search_path = public as $$
  select b.date, b.hour, b.seat, (b.user_id = auth.uid()) as mine
  from public.bookings b
  where b.status = 'active' and b.date between p_from and p_to
$$;
grant execute on function public.occupied_slots(date, date) to anon, authenticated;

-- Удаление собственного аккаунта
create or replace function public.delete_own_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  delete from auth.users where id = auth.uid();
end $$;
grant execute on function public.delete_own_account() to authenticated;

-- Проверка перед созданием брони: слот не в прошлом, день/час не закрыт, мастер не заблокирован
create or replace function public.check_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id and blocked) then
    raise exception 'Аккаунт заблокирован. Свяжитесь с администратором.';
  end if;
  if (new.date + make_interval(hours => new.hour)) < now() then
    raise exception 'Нельзя бронировать прошедшее время';
  end if;
  if exists (select 1 from public.closed_slots c where c.date = new.date
             and (c.hour is null or c.hour = new.hour) and (c.seat is null or c.seat = new.seat)) then
    raise exception 'Этот слот закрыт администратором';
  end if;
  return new;
end $$;
drop trigger if exists bookings_check on public.bookings;
create trigger bookings_check before insert on public.bookings
  for each row execute function public.check_booking();

-- ========== 6. Права доступа (RLS) ==========
alter table public.profiles     enable row level security;
alter table public.bookings     enable row level security;
alter table public.closed_slots enable row level security;
alter table public.settings     enable row level security;

-- profiles: свой профиль видит и правит владелец; админ видит и правит всех
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (id = auth.uid() and role = (select role from public.profiles p where p.id = auth.uid())
        and blocked = (select blocked from public.profiles p where p.id = auth.uid()))
  );

-- bookings: мастер видит/создаёт/отменяет свои; админ — любые
drop policy if exists "bookings_select" on public.bookings;
create policy "bookings_select" on public.bookings for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "bookings_insert" on public.bookings;
create policy "bookings_insert" on public.bookings for insert with check (user_id = auth.uid());
drop policy if exists "bookings_update" on public.bookings;
create policy "bookings_update" on public.bookings for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- closed_slots: читают все, меняет админ
drop policy if exists "closed_select" on public.closed_slots;
create policy "closed_select" on public.closed_slots for select using (true);
drop policy if exists "closed_admin" on public.closed_slots;
create policy "closed_admin" on public.closed_slots for all using (public.is_admin()) with check (public.is_admin());

-- settings: читают все, меняет админ
drop policy if exists "settings_select" on public.settings;
create policy "settings_select" on public.settings for select using (true);
drop policy if exists "settings_admin" on public.settings;
create policy "settings_admin" on public.settings for all using (public.is_admin()) with check (public.is_admin());

-- ========== 7. Назначить администратора ==========
-- Сначала зарегистрируйся на сайте обычным способом, затем выполни (подставь свой email):
-- update public.profiles set role = 'admin' where email = 'ТВОЙ_EMAIL@example.com';
