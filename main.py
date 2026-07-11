import asyncio
import html
import logging
from dataclasses import dataclass

from aiogram import Bot, Dispatcher, types
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.filters.command import CommandObject
from aiogram.types import BotCommand, KeyboardButton, LinkPreviewOptions, ReplyKeyboardMarkup
from aiogram.types import BufferedInputFile

import db
from ai_gen import available_modes, enabled_provider_names, generate_post, is_mode_token, normalize_mode
from ai_image import ai_image_available, generate_ai_image
from bridge import start_bridge
from config import AppConfig, load_config
from scheduler import run_scheduler
from user_keys import fetch_user_providers, log_usage
from content_history import ContentHistory
from image_fetcher import download_image, get_science_photo


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

config = load_config()


def _create_bot(config: AppConfig) -> Bot | None:
    if not config.bot_token:
        return None
    session = AiohttpSession(
        proxy=config.telegram_proxy_url or None,
        timeout=float(config.request_timeout_seconds),
    )
    return Bot(token=config.bot_token, session=session)


bot = _create_bot(config)
dp = Dispatcher()

# Команды настройки (/setup, /channels, /addtime, /topics и др.) — setup_commands.py
import setup_commands as _setup_commands  # noqa: E402

dp.include_router(
    _setup_commands.attach(
        config,
        lambda user_id: not config.admin_user_ids or user_id in config.admin_user_ids,
    )
)


BTN_PREVIEW = "🔎 Preview"
BTN_POST = "🚀 Post"
BTN_TEST = "⚙️ Test"
BTN_MODES = "🎛 Modes"
BTN_HELP = "❓ Help"


@dataclass(frozen=True)
class PublishResult:
    ok: bool
    with_image: bool
    topic: str
    details: str


@dataclass(frozen=True)
class CommandInput:
    topic: str
    mode: str


def _normalize_topic(raw: str | None) -> str:
    topic = (raw or "").strip()
    return topic or config.default_topic


def _parse_command_args(raw: str | None) -> CommandInput:
    parts = (raw or "").split()
    if parts:
        maybe_mode = normalize_mode(parts[0], config)
        if is_mode_token(parts[0]):
            return CommandInput(topic=_normalize_topic(" ".join(parts[1:])), mode=maybe_mode)
    return CommandInput(topic=_normalize_topic(raw), mode=normalize_mode(config.default_mode, config))


def _channel_url(config: AppConfig) -> str:
    if config.channel_url:
        return config.channel_url
    if config.channel_id.startswith("@"):
        return f"https://t.me/{config.channel_id.lstrip('@')}"
    return ""


def _channel_footer(config: AppConfig) -> str:
    url = _channel_url(config)
    if not url:
        return "\n\nНаучные факты"
    return f'\n\n<a href="{url}">Научные факты</a>'


def _is_allowed(message: types.Message) -> bool:
    if not config.admin_user_ids:
        return True
    if not message.from_user:
        return False
    return message.from_user.id in config.admin_user_ids


async def _deny_if_needed(message: types.Message) -> bool:
    if _is_allowed(message):
        return False
    await message.answer("У вас нет доступа к этой команде.")
    return True


def _caption(text: str) -> str:
    suffix = _channel_footer(config)
    text = html.escape(text)
    limit = 1024 - len(suffix)
    if len(text) > limit:
        text = text[: limit - 3].rstrip() + "..."
    return text + suffix


def _main_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=BTN_PREVIEW), KeyboardButton(text=BTN_POST)],
            [KeyboardButton(text=BTN_TEST), KeyboardButton(text=BTN_MODES)],
            [KeyboardButton(text=BTN_HELP)],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите действие или введите /preview funny космос",
    )


