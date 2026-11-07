"""ask(): the whole AI path for POST /ask.
question -> intent -> minimum figures -> Claude (JSON) -> number check -> retry once -> cache -> template.
Claude can only propose. Confirming is B's /actions/{id}/confirm, never called from here."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional

from engine import credit
from engine.credit import Account, Transaction
from engine.figures import Figure, build_figures, build_facts
from . import prompt, templates
from .actions import Proposal, ProposalError, make_proposal
from .cache import AnswerCache
from .checker import extract_pence, unknown_ids, verify
from .client import LLM
from .intent import ACTION_FOR_INTENT, INTENT_FIGURES, detect_intent, wants_full_balance

LEVELS = ("simple", "detailed")
PAY_IDS = {"minimum_payment": "minimum", "balance": "full"}


@dataclass
class _Draft:
    text: str
    ids: List[str]
    action: Optional[dict]
    source: str                      # "ai" | "cache" | "template"


def _parse(raw: str) -> Optional[dict]:
    try:
        obj = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
    except ValueError:
        return None
    text, ids, action = obj.get("text"), obj.get("figure_ids", []), obj.get("action")
    if not isinstance(text, str) or not text.strip() or not isinstance(ids, list):
        return None
    if not all(isinstance(i, str) for i in ids) or not (action is None or isinstance(action, dict)):
        return None
    return {"text": text.strip(), "ids": ids, "action": action}


def _acceptable(d: dict, figs: Dict[str, Figure]) -> Optional[str]:
    """None if fine, otherwise a short problem description to feed back to the model."""
    bad_ids = unknown_ids(d["ids"], figs)
    if bad_ids:
        return f"You cited figure ids that do not exist: {', '.join(bad_ids)}."
    res = verify(d["text"], figs)
    if not res.ok:
        return f"Your text contained numbers that are not in the figures: {', '.join(res.unknown)}. Use only the display strings provided."
    return None


def _proposal(spec: Optional[dict], intent: str, figs, candidate, account, txs, today) -> Optional[Proposal]:
    """Turn a suggested action into a validated proposal, or drop it. The model never supplies amounts."""
    if not spec or ACTION_FOR_INTENT.get(intent) != spec.get("type"):
        return None
    try:
        t = spec["type"]
        if t == "dispute":
            if candidate is None or spec.get("transaction_id") != candidate.id:
                return None
            return make_proposal("dispute", account, txs, today, transaction_id=candidate.id)
        if t == "pay":
            fid = spec.get("amount_figure_id")
            if fid in PAY_IDS and fid in figs:
                return make_proposal("pay", account, txs, today, pay=PAY_IDS[fid])
            if fid == "requested_amount" and fid in figs:
                return make_proposal("pay", account, txs, today, pay=figs[fid].value)
            return None
        if t == "pause":
            return make_proposal("pause", account, txs, today)
    except (ProposalError, TypeError):
        return None
    return None


def _template_action(intent: str, question: str, figs, candidate, facts) -> Optional[dict]:
    if intent == "dispute" and candidate is not None:
        return {"type": "dispute", "transaction_id": candidate.id}
    if intent == "pay":
        if "requested_amount_problem" in facts:
            return None          # they asked for more than the balance: propose nothing
        fid = "requested_amount" if "requested_amount" in figs else "balance" if wants_full_balance(question) else "minimum_payment"
        return {"type": "pay", "amount_figure_id": fid}
    if intent == "pause":
        return {"type": "pause"}
    return None


def ask(question: str, account: Account, transactions: List[Transaction], today: date, *,
        reading_level: str = "simple", llm: Optional[LLM] = None, cache: Optional[AnswerCache] = None,
        cache_scope: str = "", prefer_cache: bool = False) -> dict:
    """Returns the /ask response body. B saves `proposed_action` as a pending_actions row,
    adds its action id, and returns it. Pass llm=None for mock/offline (template path)."""
    level = reading_level if reading_level in LEVELS else "simple"
    intent = detect_intent(question)
    hint = question if intent == "dispute" else ""
    amounts = extract_pence(question)
    candidate = (credit.find_transaction(transactions, amount_pence=amounts[0] if amounts else None, merchant_hint=hint)
                 if intent == "dispute" else None)
    requested = amounts[0] if intent == "pay" and amounts else None
    valid_req = requested if requested and 0 < requested <= account.balance_pence else None

    everything = build_figures(account, transactions, today, candidate=candidate, requested_pence=valid_req)
    figs = {k: everything[k] for k in INTENT_FIGURES[intent] if k in everything}
    facts = build_facts(account, transactions, today, candidate)
    if requested and not valid_req:
        facts["requested_amount_problem"] = "more than balance"
    ckey = AnswerCache.key(cache_scope, intent, level, question)

    def from_cache() -> Optional[_Draft]:
        e = cache.get(ckey) if cache else None
        if e and not _acceptable({"text": e["text"], "ids": e["figure_ids"]}, figs):
            return _Draft(e["text"], e["figure_ids"], e.get("action"), "cache")
        return None            # missing or stale: ignore it

    def from_llm() -> Optional[_Draft]:
        problem = None
        for _ in range(2):     # first try plus one retry
            try:
                raw = llm(prompt.SYSTEM, prompt.build_user_message(question, level, figs, facts, candidate, problem))
            except Exception:  # timeout, rate limit, no network: go straight to fallbacks
                return None
            d = _parse(raw)
            problem = "Reply with valid JSON in the required shape." if d is None else _acceptable(d, figs)
            if problem is None:
                if cache:
                    cache.put(ckey, {"text": d["text"], "figure_ids": d["ids"], "action": d["action"]})
                return _Draft(d["text"], d["ids"], d["action"], "ai")
        return None

    draft = from_cache() if prefer_cache else None
    if draft is None and llm is not None:
        draft = from_llm()
    if draft is None and not prefer_cache:
        draft = from_cache()
    if draft is None:
        text, ids = templates.render(intent, level, figs, facts)
        draft = _Draft(text, ids, _template_action(intent, question, figs, candidate, facts), "template")

    proposal = _proposal(draft.action, intent, figs, candidate, account, transactions, today)
    ok = verify(draft.text, figs).ok
    return {
        "answer": draft.text,
        "format": level,
        "figures": [figs[i].to_api() for i in draft.ids if i in figs],
        "verified": ok,
        "label": "Verified figures" if draft.source != "template" and ok else "Standard explanation",
        "source": draft.source,
        "intent": intent,
        "proposed_action": proposal.to_dict() if proposal else None,
    }
