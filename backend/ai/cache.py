"""Cached model answers for the demo questions, for when the API or venue Wi-Fi is slow.
Every cached answer is re-checked against today's figures before it is shown."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional


def _norm(q: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w£%\s]", "", q.lower())).strip()


class AnswerCache:
    def __init__(self, path: str | Path | None = None):
        self.path = Path(path) if path else None
        self._d: dict = {}
        if self.path and self.path.exists():
            try:
                self._d = json.loads(self.path.read_text())
            except (OSError, ValueError):
                self._d = {}

    @staticmethod
    def key(scope: str, intent: str, level: str, question: str) -> str:
        return f"{scope}|{intent}|{level}|{_norm(question)}"

    def get(self, key: str) -> Optional[dict]:
        return self._d.get(key)

    def put(self, key: str, entry: dict) -> None:
        self._d[key] = entry
        if self.path:
            try:
                self.path.write_text(json.dumps(self._d, indent=2, ensure_ascii=False))
            except OSError:
                pass
