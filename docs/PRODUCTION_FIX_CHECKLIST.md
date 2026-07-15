# AutoPostingTG — production readiness checklist

Актуальный статус релиза 1.1.0 после полного аудита. Здесь отмечаются только
функции, которые существуют в коде и имеют проверяемое доказательство.

Обозначения:

- `[x]` — реализовано и покрыто автоматической проверкой;
- `[ ]` — требует действия владельца или проверки в реальном Telegram;
- `N/A` — намеренно не входит в single-owner продаваемую версию.

## 1. Замечания владельца

- [x] Положительный Telegram user ID нельзя сохранить или выбрать как канал.
- [x] Канал сохраняется только после проверки `chat.type == channel`, прав
  администратора и `can_post_messages`.
- [x] Старые некорректные channel rows карантинируются миграцией 002.
- [x] Расписание не сообщает `published` до подтверждения Telegram; сохраняются
  фактические chat ID, message ID, attempt ID и ошибка.
- [x] Ошибочная публикация видна как `failed`, её можно повторить вручную.
- [x] Перегенерация текста доступна в Generator и Queue; при ошибке старый текст
  остаётся на месте.
- [x] Изменение текста делает прежнее фото устаревшим и исключает его из
  публикации до нового выбора.
- [x] Generator и Queue используют общий stock-search contract.
- [x] Generator и Queue показывают до трёх разных stock-кандидатов для выбора;
  повторный поиск передаёт уже показанные URL в exclusions.
- [x] NASA `medium/small/thumb` одного archive asset не считаются разными
  фотографиями; варианты дедуплицируются по исходному NASA asset ID.
- [x] AI-план фото сохраняет точный объект, фокусную деталь и обязательные
  термины; широкое фото отклоняется, если metadata не подтверждает детали.
- [x] Есть regression fixtures для Titan methane rain, Olympus Mons и giant
  squid eye.
- [x] Пакетный режим выключен по умолчанию; владелец выбирает 2–5 постов.
- [x] Пакетные результаты — отдельные черновики, выбранные элементы попадают в
  Queue и никогда не публикуются автоматически.

## 2. Целостность публикации и scheduler

- [x] Статусы: `queued -> publishing -> published|failed`; optimistic success
  отсутствует.
- [x] Слот захватывается атомарно одним worker; есть watchdog пропущенных слотов.
- [x] Schedule/Queue всегда scoped по owner и verified channel.
- [x] Cancel не создаёт замену без явного действия пользователя.
- [x] Режимы `short`, `normal`, `long`, `funny`, `wow`, `strict` валидируются на
  сервере.
- [x] Timezone и время проверяются до записи.
- [x] Telegram error сохраняется без секрета и показывается как retryable state.
- [x] Автоматический blind retry после неопределённого Telegram timeout не
  выполняется, чтобы не создавать дубль; решение остаётся владельцу.
- [x] Два параллельных claim одного слота и mismatch channel покрыты тестами.
- [ ] Выполнить одну намеренную публикацию в тестовый канал и открыть сохранённую
  ссылку на сообщение.
- [ ] Выполнить один реальный schedule slot и сверить Telegram, posts, slot_runs,
  уведомление и Stats.

## 3. Генерация текста

- [x] Новый текст принимается только после проверки языка, длины режима,
  структуры, начала с emoji, окончания предложения, ссылок и boilerplate.
- [x] Previous draft и recent channel history передаются как anti-dup context.
- [x] Batch проверяет различие результатов и возвращает успешные partial drafts,
  если один элемент не сгенерирован.
- [x] Есть bounded provider attempts, timeout, rate limit и usage accounting.
- [x] Native Anthropic и OpenAI-compatible провайдеры разделены корректно.
- [x] При полном отказе LLM возвращается ошибка; локальный выдуманный fallback
  отсутствует.
- [x] UI честно сообщает, что автоматическая проверка проверяет формат, а
  фактологию перед публикацией подтверждает человек.
- [ ] Вручную проверить научные числа, имена и источник каждого demo-поста.

## 4. Stock/AI media

- [x] Структурированный query plan строится после готового текста.
- [x] Пользовательские Gemini keys участвуют в query planning и AI image; env
  keys являются fallback.
- [x] Gemini keys ротируются только после retryable quota/rate failure.
- [x] Провайдеры имеют circuit breaker для повторных auth/quota/server errors.
- [x] Download проверяет public HTTPS/DNS, redirect chain, MIME и размер.
- [x] Старое изображение сохраняется, если замена не удалась.
- [x] Scheduled AI-image failure переходит на безопасный stock fallback.
- [x] Не найденное точное фото возвращает явную ошибку, а не случайное `science`.
- [x] Источник и точный query отображаются/сохраняются для выбранного media.
- [ ] Вручную проверить содержимое thumbnails: metadata-проверка не является
  компьютерным зрением и не гарантирует, что важная деталь видна в кадре.
