"""The AI number check: pull every £ amount and percentage out of the text and reject any
that the engine did not supply. Small on purpose, so it is easy to explain to judges."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Mapping

from engine.figures import Figure, gbp

_NUM = r"(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?"
_POUND_SIGN = re.compile(r"£\s?" + _NUM)
_POUND_WORD = re.compile(r"\b" + _NUM + r"\s*(?:pounds?|quid|gbp)\b", re.I)
_PENCE = re.compile(r"\b(\d+)\s?p\b")
_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s?(?:%|per\s?cent\b|percent\b)", re.I)


def _pence(whole: str, frac: str | None) -> int:
    return int(whole.replace(",", "")) * 100 + int((frac or "").ljust(2, "0") or 0)


def extract_pence(text: str) -> List[int]:
    """£35, £35.00, £1,234.50, 35 pounds, 35p -> pence."""
    out = [_pence(m.group(1), m.group(2)) for m in _POUND_SIGN.finditer(text)]
    out += [_pence(m.group(1), m.group(2)) for m in _POUND_WORD.finditer(text)]
    out += [int(m.group(1)) for m in _PENCE.finditer(text)]
    return out


def extract_percents(text: str) -> List[float]:
    return [float(m.group(1)) for m in _PERCENT.finditer(text)]


@dataclass
class CheckResult:
    ok: bool
    unknown: List[str] = field(default_factory=list)   # numbers the engine did not produce


def verify(text: str, figures: Mapping[str, Figure]) -> CheckResult:
    """ok only if every amount and percentage in `text` is one of `figures`."""
    pence = {f.value for f in figures.values() if f.kind == "pence"}
    pct = {float(f.value) for f in figures.values() if f.kind == "percent"}
    bad = [gbp(p) for p in extract_pence(text) if p not in pence]
    bad += [f"{p:g}%" for p in extract_percents(text) if p not in pct]
    return CheckResult(ok=not bad, unknown=bad)


def unknown_ids(ids, figures: Mapping[str, Figure]) -> List[str]:
    return [i for i in ids if i not in figures]