def _help_text() -> str:
    return (
        "AI Content Manager\n\n"
        "Кнопки меню:\n"
        f"{BTN_PREVIEW} - preview с темой и режимом по умолчанию\n"
        f"{BTN_POST} - публикация в канал с темой и режимом по умолчанию\n"
        f"{BTN_TEST} - проверка конфигурации\n"
        f"{BTN_MODES} - список режимов\n"
        f"{BTN_HELP} - справка\n\n"
        "Команды с аргументами:\n"
        "/post [режим] [тема] - отправить пост в канал\n"
        "/preview [режим] [тема] - отправить тестовый пост в этот чат\n"
        "/modes - показать режимы\n"
        "/test - проверить конфигурацию\n\n"
        "Настройка системы (всё как в Mini App):\n"
        "/setup - обзор текущей настройки\n"
        "/channels, /addchannel, /usechannel - каналы\n"
        "/settopic, /setmode, /setmedia - тема, режим, медиа\n"
        "/times, /addtime, /deltime - расписание\n"
        "/topics, /addtopic, /deltopic - пул тем\n\n"
        "Примеры:\n"
        "/post wow космос\n"
        "/addchannel @mychannel космос\n"
        "/addtime 09:00 история funny"
    )


def _modes_text() -> str:
    return (
        "Режимы генерации:\n\n"
        "normal / обычный - нейтральный короткий факт\n"
        "funny / смешной - факт с лёгкой иронией\n"
        "wow / интересный - факт с акцентом на удивление\n"
        "strict / строгий - сухой информативный стиль\n\n"
        "Пример:\n"
        "/preview wow деревья"
    )


async def _resolve_media(
    topic: str,
    post_text: str,
    image_policy: str,
    excluded_image_urls: set[str],
) -> tuple[tuple[bytes, str] | None, str | None, str | None]:
    """Подбирает медиа по политике канала.

    Возвращает (payload, image_url, image_source).
    Политики: 'off' — без фото; 'ai' — AI-генерация с откатом на стоковые;
    'auto' (по умолчанию) — стоковые фото.
    """
    if image_policy == "off":
        return None, None, None

    if image_policy == "ai" and ai_image_available(config):
        ai_payload = await generate_ai_image(topic, post_text, config)
        if ai_payload:
            return ai_payload, None, "AI (Gemini)"
        logger.info("AI image failed, falling back to stock photos")

    image = await get_science_photo(topic, config, excluded_urls=excluded_image_urls)
    payload = await download_image(image, config) if image else None
    if payload and image:
        return payload, image.url, image.source
    return None, None, None


