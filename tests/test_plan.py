from dataclasses import replace

from config import load_config
from content_history import ContentHistory


def test_content_history_loads_from_configured_json(tmp_path):
    config = replace(load_config(), history_file=str(tmp_path / "history.json"))
    history = ContentHistory.load(config)

    assert history.path == tmp_path / "history.json"
    assert history.items == []
