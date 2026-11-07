"""Builds the read-back sentence and the details B saves in pending_actions.
Deterministic: no model writes these. There is deliberately no confirm function in this package."""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import date
from typing import Union

from engine import credit
from engine.credit import Account, Transaction
from engine.figures import gbp


class ProposalError(ValueError):
    """The request cannot be proposed (unknown charge, bad amount). Message is safe to show."""


@dataclass(frozen=True)
class Proposal:
    type: str            # "pay" | "dispute" | "pause"
    details: dict        # JSON-safe; B stores this and /actions/{id}/confirm runs from it
    read_back: str

    def to_dict(self) -> dict:
        return asdict(self)


def _clean(s: str) -> str:
    return s.replace("£", "").replace("%", "")


def make_proposal(kind: str, account: Account, transactions: list[Transaction], today: date, *,
                  transaction_id: int | None = None,
                  pay: Union[str, int] = "minimum") -> Proposal:
    """kind: 'pay' (pay = 'minimum' | 'full' | pence int), 'dispute' (transaction_id), or 'pause'."""
    if kind == "pay":
        if account.balance_pence <= 0:
            raise ProposalError("There is nothing to pay.")
        if pay == "minimum":
            amount, how = credit.minimum_payment_pence(account.balance_pence, account.apr_bp), "minimum"
        elif pay == "full":
            amount, how = account.balance_pence, "full"
        elif isinstance(pay, int) and not isinstance(pay, bool):
            amount, how = pay, "custom"
        else:
            raise ProposalError("Choose the minimum, the full balance or an amount.")
        if amount <= 0:
            raise ProposalError("The amount must be more than £0.00.")
        if amount > account.balance_pence:
            raise ProposalError(f"That is more than your balance of {gbp(account.balance_pence)}.")
        text = {"minimum": f"Pay your {gbp(amount)} minimum payment today?",
                "full": f"Pay your full balance of {gbp(amount)} today?",
                "custom": f"Pay {gbp(amount)} today?"}[how]
        return Proposal("pay", {"amount_pence": amount, "kind": how}, text)

    if kind == "dispute":
        tx = next((t for t in transactions if t.id == transaction_id), None)
        if tx is None:
            raise ProposalError("I could not find that charge.")
        if tx.status not in credit.DISPUTABLE_STATUSES:
            raise ProposalError("That charge is already being looked into.")
        text = f"Dispute the {gbp(tx.amount_pence)} charge from {_clean(tx.merchant)} on {tx.date.day} {tx.date:%B}?"
        return Proposal("dispute", {"transaction_id": tx.id, "amount_pence": tx.amount_pence,
                                    "merchant": tx.merchant, "date": tx.date.isoformat()}, text)

    if kind == "pause":
        return Proposal("pause", {"hours": credit.PAUSE_HOURS}, f"Pause your card for {credit.PAUSE_HOURS} hours?")

    raise ProposalError("That action is not available.")
