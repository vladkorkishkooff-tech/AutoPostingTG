"""Полная настройка бота через команды в Telegram.

Все настройки хранятся в БД (как и в Mini App) — .env остаётся
источником значений по умолчанию. Команды доступны только админам.

Каналы:      /channels, /addchannel, /usechannel
Настройки:   /setup, /settopic, /setmode, /setmedia
Расписание:  /times, /addtime, /deltime
Пул тем:     /topics, /addtopic, /deltopic
"""

import html
import logging
import re

from aiogram import Router, types
from aiogram.filters import Command, CommandObject

import db
from ai_gen import available_modes, normalize_mode

logger = logging.getLogger(__name__)

router = Router(name="setup")

# Выбранный канал для команд настройки: admin_telegram_id -> channel db id
_selected_channel: dict[int, int] = {}

_TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")

MEDIA_POLICIES = {
    "auto": "стоковые фото (по умолчанию)",
    "ai": "AI-генерация изображений (нужен ключ Gemini)",
    "off": "без изображений",
}

# Заполняется из main.py при подключении роутера
_ctx: dict = {"config": None, "is_admin": None}


def attach(config, is_admin) -> Router:
    """Подключает контекст (конфиг и проверку админа) и возвращает роутер."""
    _ctx["config"] = config
    _ctx["is_admin"] = is_admin
    return router


async def _guard(message: types.Message) -> bool:
    """True — если доступ запрещён (не админ или нет БД)."""
    is_admin = _ctx["is_admin"]
    if is_admin is not None and not is_admin(message.from_user.id if message.from_user else 0):
        await message.answer("Эта команда доступна только владельцу бота.")
        return True
    config = _ctx["config"]
    if not config or not config.database_url:
        await message.answer(
            "Настройка через команды требует БД (DATABASE_URL). "
            "Сейчас бот работает в режиме .env-конфигурации."
        )
        return True
    return False


async def _pool():
    return await db.get_pool(_ctx["config"].database_url)


async def _owner_id(pool, message: types.Message) -> int:
    telegram_id = message.from_user.id if message.from_user else 0
    username = message.from_user.username if message.from_user else None
    return await db.ensure_user(pool, telegram_id, username)


async def _current_channel(pool, message: types.Message) -> dict | None:
    """Выбранный канал админа, иначе первый активный, иначе None."""
    owner = await _owner_id(pool, message)
    channels = await db.owner_channels(pool, owner)
    if not channels:
        return None
    admin_id = message.from_user.id if message.from_user else 0
    selected = _selected_channel.get(admin_id)
    if selected:
        for ch in channels:
            if ch["id"] == selected and ch["is_active"] and ch.get("is_verified") and ch.get("bot_can_post"):
                return ch
    for ch in channels:
        if ch["is_active"] and ch.get("is_verified") and ch.get("bot_can_post"):
            return ch
    return None


async def _verify_channel(message: types.Message, target: str) -> dict:
    """Authoritatively verify a Telegram channel before persisting it."""
    if not db.is_valid_channel_target(target):
        return {"ok": False, "error": "invalid_publication_target"}
    try:
        chat = await message.bot.get_chat(target)
    except Exception:
        logger.warning("Channel lookup failed for %s", target, exc_info=True)
        return {"ok": False, "error": "channel_not_found"}
    chat_type = str(getattr(getattr(chat, "type", ""), "value", getattr(chat, "type", ""))).lower()
    if chat_type != "channel":
        return {"ok": False, "error": "target_not_channel"}
    try:
        me = await message.bot.get_me()
        member = await message.bot.get_chat_member(chat.id, me.id)
    except Exception:
        logger.warning("Channel permission check failed for %s", target, exc_info=True)
        return {"ok": False, "error": "permission_check_failed"}
    status = str(getattr(getattr(member, "status", ""), "value", getattr(member, "status", ""))).lower()
    is_owner = status in {"creator", "owner"}
    if not (is_owner or status == "administrator"):
        return {"ok": False, "error": "bot_not_admin"}
    if not (is_owner or bool(getattr(member, "can_post_messages", False))):
        return {"ok": False, "error": "bot_cannot_post"}
    return {
        "ok": True,
        "chat_id": int(chat.id),
        "title": getattr(chat, "title", None),
        "username": getattr(chat, "username", None),
    }


def _channel_line(index: int, ch: dict, current_id: int | None) -> str:
    marker = "→ " if ch["id"] == current_id else "   "
    if not ch.get("is_verified") or not ch.get("bot_can_post"):
        status = " (не проверен)"
    else:
        status = "" if ch["is_active"] else " (выключен)"
    title = f" · {html.escape(ch['title'])}" if ch.get("title") else ""
    return (
        f"{marker}{index}. <b>{html.escape(str(ch['chat_id']))}</b>{title}{status}\n"
        f"      тема: {html.escape(ch['topic'] or '—')} · режим: {ch['mode'] or '—'} · "
        f"медиа: {ch.get('image_policy') or 'auto'}"
    )


