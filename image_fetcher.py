import logging
import random
from dataclasses import dataclass
from pathlib import Path

import aiohttp

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


# Кеш AI-переведённых запросов: заполняется в get_science_photo перед поиском
_AI_QUERIES: dict[str, list[str]] = {}


def _topic_queries(topic: str) -> list[str]:
    # AI-запросы приоритетнее словаря: конкретные английские сцены ищутся на порядок лучше
    ai_queries = _AI_QUERIES.get(topic.strip().lower())
    if ai_queries:
        return ai_queries

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


async def fetch_wikimedia(
    session: aiohttp.ClientSession,
    topic: str,
    config: AppConfig,
    excluded_urls: set[str],
) -> ImageResult | None:
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
        if url not in excluded_urls:
            candidates.append(ImageResult(url=url, source="Wikimedia Commons", title=title))

    return random.choice(candidates) if candidates else None


async def fetch_nasa(
    session: aiohttp.ClientSession,
    topic: str,
    config: AppConfig,
    excluded_urls: set[str],
) -> ImageResult | None:
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
            if url and link.get("render") == "image" and url not in excluded_urls:
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
        if apod and apod.get("media_type") == "image" and apod.get("url") not in excluded_urls:
            return ImageResult(url=apod["url"], source="NASA APOD", title=apod.get("title", ""))

    return None


async def fetch_pixabay(
    session: aiohttp.ClientSession,
    topic: str,
    config: AppConfig,
    excluded_urls: set[str],
) -> ImageResult | None:
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
        if (item.get("largeImageURL") or item.get("webformatURL"))
        and (item.get("largeImageURL") or item.get("webformatURL")) not in excluded_urls
    ]
    return random.choice(candidates) if candidates else None


async def fetch_pexels(
    session: aiohttp.ClientSession,
    topic: str,
    config: AppConfig,
    excluded_urls: set[str],
) -> ImageResult | None:
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
        if ((item.get("src") or {}).get("large") or (item.get("src") or {}).get("landscape"))
        and ((item.get("src") or {}).get("large") or (item.get("src") or {}).get("landscape")) not in excluded_urls
    ]
    return random.choice(candidates) if candidates else None


async def fetch_unsplash(
    session: aiohttp.ClientSession,
    topic: str,
    config: AppConfig,
    excluded_urls: set[str],
) -> ImageResult | None:
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
        and (item.get("urls") or {}).get("regular") not in excluded_urls
    ]
    return random.choice(candidates) if candidates else None


async def fetch_openverse(
    session: aiohttp.ClientSession,
    topic: str,
    config: AppConfig,
    excluded_urls: set[str],
) -> ImageResult | None:
    """Openverse — агрегатор 800+ млн CC-изображений (Flickr, музеи и др.), без ключа."""
    params = {
        "q": _pick_query(topic),
        "page_size": "20",
        "aspect_ratio": "wide",
        "mature": "false",
        "filter_dead": "true",
    }
    data = await _fetch_json(
        session,
        "https://api.openverse.org/v1/images/",
        params=params,
        proxy=config.outbound_proxy_url or None,
    )
    results = (data or {}).get("results", [])
    candidates = [
        ImageResult(url=item["url"], source="Openverse", title=item.get("title") or "")
        for item in results
        if item.get("url")
        and item["url"] not in excluded_urls
        and not item["url"].lower().endswith((".svg", ".gif"))
    ]
    return random.choice(candidates) if candidates else None


async def get_science_photo(
    topic: str = "наука",
    config: AppConfig | None = None,
    excluded_urls: set[str] | None = None,
) -> ImageResult | None:
    config = config or load_config()
    excluded_urls = excluded_urls or set()
    timeout = aiohttp.ClientTimeout(total=config.request_timeout_seconds)
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json,image/*,*/*;q=0.8"}

    # Главный фикс качества: переводим тему в английские поисковые запросы через AI
    key = topic.strip().lower()
    if key not in _AI_QUERIES:
        try:
            from ai_gen import topic_to_image_queries

            queries = await topic_to_image_queries(topic, config)
            if queries:
                _AI_QUERIES[key] = queries
                if len(_AI_QUERIES) > 500:
                    _AI_QUERIES.clear()
                    _AI_QUERIES[key] = queries
        except Exception:
            logger.exception("AI image query translation failed, falling back to raw topic")

    providers = [
        ("Pixabay", lambda session: fetch_pixabay(session, topic, config, excluded_urls)),
        ("Pexels", lambda session: fetch_pexels(session, topic, config, excluded_urls)),
        ("Openverse", lambda session: fetch_openverse(session, topic, config, excluded_urls)),
        ("Wikimedia Commons", lambda session: fetch_wikimedia(session, topic, config, excluded_urls)),
        ("NASA", lambda session: fetch_nasa(session, topic, config, excluded_urls)),
        ("Unsplash", lambda session: fetch_unsplash(session, topic, config, excluded_urls)),
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



