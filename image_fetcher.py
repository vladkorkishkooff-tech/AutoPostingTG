import asyncio
import ipaddress
import logging
import re
import socket
import time
from dataclasses import dataclass, replace
from pathlib import Path
from urllib.parse import urljoin, urlparse

import aiohttp

from config import AppConfig, load_config

logger = logging.getLogger(__name__)


USER_AGENT = (
    "AutoPostingTG/1.0 "
    "(https://github.com/vladkorkishkooff-tech/AutoPostingTG; educational image search)"
)


@dataclass(frozen=True)
class ImageResult:
    url: str
    source: str
    title: str = ""
    query: str = ""
    search_text: str = ""
    required_terms: tuple[str, ...] = ()

    @property
    def filename(self) -> str:
        suffix = Path(self.url.split("?", 1)[0]).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            suffix = ".jpg"
        safe_source = self.source.lower().replace(" ", "_")
        return f"{safe_source}{suffix}"


# Кеш AI-запросов из готового текста: заполняется перед обращением к фотопровайдерам.
_AI_QUERIES: dict[str, list[str]] = {}
_AI_REQUIRED_TERMS: dict[str, tuple[str, ...]] = {}
_AI_SUBJECTS: dict[str, str] = {}
_AI_FOCUS: dict[str, str] = {}

# Process-local circuit breaker: a bad provider is retried after a restart,
# but it cannot delay every image request while the bot remains online.
_PROVIDER_FAILURES: dict[str, tuple[int, float]] = {}
_CIRCUIT_FAILURE_THRESHOLD = 3
_CIRCUIT_COOLDOWN_SECONDS = 120.0


def _provider_is_paused(host: str, now: float | None = None) -> bool:
    _, opened_until = _PROVIDER_FAILURES.get(host, (0, 0.0))
    return opened_until > (time.monotonic() if now is None else now)


def _record_provider_failure(host: str, cooldown: float, now: float | None = None) -> None:
    failures, _ = _PROVIDER_FAILURES.get(host, (0, 0.0))
    failures += 1
    current = time.monotonic() if now is None else now
    _PROVIDER_FAILURES[host] = (
        failures,
        current + cooldown if failures >= _CIRCUIT_FAILURE_THRESHOLD else 0.0,
    )

_GENERIC_SEARCH_TERMS = {
    "and",
    "concept",
    "education",
    "experiment",
    "image",
    "laboratory",
    "nature",
    "of",
    "photo",
    "research",
    "science",
    "scientist",
    "the",
    "technology",
    "view",
}
_ASTRONOMY_TERMS = {
    "asteroid",
    "astronaut",
    "astronomy",
    "comet",
    "cosmos",
    "earth",
    "europa",
    "galaxy",
    "jupiter",
    "mars",
    "mercury",
    "moon",
    "nasa",
    "nebula",
    "neptune",
    "orbit",
    "planet",
    "satellite",
    "saturn",
    "space",
    "spacecraft",
    "star",
    "sun",
    "telescope",
    "titan",
    "uranus",
    "venus",
}
_FOCAL_DETAIL_TERMS = {
    "brain", "caldera", "cell", "crater", "eruption", "eye", "eyes", "flower",
    "heart", "lake", "leaf", "lens", "nucleus", "plume", "rain", "ring", "rings",
    "storm", "tentacle", "tooth", "teeth", "wing",
}


def _url_host(url: str) -> str:
    """Return a log-safe host label without query strings or credentials."""
    return urlparse(url).hostname or "invalid-host"


def _image_asset_key(url: str) -> str:
    """Collapse provider-specific size variants to one underlying asset.

    NASA search returns ``~medium``, ``~small`` and ``~thumb`` links for the
    same archive image. Treating those URLs as separate candidates made the
    Mini App show three identical pictures. Other providers already return one
    chosen rendition per search item, so their normalized URL remains exact.
    """
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path
    if host.endswith("nasa.gov"):
        path = re.sub(
            r"~(?:orig|large|medium|small|thumb)(?=\.[A-Za-z0-9]+$)",
            "",
            path,
            flags=re.IGNORECASE,
        )
    return f"{host}{path}"