async def publish_post(
    topic: str | None = None,
    *,
    target_chat: str | int | None = None,
    mode: str | None = None,
    image_policy: str | None = None,
    schedule_id: int | None = None,
    scheduled_at=None,
) -> PublishResult:
    if bot is None:
        return PublishResult(False, False, _normalize_topic(topic), "BOT_TOKEN is not configured")

    normalized_topic = _normalize_topic(topic)
    normalized_mode = normalize_mode(mode, config)
    chat_id = target_chat or config.channel_id
    logger.info("Preparing post for topic: %s, mode: %s", normalized_topic, normalized_mode)

    use_db = bool(config.database_url)
    pool = None
    channel_db_id: int | None = None
    owner_id: int | None = None
    history: ContentHistory | None = None
    user_providers: list[dict] = []

    if use_db:
        pool = await db.get_pool(config.database_url)
        owner_telegram_id = next(iter(config.admin_user_ids), 0)
        owner_id = await db.ensure_user(pool, owner_telegram_id)
        channel_db_id = await db.ensure_channel(
            pool, owner_id, str(chat_id), topic=normalized_topic, mode=normalized_mode
        )
        avoid_texts = await db.recent_texts(
            pool, channel_db_id, topic=normalized_topic, mode=normalized_mode, limit=config.recent_post_limit
        )
        try:
            user_providers = await fetch_user_providers(pool, owner_id)
        except Exception:
            logger.exception("Failed to load user providers, falling back to env keys")
    else:
        history = ContentHistory.load(config)
        avoid_texts = history.recent_texts(
            topic=normalized_topic,
            mode=normalized_mode,
            limit=config.recent_post_limit,
        )

    async def _is_duplicate(candidate: str) -> bool:
        if use_db:
            return await db.has_text(pool, channel_db_id, candidate)
        return history.has_text(
            candidate, topic=normalized_topic, mode=normalized_mode, limit=config.recent_post_limit
        )

    async def _log_attempt(provider_name: str, model: str, success: bool, error: str | None, duration_ms: int):
        if use_db and pool is not None:
            await log_usage(
                pool,
                user_id=owner_id,
                channel_id=channel_db_id,
                event_type="generation",
                provider=provider_name,
                model=model,
                success=success,
                error=error,
                duration_ms=duration_ms,
            )

    post_text = ""
    for attempt in range(max(config.generation_attempts, 1)):
        candidate = await generate_post(
            normalized_topic,
            config,
            normalized_mode,
            avoid_texts,
            user_providers=user_providers,
            on_attempt=_log_attempt if use_db else None,
        )
        if candidate is None:
            break
        if not await _is_duplicate(candidate):
            post_text = candidate
            break
        logger.info("Generated duplicate post, retrying. Attempt %s", attempt + 1)
        avoid_texts.append(candidate)

    if not post_text:
        if use_db and pool is not None:
            await log_usage(
                pool,
                user_id=owner_id,
                channel_id=channel_db_id,
                event_type="publish",
                success=False,
                error="all providers failed",
            )
        return PublishResult(False, False, normalized_topic, "all LLM providers failed, nothing published")

    if use_db:
        excluded_image_urls = await db.recent_image_urls(
            pool, channel_db_id, topic=normalized_topic, limit=config.recent_image_limit
        )
    else:
        excluded_image_urls = history.recent_image_urls(topic=normalized_topic, limit=config.recent_image_limit)

    # Медиа-политика: явный параметр > настройка канала > 'auto' (фото включены)
    policy = image_policy
    if policy is None and use_db and channel_db_id is not None:
        settings = await db.get_channel_settings(pool, channel_db_id)
        policy = (settings or {}).get("image_policy")
    policy = policy or "auto"

    image_payload, image_url, image_source = await _resolve_media(
        normalized_topic, post_text, policy, excluded_image_urls
    )

    try:
        message_id: int | None = None
        if image_payload:
            image_bytes, filename = image_payload
            sent = await bot.send_photo(
                chat_id=chat_id,
                photo=BufferedInputFile(image_bytes, filename=filename),
                caption=_caption(post_text),
                parse_mode=ParseMode.HTML,
                show_caption_above_media=False,
                disable_notification=True,
            )
            message_id = sent.message_id
        else:
            sent = await bot.send_message(
                chat_id=chat_id,
                text=_caption(post_text),
                parse_mode=ParseMode.HTML,
                link_preview_options=LinkPreviewOptions(is_disabled=True),
                disable_notification=True,
            )
            message_id = sent.message_id

        if use_db:
            await db.add_published_post(
                pool,
                channel_db_id,
                topic=normalized_topic,
                mode=normalized_mode,
                text=post_text,
                image_url=image_url,
                image_source=image_source,
                telegram_message_id=message_id,
                schedule_id=schedule_id,
            )
            await log_usage(
                pool,
                user_id=owner_id,
                channel_id=channel_db_id,
                event_type="publish",
                success=True,
            )
        else:
            history.add(
                topic=normalized_topic,
                mode=normalized_mode,
                text=post_text,
                image_url=image_url,
                image_source=image_source,
                chat_id=str(chat_id),
            )
            history.save(config.history_limit)
        with_image = bool(image_payload)
        logger.info("Post sent to %s (image: %s)", chat_id, with_image)
        details = f"sent with image from {image_source}" if with_image else "sent without image"
        return PublishResult(True, with_image, normalized_topic, details)
    except Exception as exc:
        logger.exception("Telegram send failed")
        return PublishResult(False, bool(image_payload), normalized_topic, str(exc))


