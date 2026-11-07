"""Missed-payment risk for the staff console: account data -> features -> model -> plain-English result.

Inputs are account behaviour only (balance, statement history, payments, spending). The needs profile is
used afterwards, only to suggest HOW to reach out (via a channel the customer allows), never as a model input.
"""
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache

from engine import credit
from risk import load_model

from app import queries

SUGGESTIONS = {
    "high": "Reach out now to offer support: a lower payment plan, a short break from interest, or a chat about options. "
            "Lead with help, not a warning.",
    "medium": "Send a friendly, plain-English reminder a few days before the due date, with a link to Get support.",
    "low": "No action needed.",
}


@lru_cache(maxsize=1)
def model():
    return load_model()


def features(conn, persona: str, today: date | None = None) -> dict[str, float]:
    today = today or date.today()
    account, transactions = queries.load_engine_inputs(conn, persona)
    history = conn.execute(
        "SELECT * FROM statement_history WHERE persona = ? ORDER BY months_ago", (persona,)
    ).fetchall()
    last3, last6 = history[:3], history[:6]

    # Spending in the last 30 days compared with their usual month (average of the last 3 statements).
    since = today - timedelta(days=30)
    recent_spend = sum(t.amount_pence for t in transactions
                       if t.status in credit.COUNTED_STATUSES and t.date > since)
    usual_spend = sum(h["spend_pence"] for h in last3) / len(last3) if last3 else recent_spend or 1

    # Has at least this month's minimum already been paid in the last 30 days?
    minimum = credit.minimum_payment_pence(account.balance_pence, account.apr_bp)
    cutoff = (datetime.combine(since, datetime.min.time(), tzinfo=timezone.utc)).isoformat()
    paid_recently = conn.execute(
        "SELECT COALESCE(SUM(amount_pence), 0) FROM payments WHERE persona = ? AND created_at >= ?", (persona, cutoff)
    ).fetchone()[0]

    three_months_ago = history[2]["statement_balance_pence"] if len(history) >= 3 else account.balance_pence
    return {
        "utilisation": account.balance_pence / account.limit_pence if account.limit_pence else 0.0,
        "min_only_last_3": sum(1 for h in last3 if h["paid_pence"] <= h["minimum_pence"]),
        "late_last_6": sum(1 for h in last6 if h["days_late"] > 0),
        "balance_growth": account.balance_pence / three_months_ago if three_months_ago else 1.0,
        "spend_ratio": recent_spend / usual_spend if usual_spend else 1.0,
        "paid_this_cycle": 1 if account.balance_pence == 0 or paid_recently >= minimum else 0,
    }


def assess(conn, persona: str, today: date | None = None) -> dict:
    m = model()
    prediction = m.predict(features(conn, persona, today))
    metrics = m.metrics
    return {
        "probability": prediction.probability,
        "percent": round(prediction.probability * 100),
        "band": prediction.band,
        "drivers": [d.__dict__ for d in prediction.drivers],
        "suggestion": SUGGESTIONS[prediction.band],
        "model": {
            "kind": "Logistic regression",
            "trained_on": metrics["trained_on"],
            "test_auc": metrics["test_auc"],
            "test_accuracy": metrics["test_accuracy"],
            "synthetic_data": metrics["synthetic_data"],
        },
    }
