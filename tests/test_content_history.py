import pytest
from content_history import ContentHistory, text_hash, normalize_text
import os
import tempfile
from pathlib import Path

@pytest.fixture
def temp_history():
    fd, path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    os.unlink(path)

    history = ContentHistory(path=Path(path), items=[])
    yield history

    try:
        os.unlink(path)
    except OSError:
        pass

def test_normalize_text():
    assert normalize_text("  Привет   МИР!  ") == "привет мир!"

def test_text_hash_consistency():
    h1 = text_hash("  Привет   МИР!  ")
    h2 = text_hash("привет мир!")
    assert h1 == h2

def test_add_and_recent_texts(temp_history):
    temp_history.add(
        topic="космос", mode="normal", text="Факт про космос",
        image_url=None, image_source="generated", chat_id="123"
    )
    texts = temp_history.recent_texts(topic="космос")
    assert len(texts) == 1
    assert texts[0] == "Факт про космос"

    texts_empty = temp_history.recent_texts(topic="физика")
    assert len(texts_empty) == 0

def test_has_text(temp_history):
    temp_history.add(
        topic="биология", mode="wow", text="ДНК содержит гены",
        image_url=None, image_source="generated", chat_id="123"
    )
    assert temp_history.has_text("  ДНК содержит гены  ") is True
    assert temp_history.has_text("РНК содержит гены") is False


def test_save_persists_bounded_history(temp_history):
    for index in range(3):
        temp_history.add(
            topic="физика",
            mode="normal",
            text=f"Факт {index}",
            image_url=None,
            image_source="none",
            chat_id="123",
        )

    temp_history.save(limit=2)
    payload = temp_history.path.read_text(encoding="utf-8")
    assert "Факт 0" not in payload
    assert "Факт 1" in payload
    assert "Факт 2" in payload
