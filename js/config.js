// Настройки подключения к Supabase.
// Пока оба поля пустые — сайт работает в ДЕМО-режиме (данные в браузере, localStorage).
// Как подключить настоящую базу:
//   1. supabase.com → New project → дождаться создания.
//   2. SQL Editor → New query → вставить весь файл supabase/schema.sql → Run.
//   3. Project Settings → API → скопировать Project URL и anon (publishable) key сюда.
//   4. Authentication → URL Configuration → Site URL = адрес сайта (GitHub Pages).
window.BS_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
};
