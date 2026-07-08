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
from bridge import start_bridge
from config import AppConfig, load_config
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
        "Примеры:\n"
        "/post wow космос\n"
        "/preview funny биология"
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


async def publish_post(
    topic: str | None = None,
    *,
    target_chat: str | int | None = None,
    mode: str | None = None,
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
    image = await get_science_photo(normalized_topic, config, excluded_urls=excluded_image_urls)
    image_payload = await download_image(image, config) if image else None

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
            image_source = image.source if image else "unknown"
            image_url = image.url if image else None
        else:
            sent = await bot.send_message(
                chat_id=chat_id,
                text=_caption(post_text),
                parse_mode=ParseMode.HTML,
                link_preview_options=LinkPreviewOptions(is_disabled=True),
                disable_notification=True,
            )
            message_id = sent.message_id
            image_source = None
            image_url = None

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
    image_status = "с изображением" if result.with_image else "без изображения"
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
    if config.disable_periodic_posting:
        logger.info("Periodic posting is disabled")
        return

    interval = max(config.post_interval_hours, 1) * 3600
    if config.post_on_startup:
        await publish_post(config.default_topic)

    while True:
        await asyncio.sleep(interval)
        await publish_post(config.default_topic, mode=config.default_mode)


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

        bridge_runner = await start_bridge(_generate_preview, publish_post)
        asyncio.create_task(periodic_posting())
        await bot.delete_webhook(drop_pending_updates=True)
        await bot.set_my_commands(
            [
                BotCommand(command="start", description="Открыть меню"),
                BotCommand(command="menu", description="Показать кнопки меню"),
                BotCommand(command="preview", description="Тестовый пост в этот чат"),
                BotCommand(command="post", description="Опубликовать пост в канал"),
                BotCommand(command="modes", description="Показать режимы генерации"),
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
