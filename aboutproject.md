# AI Content Manager

## О проекте

AI Content Manager - это Telegram-бот для автоматической подготовки и публикации научно-популярных постов. Проект рассчитан на портфолио: он показывает работу с Telegram Bot API, асинхронными HTTP-запросами, внешними AI API, fallback-архитектурой и расширяемой конфигурацией через `.env`.

Бот умеет генерировать текст поста, подбирать изображение, отправлять preview в личный чат и публиковать готовый пост в Telegram-канал.

Также поддерживаются режимы генерации (`normal`, `funny`, `wow`, `strict`) и настройка эталона стиля через `POST_STYLE_EXAMPLE` в `.env`.
Для управления есть slash-команды и кнопки Telegram-меню.

## Основная идея

Проект не привязан к одному AI API. Текст генерируется через цепочку провайдеров:

```text
Groq -> Mistral -> Gemini -> NVIDIA -> OpenRouter -> custom OpenAI-compatible API -> local fallback
```

Если внешние API недоступны или ключи не заданы, бот не падает, а использует локальный fallback-генератор текстов из `ai_gen.py`. Это важно для бесплатного портфолио-режима.

Изображения ищутся через отдельную fallback-цепочку:

```text
Wikimedia Commons -> NASA -> Pixabay -> Pexels -> Unsplash
```

Wikimedia работает без ключа. NASA может работать с `DEMO_KEY`, но для стабильности лучше указать бесплатный `NASA_API_KEY`.

## Текущие возможности

- `/post [тема]` - сгенерировать пост и отправить в канал.
- `/preview [тема]` - сгенерировать тестовый пост и отправить в текущий чат.
- `/menu` - показать кнопки управления.
- `/modes` - показать режимы генерации.
- `/test` - показать состояние конфигурации.
- Автопостинг раз в заданное количество часов.
- Ограничение доступа по `ADMIN_USER_IDS`.
- Работа без LLM API-ключей за счет local fallback.
- Режимы генерации: обычный, смешной, удивляющий и строгий.
- Настройка стиля поста через один или несколько эталонов в prompt.
- Reply-кнопки для preview, публикации, проверки конфига и справки.
- Подключение бесплатных и платных провайдеров через `.env`.
- Загрузка изображения в Telegram как bytes, а не простая передача URL.

## Структура

```text
ai_content_manager/
├── main.py              # Telegram-бот, команды, публикация
├── config.py            # Загрузка и нормализация переменных окружения
├── ai_gen.py            # LLM-провайдеры и local fallback
├── image_fetcher.py     # Поиск и скачивание изображений
├── README.md            # Инструкция запуска
├── .env.example         # Шаблон конфигурации
├── .gitignore           # Исключение секретов и служебных файлов
├── requirements.txt     # Минимальные зависимости
├── images/              # Папка под локальные изображения
└── *_*.py / utils.py    # Старые пустые заготовки под дальнейшее развитие
```

## Ключевые файлы

### `main.py`

Главная точка входа. Отвечает за:

- создание `Bot` и `Dispatcher`;
- команды `/start`, `/help`, `/test`, `/preview`, `/post`;
- публикацию текста или фото с caption;
- периодический постинг;
- сброс старых Telegram updates при запуске.

### `config.py`

Центральная конфигурация проекта. Загружает `.env`, нормализует значения и предоставляет `AppConfig`.

Основные настройки:

- Telegram: `BOT_TOKEN`, `CHANNEL_ID`, `CHANNEL_URL`;
- LLM: `GROQ_API_KEY`, `MISTRAL_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`;
- изображения: `NASA_API_KEY`, `PIXABAY_API_KEY`, `PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`;
- поведение: `POST_INTERVAL_HOURS`, `POST_ON_STARTUP`, `DISABLE_PERIODIC_POSTING`, `ADMIN_USER_IDS`.
- стиль: `DEFAULT_MODE`, `POST_STYLE_EXAMPLE`.

### `ai_gen.py`

Содержит общий клиент для OpenAI-compatible chat completion API. Поддерживает:

- Groq;
- Mistral;
- Gemini OpenAI-compatible endpoint;
- NVIDIA NIM;
- OpenRouter;
- любой custom endpoint через `CUSTOM_OPENAI_BASE_URL`.

Если ни один внешний провайдер не вернул текст, используется local fallback.

### `image_fetcher.py`

Отвечает за поиск изображения и скачивание его bytes для отправки в Telegram. Сначала проверяет источники без обязательных платных ключей, затем опциональные stock API.

## Минимальные требования для запуска

Обязательно:

```env
BOT_TOKEN=...
CHANNEL_ID=...
CHANNEL_URL=...
```

Опционально, но желательно:

```env
GROQ_API_KEY=...
NASA_API_KEY=...
ADMIN_USER_IDS=...
```

## Сценарий запуска

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python main.py
```

Перед запуском нужно заполнить `.env` и добавить бота администратором Telegram-канала.

## Сильные стороны для портфолио

- Проект не зависит от одного AI API.
- Есть бесплатный режим без внешнего LLM и бесплатный путь через Groq/NVIDIA/OpenRouter/image API.
- В README явно описан компромисс: бесплатный путь сложнее в настройке, платные API удобнее и стабильнее.
- Провайдеры можно добавлять без переписывания Telegram-логики.
- Секреты вынесены в `.env`.
- Есть preview-команда для безопасной проверки перед публикацией.
- Изображения проходят через fallback-цепочку и скачиваются перед отправкой.

## Следующие улучшения

- Добавить SQLite-историю публикаций.
- Добавить антидубли тем и изображений.
- Добавить генерацию контент-плана на неделю.
- Добавить web-панель управления.
- Добавить Dockerfile.
- Добавить тесты для `config.py`, `ai_gen.py` и `image_fetcher.py`.