async def publish_custom_text(
    topic: str | None,
    text: str,
    *,
    mode: str | None = None,
    target_chat: str | int | None = None,
    image_url_override: str | None = None,
    image_mode_override: str | None = None,
) -> PublishResult:
    """Публикует отредактированный пользователем текст без генерации.

    Медиа: если пользователь выбрал фото в генераторе (image_url_override) —
    используется оно; если задан image_mode_override ('ai'/'off') — он важнее
    политики канала; иначе — политика канала, как при обычной публикации.
    """
    if bot is None:
        return PublishResult(False, False, _normalize_topic(topic), "BOT_TOKEN is not configured")
    if not text.strip():
        return PublishResult(False, False, _normalize_topic(topic), "empty text")

    normalized_topic = _normalize_topic(topic)
    normalized_mode = normalize_mode(mode, config)
    chat_id = target_chat or config.channel_id

    use_db = bool(config.database_url)
    pool = None
    channel_db_id: int | None = None
    excluded_image_urls: set[str] = set()
    policy = "auto"

    if use_db:
        pool = await db.get_pool(config.database_url)
        owner_telegram_id = next(iter(config.admin_user_ids), 0)
        owner_id = await db.ensure_user(pool, owner_telegram_id)
        channel_db_id = await db.ensure_channel(
            pool, owner_id, str(chat_id), topic=normalized_topic, mode=normalized_mode
        )
        excluded_image_urls = await db.recent_image_urls(
            pool, channel_db_id, topic=normalized_topic, limit=config.recent_image_limit
        )
        settings = await db.get_channel_settings(pool, channel_db_id)
        policy = (settings or {}).get("image_policy") or "auto"

    if image_mode_override in {"ai", "off", "auto"}:
        policy = image_mode_override

    if image_url_override and image_url_override.startswith("data:image/"):
        # AI-фото, сгенерированное в предпросмотре генератора (base64)
        try:
            import base64 as _b64

            b64_data = image_url_override.split(",", 1)[1]
            image_payload = (_b64.b64decode(b64_data), "ai_image.png")
            image_url = None  # data-URL в БД не храним
            image_source = "AI (Gemini)"
        except Exception:
            logger.warning("Data URL decode failed, falling back to policy")
            image_payload, image_url, image_source = await _resolve_media(
                normalized_topic, text, policy, excluded_image_urls
            )
    elif image_url_override:
        # Пользователь выбрал конкретное фото в предпросмотре
        from image_fetcher import ImageResult

        image_payload = await download_image(
            ImageResult(url=image_url_override, source="выбрано вручную"), config
        )
        image_url = image_url_override if image_payload else None
        image_source = "выбрано вручную" if image_payload else None
        if not image_payload:
            logger.warning("Chosen image download failed, falling back to policy")
            image_payload, image_url, image_source = await _resolve_media(
                normalized_topic, text, policy, excluded_image_urls
            )
    else:
        image_payload, image_url, image_source = await _resolve_media(
            normalized_topic, text, policy, excluded_image_urls
        )

    try:
        message_id: int | None = None
        if image_payload:
            image_bytes, filename = image_payload
            sent = await bot.send_photo(
                chat_id=chat_id,
                photo=BufferedInputFile(image_bytes, filename=filename),
                caption=_caption(text),
                parse_mode=ParseMode.HTML,
                show_caption_above_media=False,
                disable_notification=True,
            )
            message_id = sent.message_id
        else:
            sent = await bot.send_message(
                chat_id=chat_id,
                text=_caption(text),
                parse_mode=ParseMode.HTML,
                link_preview_options=LinkPreviewOptions(is_disabled=True),
                disable_notification=True,
            )
            message_id = sent.message_id

        if use_db and channel_db_id is not None:
            await db.add_published_post(
                pool,
                channel_db_id,
                topic=normalized_topic,
                mode=normalized_mode,
                text=text,
                image_url=image_url,
                image_source=image_source,
                telegram_message_id=message_id,
            )
        with_image = bool(image_payload)
        logger.info("Custom post sent to %s (image: %s)", chat_id, with_image)
        return PublishResult(True, with_image, normalized_topic, "custom text published")
    except Exception as exc:
        logger.exception("Custom text publish failed")
        return PublishResult(False, bool(image_payload), normalized_topic, str(exc))


async def _resolve_slot_topic(pool, channel_id: int, fallback_topic: str) -> str:
    """Тема слота: ротация из пула тем канала, иначе тема слота/канала."""
    try:
        pool_topic = await db.pick_pool_topic(pool, channel_id)
        if pool_topic:
            return pool_topic
    except Exception:
        logger.exception("Topic pool rotation failed for channel %s", channel_id)
    return fallback_topic


