"""Fills the database with the three demo personas (person B owns this file).

    cd backend
    python -m app.seed

Running it again wipes the database and starts fresh. That is also what POST /demo/reset does.
Dates are worked out from today, so "payment due in five days" is true on demo day.
"""
import json
from datetime import date, timedelta

from app.db import TABLES, connect, create_tables
from app.mock_data import load_mock

PERSONAS = ["priya", "sam", "amara"]

# Same account for everyone, so the demo story is identical for every persona.
ACCOUNT = {
    "credit_limit_pence": 150000,
    "balance_pence": 62000,
    "apr_basis_points": 2490,
    "minimum_payment_pence": 3500,
}
DUE_IN_DAYS = 5

# Only Priya has set a spending limit (£400). Sam and Amara have none.
MONTHLY_LIMIT_PENCE = {"priya": 40000, "sam": None, "amara": None}

# (id, merchant, amount in pence, days ago, status). Together they add up to £310.00,
# which is 77.5% of Priya's £400 limit. tx_042 is the charge nobody recognises.
TRANSACTIONS = [
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
                   balance_pence, apr_basis_points, minimum_payment_pence, due_date,
                   monthly_limit_pence, card_paused_until)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)""",
            (
                persona,
                mock["display_name"],
                json.dumps(mock["settings"]),
                ACCOUNT["credit_limit_pence"],
                ACCOUNT["balance_pence"],
                ACCOUNT["apr_basis_points"],
                ACCOUNT["minimum_payment_pence"],
                (today + timedelta(days=DUE_IN_DAYS)).isoformat(),
                MONTHLY_LIMIT_PENCE[persona],
            ),
        )
        for tx_id, merchant, amount, days_ago, status in TRANSACTIONS:
            conn.execute(
                "INSERT INTO transactions (persona, id, merchant, amount_pence, date, status) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (persona, tx_id, merchant, amount, (today - timedelta(days=days_ago)).isoformat(), status),
            )

    conn.commit()


if __name__ == "__main__":
    connection = connect()
    seed(connection)
    connection.close()
    print("Seeded 3 personas: priya, sam, amara.")
