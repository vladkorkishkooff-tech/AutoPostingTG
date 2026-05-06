import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import AppConfig

logger = logging.getLogger(__name__)


def normalize_text(text: str) -> str:
    return " ".join(text.casefold().strip().split())


def text_hash(text: str) -> str:
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()


@dataclass
class ContentHistory:
    path: Path
    items: list[dict[str, Any]]

    @classmethod
    def load(cls, config: AppConfig) -> "ContentHistory":
        path = Path(config.history_file)
        if not path.is_absolute():
            path = Path(__file__).resolve().parent / path

        if not path.exists():
            return cls(path=path, items=[])

        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            items = raw.get("items", []) if isinstance(raw, dict) else []
            return cls(path=path, items=[item for item in items if isinstance(item, dict)])
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Could not read content history %s: %s", path, exc)
            return cls(path=path, items=[])

    def save(self, limit: int) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"items": self.items[-limit:]}
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def recent_texts(self, *, topic: str | None = None, mode: str | None = None, limit: int = 20) -> list[str]:
        result: list[str] = []
        for item in reversed(self.items):
            if topic and item.get("topic") != topic:
                continue
            if mode and item.get("mode") != mode:
                continue
            text = item.get("text")
            if isinstance(text, str) and text:
                result.append(text)
            if len(result) >= limit:
                break
        return result

    def recent_image_urls(self, *, topic: str | None = None, limit: int = 30) -> set[str]:
        result: set[str] = set()
        for item in reversed(self.items):
            if topic and item.get("topic") != topic:
                continue
            url = item.get("image_url")
            if isinstance(url, str) and url:
                result.add(url)
            if len(result) >= limit:
                break
        return result

    def has_text(self, text: str, *, topic: str | None = None, mode: str | None = None, limit: int = 50) -> bool:
        candidate_hash = text_hash(text)
        checked = 0
        for item in reversed(self.items):
            if topic and item.get("topic") != topic:
                continue
            if mode and item.get("mode") != mode:
                continue
            if item.get("text_hash") == candidate_hash:
                return True
            checked += 1
            if checked >= limit:
                break
        return False

    def add(
        self,
        *,
        topic: str,
        mode: str,
        text: str,
        image_url: str | None,
        image_source: str,
        chat_id: str,
    ) -> None:
        self.items.append(
            {
                "created_at": datetime.now(timezone.utc).isoformat(),
                "topic": topic,
                "mode": mode,
                "text": text,
                "text_hash": text_hash(text),
                "image_url": image_url,
                "image_source": image_source,
                "chat_id": str(chat_id),
            }
        )