async def prepare_queued_post(item: dict) -> None:
    """Предгенерация поста в очередь за QUEUE_PREGEN_MINUTES до слота.

    Пост сохраняется со status='queued': его можно посмотреть, одобрить,
    отредактировать или отклонить в Mini App до публикации.
    """
    if not config.database_url:
        return
    pool = await db.get_pool(config.database_url)

    if await db.has_queued_post_for_slot(pool, item["schedule_id"], item["scheduled_at"]):
        return

    channel_id = item["channel_id"]
    topic = await _resolve_slot_topic(pool, channel_id, _normalize_topic(item["topic"]))
    mode = normalize_mode(item["mode"], config)
    policy = item.get("image_policy") or "auto"

    owner_telegram_id = next(iter(config.admin_user_ids), 0)
    owner_id = await db.ensure_user(pool, owner_telegram_id)
    avoid_texts = await db.recent_texts(pool, channel_id, topic=topic, mode=mode, limit=config.recent_post_limit)
    try:
        user_providers = await fetch_user_providers(pool, owner_id)
    except Exception:
        user_providers = []

    post_text = ""
    for _ in range(max(config.generation_attempts, 1)):
        candidate = await generate_post(topic, config, mode, avoid_texts, user_providers=user_providers)
        if candidate is None:
            break
        if not await db.has_text(pool, channel_id, candidate):
            post_text = candidate
            break
        avoid_texts.append(candidate)

    if not post_text:
        logger.warning("Pre-generation: all providers failed for schedule %s", item["schedule_id"])
        await notify_owner(
            "⚠️ Не удалось подготовить пост для очереди\n"
            f"Тема: {html.escape(topic)}\n"
            "Все AI-провайдеры недоступны. Проверьте ключи в разделе «API-ключи»."
        )
        return

    image_url: str | None = None
    image_source: str | None = None
    if policy == "ai" and ai_image_available(config):
        # AI-изображение генерируется в момент публикации (нет URL для предпросмотра)
        image_source = "ai_pending"
    elif policy != "off":
        excluded = await db.recent_image_urls(pool, channel_id, topic=topic, limit=config.recent_image_limit)
        image = await get_science_photo(topic, config, excluded_urls=excluded)
        if image:
            image_url = image.url
            image_source = image.source

    post_id = await db.insert_queued_post(
        pool,
        channel_id,
        schedule_id=item["schedule_id"],
        topic=topic,
        mode=mode,
        text=post_text,
        image_url=image_url,
        image_source=image_source,
        media_type="photo" if image_url else None,
        scheduled_at=item["scheduled_at"],
    )
    logger.info("Queued post %s prepared for schedule %s (%s)", post_id, item["schedule_id"], topic)

    slot_time = str(item.get("post_time") or "")[:5]
    await notify_owner(
        f"📝 Пост подготовлен и ждёт в очереди\n"
        f"Слот: {slot_time} · Тема: {html.escape(topic)}\n"
        f"Откройте Mini App, чтобы посмотреть, поправить или отклонить его до публикации."
    )


async def publish_prepared(post: dict, chat_id: str, image_policy: str) -> PublishResult:
    """Публикует уже подготовленный пост из очереди (текст и медиа заданы)."""
    if bot is None:
        return PublishResult(False, False, post["topic"], "BOT_TOKEN is not configured")

    pool = await db.get_pool(config.database_url)
    text = post["text"]
    image_url = post.get("image_url")
    image_source = post.get("image_source")
    media_type = post.get("media_type") or ("photo" if image_url else None)

    try:
        message_id: int | None = None
        with_image = False

        if media_type == "video" and image_url:
            sent = await bot.send_video(
                chat_id=chat_id,
                video=image_url,
                caption=_caption(text),
                parse_mode=ParseMode.HTML,
                disable_notification=True,
            )
            message_id = sent.message_id
            with_image = True
        else:
            payload: tuple[bytes, str] | None = None
            if image_source == "ai_pending" and ai_image_available(config):
                payload = await generate_ai_image(post["topic"], text, config)
                if payload:
                    image_source = "AI (Gemini)"
            elif image_url:
                from image_fetcher import ImageResult

                payload = await download_image(
                    ImageResult(url=image_url, source=image_source or "custom"), config
                )

            if payload:
                image_bytes, filename = payload
                sent = await bot.send_photo(
                    chat_id=chat_id,
                    photo=BufferedInputFile(image_bytes, filename=filename),
                    caption=_caption(text),
                    parse_mode=ParseMode.HTML,
                    show_caption_above_media=False,
                    disable_notification=True,
                )
                message_id = sent.message_id
                with_image = True
            elif image_url:
                # не удалось скачать — пробуем отправить по URL напрямую
                sent = await bot.send_photo(
                    chat_id=chat_id,
                    photo=image_url,
                    caption=_caption(text),
                    parse_mode=ParseMode.HTML,
                    disable_notification=True,
                )
                message_id = sent.message_id
                with_image = True
            else:
                sent = await bot.send_message(
                    chat_id=chat_id,
                    text=_caption(text),
                    parse_mode=ParseMode.HTML,
                    link_preview_options=LinkPreviewOptions(is_disabled=True),
                    disable_notification=True,
                )
                message_id = sent.message_id

        await db.mark_post_published(pool, post["id"], message_id)
        logger.info("Queued post %s published to %s (media: %s)", post["id"], chat_id, with_image)
        return PublishResult(True, with_image, post["topic"], "published from queue")
    except Exception as exc:
        logger.exception("Queued post %s publish failed", post["id"])
        try:
            await db.mark_post_failed(pool, post["id"], str(exc))
        except Exception:
            logger.exception("Failed to mark post %s as failed", post["id"])
        return PublishResult(False, False, post["topic"], str(exc))


