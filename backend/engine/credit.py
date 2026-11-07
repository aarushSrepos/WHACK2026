"""Pure account maths. Money is whole pence (int). No database, no clock, no randomness:
pass `today` in so results are repeatable and testable."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable, Mapping, Optional

# Demo rules (state these in the pitch as simulated, not Capital One's real rules).
MIN_FLOOR_PENCE = 3500        # minimum payment is never below £35.00 (or the whole balance if smaller)
MIN_PERCENT_BP = 100          # 1% of balance, in basis points, plus interest
CHECK_IN_PERCENT = 80         # spending-limit check-in threshold
PAUSE_HOURS = 24
COUNTED_STATUSES = frozenset({"posted", "pending", "disputed"})   # count towards spend
DISPUTABLE_STATUSES = frozenset({"posted", "pending"})            # can still be disputed


def _round_div(n: int, d: int) -> int:
    """Integer division rounded half up (n >= 0, d > 0). No floats, so no drift."""
    return (2 * n + d) // (2 * d)


def _to_date(v: Any) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


@dataclass(frozen=True)
class Account:
    limit_pence: int
    balance_pence: int
    apr_bp: int                       # 24.9% APR = 2490
    due_date: date
    spending_limit_pence: Optional[int] = None

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "Account":
        keys = row.keys()
        return cls(limit_pence=row["limit_pence"], balance_pence=row["balance_pence"],
                   apr_bp=row["apr_bp"], due_date=_to_date(row["due_date"]),
                   spending_limit_pence=row["spending_limit_pence"] if "spending_limit_pence" in keys else None)


@dataclass(frozen=True)
class Transaction:
    id: int
    merchant: str
    amount_pence: int
    date: date
    status: str = "posted"

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "Transaction":
        return cls(id=row["id"], merchant=row["merchant"], amount_pence=row["amount_pence"],
                   date=_to_date(row["date"]), status=row["status"])


def interest_estimate_pence(balance_pence: int, apr_bp: int) -> int:
    """One month of interest on the current balance (estimate)."""
    return _round_div(max(0, balance_pence) * apr_bp, 10_000 * 12)


def minimum_payment_pence(balance_pence: int, apr_bp: int) -> int:
    """Greater of the floor and (1% of balance + a month's interest), never above the balance."""
    if balance_pence <= 0:
        return 0
    raw = _round_div(balance_pence * MIN_PERCENT_BP, 10_000) + interest_estimate_pence(balance_pence, apr_bp)
    return min(balance_pence, max(MIN_FLOOR_PENCE, raw))


def utilisation_percent(balance_pence: int, limit_pence: int) -> int:
    """Share of the credit limit in use, whole percent."""
    if limit_pence <= 0:
        return 0
    return _round_div(max(0, balance_pence) * 100, limit_pence)


def month_spend_pence(transactions: Iterable[Transaction], year: int, month: int) -> int:
    total = sum(t.amount_pence for t in transactions
                if t.status in COUNTED_STATUSES and t.date.year == year and t.date.month == month)
    return max(0, total)


def previous_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def limit_progress_percent(spend_pence: int, limit_pence: Optional[int]) -> Optional[int]:
    """Rounded DOWN, so the 80% check-in never appears early. None if no limit is set."""
    if not limit_pence or limit_pence <= 0:
        return None
    return max(0, spend_pence) * 100 // limit_pence


def days_until(due: date, today: date) -> int:
    return (due - today).days


def find_transaction(transactions: Iterable[Transaction], *, amount_pence: Optional[int] = None,
                     merchant_hint: str = "") -> Optional[Transaction]:
    """Find the charge a customer means. Matches amount first, then merchant name in their words.
    Returns the most recent match, or None. Already-disputed charges are skipped."""
    pool = [t for t in transactions if t.status in DISPUTABLE_STATUSES]
    hint = merchant_hint.lower()
    if amount_pence is None and not hint:
        return None
    if amount_pence is not None:
        pool = [t for t in pool if t.amount_pence == amount_pence]
    if hint:
        named = [t for t in pool if t.merchant.lower() in hint]
        if named or amount_pence is None:
            pool = named
    return max(pool, key=lambda t: t.date, default=None)
