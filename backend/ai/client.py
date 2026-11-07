"""Thin Claude wrapper. Reads ANTHROPIC_API_KEY from the environment. Never commit the key."""
from __future__ import annotations

import os
from typing import Callable

LLM = Callable[[str, str], str]      # (system, user) -> raw reply text


def claude_llm(model: str | None = None, timeout: float = 8.0, max_tokens: int = 500) -> LLM:
    """Short timeout and no SDK retries: if the venue Wi-Fi is bad we fall back fast, not slowly."""
    import anthropic                              # imported here so tests and mock mode need no SDK
    client = anthropic.Anthropic(timeout=timeout, max_retries=0)
    name = model or os.getenv("CLAUDE_MODEL", "claude-haiku-5-5")

    def call(system: str, user: str) -> str:
        resp = client.messages.create(model=name, max_tokens=max_tokens, temperature=0,
                                      system=system, messages=[{"role": "user", "content": user}])
        return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    return call
