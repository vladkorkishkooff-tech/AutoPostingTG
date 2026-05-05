import logging
import math
import random
from io import BytesIO
from dataclasses import dataclass
from pathlib import Path

import aiohttp
from PIL import Image, ImageDraw, ImageFont

from config import AppConfig, load_config

logger = logging.getLogger(__name__)


USER_AGENT = "AIContentManager/1.0 (portfolio Telegram bot; educational image search)"


@dataclass(frozen=True)
class ImageResult:
    url: str
    source: str
    title: str = ""

    @property
    def filename(self) -> str:
        suffix = Path(self.url.split("?", 1)[0]).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            suffix = ".jpg"
        safe_source = self.source.lower().replace(" ", "_")
        return f"{safe_source}{suffix}"


def _topic_queries(topic: str) -> list[str]:
    mapping = {
        "наука": ["science research", "laboratory science", "scientific experiment"],
        "космос": ["space astronomy", "galaxy", "nebula", "planet"],
        "физика": ["physics experiment", "particle physics", "quantum physics"],
        "химия": ["chemistry laboratory", "molecules", "chemical experiment"],
        "биология": ["biology microscope", "dna biology", "cell biology"],
        "технологии": ["technology innovation", "computer chip", "robotics"],
        "математика": ["mathematics formula", "geometry", "numbers"],
        "дерево": ["tree", "forest tree", "green tree"],
        "деревья": ["trees", "forest", "green trees"],
        "лес": ["forest", "trees", "woodland"],
        "япония": ["Japan", "Tokyo temple", "Japanese flag"],
        "японский язык": ["Japan", "Japanese language", "Tokyo street"],
    }
    normalized = topic.strip().lower()
    if normalized in mapping:
        return mapping[normalized]
    return [normalized, f"{normalized} science", "science research"]


def _pick_query(topic: str) -> str:
    return random.choice(_topic_queries(topic))


async def _fetch_json(
    session: aiohttp.ClientSession,
    url: str,
    *,
    params: dict[str, str | int] | None = None,
    headers: dict[str, str] | None = None,
    proxy: str | None = None,
) -> dict | None:
    try:
        async with session.get(url, params=params, headers=headers, proxy=proxy) as response:
            if response.status >= 400:
                body = await response.text()
                logger.warning("Image API %s failed with HTTP %s: %s", url, response.status, body[:200])
                return None
            return await response.json()
    except (aiohttp.ClientError, TimeoutError) as exc:
        logger.warning("Image API network error for %s: %s", url, exc)
        return None
    except Exception:
        logger.exception("Unexpected image API error for %s", url)
        return None


async def fetch_wikimedia(session: aiohttp.ClientSession, topic: str, config: AppConfig) -> ImageResult | None:
    query = _pick_query(topic)
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": f"{query} filetype:bitmap",
        "gsrnamespace": "6",
        "gsrlimit": "12",
        "prop": "imageinfo",
        "iiprop": "url|mime|size",
        "iiurlwidth": "1280",
        "origin": "*",
    }
    data = await _fetch_json(
        session,
        "https://commons.wikimedia.org/w/api.php",
        params=params,
        proxy=config.outbound_proxy_url or None,
    )
    pages = (data or {}).get("query", {}).get("pages", {})
    candidates: list[ImageResult] = []

    for page in pages.values():
        image_info = (page.get("imageinfo") or [{}])[0]
        mime = image_info.get("mime", "")
        width = image_info.get("width") or 0
        height = image_info.get("height") or 0
        url = image_info.get("thumburl") or image_info.get("url")
        title = page.get("title", "")

        if not url or not mime.startswith("image/"):
            continue
        if width and height and width < height:
            continue
        if url.lower().endswith((".svg", ".gif", ".tif", ".tiff")):
            continue
        candidates.append(ImageResult(url=url, source="Wikimedia Commons", title=title))

    return random.choice(candidates) if candidates else None


