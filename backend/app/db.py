"""SQLite connection and table definitions (person B owns this file).

Money is whole pence in INTEGER columns. Dates are ISO text ("2026-11-12").
There is no ORM on purpose: plain SQL is easy to read and easy to debug.
"""
import sqlite3
from contextlib import contextmanager

from app.config import database_path

TABLES = ["users", "transactions", "disputes", "payments", "pending_actions", "needs_profiles", "support_requests", "support_messages", "statement_history"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    persona                TEXT PRIMARY KEY,          -- priya, sam, amara, alex
    display_name           TEXT NOT NULL,
    settings_json          TEXT NOT NULL,             -- the needs profile, as JSON
    credit_limit_pence     INTEGER NOT NULL,
    balance_pence          INTEGER NOT NULL,
    apr_basis_points       INTEGER NOT NULL,          -- 2490 = 24.90%
    due_date              TEXT NOT NULL,
    monthly_limit_pence    INTEGER,                   -- the customer's own limit, NULL = none
    card_paused_until      TEXT                       -- ISO datetime, NULL = card is on
);

CREATE TABLE IF NOT EXISTS transactions (
    persona       TEXT NOT NULL REFERENCES users(persona),
    id            TEXT NOT NULL,
    merchant      TEXT NOT NULL,
    amount_pence  INTEGER NOT NULL,
    date          TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('posted', 'pending', 'disputed')),
    PRIMARY KEY (persona, id)
);

CREATE TABLE IF NOT EXISTS disputes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    persona         TEXT NOT NULL REFERENCES users(persona),
    transaction_id  TEXT NOT NULL,
    reason          TEXT,
    status          TEXT NOT NULL,
    case_summary    TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    persona       TEXT NOT NULL REFERENCES users(persona),
    amount_pence  INTEGER NOT NULL,
    status        TEXT NOT NULL,                      -- always simulated
    created_at    TEXT NOT NULL
);

-- A proposed pay / dispute / pause waiting for the customer to confirm.
CREATE TABLE IF NOT EXISTS pending_actions (
    id            TEXT PRIMARY KEY,
    persona       TEXT NOT NULL REFERENCES users(persona),
    type          TEXT NOT NULL,                      -- pay, dispute, pause_card, unpause_card
    details_json  TEXT NOT NULL,                      -- amount, transaction id, ... saved at propose time
    read_back     TEXT NOT NULL,
    status        TEXT NOT NULL,                      -- waiting, done, cancelled
    result_json   TEXT,                               -- what confirm returned, so a second confirm repeats it
    created_at    TEXT NOT NULL
);

-- "Tell us once": how the customer wants to be contacted and supported.
CREATE TABLE IF NOT EXISTS needs_profiles (
    persona           TEXT PRIMARY KEY REFERENCES users(persona),
    profile_json      TEXT NOT NULL,                  -- channels, letter format, call adjustments, ...
    share_with_staff  INTEGER NOT NULL DEFAULT 0,     -- 1 = staff may see the details
    updated_at        TEXT NOT NULL
);

-- A customer asking a person for help. Staff work through these in the staff console.
CREATE TABLE IF NOT EXISTS support_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    persona     TEXT NOT NULL REFERENCES users(persona),
    topic       TEXT NOT NULL,
    message     TEXT,
    channel     TEXT NOT NULL,                        -- how the customer asked us to reply
    status      TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved')),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Past monthly statements: what the missed-payment model learns a customer's pattern from.
CREATE TABLE IF NOT EXISTS statement_history (
    persona                  TEXT NOT NULL REFERENCES users(persona),
    months_ago               INTEGER NOT NULL,        -- 1 = last statement
    statement_balance_pence  INTEGER NOT NULL,
    minimum_pence            INTEGER NOT NULL,
    paid_pence               INTEGER NOT NULL,
    days_late                INTEGER NOT NULL,        -- 0 = paid on time
    spend_pence              INTEGER NOT NULL,        -- spending that month
    PRIMARY KEY (persona, months_ago)
);

-- Replies on a request. author 'note' is staff-only and never shown to the customer.
CREATE TABLE IF NOT EXISTS support_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id  INTEGER NOT NULL REFERENCES support_requests(id),
    author      TEXT NOT NULL CHECK (author IN ('customer', 'staff', 'note')),
    text        TEXT NOT NULL,
    channel     TEXT,
    staff_name  TEXT,
    created_at  TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    """Open the database file (it is created if missing). Rows act like dicts."""
    conn = sqlite3.connect(database_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def create_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)


@contextmanager
def db():
    """Use in a route:  with db() as conn: ...

    Makes sure the tables exist and the demo personas are seeded (first run only),
    and always closes the connection afterwards.
    """
    conn = connect()
    try:
        create_tables(conn)
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            from app.seed import seed  # imported here to avoid a circular import

            seed(conn)
        yield conn
    finally:
        conn.close()
