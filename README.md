# OPSLAB Соціометрія

Одностороннє Go-монорепо для соціометричного опитування OPSLAB (власність, лідерство, розвиток бізнесу) зі входом за email+кодом, збереженням у Postgres, drag&drop ранжуванням і адмін-панеллю (експорт JSON, тестове заповнення, очищення перед продакшном).  
Фронтенд — вбудований (vanilla JS, brutalist-styled), бекенд — `net/http` + `pgx`.

## Запуск локально
```bash
export DATABASE_URL="postgres://user:pass@localhost:5432/opslab?sslmode=disable"
export SESSION_SECRET="replace-me"
go run ./cmd/server
```
Додаток слухає `:8080`.

## Railway / Docker
```bash
docker build -t opslab-survey .
docker run -e DATABASE_URL=... -e SESSION_SECRET=... -p 8080:8080 opslab-survey
```
Railway автоматично прочитає `PORT`; підставте `DATABASE_URL` з їхнього Postgres.

## Адмін-флоу
- Логін: `work.olegkaminskyi@gmail.com` / `0000`
- Кнопка «Заповнити тестовими» — заливає валідні тест-відповіді для всіх.
- «Експорт JSON» — вигрузка всіх відповідей + учасники.
- «Очистити й запустити продакшн» — truncates `responses`, готує чисту базу.

## Учасники (Anastasiia виключена)
- 1122 — Катерина Петухова — kateryna.petukhova@opslab.uk  
- 1425 — Марія Василик — mariya.vasylyk@opslab.uk  
- 3814 — Ірина Мячкова — iryna.miachkova@opslab.uk  
- 4582 — Вероніка Кухарчук — veronika.kukharchuk@opslab.uk  
- 6738 — Іванна Сакало — ivanna.sakalo@opslab.uk  
- 7139 — Jane Давидюк — janedavydiuk@opslab.uk  
- 8463 — Оксана Клінчаян — oksana.klinchaian@opslab.uk  
- 9267 — Михайло Іващук — mykhailo.ivashchuk@opslab.uk  
- 0000 — Олег Камінський (Адмін/тест) — work.olegkaminskyi@gmail.com  

## Питання
- 5 спільних (≈20%): власність, швидкість рішень, бізнес-бет, стабільність, довіра.
- Для кожного колеги — 4 варіативні формулювання (scale/choice/text) про ті ж критерії.
- Drag&drop по 3 критеріях + суб'єктивне місце себе.

## Тестове наповнення
- Ендпоінт `/api/admin/run-test` (кнопка в UI) заповнює всі анкети синтетично (`is_test_data=true`).
- `/api/admin/reset` чистить `responses`.

## Статичні файли
- Фронтенд в `web/static` (вбудований через `go:embed`).  
- Без зовнішніх збірок, тому легко деплоїти.
