"""Turns raw rows into named figures. The AI only ever sees these IDs and display strings."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Dict, Optional

from . import credit
from .credit import Account, Transaction


def gbp(pence: int) -> str:
    sign = "-" if pence < 0 else ""
    p = abs(pence)
    return f"{sign}£{p // 100:,}.{p % 100:02d}"


@dataclass(frozen=True)
class Figure:
    id: str
    label: str
    value: int
    kind: str          # "pence" | "percent" | "days"

    @property
    def display(self) -> str:
        if self.kind == "pence":
            return gbp(self.value)
        if self.kind == "percent":
            return f"{self.value}%"
        return f"{self.value} day" + ("" if self.value == 1 else "s")

    def to_api(self) -> dict:
        d = {"id": self.id, "label": self.label, "kind": self.kind, "display": self.display}
        d["value_pence" if self.kind == "pence" else "value"] = self.value
        return d


def limit_status(account: Account, spend_pence: int) -> str:
    """'none' (no limit set) | 'under' | 'check_in' (80-99%) | 'over' (100%+)."""
    pct = credit.limit_progress_percent(spend_pence, account.spending_limit_pence)
    if pct is None:
        return "none"
    if pct >= 100:
        return "over"
    return "check_in" if pct >= credit.CHECK_IN_PERCENT else "under"


def build_figures(account: Account, transactions: list[Transaction], today: date, *,
                  candidate: Optional[Transaction] = None,
                  requested_pence: Optional[int] = None) -> Dict[str, Figure]:
    """Every number the app may show or the AI may mention. Python owns these."""
    y, m = today.year, today.month
    py, pm = credit.previous_month(y, m)
    spend = credit.month_spend_pence(transactions, y, m)
    last = credit.month_spend_pence(transactions, py, pm)
    figs = [
        Figure("balance", "Balance", account.balance_pence, "pence"),
        Figure("credit_limit", "Credit limit", account.limit_pence, "pence"),
        Figure("available_credit", "Available credit", max(0, account.limit_pence - account.balance_pence), "pence"),
        Figure("utilisation", "Share of credit limit used", credit.utilisation_percent(account.balance_pence, account.limit_pence), "percent"),
        Figure("minimum_payment", "Minimum payment", credit.minimum_payment_pence(account.balance_pence, account.apr_bp), "pence"),
        Figure("interest_estimate", "Estimated interest for a month", credit.interest_estimate_pence(account.balance_pence, account.apr_bp), "pence"),
        Figure("days_until_due", "Days until payment is due", credit.days_until(account.due_date, today), "days"),
        Figure("month_spend", "Spending this month", spend, "pence"),
        Figure("last_month_spend", "Spending last month", last, "pence"),
        Figure("spend_change", "Difference from last month", abs(spend - last), "pence"),
    ]
    pct = credit.limit_progress_percent(spend, account.spending_limit_pence)
    if pct is not None:
        figs += [Figure("spending_limit", "Monthly spending limit", account.spending_limit_pence, "pence"),
                 Figure("limit_progress", "Share of spending limit used", pct, "percent")]
    if candidate is not None:
        figs.append(Figure("charge_amount", "Amount of the charge", candidate.amount_pence, "pence"))
    if requested_pence is not None and 0 < requested_pence <= account.balance_pence:
        figs.append(Figure("requested_amount", "Amount you asked to pay", requested_pence, "pence"))
    return {f.id: f for f in figs}


def build_facts(account: Account, transactions: list[Transaction], today: date,
                candidate: Optional[Transaction] = None) -> Dict[str, str]:
    """Words, not numbers: things the AI may mention that the checker does not need to police."""
    py, pm = credit.previous_month(today.year, today.month)
    spend = credit.month_spend_pence(transactions, today.year, today.month)
    last = credit.month_spend_pence(transactions, py, pm)
    facts = {"due_date": f"{account.due_date:%A} {account.due_date.day} {account.due_date:%B}",
             "spend_direction": "higher" if spend > last else "lower" if spend < last else "the same"}
    if candidate is not None:
        facts["charge_merchant"] = candidate.merchant.replace("£", "").replace("%", "")
        facts["charge_date"] = f"{candidate.date.day} {candidate.date:%B}"
    return facts
