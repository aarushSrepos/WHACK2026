"""The two-step action flow: PROPOSE, then CONFIRM (person B owns this file).

    propose()  saves a row in pending_actions (status "waiting") and returns its id plus a
               read-back sentence. Nothing has happened yet.
    confirm()  runs the saved row, once. It reads the amount, the charge and the rest from the
               SAVED details, never from anything the browser sends again.

Safety rules this file enforces (each one has a test in tests/test_actions.py):
- A customer can only confirm their own actions. Someone else's id looks like "not found".
- Confirming twice does not do it twice: the second call returns the first result.
- The state is checked again at confirm time (balance, charge, card), because it may have
  changed since the proposal. If so the customer is told and nothing happens.
- Every action is simulated. No real money moves.
"""
import json
from datetime import date, datetime, timedelta, timezone

from ai.actions import ProposalError, make_proposal
from engine.figures import gbp

from app import pending, queries
from app.errors import ApiError
from app.schemas import ActionRequest


# ---------- step 1: propose ----------

def propose(conn, persona: str, body: ActionRequest, today: date | None = None, now: datetime | None = None) -> dict:
    """Save a proposal (no AI involved) and return {action_id, type, read_back}."""
    today = today or date.today()
    now = now or datetime.now(timezone.utc)
    account, transactions = queries.load_engine_inputs(conn, persona)
    paused = queries.card_paused(conn, persona, now)

    try:
        if body.type == "pay":
            # C's make_proposal checks the amount and writes the read-back sentence.
            proposal = make_proposal("pay", account, transactions, today, pay=body.amount_pence or "minimum").to_dict()
        elif body.type == "dispute":
            proposal = make_proposal(
                "dispute", account, transactions, today, transaction_id=body.transaction_id
            ).to_dict()
            if body.reason:
                proposal["details"]["reason"] = body.reason
        elif body.type == "pause_card":
            if paused:
                raise ApiError("Your card is already paused.", 409)
            proposal = make_proposal("pause", account, transactions, today).to_dict()
        else:  # unpause_card
            if not paused:
                raise ApiError("Your card is not paused.", 409)
            proposal = {"type": "unpause", "details": {}, "read_back": "Turn your card back on now?"}
    except ProposalError as problem:
        raise ApiError(str(problem), 400)

    return pending.save_proposal(conn, persona, proposal)


# ---------- step 2: confirm ----------

def confirm(conn, persona: str, action_id: str, now: datetime | None = None) -> dict:
    """Run a waiting action once. Returns a dict matching schemas.ConfirmResponse."""
    now = now or datetime.now(timezone.utc)

    # IMMEDIATE takes the database's write lock now, so two confirms at the same moment
    # cannot both see "waiting". The second one waits, then sees "done".
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute(
            "SELECT * FROM pending_actions WHERE id = ? AND persona = ?", (action_id, persona)
        ).fetchone()
        if row is None:
            raise ApiError("Unknown action id", 404)  # also what you get for someone else's id
        if row["status"] == "done":
            conn.rollback()
            return json.loads(row["result_json"])  # confirmed before: repeat the answer, do nothing
        if row["status"] != "waiting":
            raise ApiError("This action was cancelled.", 409)

        details = json.loads(row["details_json"])
        runner = RUNNERS[row["type"]]
        summary, reference = runner(conn, persona, details, now, action_id)

        result = {
            "action_id": action_id,
            "type": row["type"],
            "status": "done",
            "summary": summary,
            "reference": reference,
            "simulated": True,
        }
        conn.execute(
            "UPDATE pending_actions SET status = 'done', result_json = ? WHERE id = ?",
            (json.dumps(result), action_id),
        )
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise


def _run_pay(conn, persona, details, now, action_id):
    amount = details["amount_pence"]
    balance = conn.execute("SELECT balance_pence FROM users WHERE persona = ?", (persona,)).fetchone()[0]
    if amount > balance:
        raise ApiError(f"That is more than your balance of {gbp(balance)} now. Please start again.", 409)
    conn.execute("UPDATE users SET balance_pence = balance_pence - ? WHERE persona = ?", (amount, persona))
    cursor = conn.execute(
        "INSERT INTO payments (persona, amount_pence, status, created_at) VALUES (?, ?, 'simulated', ?)",
        (persona, amount, now.isoformat()),
    )
    summary = f"Simulated payment of {gbp(amount)} made. Your balance is now {gbp(balance - amount)}."
    return summary, f"SIM-PAY-{cursor.lastrowid:04d}"


def _run_dispute(conn, persona, details, now, action_id):
    tx = conn.execute(
        "SELECT * FROM transactions WHERE persona = ? AND id = ?", (persona, details["transaction_id"])
    ).fetchone()
    if tx is None or tx["status"] not in ("posted", "pending"):
        raise ApiError("That charge can no longer be disputed.", 409)
    conn.execute(
        "UPDATE transactions SET status = 'disputed' WHERE persona = ? AND id = ?",
        (persona, tx["id"]),
    )
    when = date.fromisoformat(tx["date"])
    summary = (
        f"Dispute opened for the {gbp(tx['amount_pence'])} charge from {tx['merchant']} "
        f"on {when.day} {when:%B}. You do not need to phone us. We will update you here."
    )
    reason = details.get("reason") or "The customer does not recognise this charge."
    cursor = conn.execute(
        """INSERT INTO disputes (persona, transaction_id, reason, status, case_summary, created_at)
           VALUES (?, ?, ?, 'open', ?, ?)""",
        (persona, tx["id"], reason, f"{summary} Reason: {reason}", now.isoformat()),
    )
    return summary, f"SIM-CASE-{cursor.lastrowid:04d}"


def _run_pause(conn, persona, details, now, action_id):
    hours = details.get("hours", 24)
    until = now + timedelta(hours=hours)
    conn.execute("UPDATE users SET card_paused_until = ? WHERE persona = ?", (until.isoformat(), persona))
    summary = f"Your card is paused for {hours} hours (simulated). You can turn it back on at any time."
    return summary, f"SIM-PAUSE-{action_id[-4:].upper()}"


def _run_unpause(conn, persona, details, now, action_id):
    conn.execute("UPDATE users SET card_paused_until = NULL WHERE persona = ?", (persona,))
    return "Your card is back on (simulated).", f"SIM-UNPAUSE-{action_id[-4:].upper()}"


RUNNERS = {
    "pay": _run_pay,
    "dispute": _run_dispute,
    "pause_card": _run_pause,
    "unpause_card": _run_unpause,
}
