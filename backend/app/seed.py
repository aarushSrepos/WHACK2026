"""Fills the database with the four demo personas (person B owns this file).

    cd backend
    python -m app.seed

Running it again wipes the database and starts fresh. That is also what POST /demo/reset does.

Dates are worked out from today so the demo is always true:
- the payment is due five days from today
- the "this month" transactions fall inside the current calendar month
- the "last month" transactions fall inside the previous one, so "why is my bill higher?" has
  something to compare against (C's engine compares calendar months)
"""
import json
from datetime import date, datetime, time, timedelta, timezone

from app.db import TABLES, connect, create_tables
from app.mock_data import load_mock
from app.schemas import NeedsProfileUpdate

PERSONAS = ["priya", "sam", "amara", "alex"]

# Same account for everyone, so the demo story is identical for every persona.
# The minimum payment is not stored: C's engine works it out from the balance and APR.
ACCOUNT = {
    "credit_limit_pence": 150000,
    "balance_pence": 62000,
    "apr_basis_points": 2490,
}
DUE_IN_DAYS = 5

# Only Priya has set a spending limit (£400). The others have none (Alex can choose one in the demo).
MONTHLY_LIMIT_PENCE = {"priya": 40000, "sam": None, "amara": None, "alex": None}

# This month: (id, merchant, pence, days ago, status). They add up to £310.00, which is
# 77% of Priya's £400 limit, so one more small purchase crosses the 80% check-in.
# tx_042 is the charge nobody recognises. If today is early in the month, a transaction that
# would fall in the previous month is dated the 1st instead, so the total never changes.
THIS_MONTH = [
    ("tx_001", "Corner Cafe", 420, 1, "posted"),
    ("tx_007", "Page & Co Books", 1899, 1, "pending"),
    ("tx_003", "GreenGrocer Supermarket", 3815, 2, "posted"),
    ("tx_005", "High Street Pharmacy", 1240, 3, "posted"),
    ("tx_042", "ONLINE*MRKT 4471", 4200, 4, "posted"),
    ("tx_006", "City Bus Pass", 3000, 5, "posted"),
    ("tx_004", "StreamBox", 999, 6, "posted"),
    ("tx_008", "Mobile Top-up", 1000, 7, "posted"),
    ("tx_009", "Wilson's Electronics", 9999, 12, "posted"),
    ("tx_010", "Fuel Station", 4428, 15, "posted"),
]

# Last month: (id, merchant, pence, days before the 1st of this month, status). £186.00 in total,
# so this month is £124.00 higher.
LAST_MONTH = [
    ("tx_101", "GreenGrocer Supermarket", 3600, 3, "posted"),
    ("tx_102", "City Bus Pass", 3000, 6, "posted"),
    ("tx_103", "StreamBox", 999, 8, "posted"),
    ("tx_104", "High Street Pharmacy", 1500, 11, "posted"),
    ("tx_105", "Fuel Station", 4500, 14, "posted"),
    ("tx_106", "Mobile Top-up", 1000, 16, "posted"),
    ("tx_107", "Page & Co Books", 2200, 19, "posted"),
    ("tx_108", "Corner Cafe", 1801, 22, "posted"),
]


# "Tell us once" needs profiles. Priya has filled hers in but NOT shared it with staff, so the demo can
# show the consent switch: the staff console sees nothing until she turns sharing on.
NEEDS = {
    "priya": dict(channels=["app", "email", "text", "letter", "phone"], preferred_channel="email",
                  letter_format="easy_read", call_adjustments=["extra_time"],
                  notes="I'm dyslexic. Short sentences and bullet points help me.", share_with_staff=False),
    "sam": dict(channels=["app", "email", "text"], preferred_channel="text", letter_format="standard",
                call_adjustments=["relay_uk"],
                notes="I'm Deaf. Please never phone me. Text or Relay UK is best.", share_with_staff=True),
    "amara": dict(channels=["app", "email", "letter", "phone"], preferred_channel="email", letter_format="braille",
                  call_adjustments=["speak_slowly"],
                  notes="I use a screen reader. Plain-text emails work best, not PDFs.", share_with_staff=True),
    "alex": dict(channels=["app", "email"], preferred_channel="app", letter_format="standard",
                 call_adjustments=["agreed_times", "same_person"], helper_name="Jamie (partner)",
                 notes="Phone calls make me anxious. Please write to me first.", share_with_staff=True),
}

# Support requests already in the staff queue: (persona, topic, message, channel, status, hours ago, replies).
# A reply is (author, text, channel, hours ago).
REQUESTS = [
    ("alex", "struggling_to_pay", "I'm worried I won't be able to pay this month. I don't want to talk on the phone.",
     "app", "open", 20, []),
    ("sam", "understanding_account", "Why did my minimum payment change?", "text", "in_progress", 30, [
        ("staff", "Hi Sam, your minimum is £35, or 1% of your balance plus interest if that is more. "
                  "So it can change with your balance. I'll send a short breakdown by text.", "text", 26),
        ("note", "Customer is Deaf: text only. Breakdown to follow.", None, 26),
    ]),
]


