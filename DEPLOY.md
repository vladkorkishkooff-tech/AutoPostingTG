# Деплой AutoPostingTG в продакшен

Система состоит из двух частей, которые деплоятся отдельно:

1. **Mini App (Next.js)** — на Vercel
2. **Бот, scheduler и bridge (Python)** — постоянно на Railway или Docker/VPS

Обе части используют одну базу Neon.

## 1. Переменные окружения

### Mini App (Vercel)

| Переменная | Обязательно | Описание |
|---|---|---|
| `DATABASE_URL` | да | Строка подключения Neon (добавляется интеграцией автоматически) |
| `BOT_TOKEN` | да | Токен бота — используется для проверки подписи Telegram initData |
| `KEYS_ENCRYPTION_SECRET` | да | Секрет шифрования API-ключей (одинаковый с ботом). Сгенерировать: `openssl rand -base64 32` |
| `BOT_BRIDGE_URL` | да | Публичный HTTPS URL моста бота, например `https://bot.example.com` |
| `BRIDGE_SECRET` | да | Общий секрет для запросов Mini App → бот (одинаковый с ботом) |

`ALLOW_DEV_AUTH=1` — только для локальной разработки. **В продакшене не ставить.**

### Бот (VPS / Railway)

| Переменная | Обязательно | Описание |
|---|---|---|
| `BOT_TOKEN` | да | Токен от @BotFather |
| `CHANNEL_ID` | да | `@имя_канала` или ID канала, начинающийся с `-100` |
| `ADMIN_USER_IDS` | да | Telegram ID владельца (через запятую) |
| `DATABASE_URL` | да | Та же строка Neon, что и у Mini App |
| `KEYS_ENCRYPTION_SECRET` | да | Тот же секрет, что у Mini App |
| `BRIDGE_SECRET` | да | Тот же секрет, что у Mini App |
| `WEB_APP_URL` | да | Публичный HTTPS URL Mini App; бот добавит его в menu button |
| `BRIDGE_PORT` | нет | Локальный порт моста; Railway использует выданный `PORT` |
| `GEMINI_API_KEYS` | нет | Несколько ключей Gemini через запятую — ротация при лимитах |
| `GROQ_API_KEY`, `MISTRAL_API_KEY` и др. | нет | Общие fallback-провайдеры |
| `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `NASA_API_KEY`, `UNSPLASH_ACCESS_KEY` | нет | Источники изображений |

`ADMIN_USER_IDS` обязателен: это числовой Telegram ID владельца, а не username.

## 2. Порядок деплоя

### Шаг 1: база
Схема хранится в `migrations/` и применяется командой `python migrate.py`.
Не считайте базу готовой только по наличию аккаунта Neon: проверяйте миграции
для каждого нового окружения.

### Шаг 2: бот
```bash
# на сервере
git clone <репозиторий> && cd AutoPostingTG
pip install -r requirements.txt
# заполнить .env (см. таблицу выше)
python production_check.py
python migrate.py
python main.py
```
Для автозапуска: systemd-юнит или `docker compose` (процесс должен перезапускаться при падении).

Docker-вариант запускает те же проверки и миграции автоматически:

```bash
docker compose up --build -d
docker compose logs -f bot
```

Для локального запуска через Docker Desktop, если proxy слушает
`127.0.0.1:10809` на Windows, используйте дополнительный override:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-proxy.yml up --build -d
```

### Bridge для Mini App

Mini App является главным интерфейсом, поэтому production bridge обязателен.
На Railway приложение слушает автоматически выданный `PORT`. Для Docker/VPS
укажите `BRIDGE_PORT=8081` и запускайте дополнительный override:

```bash
docker compose -f docker-compose.yml -f docker-compose.bridge.yml up -d
```

Bridge привязывается только к `127.0.0.1`. Разместите перед ним HTTPS reverse
proxy на VPS и укажите его публичный HTTPS URL в `BOT_BRIDGE_URL` на Vercel.
Не публикуйте порт bridge напрямую в интернет и не используйте HTTP URL в
`BOT_BRIDGE_URL`.

Для краткого локального теста Docker Desktop можно добавить
`docker-compose.tunnel.yml`. Он запускает временный Cloudflare Quick Tunnel;
скопируйте выданный `https://*.trycloudflare.com` в `BOT_BRIDGE_URL` Vercel и
перезапустите Vercel deployment. URL меняется после перезапуска tunnel и не
подходит для постоянного production.

### Шаг 3: Mini App
Разверните корневой Next.js-проект командой `vercel --prod` или через Git
integration. Пропишите production env-переменные в настройках Vercel-проекта.

### Шаг 4: связать с Telegram
1. В @BotFather: `/newapp` → указать URL Vercel-деплоя → получить Mini App
2. Кнопка меню бота: `/setmenubutton` → URL Mini App

Либо добавьте `WEB_APP_URL=https://ваш-проект.vercel.app` в `.env` бота и
перезапустите контейнер: бот установит menu button автоматически.

## 3. Проверка после деплоя

- [ ] `/test` в боте показывает все провайдеры и ключи
- [ ] `/preview космос` генерирует пост с фото
- [ ] Mini App открывается из Telegram (не из браузера — там будет 401)
- [ ] В Mini App добавить расписание → бот публикует в указанное время
- [ ] Добавить свой API-ключ в «API хранилище» → генерация идёт через него (видно в «Статистика»)

## 4. Как работает авторизация

Mini App подписывает каждый запрос заголовком `X-Telegram-Init-Data`. Сервер проверяет
HMAC-подпись initData токеном бота и достаёт Telegram ID пользователя. Пользователь
создаётся в БД автоматически при первом входе. Все данные (ключи, посты, расписания,
статистика) изолированы по user_id.

## 5. Как работает каскад генерации

1. Ключи клиента из «API хранилища» (по приоритету)
2. `GEMINI_API_KEYS` с ротацией (второй ключ подхватывается при 429)
3. Остальные env-провайдеры по `LLM_PROVIDER_ORDER`

Каждая попытка пишется в `usage_events` и видна в разделе «Статистика».

## 6. Миграции текущего релиза

- `002_publication_integrity.sql` — проверенные каналы и честные статусы публикации;
- `003_style_profiles.sql` — профиль стиля по каналу;
- `004_rate_limits_and_query_indexes.sql` — распределённые API-лимиты и индексы.
- `005_quarantine_invalid_publication_work.sql` — отключение legacy-слотов и
  Queue-записей, которые ссылаются не на проверенный Telegram-канал.
- `006_merge_duplicate_telegram_channels.sql` — объединение `@username` и
  `-100...` алиасов одного Telegram-канала по стабильному Telegram chat ID.

Сначала применяйте их на отдельной Neon branch/staging-базе. Production entrypoint
применит только ещё не записанные миграции под PostgreSQL advisory lock.
