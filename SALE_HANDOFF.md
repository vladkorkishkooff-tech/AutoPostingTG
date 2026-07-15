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
