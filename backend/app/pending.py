"""Saving a proposed action so it can be confirmed later (person B owns this file).

A proposal is only a row in pending_actions. Nothing happens until the customer confirms,
and confirming will run from the SAVED details, never from numbers sent again by the browser.
"""
import json
import uuid
from datetime import datetime, timezone

# C's AI layer says "pause"; the API contract (schemas.py) says "pause_card".
API_TYPE = {"pay": "pay", "dispute": "dispute", "pause": "pause_card"}


def save_proposal(conn, persona: str, proposal: dict) -> dict:
    """Store a proposal from C's make_proposal() and return the API's ProposedAction.

    `proposal` looks like {"type": "pay", "details": {...}, "read_back": "Pay your £35.00 ...?"}.
    """
    action_id = "act_" + uuid.uuid4().hex[:12]
    action_type = API_TYPE[proposal["type"]]
    conn.execute(
        """INSERT INTO pending_actions
               (id, persona, type, details_json, read_back, status, result_json, created_at)
           VALUES (?, ?, ?, ?, ?, 'waiting', NULL, ?)""",
        (
            action_id,
            persona,
            action_type,
            json.dumps(proposal["details"]),
            proposal["read_back"],
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    return {"action_id": action_id, "type": action_type, "read_back": proposal["read_back"]}
