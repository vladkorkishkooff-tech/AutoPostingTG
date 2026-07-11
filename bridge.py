"""HTTP bridge: lets the Mini App (Next.js) trigger the bot.

Runs a small aiohttp server inside the bot process when BRIDGE_PORT is set.
Secured with a shared secret (BRIDGE_SECRET) — the Next.js API route sends it
in the X-Bridge-Secret header. Never expose this port publicly without the secret.
"""

import logging
import os

from aiohttp import web

logger = logging.getLogger(__name__)


def _check_secret(request: web.Request) -> bool:
    secret = os.getenv("BRIDGE_SECRET", "")
    return bool(secret) and request.headers.get("X-Bridge-Secret") == secret


async def start_bridge(generate_preview, publish_post, fetch_image=None, publish_custom=None) -> web.AppRunner | None:
    """Start the bridge server.

    generate_preview(topic, mode) -> str | None
    publish_post(topic, mode=...) -> PublishResult
    fetch_image(topic, excluded_urls) -> dict | None  ({"url", "source"})
    publish_custom(topic, text, mode=...) -> PublishResult  (публикация отредактированного текста)
    """
    port = int(os.getenv("BRIDGE_PORT", "0") or "0")
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

        if action == "publish_custom":
            if publish_custom is None:
                return web.json_response({"error": "not_supported"}, status=501)
            text = str(body.get("text") or "").strip()
            if not text:
                return web.json_response({"error": "empty_text"}, status=400)
            result = await publish_custom(topic or None, text, mode=mode)
            return web.json_response(
                {"ok": result.ok, "withImage": result.with_image, "details": result.details},
                status=200 if result.ok else 502,
            )

        if action == "publish":
            result = await publish_post(topic or None, mode=mode)
            return web.json_response(
                {"ok": result.ok, "withImage": result.with_image, "details": result.details},
                status=200 if result.ok else 502,
            )

        text = await generate_preview(topic or None, mode)
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
        excluded = {str(u) for u in (body.get("excludedUrls") or []) if u}
        result = await fetch_image(topic, excluded)
        if not result:
            return web.json_response({"error": "image_not_found"}, status=404)
        return web.json_response(result)

    async def handle_health(_: web.Request) -> web.Response:
        return web.json_response({"ok": True})

    app = web.Application()
    app.router.add_post("/generate", handle_generate)
    app.router.add_post("/image", handle_image)
    app.router.add_get("/health", handle_health)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    logger.info("Bridge server listening on port %s", port)
    return runner
