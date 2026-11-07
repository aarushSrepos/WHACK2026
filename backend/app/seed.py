"""Fills the database with the three demo personas (person B owns this file).

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
from datetime import date, timedelta

from app.db import TABLES, connect, create_tables
from app.mock_data import load_mock

PERSONAS = ["priya", "sam", "amara"]

# Same account for everyone, so the demo story is identical for every persona.
# The minimum payment is not stored: C's engine works it out from the balance and APR.
ACCOUNT = {
    "credit_limit_pence": 150000,
    "balance_pence": 62000,
    "apr_basis_points": 2490,
}
DUE_IN_DAYS = 5

# Only Priya has set a spending limit (£400). Sam and Amara have none.
MONTHLY_LIMIT_PENCE = {"priya": 40000, "sam": None, "amara": None}

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


if __name__ == "__main__":
    connection = connect()
    seed(connection)
    connection.close()
    print("Seeded 3 personas: priya, sam, amara.")
