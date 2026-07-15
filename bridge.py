"""HTTP bridge: lets the Mini App (Next.js) trigger the bot.

Runs a small aiohttp server inside the bot process when BRIDGE_PORT is set.
Secured with a shared secret (BRIDGE_SECRET) — the Next.js API route sends it
in the X-Bridge-Secret header. Never expose this port publicly without the secret.
"""

import base64
import hmac
import logging
import os

from aiohttp import web

logger = logging.getLogger(__name__)


def _check_secret(request: web.Request) -> bool:
    secret = os.getenv("BRIDGE_SECRET", "")
    supplied = request.headers.get("X-Bridge-Secret", "")
    return bool(secret) and hmac.compare_digest(supplied, secret)


async def start_bridge(
    generate_preview,
    publish_post,
    fetch_image=None,
    publish_custom=None,
    ai_image=None,
    verify_channel=None,
) -> web.AppRunner | None:
    """Start the bridge server.

    generate_preview(topic, mode, owner_telegram_id=..., target_chat=..., avoid_text=...) -> str | None
    publish_post(topic, mode=...) -> PublishResult
    fetch_image(topic, excluded_urls, context, owner_telegram_id=...) -> dict | None
    publish_custom(topic, text, mode=..., image_url=..., image_mode=...) -> PublishResult
    ai_image(topic, text, owner_telegram_id=...) -> tuple[bytes, str] | None | str
    """
    # Railway exposes the public service port through PORT.  Local and
    # self-hosted deployments can still explicitly override it with
    # BRIDGE_PORT.
    port = int(os.getenv("BRIDGE_PORT") or os.getenv("PORT") or "0")
    if not port:
        logger.info("Bridge disabled (BRIDGE_PORT is not set)")
        return None
    if not os.getenv("BRIDGE_SECRET"):
        logger.warning("Bridge disabled: BRIDGE_SECRET is not set")
        return None

    async def handle_generate(request: web.Request) -> web.Response:
        if not _check_secret(request):
            return web.json_response({"error": "unauthorized"}, status=401)
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)

        topic = str(body.get("topic") or "").strip()
        mode = str(body.get("mode") or "normal").strip()
        action = str(body.get("action") or "preview").strip()
        avoid_text = str(body.get("avoidText") or "").strip()[:2000]
        target_chat = str(body.get("targetChat") or "").strip() or None
        try:
            owner_telegram_id = int(body.get("ownerTelegramId") or 0) or None
        except (TypeError, ValueError):
            return web.json_response({"error": "invalid_owner"}, status=400)
        if target_chat and not (
            (target_chat.startswith("@") and target_chat[1:].replace("_", "a").isalnum())
            or (target_chat.startswith("-100") and target_chat[4:].isdigit())
        ):
            return web.json_response({"error": "invalid_target"}, status=400)

        if action == "publish_custom":
            if publish_custom is None:
                return web.json_response({"error": "not_supported"}, status=501)
            text = str(body.get("text") or "").strip()
            if not text:
                return web.json_response({"error": "empty_text"}, status=400)
            image_url = str(body.get("imageUrl") or "").strip() or None
            image_mode = str(body.get("imageMode") or "").strip() or None
            result = await publish_custom(
                topic or None,
                text,
                mode=mode,
                target_chat=target_chat,
                owner_telegram_id=owner_telegram_id,
                image_url_override=image_url,
                image_mode_override=image_mode,
            )
            return web.json_response(
                {
                    "ok": result.ok,
                    "withImage": result.with_image,
                    "details": result.details,
                    "outcome": result.outcome,
                    "messageId": result.message_id,
                    "telegramChatId": result.telegram_chat_id,
                    "messageLink": result.message_link,
                    "errorCode": result.error_code,
                },
                status=200 if result.ok else 502,
            )

        if action == "publish":
            result = await publish_post(
                topic or None,
                mode=mode,
                target_chat=target_chat,
                owner_telegram_id=owner_telegram_id,
            )
            return web.json_response(
                {
                    "ok": result.ok,
                    "withImage": result.with_image,
                    "details": result.details,
                    "outcome": result.outcome,
                    "messageId": result.message_id,
                    "telegramChatId": result.telegram_chat_id,
                    "messageLink": result.message_link,
                    "errorCode": result.error_code,
                },
                status=200 if result.ok else 502,
            )

        text = await generate_preview(
            topic or None,
            mode,
            owner_telegram_id=owner_telegram_id,
            target_chat=target_chat,
            avoid_text=avoid_text or None,
        )
        if text is None:
            return web.json_response({"error": "generation_failed"}, status=502)
        return web.json_response({"text": text})

    async def handle_image(request: web.Request) -> web.Response:
        if not _check_secret(request):
            return web.json_response({"error": "unauthorized"}, status=401)
        if fetch_image is None:
            return web.json_response({"error": "not_supported"}, status=501)
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)

        topic = str(body.get("topic") or "").strip() or "наука"
        # A generated draft contains the exact fact and produces much more
        # relevant stock queries than a short title alone.
        context = str(body.get("text") or "").strip()
        excluded = {str(u) for u in (body.get("excludedUrls") or []) if u}
        try:
            owner_telegram_id = int(body.get("ownerTelegramId") or 0) or None
        except (TypeError, ValueError):
            return web.json_response({"error": "invalid_owner"}, status=400)
        result = await fetch_image(topic, excluded, context or topic, owner_telegram_id=owner_telegram_id)
        if not result:
            return web.json_response({"error": "image_not_found"}, status=404)
        return web.json_response(result)

    async def handle_ai_image(request: web.Request) -> web.Response:
        if not _check_secret(request):
            return web.json_response({"error": "unauthorized"}, status=401)
        if ai_image is None:
            return web.json_response({"error": "not_supported"}, status=501)
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)

        topic = str(body.get("topic") or "").strip() or "наука"
        text = str(body.get("text") or "").strip()
        try:
            owner_telegram_id = int(body.get("ownerTelegramId") or 0) or None
        except (TypeError, ValueError):
            return web.json_response({"error": "invalid_owner"}, status=400)
        result = await ai_image(topic, text, owner_telegram_id=owner_telegram_id)
        if isinstance(result, str):
            status = 429 if result == "quota_exhausted" else 422
            return web.json_response({"error": result}, status=status)
        if result is None:
            return web.json_response({"error": "generation_failed"}, status=502)
        image_bytes, filename = result
        data_url = "data:image/png;base64," + base64.b64encode(image_bytes).decode("ascii")
        return web.json_response({"dataUrl": data_url, "filename": filename})

    async def handle_health(_: web.Request) -> web.Response:
        commit = (os.getenv("RAILWAY_GIT_COMMIT_SHA") or os.getenv("RELEASE_SHA") or "").strip()
        return web.json_response(
            {
                "ok": True,
                "version": os.getenv("APP_VERSION", "1.1.0"),
                "commit": commit[:12] or None,
            }
        )

    async def handle_verify_channel(request: web.Request) -> web.Response:
        if not _check_secret(request):
            return web.json_response({"error": "unauthorized"}, status=401)
        if verify_channel is None:
            return web.json_response({"error": "not_supported"}, status=501)
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)
        target = str(body.get("chatId") or "").strip()
        if not target:
            return web.json_response({"error": "invalid_target"}, status=400)
        result = await verify_channel(target)
        status = 200 if result.get("ok") else 422
        return web.json_response(result, status=status)

    # publish_custom may carry a base64 AI image. Keep the limit bounded, but
    # above the 4 MB limit enforced by the Next.js route.
    app = web.Application(client_max_size=5 * 1024 * 1024)
    app.router.add_post("/generate", handle_generate)
    app.router.add_post("/image", handle_image)
    app.router.add_post("/ai_image", handle_ai_image)
    app.router.add_post("/verify_channel", handle_verify_channel)
    app.router.add_get("/health", handle_health)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    logger.info("Bridge server listening on port %s", port)
    return runner
