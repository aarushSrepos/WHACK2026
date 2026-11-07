"""Checks the routes that read the real SQLite database.

Each test gets its own empty database file, so nothing touches your real spendsense.db.
"""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.db import connect, create_tables
from app.main import app
from app.seed import seed

client = TestClient(app)


@pytest.fixture(autouse=True)
def live_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MOCK", "1")
    monkeypatch.setenv("LIVE_ROUTES", "me,transactions,demo_reset")
    monkeypatch.delenv("ENABLE_DEMO_ROUTES", raising=False)


def persona(name: str) -> dict:
    return {"X-Persona": name}


def test_first_request_seeds_the_database():
    body = client.get("/me", headers=persona("priya")).json()
    assert body["display_name"] == "Priya"


def test_me_figures_for_priya():
    body = client.get("/me", headers=persona("priya")).json()
    account = body["account"]
    assert account["balance_pence"] == 62000
    assert account["available_credit_pence"] == 88000
    assert account["utilisation_percent"] == 41.3
    assert account["minimum_payment_pence"] == 3500
    assert account["interest_estimate_pence"] == 1287
    assert account["card_paused_until"] is None
    assert body["spending"] == {
        "monthly_limit_pence": 40000,
        "spent_this_month_pence": 31000,
        "percent_used": 77.5,
    }
    assert body["settings"]["font"] == "dyslexia_friendly"


def test_due_date_is_five_days_from_today():
    due = client.get("/me", headers=persona("priya")).json()["account"]["due_date"]
    assert due == (date.today() + timedelta(days=5)).isoformat()


def test_sam_has_no_spending_limit():
    spending = client.get("/me", headers=persona("sam")).json()["spending"]
    assert spending["monthly_limit_pence"] is None
    assert spending["percent_used"] is None


def test_transactions_newest_first_and_include_the_odd_charge():
    items = client.get("/transactions", headers=persona("amara")).json()["transactions"]
    assert len(items) == 10
    dates = [t["date"] for t in items]
    assert dates == sorted(dates, reverse=True)
    assert dates[0] == (date.today() - timedelta(days=1)).isoformat()
    odd = next(t for t in items if t["id"] == "tx_042")
    assert odd["merchant"] == "ONLINE*MRKT 4471"
    assert odd["amount_pence"] == 4200


def test_personas_do_not_see_each_others_rows():
    conn = connect()
    create_tables(conn)
    seed(conn)
    conn.execute("UPDATE users SET balance_pence = 99999 WHERE persona = 'sam'")
    conn.commit()
    conn.close()
    assert client.get("/me", headers=persona("sam")).json()["account"]["balance_pence"] == 99999
    assert client.get("/me", headers=persona("priya")).json()["account"]["balance_pence"] == 62000


def test_demo_reset_restores_the_starting_data():
    client.get("/me")  # make sure the database exists
    conn = connect()
    conn.execute("UPDATE users SET balance_pence = 1")
    conn.execute("DELETE FROM transactions")
    conn.commit()
    conn.close()

    assert client.post("/demo/reset").json()["ok"] is True

    assert client.get("/me").json()["account"]["balance_pence"] == 62000
    assert len(client.get("/transactions").json()["transactions"]) == 10


def test_seeding_twice_does_not_duplicate_rows():
    conn = connect()
    seed(conn)
    seed(conn)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 3
    assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 30
    conn.close()


def test_routes_not_in_live_routes_still_return_mocks():
    r = client.post("/ask", json={"question": "Why is my bill higher?"})
    assert r.status_code == 200
    assert r.json()["proposed_action"] is None
