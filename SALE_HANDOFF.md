# Передача AutoPostingTG покупателю

## 1. Что передаётся

- репозиторий с исходным кодом и историей релиза;
- Vercel Mini App, Railway bot/bridge и Neon database — переносом проектов или
  новым развёртыванием в аккаунтах покупателя;
- инструкция настройки без передачи личных ключей продавца.

Не передавайте `.env`, дамп production-базы с личными данными, Telegram token,
API keys или общие секреты в Git, архиве или мессенджере.

## 2. Переменные покупателя

### Vercel

- `DATABASE_URL`
- `BOT_TOKEN`
- `KEYS_ENCRYPTION_SECRET`
- `BOT_BRIDGE_URL`
- `BRIDGE_SECRET`

`ALLOW_DEV_AUTH` в Production должен отсутствовать.

### Railway

- `BOT_TOKEN`
- `CHANNEL_ID`
- `CHANNEL_URL`
- `ADMIN_USER_IDS`
- `DATABASE_URL`
- `KEYS_ENCRYPTION_SECRET`
- `BRIDGE_SECRET`
- `WEB_APP_URL`
- `GEMINI_API_KEYS` и другие выбранные provider/image keys
- `LLM_PROVIDER_ORDER`

Railway сам предоставляет `PORT`; отдельный `BRIDGE_PORT` там не требуется.
Одинаковые значения `BOT_TOKEN`, `DATABASE_URL`, `KEYS_ENCRYPTION_SECRET` и
`BRIDGE_SECRET` должны использоваться обеими частями системы.

## 3. Безопасный порядок установки

1. Покупатель создаёт нового бота через @BotFather и добавляет его администратором канала.
2. Создаёт новую Neon-базу и сохраняет connection string только в Vercel/Railway.
3. Генерирует два независимых секрета длиной не менее 32 символов:
   `KEYS_ENCRYPTION_SECRET` и `BRIDGE_SECRET`.
4. Разворачивает Railway из корневого `Dockerfile`; entrypoint сам проверит env и применит миграции.
5. Проверяет `https://<railway-domain>/health` — ожидается `{"ok":true}`.
6. Разворачивает корневой Next.js проект на Vercel и добавляет Vercel env.
7. Указывает Vercel URL в `WEB_APP_URL`, перезапускает Railway и назначает этот URL menu button бота.
8. Открывает Mini App только из Telegram и добавляет тестовый канал.

## 4. Приёмочный тест

Проводите строго в таком порядке:

1. `/test` в личном чате с ботом.
2. `/preview космос` — текст и фото приходят только в личный чат.
3. Mini App → «Генератор» → Gemini-текст → стоковое фото → «Предпросмотр».
4. Проверить текст, источник фото и правильный выбранный канал.
5. Выполнить одну ручную публикацию в тестовый канал.
6. Создать один слот на ближайшие 5–10 минут и убедиться в одной публикации.
7. Перезапустить Railway и проверить `/health`, Mini App и отсутствие дубля.
8. Только после этого включить постоянное расписание.

## 5. Отзыв доступов продавца

После приёмки покупатель меняет/перевыпускает Telegram token, пароль Neon,
AI/image keys и оба внутренних секрета, удаляет продавца из команд Vercel,
Railway и Neon. Если меняется `KEYS_ENCRYPTION_SECRET`, ранее сохранённые в Mini
App provider keys нужно удалить и ввести заново.

## 6. Что проверить перед отправкой архива/репозитория

```powershell
git status --short
git ls-files .env .env.local
python -m compileall -q main.py bridge.py config.py db.py migrate.py scheduler.py setup_commands.py ai_gen.py ai_image.py image_fetcher.py user_keys.py content_history.py
python -m pip install -r requirements-dev.txt
python -m pip check
python -m pytest -q
python production_check.py
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:web
pnpm build
pnpm audit --prod --audit-level high
docker build --no-cache -f Dockerfile.bot -t autoposting-tg-release .
docker run --rm autoposting-tg-release python -m pip check
```

Команда `git ls-files .env .env.local` должна вернуть пустой результат.

## 7. Внешний AI-контур для продажи

AutoPostingTG — это не «бот, привязанный к одному API». Клиент может получать контент четырьмя способами:

- через подключённые API-ключи OpenAI, Claude, Gemini, DeepSeek и совместимых провайдеров;
- через своего AI-агента или бесплатный тариф ChatGPT/Claude/Gemini;
- через локальную модель Ollama/LM Studio, экспортируя стандартный JSON-пакет;
- вручную, подготовив пакет по готовому шаблону и загрузив его в Mini App.

Агент исследует тему, указывает свежие источники, создаёт тексты и промпты изображений; Mini App валидирует JSON, сохраняет происхождение фактов, кладёт посты в очередь, а владелец подтверждает публикацию и расписание. Поэтому можно начать без платного API, а позже подключить более мощную модель без переделки очереди.

Фраза для объявления:

> Генерируйте посты не только через API: используйте своих AI-агентов, бесплатные тарифы или локальные модели. Дайте им готовую инструкцию — на выходе получится стандартный JSON, который AutoPostingTG проверит, превратит в очередь и постепенно опубликует только после вашего подтверждения. Встроенный раздел «Актуальные идеи» подсказывает свежие темы по новостным источникам за последние 7 дней.

Идеи — редакторские подсказки из бесплатной RSS-ленты, а не автоматическая гарантия истины: источник нужно открыть и подтвердить. Локальные модели подключаются к серверу только через публичный HTTPS OpenAI-compatible endpoint; полностью офлайн-сценарий работает через экспорт и ручной импорт JSON. Подробная инструкция: [`docs/content/AGENT_POSTING_GUIDE.md`](docs/content/AGENT_POSTING_GUIDE.md).