@router.message(Command("setup"))
async def cmd_setup(message: types.Message):
    if await _guard(message):
        return
    pool = await _pool()
    ch = await _current_channel(pool, message)
    if ch is None:
        await message.answer(
            "Каналы ещё не настроены.\n\n"
            "Добавьте первый: <code>/addchannel @вашканал тема</code>\n"
            "Например: <code>/addchannel @science_daily космос</code>",
            parse_mode="HTML",
        )
        return

    slots = await db.schedules_for_channel(pool, ch["id"])
    topics = await db.pool_topics(pool, ch["id"])
    active_topics = [t for t in topics if t["is_active"]]

    slots_text = (
        "\n".join(
            f"   {str(s['post_time'])[:5]}"
            + (f" · {html.escape(s['topic'])}" if s.get("topic") else "")
            + (f" · {s['mode']}" if s.get("mode") else "")
            + ("" if s["is_active"] else " (выкл)")
            for s in slots
        )
        or "   нет — добавьте: /addtime 09:00"
    )
    topics_text = (
        "\n".join(f"   {t['id']}. {html.escape(t['topic'])}" for t in active_topics[:10])
        or "   пул пуст — используется тема канала"
    )

    await message.answer(
        f"<b>Текущая настройка</b>\n\n"
        f"Канал: <b>{html.escape(str(ch['chat_id']))}</b>\n"
        f"Тема: {html.escape(ch['topic'] or '—')}\n"
        f"Режим: {ch['mode'] or '—'}\n"
        f"Медиа: {ch.get('image_policy') or 'auto'} — {MEDIA_POLICIES.get(ch.get('image_policy') or 'auto', '')}\n\n"
        f"<b>Расписание</b> ({len(slots)}):\n{slots_text}\n\n"
        f"<b>Пул тем</b> ({len(active_topics)}):\n{topics_text}\n\n"
        f"Команды: /settopic /setmode /setmedia /addtime /addtopic /channels",
        parse_mode="HTML",
    )


@router.message(Command("channels"))
async def cmd_channels(message: types.Message):
    if await _guard(message):
        return
    pool = await _pool()
    owner = await _owner_id(pool, message)
    channels = await db.owner_channels(pool, owner)
    if not channels:
        await message.answer(
            "Каналов нет. Добавьте: <code>/addchannel @вашканал тема</code>", parse_mode="HTML"
        )
        return
    current = await _current_channel(pool, message)
    current_id = current["id"] if current else None
    lines = [_channel_line(i + 1, ch, current_id) for i, ch in enumerate(channels)]
    await message.answer(
        "<b>Ваши каналы</b> (→ выбран для настройки):\n\n"
        + "\n".join(lines)
        + "\n\nПереключить: <code>/usechannel номер</code>",
        parse_mode="HTML",
    )


@router.message(Command("addchannel"))
async def cmd_addchannel(message: types.Message, command: CommandObject):
    if await _guard(message):
        return
    args = (command.args or "").split(maxsplit=1)
    if not args:
        await message.answer(
            "Формат: <code>/addchannel @канал [тема]</code>\n"
            "Бот должен быть админом канала с правом публикации.",
            parse_mode="HTML",
        )
        return
    chat_ref = args[0].strip()
    topic = args[1].strip() if len(args) > 1 else "наука"
    if not db.is_valid_channel_target(chat_ref):
        await message.answer("Укажите @username канала или ID канала, начинающийся с -100. Личный Telegram ID использовать нельзя.")
        return

    verification = await _verify_channel(message, chat_ref)
    if not verification.get("ok"):
        errors = {
            "channel_not_found": "Канал не найден или бот ещё не добавлен в него.",
            "target_not_channel": "Указанный адрес принадлежит не Telegram-каналу.",
            "bot_not_admin": "Добавьте бота администратором канала.",
            "bot_cannot_post": "Выдайте боту право публиковать сообщения.",
            "permission_check_failed": "Не удалось проверить права бота. Повторите позже.",
        }
        await message.answer(errors.get(str(verification.get("error")), "Канал не прошёл проверку."))
        return

    pool = await _pool()
    owner = await _owner_id(pool, message)
    channel_id = await db.ensure_channel(
        pool,
        owner,
        chat_ref,
        title=verification.get("title"),
        topic=topic,
    )
    await db.update_channel_verification(
        pool,
        channel_id,
        verified=True,
        telegram_chat_id=verification.get("chat_id"),
        title=verification.get("title"),
        username=verification.get("username"),
        can_post=True,
    )
    admin_id = message.from_user.id if message.from_user else 0
    _selected_channel[admin_id] = channel_id
    await message.answer(
        f"Канал <b>{html.escape(chat_ref)}</b> добавлен и выбран для настройки.\n"
        f"Тема: {html.escape(topic)}\n\n"
        f"Дальше: <code>/addtime 09:00</code> — время публикации, /setup — обзор.",
        parse_mode="HTML",
    )