async def notify_owner(text: str) -> None:
    """Отправляет служебное уведомление владельцу бота в личку.

    Работает тихо: любые ошибки (владелец не начал диалог с ботом и т.п.)
    логируются, но не влияют на основной поток.
    """
    if bot is None or not config.admin_user_ids:
        return
    for admin_id in config.admin_user_ids:
        try:
            await bot.send_message(
                chat_id=admin_id,
                text=text,
                parse_mode=ParseMode.HTML,
                link_preview_options=LinkPreviewOptions(is_disabled=True),
                disable_notification=False,
            )
        except Exception:
            logger.warning("Owner notification failed for %s", admin_id, exc_info=True)


async def publish_scheduled(item: dict) -> PublishResult:
    """Публикация слота: пост из очереди либо свежая генерация."""
    pool = await db.get_pool(config.database_url)
    queued = await db.get_queued_post_for_slot(pool, item["schedule_id"], item["scheduled_at"])
    if queued:
        result = await publish_prepared(queued, item["chat_id"], item.get("image_policy") or "auto")
    else:
        topic = await _resolve_slot_topic(pool, item["channel_id"], _normalize_topic(item["topic"]))
        result = await publish_post(
            topic,
            target_chat=item["chat_id"],
            mode=item["mode"],
            image_policy=item.get("image_policy"),
            schedule_id=item["schedule_id"],
        )

    slot_time = str(item.get("post_time") or "")[:5]
    chat = html.escape(str(item.get("chat_id") or ""))
    if result.ok:
        await notify_owner(
            f"✅ Пост по расписанию опубликован\n"
            f"Канал: {chat}\n"
            f"Слот: {slot_time} · Тема: {html.escape(result.topic)}\n"
            f"{'С изображением' if result.with_image else 'Без изображения'}"
        )
    else:
        await notify_owner(
            f"⚠️ Пост по расписанию не вышел\n"
            f"Канал: {chat}\n"
            f"Слот: {slot_time} · Тема: {html.escape(result.topic)}\n"
            f"Причина: {html.escape(result.details[:200])}"
        )
    return result


METRICS_POLL_SECONDS = 60  # опрос каждую минуту (getChatMemberCount — дешёвый вызов)
METRICS_HEARTBEAT_SECONDS = 3600  # запись раз в час, даже если число не изменилось


async def run_metrics_collector() -> None:
    """Следит за числом подписчиков почти в реальном времени.

    Опрашивает Telegram каждую минуту, но пишет в БД только когда значение
    изменилось (+ часовой heartbeat, чтобы график не имел разрывов).
    Так статистика обновляется ежеминутно без раздувания таблицы.
    """
    if bot is None or not config.database_url:
        return
    pool = await db.get_pool(config.database_url)
    last_counts: dict[int, int] = {}
    last_written: dict[int, float] = {}

    while True:
        try:
            channels = await db.active_channels(pool)
            now = asyncio.get_event_loop().time()
            for channel in channels:
                chat_id = channel["chat_id"]
                # личные чаты (preview) пропускаем — метрики только для каналов
                if not (str(chat_id).startswith("@") or str(chat_id).startswith("-100")):
                    continue
                cid = channel["id"]
                try:
                    count = await bot.get_chat_member_count(chat_id=chat_id)
                except Exception:
                    logger.warning("Metric snapshot failed for %s", chat_id, exc_info=True)
                    continue

                changed = last_counts.get(cid) != count
                stale = now - last_written.get(cid, 0) >= METRICS_HEARTBEAT_SECONDS
                if changed or stale:
                    try:
                        await db.record_channel_metric(pool, cid, count)
                        last_counts[cid] = count
                        last_written[cid] = now
                    except Exception:
                        logger.warning("Metric write failed for %s", chat_id, exc_info=True)
        except Exception:
            logger.exception("Metrics collector loop error")
        await asyncio.sleep(METRICS_POLL_SECONDS)


