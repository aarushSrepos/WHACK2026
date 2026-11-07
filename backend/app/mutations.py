"""Changes that are not pay / dispute / pause: settings and the demo purchase (person B owns this file)."""
import json
from datetime import date, datetime, timezone

from ai.templates import check_in_message
from engine import credit
from engine.figures import build_figures, gbp, limit_status

from app import queries
from app.errors import ApiError
from app.schemas import SettingsUpdate, SpendRequest


def update_settings(conn, persona: str, body: SettingsUpdate) -> None:
    """Save the needs profile and/or the monthly spending limit. Only fields that were sent change."""
    user = queries._user(conn, persona)

    if body.settings is not None:
        current = json.loads(user["settings_json"])
        current.update(body.settings.model_dump(exclude_unset=True))  # keep fields the customer did not touch
        conn.execute("UPDATE users SET settings_json = ? WHERE persona = ?", (json.dumps(current), persona))

    if body.monthly_limit_pence is not None:
        if body.monthly_limit_pence >= user["credit_limit_pence"]:
            raise ApiError(
                f"Your spending limit needs to be below your credit limit of {gbp(user['credit_limit_pence'])}.", 400
            )
        conn.execute(
            "UPDATE users SET monthly_limit_pence = ? WHERE persona = ?", (body.monthly_limit_pence, persona)
        )

    conn.commit()


def crossed_threshold(before_percent: int | None, after_percent: int | None) -> int | None:
    """Did this purchase cross a check-in line? Returns 100, 80 or None (100 wins if both)."""
    if before_percent is None or after_percent is None:
        return None
    if before_percent < 100 <= after_percent:
        return 100
    if before_percent < credit.CHECK_IN_PERCENT <= after_percent:
        return credit.CHECK_IN_PERCENT
    return None


def demo_spend(conn, persona: str, body: SpendRequest, today: date | None = None, now: datetime | None = None) -> dict:
    """Rehearsal helper: a purchase on the customer's card, so the 80% check-in can be shown live."""
    today = today or date.today()
    now = now or datetime.now(timezone.utc)
    account, transactions = queries.load_engine_inputs(conn, persona)

    if queries.card_paused(conn, persona, now):
        raise ApiError("Your card is paused, so this purchase was declined (simulated).", 409)
    if account.balance_pence + body.amount_pence > account.limit_pence:
        raise ApiError("That purchase is over the credit limit, so it was declined (simulated).", 409)

    before = credit.month_spend_pence(transactions, today.year, today.month)
    count = conn.execute(
        "SELECT COUNT(*) FROM transactions WHERE persona = ? AND id LIKE 'tx_demo_%'", (persona,)
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO transactions (persona, id, merchant, amount_pence, date, status) VALUES (?, ?, ?, ?, ?, 'posted')",
        (persona, f"tx_demo_{count + 1:03d}", body.merchant, body.amount_pence, today.isoformat()),
    )
    conn.execute(
        "UPDATE users SET balance_pence = balance_pence + ? WHERE persona = ?", (body.amount_pence, persona)
    )
    conn.commit()

    account, transactions = queries.load_engine_inputs(conn, persona)  # now including the purchase
    after = credit.month_spend_pence(transactions, today.year, today.month)
    limit = account.spending_limit_pence
    crossed = crossed_threshold(
        credit.limit_progress_percent(before, limit), credit.limit_progress_percent(after, limit)
    )

    message = None
    if crossed:
        # C's fixed, neutral wording. No red, no judgement, no advice.
        figures = build_figures(account, transactions, today)
        message = check_in_message(figures, limit_status(account, after))["text"]

    return {
        "spending": {
            "monthly_limit_pence": limit,
            "spent_this_month_pence": after,
            "percent_used": credit.limit_progress_percent(after, limit),
        },
        "threshold_crossed": crossed,
        "message": message,
    }