- [ ] Проверить license/source условия выбранного stock-провайдера перед
  коммерческой публикацией; приложение не выдаёт юридическую гарантию лицензии.

## 5. Mini App

- [x] Channels: connect, verify, enable/disable, defaults и disconnect.
- [x] Style profile: persistent per-channel traits/examples и влияние на prompt.
- [x] Media: фильтры, реальные sources и attach к Queue.
- [x] Providers/Keys: encrypted CRUD, priority, enable/disable, health/usage.
- [x] Settings, History, Templates и Stats работают с user-scoped Postgres data.
- [x] Queue: edit, regenerate, media replace, approve, cancel, publish/retry.
- [x] Duplicate BottomNav/nested main удалены; mobile overflow проверен.
- [x] Без валидного Telegram initData API возвращает 401; production bypass нет.
- [x] `ADMIN_USER_IDS` обязателен и ограничивает продаваемую single-owner версию.
- [x] Browser E2E на 390×844: batch default OFF, 4 drafts, 2 queued,
  regenerate и stock attach.
- [ ] Пройти тот же flow внутри реального Telegram Mini App владельца.

## 6. Безопасность и данные

- [x] Все browser API queries scoped по authenticated user ID.
- [x] initData имеет HMAC, expiry и future timestamp checks.
- [x] API keys шифруются AES-256-GCM совместимым Python/TypeScript форматом.
- [x] Bridge требует `BRIDGE_SECRET`; production URL — только public HTTPS.
- [x] Custom provider URL: HTTPS, DNS resolution, запрет private/link-local/
  metadata IP; проверка повторяется в Python runtime.
- [x] AI/image endpoints имеют DB-backed per-user rate limits.
- [x] Provider response bodies, keys и initData не логируются.
- [x] `.env*` игнорируются и не отслеживаются Git.
- [ ] Перед продажей перевыпустить demo credentials и удалить продавца из
  Vercel/Railway/Neon buyer projects.

## 7. Reproducible release

- [x] Python runtime/dev dependencies pinned separately.
- [x] Additive migrations 001–005 и idempotent advisory-lock runner.
- [x] Docker entrypoint выполняет production check и migrations до старта.
- [x] CI: Python, web, migrations twice, audit, Docker/pip check и gitleaks.
- [x] Health/config endpoints содержат release version и commit SHA.
- [x] README, deployment и buyer handoff соответствуют фактической архитектуре.
- [x] Commit/stage все файлы релиза и получить зелёный CI на remote commit.
- [x] Commit `d423f3c` развёрнут на Railway и Vercel; production API smoke пройден.

## 8. Финальные quality gates

- [x] Python compile и 65 unit/integration tests.
- [x] Mini App lint, TypeScript и 28 unit/API tests.
- [x] Next.js production build.
- [x] Fresh PostgreSQL: migrations 001–005 применены дважды.
- [x] Clean Docker image build и `pip check` внутри образа.
- [x] Production dependency audit: zero known high vulnerabilities.
- [x] Browser E2E: mobile Generator -> batch -> Queue -> regenerate -> stock.
- [x] После последнего изменения все гейты повторены 2026-07-15.

Последний локальный отчёт: Python `65 passed`; Vitest `28 passed`; ESLint без
warning; TypeScript без ошибок; Next.js production build успешен; migrations
001–005 дали `5 applied`, затем `0 applied`; clean Docker build и `pip check`
успешны; `pnpm audit --prod` не нашёл уязвимостей; mobile Edge E2E вернул
`batchDefaultOff=true`, `generatorStockCandidates=3`, `generated=4`,
`queued=2`, `regenerated=true`, `stockAttached=true` без console errors.

## 9. Контролируемая Telegram-приёмка

Делать строго в таком порядке и только в тестовом канале:

- [ ] `/test` в личном чате владельца.
- [ ] `/preview <тема>` в личном чате, без публикации.
- [ ] Открыть Mini App из Telegram и убедиться, что user ID не виден как канал.
- [ ] Создать один пост, перегенерировать его, выбрать точное фото.
- [ ] Опубликовать ровно один явно подтверждённый пост.
- [ ] Создать один slot на 5–10 минут вперёд и дождаться ровно одного сообщения.
- [ ] Временно снять `can_post_messages` и убедиться, что статус становится
  `failed`, а не `published`; затем вернуть право.
- [ ] Повторить channel isolation для второго канала, если покупатель будет
  использовать multi-channel режим.

## Итоговая граница готовности

Код считается release candidate после зелёных автоматических гейтов. Продакшен
считается принятым только после двух внешних доказательств: одной намеренной
ручной публикации и одного реального schedule slot. Эти действия нельзя
автоматизировать без риска публикации вне явного разрешения владельца.
