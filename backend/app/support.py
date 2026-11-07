"""Tell us once, and support requests: the customer's needs profile, and the staff console.

Two rules this file enforces, so the frontend cannot get them wrong:

1. Consent. Staff only see the details of a needs profile if the customer chose to share it.
2. Contact preferences are always respected. Staff cannot reply through a channel the customer
   has not allowed (for example, a phone call to someone who asked never to be phoned). This holds
   even when the details are not shared: the system enforces the rule without revealing why.
"""
import json
from datetime import date, datetime, timezone

from engine import credit

from app import payment_risk, queries
from app.errors import ApiError
from app.schemas import NeedsProfileUpdate

DEMO_STAFF_NAME = "Jordan (Customer Care)"

TOPIC_LABELS = {
    "struggling_to_pay": "Finding it hard to pay",
    "understanding_account": "Help understanding my account",
    "accessibility": "Help using SpendSense",
    "something_else": "Something else",
}

CHANNEL_LABELS = {
    "app": "in-app message",
    "email": "email",
    "text": "text message",
    "letter": "letter",
    "phone": "phone call",
}

LETTER_LABELS = {
    "large_print": "large print",
    "braille": "braille",
    "easy_read": "Easy Read",
    "audio": "audio",
}

CALL_GUIDANCE = {
    "extra_time": "Allow extra time. Do not rush them.",
    "speak_slowly": "Speak slowly and clearly.",
    "relay_uk": "Use Relay UK (text relay) for any call.",
    "agreed_times": "Only call at a time agreed with them in writing first.",
    "same_person": "Keep the same contact person where you can.",
}

STATUS_ORDER = {"open": 0, "in_progress": 1, "resolved": 2}

# What a customer gets before they have filled anything in: every channel allowed, nothing shared.
DEFAULT_PROFILE = NeedsProfileUpdate().model_dump()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _user_or_404(conn, persona: str):
    user = queries._user(conn, persona)
    if user is None:
        raise ApiError("We could not find that customer.", 404)
    return user


# ---------- needs profile ----------

def get_needs(conn, persona: str) -> dict:
    row = conn.execute("SELECT * FROM needs_profiles WHERE persona = ?", (persona,)).fetchone()
    if row is None:
        return {**DEFAULT_PROFILE, "updated_at": None}
    profile = {**DEFAULT_PROFILE, **json.loads(row["profile_json"])}
    profile["share_with_staff"] = bool(row["share_with_staff"])
    profile["updated_at"] = row["updated_at"]
    return profile


def save_needs(conn, persona: str, body: NeedsProfileUpdate, when: str | None = None) -> dict:
    data = body.model_dump()
    share = data.pop("share_with_staff")
    conn.execute(
        """INSERT INTO needs_profiles (persona, profile_json, share_with_staff, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(persona) DO UPDATE SET profile_json = excluded.profile_json,
               share_with_staff = excluded.share_with_staff, updated_at = excluded.updated_at""",
        (persona, json.dumps(data), int(share), when or _now()),
    )
    conn.commit()
    return get_needs(conn, persona)


def guidance(profile: dict, display_name: str) -> list[dict]:
    """Plain instructions for the agent, built from the profile. Order: how to contact first."""
    allowed = profile["channels"]
    preferred = profile["preferred_channel"]
    others = [CHANNEL_LABELS[c] for c in allowed if c != preferred]
    contact = f"Contact by {CHANNEL_LABELS[preferred]} first."
    if others:
        contact += " Also OK: " + ", ".join(others) + "."
    out = [{"kind": "contact", "text": contact}]
    if "phone" not in allowed:
        out.append({"kind": "no_phone", "text": f"Do not phone {display_name}. Calls are blocked for this customer."})
    if profile["letter_format"] != "standard":
        out.append({"kind": "letters", "text": f"Send every letter in {LETTER_LABELS[profile['letter_format']]}."})
    for adjustment in profile["call_adjustments"]:
        out.append({"kind": "calls", "text": CALL_GUIDANCE[adjustment]})
    if profile.get("helper_name"):
        out.append({
            "kind": "helper",
            "text": f"{profile['helper_name']} helps {display_name} manage their money. "
                    "Check you have consent before discussing the account with them.",
        })
    if profile.get("notes"):
        out.append({"kind": "notes", "text": f"In their words: “{profile['notes']}”"})
    return out


# ---------- support requests ----------

def _messages(conn, request_id: int, include_notes: bool) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM support_messages WHERE request_id = ? ORDER BY created_at, id", (request_id,)
    ).fetchall()
    return [
        {k: row[k] for k in ("id", "author", "text", "channel", "staff_name", "created_at")}
        for row in rows
        if include_notes or row["author"] != "note"
    ]


