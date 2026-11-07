"""Loads the fixed example responses in app/mocks/."""
import json
from pathlib import Path

MOCK_DIR = Path(__file__).parent / "mocks"


def load_mock(name: str) -> dict:
    """Read app/mocks/<name>.json and return it as a dict.

    A fresh copy is read every time, so a route can edit the result safely.
    """
    path = MOCK_DIR / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))