async def fetch_nasa(session: aiohttp.ClientSession, topic: str, config: AppConfig) -> ImageResult | None:
    query = _pick_query(topic)
    params = {"q": query, "media_type": "image", "page_size": 20}
    data = await _fetch_json(
        session,
        "https://images-api.nasa.gov/search",
        params=params,
        proxy=config.outbound_proxy_url or None,
    )
    items = (data or {}).get("collection", {}).get("items", [])
    candidates: list[ImageResult] = []

    for item in items:
        links = item.get("links") or []
        meta = (item.get("data") or [{}])[0]
        for link in links:
            url = link.get("href", "")
            if url and link.get("render") == "image":
                candidates.append(ImageResult(url=url, source="NASA", title=meta.get("title", "")))

    if candidates:
        return random.choice(candidates)

    # APOD is a useful fallback for broad space/science topics.
    if topic.strip().lower() in {"космос", "space", "astronomy"}:
        apod = await _fetch_json(
            session,
            "https://api.nasa.gov/planetary/apod",
            params={"api_key": config.nasa_api_key or "DEMO_KEY", "thumbs": "true"},
            proxy=config.outbound_proxy_url or None,
        )
        if apod and apod.get("media_type") == "image" and apod.get("url"):
            return ImageResult(url=apod["url"], source="NASA APOD", title=apod.get("title", ""))

    return None


async def fetch_pixabay(session: aiohttp.ClientSession, topic: str, config: AppConfig) -> ImageResult | None:
    if not config.pixabay_api_key:
        return None

    params = {
        "key": config.pixabay_api_key,
        "q": _pick_query(topic),
        "image_type": "photo",
        "orientation": "horizontal",
        "safesearch": "true",
        "per_page": 20,
    }
    data = await _fetch_json(
        session,
        "https://pixabay.com/api/",
        params=params,
        proxy=config.outbound_proxy_url or None,
    )
    hits = (data or {}).get("hits", [])
    candidates = [
        ImageResult(
            url=item.get("largeImageURL") or item.get("webformatURL"),
            source="Pixabay",
            title=item.get("tags", ""),
        )
        for item in hits
        if item.get("largeImageURL") or item.get("webformatURL")
    ]
    return random.choice(candidates) if candidates else None


async def fetch_pexels(session: aiohttp.ClientSession, topic: str, config: AppConfig) -> ImageResult | None:
    if not config.pexels_api_key:
        return None

    params = {"query": _pick_query(topic), "orientation": "landscape", "per_page": 20}
    headers = {"Authorization": config.pexels_api_key}
    data = await _fetch_json(
        session,
        "https://api.pexels.com/v1/search",
        params=params,
        headers=headers,
        proxy=config.outbound_proxy_url or None,
    )
    photos = (data or {}).get("photos", [])
    candidates = [
        ImageResult(
            url=(item.get("src") or {}).get("large") or (item.get("src") or {}).get("landscape"),
            source="Pexels",
            title=item.get("alt", ""),
        )
        for item in photos
        if (item.get("src") or {}).get("large") or (item.get("src") or {}).get("landscape")
    ]
    return random.choice(candidates) if candidates else None


async def fetch_unsplash(session: aiohttp.ClientSession, topic: str, config: AppConfig) -> ImageResult | None:
    if not config.unsplash_access_key:
        return None

    params = {"query": _pick_query(topic), "orientation": "landscape", "per_page": 20}
    headers = {"Authorization": f"Client-ID {config.unsplash_access_key}", "Accept-Version": "v1"}
    data = await _fetch_json(
        session,
        "https://api.unsplash.com/search/photos",
        params=params,
        headers=headers,
        proxy=config.outbound_proxy_url or None,
    )
    results = (data or {}).get("results", [])
    candidates = [
        ImageResult(
            url=(item.get("urls") or {}).get("regular"),
            source="Unsplash",
            title=(item.get("description") or item.get("alt_description") or ""),
        )
        for item in results
        if (item.get("urls") or {}).get("regular")
    ]
    return random.choice(candidates) if candidates else None


async def get_science_photo(topic: str = "наука", config: AppConfig | None = None) -> ImageResult | None:
    config = config or load_config()
    timeout = aiohttp.ClientTimeout(total=config.request_timeout_seconds)
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json,image/*,*/*;q=0.8"}

    providers = [
        ("Pixabay", lambda session: fetch_pixabay(session, topic, config)),
        ("Pexels", lambda session: fetch_pexels(session, topic, config)),
        ("NASA", lambda session: fetch_nasa(session, topic, config)),
        ("Wikimedia Commons", lambda session: fetch_wikimedia(session, topic, config)),
        ("Unsplash", lambda session: fetch_unsplash(session, topic, config)),
    ]

    async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
        for name, fetcher in providers:
            result = await fetcher(session)
            if result and result.url:
                logger.info("Selected image from %s: %s", name, result.url)
                return result
            logger.info("Image provider %s returned nothing", name)

    return None


async def get_science_photo_url(query: str = "наука") -> str | None:
    result = await get_science_photo(query)
    return result.url if result else None