def _request(conn, row, include_notes: bool) -> dict:
    return {
        "id": row["id"],
        "topic": row["topic"],
        "topic_label": TOPIC_LABELS[row["topic"]],
        "message": row["message"],
        "channel": row["channel"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "messages": _messages(conn, row["id"], include_notes),
    }


def _request_row(conn, request_id: int, persona: str | None = None):
    row = conn.execute("SELECT * FROM support_requests WHERE id = ?", (request_id,)).fetchone()
    if row is None or (persona is not None and row["persona"] != persona):
        raise ApiError("We could not find that support request.", 404)
    return row


def list_requests(conn, persona: str) -> dict:
    rows = conn.execute(
        "SELECT * FROM support_requests WHERE persona = ? ORDER BY created_at DESC, id DESC", (persona,)
    ).fetchall()
    return {"requests": [_request(conn, row, include_notes=False) for row in rows]}


def create_request(conn, persona: str, topic: str, message: str | None, channel: str, when: str | None = None) -> dict:
    allowed = get_needs(conn, persona)["channels"]
    if channel not in allowed:
        raise ApiError(
            f"You asked us not to contact you by {CHANNEL_LABELS[channel]}. Please choose another way, "
            "or change this on the Your needs page.",
            400,
        )
    stamp = when or _now()
    cursor = conn.execute(
        """INSERT INTO support_requests (persona, topic, message, channel, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?)""",
        (persona, topic, (message or "").strip() or None, channel, stamp, stamp),
    )
    conn.commit()
    return _request(conn, _request_row(conn, cursor.lastrowid), include_notes=False)


def _add_message(conn, request_id: int, author: str, text: str, channel: str | None, staff_name: str | None,
                 when: str | None = None) -> None:
    stamp = when or _now()
    conn.execute(
        """INSERT INTO support_messages (request_id, author, text, channel, staff_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (request_id, author, text.strip(), channel, staff_name, stamp),
    )
    conn.execute("UPDATE support_requests SET updated_at = ? WHERE id = ?", (stamp, request_id))


def customer_reply(conn, persona: str, request_id: int, text: str) -> dict:
    row = _request_row(conn, request_id, persona)
    _add_message(conn, request_id, "customer", text, "app", None)
    if row["status"] == "resolved":  # replying re-opens it, so it lands back in the queue
        conn.execute("UPDATE support_requests SET status = 'open' WHERE id = ?", (request_id,))
    conn.commit()
    return _request(conn, _request_row(conn, request_id), include_notes=False)


# ---------- staff console ----------

def staff_queue(conn, status: str | None = None) -> dict:
    rows = conn.execute(
        """SELECT r.*, u.display_name, COALESCE(n.share_with_staff, 0) AS shared
           FROM support_requests r JOIN users u ON u.persona = r.persona
           LEFT JOIN needs_profiles n ON n.persona = r.persona"""
    ).fetchall()
    items = [
        {
            "id": row["id"],
            "persona": row["persona"],
            "display_name": row["display_name"],
            "topic": row["topic"],
            "topic_label": TOPIC_LABELS[row["topic"]],
            "message": row["message"],
            "channel": row["channel"],
            "status": row["status"],
            "needs_shared": bool(row["shared"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
        if status is None or row["status"] == status
    ]
    items.sort(key=lambda r: (STATUS_ORDER[r["status"]], r["created_at"]))
    return {"requests": items}


def staff_customers(conn) -> dict:
    users = conn.execute("SELECT persona, display_name FROM users ORDER BY rowid").fetchall()
    out = []
    for user in users:
        open_count = conn.execute(
            "SELECT COUNT(*) FROM support_requests WHERE persona = ? AND status != 'resolved'", (user["persona"],)
        ).fetchone()[0]
        risk = payment_risk.assess(conn, user["persona"])
        out.append({
            "persona": user["persona"],
            "display_name": user["display_name"],
            "needs_shared": get_needs(conn, user["persona"])["share_with_staff"],
            "open_requests": open_count,
            "risk_percent": risk["percent"],
            "risk_band": risk["band"],
        })
    return {"customers": out}


def staff_customer(conn, persona: str, today: date | None = None) -> dict:
    today = today or date.today()
    user = _user_or_404(conn, persona)
    profile = get_needs(conn, persona)
    shared = profile["share_with_staff"]
    account, transactions = queries.load_engine_inputs(conn, persona)
    rows = conn.execute(
        "SELECT * FROM support_requests WHERE persona = ? ORDER BY created_at DESC, id DESC", (persona,)
    ).fetchall()
    name = user["display_name"]
    return {
        "persona": persona,
        "display_name": name,
        "needs_shared": shared,
        "needs": profile if shared else None,
        "guidance": guidance(profile, name) if shared else [],
        "allowed_channels": profile["channels"],
        "account": {
            "balance_pence": account.balance_pence,
            "minimum_payment_pence": credit.minimum_payment_pence(account.balance_pence, account.apr_bp),
            "due_date": account.due_date,
            "days_until_due": credit.days_until(account.due_date, today),
            "card_paused": queries.card_paused(conn, persona),
            "monthly_limit_pence": account.spending_limit_pence,
        },
        "risk": payment_risk.assess(conn, persona, today),
        "requests": [_request(conn, row, include_notes=True) for row in rows],
    }


def staff_set_status(conn, request_id: int, status: str) -> dict:
    row = _request_row(conn, request_id)
    conn.execute("UPDATE support_requests SET status = ?, updated_at = ? WHERE id = ?", (status, _now(), request_id))
    conn.commit()
    return _request(conn, _request_row(conn, row["id"]), include_notes=True)


def staff_message(conn, request_id: int, text: str, channel: str, internal: bool) -> dict:
    row = _request_row(conn, request_id)
    if internal:
        _add_message(conn, request_id, "note", text, None, DEMO_STAFF_NAME)
    else:
        allowed = get_needs(conn, row["persona"])["channels"]
        if channel not in allowed:
            name = queries._user(conn, row["persona"])["display_name"]
            raise ApiError(
                f"{name} has asked not to be contacted by {CHANNEL_LABELS[channel]}. Choose one of the ways they allow.",
                409,
            )
        _add_message(conn, request_id, "staff", text, channel, DEMO_STAFF_NAME)
        if row["status"] == "open":  # a first reply means someone is on it
            conn.execute("UPDATE support_requests SET status = 'in_progress' WHERE id = ?", (request_id,))
    conn.commit()
    return _request(conn, _request_row(conn, request_id), include_notes=True)
