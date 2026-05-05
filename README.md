# AI Content Manager

Telegram-бот для портфолио: генерирует короткие научно-популярные посты, подбирает изображение и публикует результат в Telegram-канал.

Проект сделан расширяемым: LLM-провайдеры подключаются через `.env`, а при отсутствии API-ключей бот использует локальный fallback-генератор текста.

## Возможности

- `/post [тема]` - отправить пост в канал.
- `/preview [тема]` - отправить тестовый пост в текущий чат.
- `/test` - проверить конфигурацию.
- Автопостинг по расписанию раз в `POST_INTERVAL_HOURS`.
- Fallback-цепочка LLM: Groq, Mistral, Gemini, NVIDIA, OpenRouter, custom OpenAI-compatible API, local.
- Fallback-цепочка изображений: Wikimedia, NASA, Pixabay, Pexels, Unsplash.

## Быстрый запуск

1. Создать виртуальное окружение:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Установить зависимости:

```powershell
pip install -r requirements.txt
```

3. Создать `.env` на основе `.env.example`:

```powershell
Copy-Item .env.example .env
```

4. Заполнить минимум:

```env
BOT_TOKEN=токен_бота_из_BotFather
CHANNEL_ID=@username_канала
CHANNEL_URL=https://t.me/username_канала
```

Если при запуске есть ошибка `Cannot connect to host api.telegram.org:443`, значит Python-процесс не имеет доступа к Telegram Bot API. Включить VPN в режиме системного туннеля или указать локальный proxy:

```env
TELEGRAM_PROXY_URL=http://127.0.0.1:7890
```

или:

```env
TELEGRAM_PROXY_URL=socks5://127.0.0.1:1080
```

Порт зависит от твоего VPN/proxy-клиента.

Для внешних AI и image API используется `OUTBOUND_PROXY_URL`. Если он пустой, бот берёт `TELEGRAM_PROXY_URL`.

```env
TELEGRAM_PROXY_URL=http://127.0.0.1:10809
OUTBOUND_PROXY_URL=http://127.0.0.1:10809
```

5. Добавить бота администратором канала с правом публикации.

6. Запустить:

```powershell
python main.py
```

7. В Telegram написать боту:

```text
/test
/preview космос
/post космос
```

## Бесплатный LLM-режим

Для демо бот работает даже без внешнего LLM API. Он будет брать локальные шаблоны из `ai_gen.py`.

Для более сильного портфолио-режима рекомендуется начать с Groq:

```env
GROQ_API_KEY=...
GROQ_MODELS=llama-3.1-8b-instant,llama-3.3-70b-versatile,gemma2-9b-it,qwen/qwen3-32b
LLM_PROVIDER_ORDER=groq,nvidia,openrouter,local
```

Бот перебирает модели слева направо. Если одна модель вернула лимит, 403, 429 или сетевую ошибку, он переходит к следующей.

## Изображения

Wikimedia работает без ключа. NASA по умолчанию использует `DEMO_KEY`, но для стабильности лучше получить бесплатный ключ NASA API:

```env
NASA_API_KEY=...
```

Pixabay, Pexels и Unsplash опциональны:

```env
PIXABAY_API_KEY=
PEXELS_API_KEY=
UNSPLASH_ACCESS_KEY=
```

## Настройки

```env
DEFAULT_TOPIC=наука
POST_INTERVAL_HOURS=24
POST_ON_STARTUP=false
DISABLE_PERIODIC_POSTING=false
ADMIN_USER_IDS=
TELEGRAM_PROXY_URL=
OUTBOUND_PROXY_URL=
REQUEST_TIMEOUT_SECONDS=30
MAX_IMAGE_BYTES=8000000
```

Если `ADMIN_USER_IDS` пустой, команды доступны всем, кто написал боту. Для реального канала лучше указать Telegram user id администраторов:

```env
ADMIN_USER_IDS=123456789,987654321
```

## Структура

```text
main.py          # Telegram-бот, команды, публикация
config.py        # Загрузка и нормализация .env
ai_gen.py        # LLM-провайдеры и local fallback
image_fetcher.py # Поиск и скачивание изображений
requirements.txt # Минимальные зависимости
.env.example     # Шаблон конфигурации
```

## Что требуется от владельца проекта

- Создать Telegram-бота через BotFather.
- Создать Telegram-канал или использовать существующий.
- Добавить бота администратором канала.
- Заполнить `BOT_TOKEN`, `CHANNEL_ID`, `CHANNEL_URL`.
- По желанию получить бесплатный `GROQ_API_KEY` и `NASA_API_KEY`.
- Запустить `python main.py`.
