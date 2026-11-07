"""Connects C's AI layer (backend/ai/) to the API (person B owns this file).

C's ask() does the thinking: it works out the figures, asks Claude (or uses a template when
there is no key or no network), and checks every number. This file does the plumbing:
pick the model, save any proposed action, and reshape the answer to match schemas.py.
"""
import logging
import os
from datetime import date

from ai import AnswerCache, claude_llm
from ai import ask as run_ai
from app import pending

log = logging.getLogger("spendsense")

CACHE = AnswerCache()  # remembers answers while the server runs; every answer is re-checked before use
_warned_about_claude = False


def get_llm():
    """The Claude caller, or None, which makes C's code use its template answers.

    No ANTHROPIC_API_KEY means template mode on purpose, so the app works with no key and no Wi-Fi.
    A key that is set but cannot be used (usually the anthropic package is not installed) also
    falls back to templates, but prints one warning so nobody wonders why Claude is not answering.
    """
    global _warned_about_claude
    if not os.getenv("ANTHROPIC_API_KEY"):
        return None
    try:
        return claude_llm()
    except Exception as problem:
        if not _warned_about_claude:
            _warned_about_claude = True
            log.warning(
                "ANTHROPIC_API_KEY is set but Claude could not be set up (%s: %s). "
                "/ask will use template answers. Try: pip install -r requirements.txt",
                type(problem).__name__,
                problem,
            )
        return None


def adapt_figure(figure: dict) -> dict:
    """C's figure -> schemas.Figure. C stores percents and days under 'value'."""
    out = {"id": figure["id"], "label": figure["label"], "kind": figure["kind"], "display": figure["display"]}
    if figure["kind"] == "pence":
        out["value_pence"] = figure["value_pence"]
    elif figure["kind"] == "percent":
        out["value_percent"] = float(figure["value"])
    else:
        out["value_days"] = figure["value"]
    return out


def answer_question(conn, persona, question, level, account, transactions, today=None) -> dict:
    """Run the AI path for POST /ask and return a dict matching schemas.AskResponse."""
    result = run_ai(
        question,
        account,
        transactions,
        today or date.today(),
        reading_level=level,
        llm=get_llm(),
        cache=CACHE,
        cache_scope=persona,
    )
    proposed = None
    if result["proposed_action"]:
        proposed = pending.save_proposal(conn, persona, result["proposed_action"])
    return {
        "answer": result["answer"],
        "format": result["format"],
        "figures": [adapt_figure(f) for f in result["figures"]],
        "verified": result["verified"],
        "badge": result["label"],
        "proposed_action": proposed,
    }