# Six past statements per customer, newest first: (balance, minimum, paid, days late, spending), in pence.
# Priya pays in full; Sam pays down steadily; Amara mostly pays the minimum; Alex's balance is climbing,
# he pays only the minimum and has been late twice. The model scores them roughly low, low, medium, high. Every account is £620 today.
HISTORY = {
    "priya": [(61500, 3500, 61500, 0, 49000), (60500, 3500, 60500, 0, 50500), (61000, 3500, 61000, 0, 48000),
              (59000, 3500, 59000, 0, 51000), (60000, 3500, 60000, 0, 49500), (58000, 3500, 58000, 0, 50000)],
    "sam":   [(64000, 3500, 9000, 0, 52000), (66500, 3500, 9000, 0, 51000), (68000, 3500, 8000, 0, 53000),
              (70000, 3500, 8000, 0, 50500), (71500, 3500, 7000, 0, 52500), (73000, 3500, 7000, 0, 51500)],
    "amara": [(58000, 3500, 3500, 0, 43000), (57000, 3500, 6000, 0, 41500), (56000, 3500, 5000, 0, 42000),
              (51500, 3500, 5000, 2, 40000), (50000, 3500, 6000, 0, 41000), (49000, 3500, 6000, 0, 40500)],
    "alex":  [(55000, 3500, 3500, 3, 34000), (49000, 3500, 3500, 0, 33000), (44000, 3500, 3500, 6, 32500),
              (41000, 3500, 3500, 0, 31000), (39500, 3500, 5000, 0, 30500), (38000, 3500, 5000, 0, 31000)],
}


def seed_history(conn) -> None:
    for persona, months in HISTORY.items():
        for months_ago, (balance, minimum, paid, late, spend) in enumerate(months, start=1):
            conn.execute(
                """INSERT INTO statement_history (persona, months_ago, statement_balance_pence, minimum_pence,
                       paid_pence, days_late, spend_pence) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (persona, months_ago, balance, minimum, paid, late, spend),
            )
    conn.commit()


def _ago(today: date, hours: int) -> str:
    noon = datetime.combine(today, time(12, 0), tzinfo=timezone.utc)
    return (noon - timedelta(hours=hours)).isoformat()


def seed_support(conn, today: date) -> None:
    """Needs profiles and a starting support queue, so the staff console has something to show."""
    from app import support  # imported here to avoid a circular import

    for persona, needs in NEEDS.items():
        support.save_needs(conn, persona, NeedsProfileUpdate(**needs), when=_ago(today, 24 * 7))
    for persona, topic, message, channel, status, hours, replies in REQUESTS:
        request = support.create_request(conn, persona, topic, message, channel, when=_ago(today, hours))
        for author, text, reply_channel, reply_hours in replies:
            support._add_message(conn, request["id"], author, text, reply_channel,
                                 None if author == "customer" else support.DEMO_STAFF_NAME,
                                 when=_ago(today, reply_hours))
        conn.execute("UPDATE support_requests SET status = ? WHERE id = ?", (status, request["id"]))
    conn.commit()


def transaction_rows(today: date) -> list[tuple]:
    """(id, merchant, pence, ISO date, status) for every demo transaction."""
    first_of_month = today.replace(day=1)
    rows = []
    for tx_id, merchant, pence, days_ago, status in THIS_MONTH:
        when = max(first_of_month, today - timedelta(days=days_ago))
        rows.append((tx_id, merchant, pence, when.isoformat(), status))
    for tx_id, merchant, pence, days_before, status in LAST_MONTH:
        when = first_of_month - timedelta(days=days_before)
        rows.append((tx_id, merchant, pence, when.isoformat(), status))
    return rows


def seed(conn, today: date | None = None) -> None:
    """Wipe everything and insert the demo data."""
    today = today or date.today()

    for table in reversed(TABLES):  # children before parents because of foreign keys
        conn.execute(f"DROP TABLE IF EXISTS {table}")
    create_tables(conn)

    for persona in PERSONAS:
        mock = load_mock(f"me_{persona}")  # reuse the needs profile from the mock files
        conn.execute(
            """INSERT INTO users (persona, display_name, settings_json, credit_limit_pence,
                   balance_pence, apr_basis_points, due_date, monthly_limit_pence, card_paused_until)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)""",
            (
                persona,
                mock["display_name"],
                json.dumps(mock["settings"]),
                ACCOUNT["credit_limit_pence"],
                ACCOUNT["balance_pence"],
                ACCOUNT["apr_basis_points"],
                (today + timedelta(days=DUE_IN_DAYS)).isoformat(),
                MONTHLY_LIMIT_PENCE[persona],
            ),
        )
        for tx_id, merchant, pence, when, status in transaction_rows(today):
            conn.execute(
                "INSERT INTO transactions (persona, id, merchant, amount_pence, date, status) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (persona, tx_id, merchant, pence, when, status),
            )

    conn.commit()
    seed_support(conn, today)
    seed_history(conn)


if __name__ == "__main__":
    connection = connect()
    seed(connection)
    connection.close()
    print(f"Seeded {len(PERSONAS)} personas: {', '.join(PERSONAS)}.")