@router.message(Command("usechannel"))
async def cmd_usechannel(message: types.Message, command: CommandObject):
    if await _guard(message):
        return
    pool = await _pool()
    owner = await _owner_id(pool, message)
    channels = await db.owner_channels(pool, owner)
    try:
        idx = int((command.args or "").strip())
        ch = channels[idx - 1]
    except (ValueError, IndexError):
        await message.answer("Формат: <code>/usechannel номер</code> — номер из /channels", parse_mode="HTML")
        return
    if not ch.get("is_verified") or not ch.get("bot_can_post") or not ch.get("is_active"):
        await message.answer(
            "Этот канал не готов к публикации. Повторите <code>/addchannel @канал</code>, "
            "чтобы заново проверить права бота.",
            parse_mode="HTML",
        )
        return
    admin_id = message.from_user.id if message.from_user else 0
    _selected_channel[admin_id] = ch["id"]
    await message.answer(
        f"Выбран канал <b>{html.escape(str(ch['chat_id']))}</b>. Все команды настройки применяются к нему.",
        parse_mode="HTML",
    )


async def _update_field(message: types.Message, field: str, value: str, label: str):
    pool = await _pool()
    ch = await _current_channel(pool, message)
    if ch is None:
        await message.answer("Сначала добавьте канал: <code>/addchannel @канал</code>", parse_mode="HTML")
        return
    await db.update_channel_field(pool, ch["id"], field, value)
    await message.answer(
        f"{label} канала <b>{html.escape(str(ch['chat_id']))}</b>: {html.escape(value)}",
        parse_mode="HTML",
    )


@router.message(Command("settopic"))
async def cmd_settopic(message: types.Message, command: CommandObject):
    if await _guard(message):
        return
    topic = (command.args or "").strip()
    if not topic:
        await message.answer("Формат: <code>/settopic космос</code>", parse_mode="HTML")
        return
    await _update_field(message, "topic", topic[:120], "Тема")


@router.message(Command("setmode"))
async def cmd_setmode(message: types.Message, command: CommandObject):
    if await _guard(message):
        return
    raw = (command.args or "").strip().lower()
    modes = available_modes()
    if not raw or normalize_mode(raw) not in modes and raw not in modes:
        await message.answer(
            f"Формат: <code>/setmode режим</code>\nДоступно: {', '.join(modes)}", parse_mode="HTML"
        )
        return
    await _update_field(message, "mode", normalize_mode(raw), "Режим")


@router.message(Command("setmedia"))
async def cmd_setmedia(message: types.Message, command: CommandObject):
    if await _guard(message):
        return
    raw = (command.args or "").strip().lower()
    if raw not in MEDIA_POLICIES:
        options = "\n".join(f"  <code>{k}</code> — {v}" for k, v in MEDIA_POLICIES.items())
        await message.answer(f"Формат: <code>/setmedia auto|ai|off</code>\n\n{options}", parse_mode="HTML")
        return
    await _update_field(message, "image_policy", raw, "Медиа-политика")


@router.message(Command("times"))
async def cmd_times(message: types.Message):
    if await _guard(message):
        return
    pool = await _pool()
    ch = await _current_channel(pool, message)
    if ch is None:
        await message.answer("Сначала добавьте канал: <code>/addchannel @канал</code>", parse_mode="HTML")
        return
    slots = await db.schedules_for_channel(pool, ch["id"])
    if not slots:
        await message.answer(
            "Расписание пусто. Добавьте: <code>/addtime 09:00</code> "
            "или с темой: <code>/addtime 19:00 космос wow</code>",
            parse_mode="HTML",
        )
        return
    lines = [
        f"{str(s['post_time'])[:5]}"
        + (f" · {html.escape(s['topic'])}" if s.get("topic") else " · тема канала")
        + (f" · {s['mode']}" if s.get("mode") else "")
        + ("" if s["is_active"] else " (выкл)")
        for s in slots
    ]
    await message.answer(
        f"<b>Расписание {html.escape(str(ch['chat_id']))}</b>:\n\n"
        + "\n".join(lines)
        + "\n\nУдалить: <code>/deltime 09:00</code>",
        parse_mode="HTML",
    )


