"""Database reads that build the API responses (person B owns this file).

Each function takes an open connection and a persona and returns a plain dict
that matches a model in schemas.py.
"""
import json
from datetime import date, timedelta

from app import figures

SPENDING_WINDOW_DAYS = 30  # "this month" in the demo means the last 30 days


def get_me(conn, persona: str) -> dict:
    user = conn.execute("SELECT * FROM users WHERE persona = ?", (persona,)).fetchone()
    since = (date.today() - timedelta(days=SPENDING_WINDOW_DAYS)).isoformat()
    spent = conn.execute(
        "SELECT COALESCE(SUM(amount_pence), 0) FROM transactions WHERE persona = ? AND date >= ?",
        (persona, since),
    ).fetchone()[0]

    limit = user["credit_limit_pence"]
    balance = user["balance_pence"]
    monthly_limit = user["monthly_limit_pence"]

    return {
        "persona": user["persona"],
        "display_name": user["display_name"],
        "settings": json.loads(user["settings_json"]),
        "account": {
            "credit_limit_pence": limit,
            "balance_pence": balance,
            "available_credit_pence": figures.available_credit_pence(limit, balance),
            "utilisation_percent": figures.utilisation_percent(limit, balance),
            "apr_basis_points": user["apr_basis_points"],
            "minimum_payment_pence": user["minimum_payment_pence"],
            "due_date": user["due_date"],
            "interest_estimate_pence": figures.interest_estimate_pence(balance, user["apr_basis_points"]),
            "card_paused_until": user["card_paused_until"],
        },
        "spending": {
            "monthly_limit_pence": monthly_limit,
            "spent_this_month_pence": spent,
            "percent_used": figures.percent_used(spent, monthly_limit),
        },
    }


def get_transactions(conn, persona: str) -> dict:
    rows = conn.execute(
        "SELECT id, merchant, amount_pence, date, status FROM transactions "
        "WHERE persona = ? ORDER BY date DESC, id",
        (persona,),
    ).fetchall()
    return {"transactions": [dict(row) for row in rows]}