async def download_image(image: ImageResult, config: AppConfig | None = None) -> tuple[bytes, str] | None:
    config = config or load_config()
    timeout = aiohttp.ClientTimeout(total=config.request_timeout_seconds)
    headers = {"User-Agent": USER_AGENT, "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"}

    try:
        async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
            async with session.get(image.url, proxy=config.outbound_proxy_url or None) as response:
                if response.status >= 400:
                    logger.warning("Image download failed with HTTP %s for %s", response.status, image.url)
                    return None

                content_type = response.headers.get("Content-Type", "")
                if "image" not in content_type:
                    logger.warning("Image URL returned non-image content type %s for %s", content_type, image.url)
                    return None

                content = await response.read()
                if len(content) > config.max_image_bytes:
                    logger.warning("Image is too large: %s bytes from %s", len(content), image.url)
                    return None

                return content, image.filename
    except (aiohttp.ClientError, TimeoutError) as exc:
        logger.warning("Image download network error: %s", exc)
        return None
    except Exception:
        logger.exception("Unexpected image download error")
        return None


def _load_font(size: int, *, bold: bool = False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def generate_fallback_image(topic: str, fact: str) -> tuple[bytes, str]:
    width, height = 1280, 720
    normalized = topic.strip().lower()
    palettes = {
        "космос": ("#07111F", "#1D4ED8", "#FBBF24"),
        "физика": ("#111827", "#0891B2", "#F4D35E"),
        "химия": ("#102A43", "#10B981", "#F4F1DE"),
        "биология": ("#0B1F14", "#22C55E", "#A7F3D0"),
        "дерево": ("#0B1F14", "#22C55E", "#84CC16"),
        "деревья": ("#0B1F14", "#22C55E", "#84CC16"),
        "лес": ("#0B1F14", "#16A34A", "#A3E635"),
        "технологии": ("#111827", "#7C3AED", "#67E8F9"),
        "математика": ("#1F2937", "#F97316", "#E5E7EB"),
        "япония": ("#F8FAFC", "#DC2626", "#111827"),
        "японский язык": ("#F8FAFC", "#DC2626", "#111827"),
    }
    background, accent, secondary = palettes.get(normalized, ("#101820", "#0EA5E9", "#F4F1DE"))

    image = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(image)

    for y in range(height):
        ratio = y / height
        shade = int(22 * ratio)
        draw.line((0, y, width, y), fill=background)

    random.seed(normalized or "science")

    if normalized in {"дерево", "деревья", "лес", "биология"}:
        draw.rectangle((0, 520, width, height), fill="#12351F")
        for x in range(80, width, 135):
            trunk_w = random.randint(18, 30)
            trunk_h = random.randint(160, 260)
            base = 575 + random.randint(-20, 25)
            draw.rectangle((x, base - trunk_h, x + trunk_w, base), fill="#6B3F22")
            for radius, offset in [(92, -135), (72, -190), (58, -85)]:
                cx = x + trunk_w // 2 + random.randint(-36, 36)
                cy = base - trunk_h + offset + random.randint(-20, 20)
                draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=accent)
        draw.rectangle((0, 610, width, height), fill="#0F2F1C")
    elif normalized in {"космос"}:
        for _ in range(160):
            x = random.randint(0, width - 1)
            y = random.randint(0, height - 1)
            r = random.choice([1, 1, 2])
            draw.ellipse((x, y, x + r, y + r), fill="#FFFFFF")
        draw.ellipse((760, 170, 1180, 590), fill=accent)
        draw.ellipse((705, 135, 1115, 545), outline=secondary, width=4)
    elif normalized in {"япония", "японский язык"}:
        draw.rectangle((0, 0, width, height), fill="#F8FAFC")
        draw.ellipse((500, 180, 780, 460), fill=accent)
        for x in range(80, width, 170):
            draw.rectangle((x, 470, x + 34, 650), fill="#7F1D1D")
            draw.polygon([(x - 60, 470), (x + 17, 380), (x + 94, 470)], fill="#991B1B")
    else:
        for i in range(28):
            angle = i / 28 * math.tau
            cx = width // 2 + int(math.cos(angle) * 260)
            cy = height // 2 + int(math.sin(angle) * 180)
            draw.ellipse((cx - 90, cy - 90, cx + 90, cy + 90), outline=accent, width=5)
        draw.ellipse((430, 190, 850, 610), fill=secondary)

    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue(), "generated_science_fact.png"
