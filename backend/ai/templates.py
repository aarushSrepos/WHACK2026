"""Template fallback: plain sentences built straight from engine figures. Needs no network.
Shown with the label "Standard explanation"."""
from __future__ import annotations

from typing import Dict, List, Tuple

from engine.credit import CHECK_IN_PERCENT, PAUSE_HOURS
from engine.figures import Figure


def _d(f: Dict[str, Figure], k: str) -> str:
    return f[k].display


def render(intent: str, level: str, f: Dict[str, Figure], facts: Dict[str, str]) -> Tuple[str, List[str]]:
    """Returns (text, figure ids used)."""
    simple = level == "simple"
    if intent == "explain_bill":
        d = facts["spend_direction"]
        if d == "the same":
            return (f"You have spent {_d(f,'month_spend')} this month. That is the same as last month.", ["month_spend", "last_month_spend"])
        t = (f"You have spent {_d(f,'month_spend')} this month. Last month it was {_d(f,'last_month_spend')}. "
             f"That is {_d(f,'spend_change')} {d}.")
        ids = ["month_spend", "last_month_spend", "spend_change"]
        if not simple:
            t += (f" Your balance is {_d(f,'balance')}, with about {_d(f,'interest_estimate')} interest a month at your rate. "
                  f"Your minimum payment is {_d(f,'minimum_payment')}.")
            ids += ["balance", "interest_estimate", "minimum_payment"]
        return t, ids
    if intent == "due":
        t = f"Your minimum payment is {_d(f,'minimum_payment')}. It is due on {facts['due_date']}, in {_d(f,'days_until_due')}."
        ids = ["minimum_payment", "days_until_due"]
        if not simple:
            t += f" Your full balance is {_d(f,'balance')}."; ids.append("balance")
        return t, ids
    if intent == "balance":
        t = f"You owe {_d(f,'balance')}."
        ids = ["balance"]
        if not simple:
            t += f" Your limit is {_d(f,'credit_limit')}, so you have used {_d(f,'utilisation')} of it. You have {_d(f,'available_credit')} left."
            ids += ["credit_limit", "utilisation", "available_credit"]
        return t, ids
    if intent == "dispute":
        if "charge_amount" not in f:
            return ("I could not find that charge. Check the amount or the shop name, or pick it from your transactions.", [])
        return (f"I found a charge of {_d(f,'charge_amount')} from {facts['charge_merchant']} on {facts['charge_date']}. "
                "I can dispute it for you. I will read it back first and you confirm.", ["charge_amount"])
    if intent == "pay":
        if "requested_amount_problem" in facts:
            return (f"That amount is more than your balance of {_d(f,'balance')}. You can pay up to that.", ["balance"])
        if "requested_amount" in f:
            return (f"You asked to pay {_d(f,'requested_amount')}. I will read it back and you confirm before anything is paid.", ["requested_amount"])
        return (f"You can pay your minimum of {_d(f,'minimum_payment')} or your full balance of {_d(f,'balance')}. "
                "I will read it back and you confirm before anything is paid.", ["minimum_payment", "balance"])
    if intent == "pause":
        return (f"I can pause your card for {PAUSE_HOURS} hours. I will read it back and you confirm first.", [])
    if intent == "limit":
        if "spending_limit" not in f:
            return ("You have not set a monthly spending limit yet. You can set one in settings.", [])
        return (f"You have spent {_d(f,'month_spend')} of your {_d(f,'spending_limit')} monthly limit. That is {_d(f,'limit_progress')}.",
                ["month_spend", "spending_limit", "limit_progress"])
    if intent == "interest":
        t = f"Interest is about {_d(f,'interest_estimate')} a month on your balance of {_d(f,'balance')}."
        ids = ["interest_estimate", "balance"]
        if simple:
            t += " Paying more than the minimum means less interest."
        else:
            t += (f" Interest is added to the part of your balance you have not paid. Your minimum payment is "
                  f"{_d(f,'minimum_payment')}. Paying more than that lowers the interest you pay over time. "
                  "You can compare amounts in the credit simulator.")
            ids.append("minimum_payment")
        return t, ids
    if intent == "missed_payment":
        t = (f"Your minimum payment is {_d(f,'minimum_payment')}, due in {_d(f,'days_until_due')}. "
             "If a payment is missed, you may pay a fee and more interest, and it can show on your credit file.")
        if simple:
            t += " If you are finding it hard to pay, tell us early. We can talk about options."
        else:
            t += (" The exact fee and effect depend on your account terms. If you are finding it hard to pay, "
                  "contact us as early as you can to talk about support. Free, independent help is also available "
                  "from MoneyHelper and StepChange.")
        return t, ["minimum_payment", "days_until_due"]
    if intent == "afford":
        t = f"You have {_d(f,'available_credit')} of credit available."
        ids = ["available_credit"]
        if "spending_limit" in f:
            t += f" You have spent {_d(f,'month_spend')} of your own {_d(f,'spending_limit')} monthly limit."
            ids += ["month_spend", "spending_limit"]
        t += " Only you can decide what is right for you. I can show your spending or help you set a limit."
        return t, ids
    return ("I can explain your bill, interest and what to pay, dispute a charge, or pause your card. What would you like?", [])


def check_in_message(f: Dict[str, Figure], status: str) -> dict | None:
    """Fixed, neutral wording for the spending-limit check-in (at 80%, or when the limit is reached).
    No red, no judgement, no advice. B can return this from /me or /demo/spend."""
    if status not in ("check_in", "over") or "spending_limit" not in f:
        return None
    if status == "check_in":
        text = (f"You have used {_d(f,'limit_progress')} of your {_d(f,'spending_limit')} monthly limit. "
                f"That is {_d(f,'month_spend')} so far. You can carry on, or pause your card for {PAUSE_HOURS} hours.")
        ids = ["limit_progress", "spending_limit", "month_spend"]
    else:
        text = (f"You have reached your {_d(f,'spending_limit')} monthly limit. "
                f"You can carry on, or pause your card for {PAUSE_HOURS} hours.")
        ids = ["spending_limit"]
    return {"text": text, "figure_ids": ids, "status": status, "offer": "pause",
            "threshold_percent": CHECK_IN_PERCENT}