@dp.message(Command("start", "help"))
async def cmd_help(message: types.Message):
    if await _deny_if_needed(message):
        return
    await message.answer(_help_text(), reply_markup=_main_keyboard())


@dp.message(Command("menu"))
async def cmd_menu(message: types.Message):
    if await _deny_if_needed(message):
        return
    await message.answer("Меню включено.", reply_markup=_main_keyboard())


@dp.message(Command("modes"))
async def cmd_modes(message: types.Message):
    if await _deny_if_needed(message):
        return
    await message.answer(_modes_text(), reply_markup=_main_keyboard())


@dp.message(Command("post"))
async def cmd_post(message: types.Message, command: CommandObject):
    if await _deny_if_needed(message):
        return
    parsed = _parse_command_args(command.args)
    await message.answer(f"Готовлю пост для канала. Тема: {parsed.topic}. Режим: {parsed.mode}")
    result = await publish_post(parsed.topic, mode=parsed.mode)
    status = "отправлен" if result.ok else "не отправлен"
    image_status = "с изображением" if result.with_image else "��ез изображения"
    await message.answer(f"Пост {status}: {image_status}. Детали: {result.details}")


@dp.message(Command("preview"))
async def cmd_preview(message: types.Message, command: CommandObject):
    if await _deny_if_needed(message):
        return
    parsed = _parse_command_args(command.args)
    await message.answer(f"Готовлю preview в этот чат. Тема: {parsed.topic}. Режим: {parsed.mode}")
    result = await publish_post(parsed.topic, target_chat=message.chat.id, mode=parsed.mode)
    status = "готов" if result.ok else "не отправлен"
    image_status = "с изображением" if result.with_image else "без изображения"
    await message.answer(f"Preview {status}: {image_status}. Детали: {result.details}")


@dp.message(Command("test"))
async def cmd_test(message: types.Message):
    if await _deny_if_needed(message):
        return
    providers = enabled_provider_names(config)
    image_keys = {
        "NASA": bool(config.nasa_api_key),
        "Pixabay": bool(config.pixabay_api_key),
        "Pexels": bool(config.pexels_api_key),
        "Unsplash": bool(config.unsplash_access_key),
    }
    image_status = ", ".join(f"{name}: {'on' if enabled else 'off'}" for name, enabled in image_keys.items())
    await message.answer(
        "Конфигурация:\n\n"
        f"BOT_TOKEN: {'on' if config.bot_token else 'off'}\n"
        f"CHANNEL_ID: {config.channel_id or 'off'}\n"
        f"Telegram proxy: {'on' if config.telegram_proxy_url else 'off'}\n"
        f"LLM providers: {', '.join(providers) if providers else 'local'}\n"
        f"Image providers: Wikimedia: on, {image_status}\n"
        f"Default topic: {config.default_topic}\n"
        f"Default mode: {normalize_mode(config.default_mode, config)}\n"
        f"Modes: {', '.join(available_modes())}\n"
        f"History file: {config.history_file}\n"
        f"Periodic posting: {'off' if config.disable_periodic_posting else str(config.post_interval_hours) + 'h'}"
        ,
        link_preview_options=LinkPreviewOptions(is_disabled=True),
        reply_markup=_main_keyboard(),
    )


@dp.message(lambda message: message.text == BTN_PREVIEW)
async def btn_preview(message: types.Message):
    if await _deny_if_needed(message):
        return
    mode = normalize_mode(config.default_mode, config)
    await message.answer(f"Готовлю preview. Тема: {config.default_topic}. Режим: {mode}")
    result = await publish_post(config.default_topic, target_chat=message.chat.id, mode=mode)
    status = "готов" if result.ok else "не отправлен"
    await message.answer(f"Preview {status}. Детали: {result.details}", reply_markup=_main_keyboard())