def _image_url_is_excluded(url: str, excluded_urls: set[str]) -> bool:
    key = _image_asset_key(url)
    return any(_image_asset_key(excluded) == key for excluded in excluded_urls)


async def _is_public_image_url(url: str) -> bool:
    """Reject local/private destinations before downloading user-selected media."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        addresses = await asyncio.get_running_loop().getaddrinfo(
            parsed.hostname,
            port,
            type=socket.SOCK_STREAM,
        )
    except (OSError, UnicodeError, ValueError):
        return False

    if not addresses:
        return False
    return all(ipaddress.ip_address(item[4][0]).is_global for item in addresses)


def _fallback_queries(topic: str) -> list[str]:
    """Fallback is intentionally limited to explicit, known topics.

    An unknown Russian draft must never degrade to ``science research``: no
    image is safer than a visually unrelated stock photo.
    """
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
    if re.fullmatch(r"[a-z0-9][a-z0-9 '\-]{1,79}", normalized):
        return [normalized]
    return []


def _ordered_queries(queries: list[str], excluded_urls: set[str] | None = None) -> list[str]:
    """Always keep the most exact query first.

    Providers already skip ``excluded_urls`` and can return the next candidate
    for the same query. Rotating by historical URL count made an unrelated
    channel image silently select a broader query for a new post.
    """
    return list(queries)


def _text_tokens(text: str) -> set[str]:
    tokens = {word.lower() for word in re.findall(r"[A-Za-z0-9]+", text) if len(word) >= 3}
    # Add simple singular variants for metadata such as eyes/lakes/volcanoes.
    for word in tuple(tokens):
        if word.endswith("s") and len(word) > 3 and not word.endswith("ss"):
            tokens.add(word[:-1])
        if word.endswith("es") and len(word) > 4:
            tokens.add(word[:-2])
    return tokens


def _query_tokens(query: str) -> set[str]:
    return _text_tokens(query) - _GENERIC_SEARCH_TERMS


def _relevance_score(title: str, query: str) -> int:
    """Score metadata overlap so a microscope cannot satisfy a Titan query."""
    query_tokens = _query_tokens(query)
    if not query_tokens:
        return 1
    title_tokens = _text_tokens(title)
    return len(query_tokens & title_tokens)


def _select_relevant_candidate(
    candidates: list[ImageResult],
    query: str,
    required_terms: tuple[str, ...] = (),
    subject: str = "",
    focus: str = "",
) -> ImageResult | None:
    if not candidates:
        return None
    required = set(required_terms)
    subject_terms = _text_tokens(subject)
    focus_terms = (_text_tokens(focus) - _GENERIC_SEARCH_TERMS) & _FOCAL_DETAIL_TERMS

    def rank(item: ImageResult) -> tuple[int, int, int, int]:
        title_terms = _text_tokens(item.title)
        subject_overlap = len(subject_terms & title_terms)
        subject_complete = int(bool(subject_terms) and subject_terms.issubset(title_terms))
        extra_title_terms = len(title_terms - subject_terms) if subject_terms else len(title_terms)
        return (
            subject_complete,
            subject_overlap,
            _relevance_score(item.search_text or item.title, query),
            -extra_title_terms,
        )

    ranked = sorted(candidates, key=rank, reverse=True)
    query_terms = _query_tokens(query)
    minimum_overlap = 2 if len(query_terms) >= 3 else 1
    for candidate in ranked:
        searchable = candidate.search_text or candidate.title
        title_terms = _text_tokens(candidate.title)
        # Metadata descriptions are often broader than the actual frame.
        # Require the named subject and focal detail in the title/alt text so
        # a generic Mars surface cannot satisfy Olympus Mons and a whole
        # squid cannot satisfy a request for its eye.
        if subject_terms and not subject_terms.issubset(title_terms):
            continue
        if focus_terms and not focus_terms.issubset(title_terms):
            continue
        if required and not required.issubset(_text_tokens(searchable)):
            continue
        if _relevance_score(searchable, query) >= minimum_overlap:
            return candidate
    return None


def _is_astronomy_query(query: str) -> bool:
    return bool(_query_tokens(query) & _ASTRONOMY_TERMS)


def _provider_names_for_query(query: str) -> list[str]:
    if _is_astronomy_query(query):
        return ["NASA", "Wikimedia Commons", "Openverse", "Pexels", "Pixabay", "Unsplash"]
    return ["Pexels", "Pixabay", "Openverse", "Wikimedia Commons", "Unsplash", "NASA"]


async def _fetch_json(
    session: aiohttp.ClientSession,
    url: str,
    *,
    params: dict[str, str | int] | None = None,
    headers: dict[str, str] | None = None,
    proxy: str | None = None,
) -> dict | None:
    host = _url_host(url)
    if _provider_is_paused(host):
        logger.info("Image provider %s is temporarily paused after repeated failures", host)
        return None
    try:
        async with session.get(url, params=params, headers=headers, proxy=proxy) as response:
            if response.status >= 400:
                await response.read()
                cooldown = 300.0 if response.status in {400, 401, 403, 429} else _CIRCUIT_COOLDOWN_SECONDS
                _record_provider_failure(host, cooldown)
                logger.warning("Image API %s failed with HTTP %s", host, response.status)
                return None
            data = await response.json()
            _PROVIDER_FAILURES.pop(host, None)
            return data
    except (aiohttp.ClientError, TimeoutError) as exc:
        _record_provider_failure(host, _CIRCUIT_COOLDOWN_SECONDS)
        logger.warning("Image API network error for %s: %s", host, exc)
        return None
    except Exception:
        logger.exception("Unexpected image API error for %s", url)
        return None


async def fetch_wikimedia(
    session: aiohttp.ClientSession,
    query: str,
    config: AppConfig,
    excluded_urls: set[str],
    required_terms: tuple[str, ...] = (),
    subject: str = "",
    focus: str = "",
) -> ImageResult | None:
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
            candidates.append(ImageResult(url=url, source="Wikimedia Commons", title=title, query=query))

    return _select_relevant_candidate(candidates, query, required_terms, subject, focus)


async def fetch_nasa(
    session: aiohttp.ClientSession,
    query: str,
    config: AppConfig,
    excluded_urls: set[str],
    required_terms: tuple[str, ...] = (),
    subject: str = "",
    focus: str = "",
) -> ImageResult | None:
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
        search_text = " ".join(
            [
                str(meta.get("title") or ""),
                str(meta.get("description") or ""),
                " ".join(str(keyword) for keyword in (meta.get("keywords") or [])),
            ]
        )
        for link in links:
            url = link.get("href", "")
            if url and link.get("render") == "image" and not _image_url_is_excluded(
                url, excluded_urls
            ):
                candidates.append(
                    ImageResult(
                        url=url,
                        source="NASA",
                        title=meta.get("title", ""),
                        query=query,
                        search_text=search_text,
                    )
                )

    candidate = _select_relevant_candidate(candidates, query, required_terms, subject, focus)
    if candidate:
        return candidate

    # APOD is a useful fallback for broad space/science topics.
    if query.strip().lower() in {"space", "astronomy", "space astronomy"}:
        apod = await _fetch_json(
            session,
            "https://api.nasa.gov/planetary/apod",
            params={"api_key": config.nasa_api_key or "DEMO_KEY", "thumbs": "true"},
            proxy=config.outbound_proxy_url or None,
        )
        if apod and apod.get("media_type") == "image" and apod.get("url") not in excluded_urls:
            return ImageResult(
                url=apod["url"], source="NASA APOD", title=apod.get("title", ""), query=query
            )

    return None


async def fetch_pixabay(
    session: aiohttp.ClientSession,
    query: str,
    config: AppConfig,
    excluded_urls: set[str],
    required_terms: tuple[str, ...] = (),
    subject: str = "",
    focus: str = "",
) -> ImageResult | None:
    if not config.pixabay_api_key:
        return None

    params = {
        "key": config.pixabay_api_key,
        "q": query,
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
            query=query,
        )
        for item in hits
        if (item.get("largeImageURL") or item.get("webformatURL"))
        and (item.get("largeImageURL") or item.get("webformatURL")) not in excluded_urls
    ]
    return _select_relevant_candidate(candidates, query, required_terms, subject, focus)


async def fetch_pexels(
    session: aiohttp.ClientSession,
    query: str,
    config: AppConfig,
    excluded_urls: set[str],
    required_terms: tuple[str, ...] = (),
    subject: str = "",
    focus: str = "",
) -> ImageResult | None:
    if not config.pexels_api_key:
        return None

    params = {"query": query, "orientation": "landscape", "per_page": 20}
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
            query=query,
        )
        for item in photos
        if ((item.get("src") or {}).get("large") or (item.get("src") or {}).get("landscape"))
        and ((item.get("src") or {}).get("large") or (item.get("src") or {}).get("landscape")) not in excluded_urls
    ]
    return _select_relevant_candidate(candidates, query, required_terms, subject, focus)


async def fetch_unsplash(
    session: aiohttp.ClientSession,
    query: str,
    config: AppConfig,
    excluded_urls: set[str],
    required_terms: tuple[str, ...] = (),
    subject: str = "",
    focus: str = "",
) -> ImageResult | None:
    if not config.unsplash_access_key:
        return None

    params = {"query": query, "orientation": "landscape", "per_page": 20}
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
            query=query,
        )
        for item in results
        if (item.get("urls") or {}).get("regular")
        and (item.get("urls") or {}).get("regular") not in excluded_urls
    ]
    return _select_relevant_candidate(candidates, query, required_terms, subject, focus)


async def fetch_openverse(
    session: aiohttp.ClientSession,
    query: str,
    config: AppConfig,
    excluded_urls: set[str],
    required_terms: tuple[str, ...] = (),
    subject: str = "",
    focus: str = "",
) -> ImageResult | None:
    """Openverse — агрегатор 800+ млн CC-изображений (Flickr, музеи и др.), без ключа."""
    params = {
        "q": query,
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
        ImageResult(url=item["url"], source="Openverse", title=item.get("title") or "", query=query)
        for item in results
        if item.get("url")
        and item["url"] not in excluded_urls
        and not item["url"].lower().endswith((".svg", ".gif"))
    ]
    return _select_relevant_candidate(candidates, query, required_terms, subject, focus)


async def get_science_photo(
    topic: str = "наука",
    config: AppConfig | None = None,
    excluded_urls: set[str] | None = None,
    context: str | None = None,
    user_providers: list[dict] | None = None,
) -> ImageResult | None:
    config = config or load_config()
    excluded_urls = set(excluded_urls or ())
    timeout = aiohttp.ClientTimeout(total=config.request_timeout_seconds)
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json,image/*,*/*;q=0.8"}

    # The finished draft carries the exact fact; the short topic is only a safe fallback.
    search_context = (context or "").strip() or topic.strip()
    provider_signature = ",".join(
        str(provider.get("key_id") or provider.get("name") or "") for provider in (user_providers or [])
    )
    key = f"{search_context.lower()}|{provider_signature}"
    if key not in _AI_QUERIES:
        try:
            from ai_gen import topic_to_image_search_plan

            plan = await topic_to_image_search_plan(search_context, config, user_providers)
        except Exception:
            logger.exception("AI image query extraction failed")
            plan = None
        if plan:
            anchor_query = " ".join(plan.required_terms)
            plan_queries = [anchor_query, *plan.queries]
            _AI_QUERIES[key] = list(dict.fromkeys(plan_queries))
        else:
            _AI_QUERIES[key] = _fallback_queries(topic)
        _AI_REQUIRED_TERMS[key] = plan.required_terms if plan else ()
        _AI_SUBJECTS[key] = plan.subject if plan else ""
        _AI_FOCUS[key] = plan.focus if plan else ""
        if len(_AI_QUERIES) > 500:
            _AI_QUERIES.clear()
            _AI_REQUIRED_TERMS.clear()
            _AI_SUBJECTS.clear()
            _AI_FOCUS.clear()
            if plan:
                anchor_query = " ".join(plan.required_terms)
                plan_queries = [anchor_query, *plan.queries]
                _AI_QUERIES[key] = list(dict.fromkeys(plan_queries))
            else:
                _AI_QUERIES[key] = _fallback_queries(topic)
            _AI_REQUIRED_TERMS[key] = plan.required_terms if plan else ()
            _AI_SUBJECTS[key] = plan.subject if plan else ""
            _AI_FOCUS[key] = plan.focus if plan else ""

    queries = _ordered_queries(_AI_QUERIES.get(key, []), excluded_urls)
    required_terms = _AI_REQUIRED_TERMS.get(key, ())
    subject = _AI_SUBJECTS.get(key, "")
    focus = _AI_FOCUS.get(key, "")
    if not queries:
        logger.warning("No concrete image query could be derived; skipping stock image")
        return None

    async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
        for query in queries:
            providers = {
                "Pexels": lambda: fetch_pexels(
                    session, query, config, excluded_urls, required_terms, subject, focus
                ),
                "Pixabay": lambda: fetch_pixabay(
                    session, query, config, excluded_urls, required_terms, subject, focus
                ),
                "Openverse": lambda: fetch_openverse(
                    session, query, config, excluded_urls, required_terms, subject, focus
                ),
                "Wikimedia Commons": lambda: fetch_wikimedia(
                    session, query, config, excluded_urls, required_terms, subject, focus
                ),
                "NASA": lambda: fetch_nasa(
                    session, query, config, excluded_urls, required_terms, subject, focus
                ),
                "Unsplash": lambda: fetch_unsplash(
                    session, query, config, excluded_urls, required_terms, subject, focus
                ),
            }
            for name in _provider_names_for_query(query):
                result = await providers[name]()
                if result and result.url:
                    logger.info(
                        "Selected relevant image from %s for query %r (%s)",
                        name,
                        query,
                        _url_host(result.url),
                    )
                    return replace(result, required_terms=required_terms)
                logger.info("Image provider %s returned no relevant result for query %r", name, query)

    return None


async def download_image(image: ImageResult, config: AppConfig | None = None) -> tuple[bytes, str] | None:
    config = config or load_config()
    timeout = aiohttp.ClientTimeout(total=config.request_timeout_seconds)
    headers = {"User-Agent": USER_AGENT, "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"}

    try:
        async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
            current_url = image.url
            for _ in range(4):
                if not await _is_public_image_url(current_url):
                    logger.warning("Rejected non-public image URL host: %s", _url_host(current_url))
                    return None

                async with session.get(
                    current_url,
                    proxy=config.outbound_proxy_url or None,
                    allow_redirects=False,
                ) as response:
                    if 300 <= response.status < 400:
                        location = response.headers.get("Location")
                        if not location:
                            return None
                        current_url = urljoin(current_url, location)
                        continue

                    if response.status >= 400:
                        logger.warning(
                            "Image download failed with HTTP %s from %s",
                            response.status,
                            _url_host(current_url),
                        )
                        return None

                    content_type = response.headers.get("Content-Type", "")
                    if "image" not in content_type.lower():
                        logger.warning(
                            "Image URL returned non-image content type %s from %s",
                            content_type,
                            _url_host(current_url),
                        )
                        return None

                    content = await response.read()
                    if len(content) > config.max_image_bytes:
                        logger.warning(
                            "Image is too large: %s bytes from %s",
                            len(content),
                            _url_host(current_url),
                        )
                        return None

                    return content, image.filename

            logger.warning("Image download exceeded redirect limit from %s", _url_host(image.url))
            return None
    except (aiohttp.ClientError, TimeoutError) as exc:
        logger.warning("Image download network error: %s", exc)
        return None
    except Exception:
        logger.exception("Unexpected image download error")
        return None



