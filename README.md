# Beauty Studio — сайт бронирования рабочих мест

Сайт для студии красоты в Перми: мастера регистрируются, бронируют рабочее место по часам, администратор управляет расписанием.

**Стек:** HTML + CSS + JavaScript (без сборки) · Supabase (аккаунты и база) · GitHub Pages (хостинг).

## Страницы

| Публичная часть | Личный кабинет | Админка (`admin/`) |
|---|---|---|
| `index.html` — главная | `account.html` — мои записи | `login.html` — вход |
| `booking.html` — бронирование | `profile.html` — профиль | `index.html` — дашборд |
| `register.html` — регистрация | | `schedule.html` — расписание |
| `login.html` — вход | | `masters.html` — мастера |
| `prices.html` — цены | | `settings.html` — настройки |
| `contacts.html` — контакты | | |

## Подключение Supabase (уже сделано для проекта beauty-studio)

1. **Supabase.** На supabase.com создай проект. В *SQL Editor* вставь весь файл `supabase/schema.sql` и нажми Run.
2. **Ключи.** *Project Settings → API*: скопируй Project URL и anon/publishable key в `js/config.js`.
3. **Адреса.** *Authentication → URL Configuration*: Site URL = адрес сайта на GitHub Pages, туда же добавь Redirect URL `https://…/login.html` и `https://…/profile.html`.
4. **Письма.** *Authentication → Providers → Email*: подтверждение email можно оставить включённым (мастер получит письмо) или выключить, чтобы вход был сразу.
5. **Админ.** Зарегистрируйся на сайте как обычный мастер, затем в SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'твой@email';
   ```
6. **Деплой.** Залей папку в репозиторий GitHub, в *Settings → Pages* выбери ветку `main`, папку `/ (root)`.

## Как работает бронирование

- Слот = 1 час на одном рабочем месте. Количество мест и часы работы задаются в админке.
- Если мастер выбирает все часы дня за одним местом, автоматически применяется тариф «день».
- Двойная бронь исключена уникальным индексом в базе.
- Отмена мастером доступна за N часов до начала (по умолчанию 12), настраивается в админке.
- Оплата на месте. Сайт денег не принимает.
