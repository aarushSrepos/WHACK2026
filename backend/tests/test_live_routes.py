"""Checks the routes that read the real SQLite database and use C's engine and AI layer.

Each test gets its own empty database file, so nothing touches your real spendsense.db.
No test calls the real Claude API: with no ANTHROPIC_API_KEY, /ask uses its template answers.
"""
import json
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from ai import AnswerCache
from app import ai_glue
from app.db import connect, create_tables
from app.main import app
from app.seed import seed

client = TestClient(app)


@pytest.fixture(autouse=True)
def live_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MOCK", "0")
    monkeypatch.delenv("LIVE_ROUTES", raising=False)
    monkeypatch.delenv("ENABLE_DEMO_ROUTES", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(ai_glue, "CACHE", AnswerCache())  # a fresh cache for every test


def persona(name: str) -> dict:
    return {"X-Persona": name}


def first_of_month() -> date:
    return date.today().replace(day=1)


def ask(question: str, who: str = "priya", level: str = "simple") -> dict:
    r = client.post("/ask", json={"question": question, "format": level}, headers=persona(who))
    assert r.status_code == 200, r.text
    return r.json()


def pending_rows() -> list:
    conn = connect()
    rows = conn.execute("SELECT * FROM pending_actions").fetchall()
    conn.close()
    return rows


# ---------- /me ----------

def test_first_request_seeds_the_database():
    body = client.get("/me", headers=persona("priya")).json()
    assert body["display_name"] == "Priya"


def test_me_figures_for_priya():
    body = client.get("/me", headers=persona("priya")).json()
    account = body["account"]
    assert account["balance_pence"] == 62000
    assert account["available_credit_pence"] == 88000
    assert account["utilisation_percent"] == 41
    assert account["minimum_payment_pence"] == 3500  # worked out by the engine, not stored
    assert account["interest_estimate_pence"] == 1287
    assert account["card_paused_until"] is None
    assert body["spending"] == {
        "monthly_limit_pence": 40000,
        "spent_this_month_pence": 31000,
        "percent_used": 77,
    }
    assert body["settings"]["font"] == "dyslexia_friendly"


def test_due_date_is_five_days_from_today():
    due = client.get("/me", headers=persona("priya")).json()["account"]["due_date"]
    assert due == (date.today() + timedelta(days=5)).isoformat()


def test_sam_has_no_spending_limit():
    spending = client.get("/me", headers=persona("sam")).json()["spending"]
    assert spending["monthly_limit_pence"] is None
    assert spending["percent_used"] is None


# ---------- /transactions ----------

def test_transactions_cover_this_month_and_last_month():
    items = client.get("/transactions", headers=persona("amara")).json()["transactions"]
    assert len(items) == 18
    dates = [t["date"] for t in items]
    assert dates == sorted(dates, reverse=True)  # newest first
    this_month = [t for t in items if date.fromisoformat(t["date"]) >= first_of_month()]
    last_month = [t for t in items if date.fromisoformat(t["date"]) < first_of_month()]
    assert sum(t["amount_pence"] for t in this_month) == 31000
    assert sum(t["amount_pence"] for t in last_month) == 18600
    assert all(date.fromisoformat(t["date"]) <= date.today() for t in items)


def test_the_unrecognised_charge_is_there():
    items = client.get("/transactions").json()["transactions"]
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


# ---------- seeding and reset ----------

def test_demo_reset_restores_the_starting_data():
    client.get("/me")  # make sure the database exists
    conn = connect()
    conn.execute("UPDATE users SET balance_pence = 1")
    conn.execute("DELETE FROM transactions")
    conn.commit()
    conn.close()

    assert client.post("/demo/reset").json()["ok"] is True

    assert client.get("/me").json()["account"]["balance_pence"] == 62000
    assert len(client.get("/transactions").json()["transactions"]) == 18


def test_seeding_twice_does_not_duplicate_rows():
    conn = connect()
    seed(conn)
    seed(conn)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 4
    assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 72  # 18 per persona
    conn.close()


@pytest.mark.parametrize("today", [date(2026, 1, 1), date(2026, 3, 1), date(2026, 3, 31), date(2026, 12, 15)])
def test_seed_keeps_the_same_totals_on_any_day_of_the_month(today):
    """On the 1st of a month, 'days ago' dates are clamped so the totals do not change."""
    from engine import credit
    from app.queries import load_engine_inputs

    conn = connect()
    seed(conn, today=today)
    _, txs = load_engine_inputs(conn, "priya")
    conn.close()
    last_year, last_month = credit.previous_month(today.year, today.month)
    assert credit.month_spend_pence(txs, today.year, today.month) == 31000
    assert credit.month_spend_pence(txs, last_year, last_month) == 18600
    assert all(t.date <= today for t in txs)


# ---------- /ask (C's AI layer, template mode: no API key) ----------

def test_ask_explains_the_bill_from_engine_figures():
    body = ask("Why is my bill higher this month?")
    assert body["verified"] is True
    assert body["badge"] == "Standard explanation"  # no API key, so the template answer
    assert body["proposed_action"] is None
    ids = {f["id"]: f for f in body["figures"]}
    assert ids["month_spend"]["value_pence"] == 31000
    assert ids["month_spend"]["display"] == "£310.00"
    assert ids["month_spend"]["kind"] == "pence"
    assert "£310.00" in body["answer"]


def test_ask_dispute_saves_a_waiting_action():
    body = ask("I don't recognise the 42 pound charge", who="sam")
    action = body["proposed_action"]
    assert action["type"] == "dispute"
    assert action["action_id"].startswith("act_")
    assert "£42.00" in action["read_back"] and "ONLINE*MRKT 4471" in action["read_back"]

    (row,) = pending_rows()
    assert row["id"] == action["action_id"]
    assert row["persona"] == "sam"
    assert row["status"] == "waiting"
    assert row["type"] == "dispute"
    assert json.loads(row["details_json"])["transaction_id"] == "tx_042"


def test_ask_pay_minimum_saves_the_amount_server_side():
    action = ask("Pay the minimum")["proposed_action"]
    assert action["type"] == "pay"
    assert "£35.00" in action["read_back"]
    (row,) = pending_rows()
    assert json.loads(row["details_json"]) == {"amount_pence": 3500, "kind": "minimum"}


def test_ask_pause_card_uses_the_api_name():
    action = ask("Please pause my card")["proposed_action"]
    assert action["type"] == "pause_card"  # C's layer says "pause"; the contract says "pause_card"
    (row,) = pending_rows()
    assert json.loads(row["details_json"]) == {"hours": 24}


def test_ask_percent_and_days_figures_match_the_schema():
    body = ask("When is my payment due?")
    days = next(f for f in body["figures"] if f["id"] == "days_until_due")
    assert days["kind"] == "days" and days["value_days"] == 5 and days["display"] == "5 days"
    body = ask("How much have I spent against my limit?")
    progress = next(f for f in body["figures"] if f["id"] == "limit_progress")
    assert progress["kind"] == "percent" and progress["value_percent"] == 77.0


def test_ask_without_an_api_key_never_calls_claude():
    assert ai_glue.get_llm() is None


def test_ask_with_an_api_key_builds_a_claude_caller(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-real")
    monkeypatch.setattr(ai_glue, "claude_llm", lambda: (lambda system, user: "{}"))  # no package or network needed
    assert callable(ai_glue.get_llm())


def test_missing_claude_package_warns_once_and_falls_back(monkeypatch, caplog):
    def broken():
        raise ModuleNotFoundError("No module named 'anthropic'")

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-real")
    monkeypatch.setattr(ai_glue, "claude_llm", broken)
    monkeypatch.setattr(ai_glue, "_warned_about_claude", False)
    with caplog.at_level("WARNING", logger="spendsense"):
        assert ai_glue.get_llm() is None
        assert ai_glue.get_llm() is None
    warnings = [r for r in caplog.records if "pip install -r requirements.txt" in r.getMessage()]
    assert len(warnings) == 1


def test_good_ai_answer_is_shown_as_verified(monkeypatch):
    def fake_llm(system, user):
        return json.dumps({"text": "Your balance is £620.00.", "figure_ids": ["balance"], "action": None})

    monkeypatch.setattr(ai_glue, "get_llm", lambda: fake_llm)
    body = ask("Why is my bill higher this month?")
    assert body["answer"] == "Your balance is £620.00."
    assert body["badge"] == "Verified figures"
    assert body["verified"] is True


def test_ai_answer_with_a_made_up_number_is_replaced(monkeypatch):
    calls = []

    def lying_llm(system, user):
        calls.append(1)
        return json.dumps({"text": "Your balance is £999.00.", "figure_ids": ["balance"], "action": None})

    monkeypatch.setattr(ai_glue, "get_llm", lambda: lying_llm)
    body = ask("Why is my bill higher this month?")
    assert len(calls) == 2  # the first try plus one retry
    assert "999" not in body["answer"]
    assert body["badge"] == "Standard explanation"
    assert body["verified"] is True


def test_ai_cannot_invent_an_action(monkeypatch):
    def sneaky_llm(system, user):
        return json.dumps({"text": "Your balance is £620.00.", "figure_ids": ["balance"],
                           "action": {"type": "pay", "amount_figure_id": "balance"}})

    monkeypatch.setattr(ai_glue, "get_llm", lambda: sneaky_llm)
    body = ask("Why is my bill higher this month?")  # a question about the bill, not a request to pay
    assert body["proposed_action"] is None
    assert pending_rows() == []