@dp.message(lambda message: message.text == BTN_POST)
async def btn_post(message: types.Message):
    if await _deny_if_needed(message):
        return
    mode = normalize_mode(config.default_mode, config)
    await message.answer(f"Публикую в канал. Тема: {config.default_topic}. Режим: {mode}")
    result = await publish_post(config.default_topic, mode=mode)
    status = "отправлен" if result.ok else "не отправлен"
    await message.answer(f"Пост {status}. Детали: {result.details}", reply_markup=_main_keyboard())


@dp.message(lambda message: message.text == BTN_TEST)
async def btn_test(message: types.Message):
    await cmd_test(message)


@dp.message(lambda message: message.text == BTN_MODES)
async def btn_modes(message: types.Message):
    if await _deny_if_needed(message):
        return
    await message.answer(_modes_text(), reply_markup=_main_keyboard())


@dp.message(lambda message: message.text == BTN_HELP)
async def btn_help(message: types.Message):
    if await _deny_if_needed(message):
        return
    await message.answer(_help_text(), reply_markup=_main_keyboard())


async def periodic_posting():
    """Fallback-режим: простой интервал, если БД недоступна.

    При наличии DATABASE_URL постингом управляет планировщик
    (scheduler.run_scheduler) по расписаниям из таблицы schedules.
    """
    if config.disable_periodic_posting:
        logger.info("Periodic posting is disabled")
        return

    if config.database_url:
        logger.info("DB-driven scheduler is active; interval-based posting disabled")
        return

    interval = max(config.post_interval_hours, 1) * 3600
    if config.post_on_startup:
        await publish_post(config.default_topic)

    while True:
        await asyncio.sleep(interval)
        await publish_post(config.default_topic, mode=config.default_mode)


async def start_db_scheduler():
    """Запускает планировщик расписаний и сборщик метрик, если настроена БД."""
    if not config.database_url:
        return

    pool = await db.get_pool(config.database_url)
    asyncio.create_task(run_scheduler(pool, publish_scheduled, prepare_queued_post))
    asyncio.create_task(run_metrics_collector())


async def run_bot():
    if bot is None or not config.has_required_telegram_config:
        raise RuntimeError("BOT_TOKEN and CHANNEL_ID must be configured in .env")

    logger.info("Bot starting. Channel: %s", config.channel_id)
    bridge_runner = None
    try:
        async def _generate_preview(topic: str | None, mode: str) -> str | None:
            normalized_topic = _normalize_topic(topic)
            normalized_mode = normalize_mode(mode, config)
            return await generate_post(normalized_topic, config, normalized_mode)

        async def _fetch_image(topic: str, excluded_urls: set[str]) -> dict | None:
            image = await get_science_photo(topic, config, excluded_urls=excluded_urls)
            if not image:
                return None
            return {"url": image.url, "source": image.source}

        async def _ai_image(topic: str, text: str):
            """AI-фото для предпросмотра. Возвращает bytes+имя, None или код ошибки."""
            if not ai_image_available(config):
                return "no_key"
            return await generate_ai_image(topic, text, config)

        bridge_runner = await start_bridge(
            _generate_preview, publish_post, _fetch_image, publish_custom_text, _ai_image
        )
        asyncio.create_task(periodic_posting())
        await start_db_scheduler()
        await bot.delete_webhook(drop_pending_updates=True)
        await bot.set_my_commands(
            [
                BotCommand(command="start", description="Открыть меню"),
                BotCommand(command="setup", description="Обзор и настройка системы"),
                BotCommand(command="channels", description="Мои каналы"),
                BotCommand(command="addchannel", description="Добавить канал"),
                BotCommand(command="addtime", description="Добавить время публикации"),
                BotCommand(command="times", description="Расписание публикаций"),
                BotCommand(command="topics", description="Пул тем (ротация)"),
                BotCommand(command="setmedia", description="Медиа: auto / ai / off"),
                BotCommand(command="preview", description="Тестовый пост в этот чат"),
                BotCommand(command="post", description="Опубликовать пост в канал"),
                BotCommand(command="modes", description="Режимы генерации"),
                BotCommand(command="test", description="Проверить конфигурацию"),
            ]
        )
        await dp.start_polling(bot)
    finally:
        if bridge_runner is not None:
            await bridge_runner.cleanup()
        await db.close_pool()
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(run_bot())
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
    except Exception:
        logger.exception("Bot stopped with an error")
