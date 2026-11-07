"""Database reads that build the API responses (person B owns this file).

The figures come from C's engine (backend/engine/credit.py). This file only turns database
rows into the engine's objects and the engine's numbers into the API's response shape.
"""
import json
from datetime import date

from engine import credit
from engine.credit import Account, Transaction


def _user(conn, persona: str):
    return conn.execute("SELECT * FROM users WHERE persona = ?", (persona,)).fetchone()


def load_engine_inputs(conn, persona: str) -> tuple[Account, list[Transaction]]:
    """This persona's account and transactions as the engine's own types (used by /ask too)."""
    user = _user(conn, persona)
    account = Account(
        limit_pence=user["credit_limit_pence"],
        balance_pence=user["balance_pence"],
        apr_bp=user["apr_basis_points"],
        due_date=date.fromisoformat(user["due_date"]),
        spending_limit_pence=user["monthly_limit_pence"],
    )
    rows = conn.execute(
        "SELECT id, merchant, amount_pence, date, status FROM transactions WHERE persona = ?",
        (persona,),
    ).fetchall()
    return account, [Transaction.from_row(row) for row in rows]


def get_me(conn, persona: str, today: date | None = None) -> dict:
    today = today or date.today()
    user = _user(conn, persona)
    account, transactions = load_engine_inputs(conn, persona)
    spent = credit.month_spend_pence(transactions, today.year, today.month)

    return {
        "persona": user["persona"],
        "display_name": user["display_name"],
        "settings": json.loads(user["settings_json"]),
        "account": {
            "credit_limit_pence": account.limit_pence,
            "balance_pence": account.balance_pence,
            "available_credit_pence": max(0, account.limit_pence - account.balance_pence),
            "utilisation_percent": credit.utilisation_percent(account.balance_pence, account.limit_pence),
            "apr_basis_points": account.apr_bp,
            "minimum_payment_pence": credit.minimum_payment_pence(account.balance_pence, account.apr_bp),
            "due_date": account.due_date,
            "interest_estimate_pence": credit.interest_estimate_pence(account.balance_pence, account.apr_bp),
            "card_paused_until": user["card_paused_until"],
        },
        "spending": {
            "monthly_limit_pence": account.spending_limit_pence,
            "spent_this_month_pence": spent,
            "percent_used": credit.limit_progress_percent(spent, account.spending_limit_pence),
        },
    }


def get_transactions(conn, persona: str) -> dict:
    rows = conn.execute(
        "SELECT id, merchant, amount_pence, date, status FROM transactions "
        "WHERE persona = ? ORDER BY date DESC, id",
        (persona,),
    ).fetchall()
    return {"transactions": [dict(row) for row in rows]}