@router.message(Command("addtime"))
async def cmd_addtime(message: types.Message, command: CommandObject):
    if await _guard(message):
        return
    parts = (command.args or "").split()
    if not parts or not _TIME_RE.match(parts[0]):
        await message.answer(
            "Формат: <code>/addtime ЧЧ:ММ [тема] [режим]</code>\n"
            "Например: <code>/addtime 09:00</code> или <code>/addtime 19:30 космос wow</code>",
            parse_mode="HTML",
        )
        return
    post_time = parts[0] if len(parts[0]) == 5 else f"0{parts[0]}"

    slot_mode: str | None = None
    topic_parts = parts[1:]
    if topic_parts and normalize_mode(topic_parts[-1]) in available_modes() and topic_parts[-1].lower() in (
        "normal", "short", "long", "funny", "wow", "strict",
        "обычный", "короткий", "лонгрид", "смешной", "интересный", "строгий",
    ):
        slot_mode = normalize_mode(topic_parts[-1])
        topic_parts = topic_parts[:-1]
    slot_topic = " ".join(topic_parts).strip() or None

    pool = await _pool()
    ch = await _current_channel(pool, message)
    if ch is None:
        await message.answer("Сначала добавьте канал: <code>/addchannel @канал</code>", parse_mode="HTML")
        return
    await db.add_schedule_slot(pool, ch["id"], post_time, topic=slot_topic, mode=slot_mode)
    details = []
    if slot_topic:
        details.append(f"тема: {html.escape(slot_topic)}")
    if slot_mode:
        details.append(f"режим: {slot_mode}")
    suffix = f" ({', '.join(details)})" if details else " (тема и режим канала)"
    await message.answer(f"Слот <b>{post_time}</b> добавлен{suffix}.", parse_mode="HTML")


@router.message(Command("deltime"))
async def cmd_deltime(message: types.Message, command: CommandObject):
    if await _guard(message):
        return
    raw = (command.args or "").strip()
    if not _TIME_RE.match(raw):
        await message.answer("Формат: <code>/deltime ЧЧ:ММ</code>", parse_mode="HTML")
        return
    post_time = raw if len(raw) == 5 else f"0{raw}"
    pool = await _pool()
    ch = await _current_channel(pool, message)
    if ch is None:
        await message.answer("Каналов нет.")
        return
    deleted = await db.delete_schedule_slot(pool, ch["id"], post_time)
    if deleted:
        await message.answer(f"Слот <b>{post_time}</b> удалён.", parse_mode="HTML")
    else:
        await message.answer(f"Слот {post_time} не найден. Список: /times")


@router.message(Command("topics"))
async def cmd_topics(message: types.Message):
    if await _guard(message):
        return
    pool = await _pool()
    ch = await _current_channel(pool, message)
    if ch is None:
        await message.answer("Сначала добавьте канал: <code>/addchannel @канал</code>", parse_mode="HTML")
        return
    topics = await db.pool_topics(pool, ch["id"])
    if not topics:
        await message.answer(
            "Пул тем пуст — бот использует тему канала.\n"
            "Добавьте темы для ротации: <code>/addtopic глубокий океан</code>",
            parse_mode="HTML",
        )
        return
    lines = [
        f"{t['id']}. {html.escape(t['topic'])}" + ("" if t["is_active"] else " (выкл)")
        for t in topics
    ]
    await message.answer(
        f"<b>Пул тем {html.escape(str(ch['chat_id']))}</b> (ротация без повторов):\n\n"
        + "\n".join(lines)
        + "\n\nУдалить: <code>/deltopic номер</code>",
        parse_mode="HTML",
    )


@router.message(Command("addtopic"))
async def cmd_addtopic(message: types.Message, command: CommandObject):
    if await _guard(message):
        return
    topic = (command.args or "").strip()
    if not topic:
        await message.answer("Формат: <code>/addtopic глубокий океан</code>", parse_mode="HTML")
        return
    pool = await _pool()
    ch = await _current_channel(pool, message)
    if ch is None:
        await message.answer("Сначала добавьте канал: <code>/addchannel @канал</code>", parse_mode="HTML")
        return
    added = await db.add_pool_topic(pool, ch["id"], topic[:120])
    if added:
        await message.answer(f"Тема «{html.escape(topic)}» добавлена в пул.", parse_mode="HTML")
    else:
        await message.answer("Такая тема уже есть в пуле.")


@router.message(Command("deltopic"))
async def cmd_deltopic(message: types.Message, command: CommandObject):
    if await _guard(message):
        return
    try:
        topic_id = int((command.args or "").strip())
    except ValueError:
        await message.answer("Формат: <code>/deltopic номер</code> — номер из /topics", parse_mode="HTML")
        return
    pool = await _pool()
    ch = await _current_channel(pool, message)
    if ch is None:
        await message.answer("Каналов нет.")
        return
    deleted = await db.delete_pool_topic(pool, ch["id"], topic_id)
    await message.answer("Тема удалена." if deleted else "Тема с таким номером не найдена. Список: /topics")
