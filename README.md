# AutoPostingTG

Готовый к передаче single-owner продукт для подготовки и безопасной публикации
научно-популярного контента в Telegram. Главный интерфейс — Telegram Mini App;
Python-бот, bridge и планировщик постоянно работают на Railway/Docker.

## Что умеет

- несколько Telegram-каналов с отдельными темами, стилями, расписаниями и медиа-политикой;
- проверка, что цель действительно является каналом, а бот — администратор с правом публикации;
- одиночная и пакетная генерация 2–5 постов; пакетный режим всегда выключен по умолчанию;
- добавление выбранных пакетных черновиков в Queue без автопубликации;
- перегенерация текста с защитой от повторов и сохранением старого варианта при ошибке;
- режимы `normal`, `short`, `long`, `funny`, `wow`, `strict` с серверной проверкой формата;
- стоковые изображения из Pexels, Pixabay, Openverse, Wikimedia, NASA и Unsplash;
- точный AI-план поиска фото: объект, важная деталь и обязательные термины;
- AI-изображения Gemini с ротацией ключей и переходом на сток при сбое;
- Queue: редактирование, перегенерация, замена фото, одобрение слота, отмена и ручный retry;
- честные состояния `queued → publishing → published|failed` с Telegram `message_id` и ссылкой;
- атомарный захват слотов, watchdog пропущенных публикаций и уведомления владельцу;
- зашифрованное AES-256-GCM хранилище пользовательских API-ключей;
- реальные разделы Style, Media, Providers, Settings, History и Stats;
- DB rate limiting дорогих AI/image-запросов между всеми Vercel-инстансами.

Если все LLM-провайдеры недоступны, публикация **не происходит** и возвращается
явная ошибка. Система не подставляет выдуманный локальный текст вместо AI-ответа.

## Архитектура

```text
Telegram Mini App (Next.js 16, Vercel)
        │ signed initData + HTTPS
        ▼
Python bridge / bot (aiogram, Railway или Docker)
        │
        ├── Telegram Bot API
        ├── LLM и image providers
        └── Neon/Postgres ← Mini App API
```

- `app/`, `components/`, `lib/` — Mini App и её authenticated API routes;
- `main.py`, `bridge.py`, `scheduler.py`, `db.py` — бот и публикационный контур;
- `ai_gen.py`, `ai_image.py`, `image_fetcher.py` — генерация и медиа;
- `migrations/` — только additive PostgreSQL-миграции;
- `tests/`, `tests-web/` — Python и Mini App regression-тесты.

## Быстрый локальный запуск

Требуются Python 3.12, Node.js 22+, pnpm 11.7 и PostgreSQL/Neon.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
pnpm install --frozen-lockfile
Copy-Item .env.example .env
python migrate.py
python production_check.py
python main.py
```

Mini App в отдельном терминале:

```powershell
pnpm dev
```

`ALLOW_DEV_AUTH=1` допустим только локально вместе с `NODE_ENV=development`.
В production он игнорируется и должен отсутствовать.

## Обязательная production-конфигурация

Минимум:

```env
BOT_TOKEN=
CHANNEL_ID=@your_channel
ADMIN_USER_IDS=123456789
DATABASE_URL=postgresql://...
KEYS_ENCRYPTION_SECRET=<отдельный секрет не короче 32 символов>
BRIDGE_SECRET=<другой секрет не короче 32 символов>
WEB_APP_URL=https://your-mini-app.vercel.app
```

`CHANNEL_ID` принимает только `@channel_username` или Telegram channel ID,
начинающийся с `-100`. Личный Telegram ID не является каналом и будет отклонён.

Добавьте хотя бы один рабочий LLM key через Mini App или `.env`. Для Gemini
можно задать несколько ключей через запятую:

```env
GEMINI_API_KEYS=first_key,second_key
GEMINI_MODELS=gemini-3.5-flash
LLM_PROVIDER_ORDER=gemini,groq,mistral,openrouter,custom
```

Ключи изображений:

```env
PEXELS_API_KEY=
PIXABAY_API_KEY=
UNSPLASH_ACCESS_KEY=
NASA_API_KEY=DEMO_KEY
```

## Docker / Railway

```powershell
docker compose build bot
docker compose up -d bot
docker compose logs -f bot
```

Контейнер запускается непривилегированным пользователем, выполняет
`production_check.py`, применяет миграции под advisory lock и только затем
стартует бота. На Railway публичный HTTPS bridge использует системный `PORT`;
локально порт не публикуется без отдельного compose override.

Подробности: [DEPLOY.md](DEPLOY.md). Передача покупателю: [SALE_HANDOFF.md](SALE_HANDOFF.md).

## Команды бота

| Команда | Назначение |
|---|---|
| `/test` | безопасная диагностика конфигурации |
| `/preview [режим] <тема>` | приватный предпросмотр владельцу |
| `/post [режим] <тема>` | намеренная публикация в выбранный канал |
| `/channels`, `/addchannel`, `/usechannel` | управление каналами |
| `/times`, `/addtime`, `/deltime` | расписание |
| `/topics`, `/addtopic`, `/deltopic` | пул тем |
| `/settopic`, `/setmode`, `/setmedia` | настройки текущего канала |

`/addchannel` принимает только `@канал` или `-100...` и проверяет права бота до записи.

## Quality gates

```powershell
python -m pip install -r requirements-dev.txt
python -m pip check
python -m compileall -q main.py bridge.py config.py db.py migrate.py scheduler.py setup_commands.py ai_gen.py ai_image.py image_fetcher.py user_keys.py content_history.py production_check.py
python -m pytest -q
python production_check.py
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:web
pnpm build
pnpm audit --prod --audit-level high
docker compose build bot
```

CI дополнительно поднимает чистый PostgreSQL, дважды запускает миграции,
проверяет Docker-зависимости и сканирует Git на секреты.

## Обязательная приёмка перед включением расписания

1. `/test` в личном чате с ботом.
2. `/preview космос` — результат приходит только владельцу.
3. Подключение отдельного тестового канала и проверка прав бота.
4. Одна явно подтверждённая публикация; открыть сохранённую Telegram-ссылку.
5. Один слот через 5–10 минут; сверить канал, `posts`, `slot_runs`, уведомление и Stats.
6. Перезапуск Railway; убедиться, что дубль не появился.

Не запускайте два bot worker с одним `BOT_TOKEN` до проверки владения
планировщиком. Не переносите `.env`, production-дампы или ключи продавца в Git.

## Ограничения

- внешние квоты и доступность Gemini/stock providers не контролируются проектом;
- фактологию и соответствие изображения человек подтверждает в Preview/Queue;
- timeout Telegram после фактической отправки нельзя безопасно повторять вслепую,
  поэтому неоднозначный сбой фиксируется как `failed` и повторяется вручную;
- это single-owner поставка, не публичный SaaS с регистрацией и биллингом.
