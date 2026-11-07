"""Checks propose -> confirm, settings and the demo helpers against the real database.

Each test gets its own empty database file. No test calls the real Claude API.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from ai import AnswerCache
from app import ai_glue
from app.db import connect
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def live_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MOCK", "0")
    monkeypatch.delenv("LIVE_ROUTES", raising=False)
    monkeypatch.delenv("ENABLE_DEMO_ROUTES", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(ai_glue, "CACHE", AnswerCache())


def who(name: str = "priya") -> dict:
    return {"X-Persona": name}


def propose(body: dict, persona: str = "priya"):
    return client.post("/actions", json=body, headers=who(persona))


def confirm(action_id: str, persona: str = "priya"):
    return client.post(f"/actions/{action_id}/confirm", headers=who(persona))


def me(persona: str = "priya") -> dict:
    return client.get("/me", headers=who(persona)).json()


def sql(query: str, args=()):
    conn = connect()
    rows = conn.execute(query, args).fetchall()
    conn.close()
    return rows


def run(query: str, args=()):
    conn = connect()
    conn.execute(query, args)
    conn.commit()
    conn.close()


# ---------- propose ----------

def test_propose_pay_minimum_by_default():
    r = propose({"type": "pay"})
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "pay"
    assert body["action_id"].startswith("act_")
    assert "£35.00" in body["read_back"]
    assert sql("SELECT status FROM pending_actions")[0]["status"] == "waiting"
    assert me()["account"]["balance_pence"] == 62000  # proposing moves no money


def test_propose_pay_custom_amount():
    r = propose({"type": "pay", "amount_pence": 10000})
    assert r.status_code == 200
    assert "£100.00" in r.json()["read_back"]


def test_propose_pay_more_than_the_balance_is_refused():
    assert propose({"type": "pay", "amount_pence": 99999999}).status_code == 400


def test_propose_pay_zero_is_a_validation_error():
    assert propose({"type": "pay", "amount_pence": 0}).status_code == 422


def test_propose_dispute_for_a_real_charge():
    r = propose({"type": "dispute", "transaction_id": "tx_042", "reason": "Not mine"})
    assert r.status_code == 200
    assert r.json()["type"] == "dispute"
    assert "42.00" in r.json()["read_back"]


def test_propose_dispute_unknown_transaction():
    assert propose({"type": "dispute", "transaction_id": "tx_nope"}).status_code == 400


def test_propose_dispute_needs_a_transaction_id():
    assert propose({"type": "dispute"}).status_code == 422


# ---------- confirm: pay ----------

def test_confirm_pay_moves_the_balance_once():
    action = propose({"type": "pay"}).json()
    first = confirm(action["action_id"])
    assert first.status_code == 200
    body = first.json()
    assert body["status"] == "done" and body["type"] == "pay" and body["simulated"] is True
    assert body["reference"] == "SIM-PAY-0001"
    assert "£35.00" in body["summary"] and "£585.00" in body["summary"]
    assert me()["account"]["balance_pence"] == 58500
    assert len(sql("SELECT * FROM payments")) == 1

    second = confirm(action["action_id"])  # double tap
    assert second.status_code == 200
    assert second.json() == body
    assert me()["account"]["balance_pence"] == 58500
    assert len(sql("SELECT * FROM payments")) == 1


def test_confirm_ignores_anything_in_the_request_body():
    action = propose({"type": "pay"}).json()
    r = client.post(
        f"/actions/{action['action_id']}/confirm",
        headers=who(),
        json={"type": "pay", "amount_pence": 60000},
    )
    assert r.status_code == 200
    assert me()["account"]["balance_pence"] == 58500  # the saved £35, not the tampered £600


def test_confirm_unknown_action_is_404():
    assert confirm("act_doesnotexist").status_code == 404


def test_another_persona_cannot_confirm_my_action():
    action = propose({"type": "pay"}).json()
    assert confirm(action["action_id"], "sam").status_code == 404
    assert sql("SELECT status FROM pending_actions")[0]["status"] == "waiting"
    assert me("sam")["account"]["balance_pence"] == 62000
    assert me()["account"]["balance_pence"] == 62000


def test_confirm_pay_fails_if_the_balance_dropped_since():
    action = propose({"type": "pay", "amount_pence": 50000}).json()
    run("UPDATE users SET balance_pence = 1000 WHERE persona = 'priya'")
    assert confirm(action["action_id"]).status_code == 409
    assert sql("SELECT status FROM pending_actions")[0]["status"] == "waiting"
    assert len(sql("SELECT * FROM payments")) == 0


# ---------- confirm: dispute ----------

def test_confirm_dispute_marks_the_charge_and_keeps_spend():
    action = propose({"type": "dispute", "transaction_id": "tx_042"}).json()
    r = confirm(action["action_id"])
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "dispute" and body["reference"] == "SIM-CASE-0001"
    assert "do not need to phone" in body["summary"]
    status = sql("SELECT status FROM transactions WHERE persona='priya' AND id='tx_042'")[0]["status"]
    assert status == "disputed"
    assert len(sql("SELECT * FROM disputes")) == 1
    assert me()["spending"]["spent_this_month_pence"] == 31000

    again = propose({"type": "dispute", "transaction_id": "tx_042"})
    assert again.status_code == 400  # already disputed


def test_confirm_dispute_fails_if_charge_was_disputed_meanwhile():
    a = propose({"type": "dispute", "transaction_id": "tx_042"}).json()
    run("UPDATE transactions SET status='disputed' WHERE persona='priya' AND id='tx_042'")
    assert confirm(a["action_id"]).status_code == 409


# ---------- pause / unpause ----------

def test_pause_then_unpause():
    pause = propose({"type": "pause_card"})
    assert pause.status_code == 200
    done = confirm(pause.json()["action_id"])
    assert done.json()["type"] == "pause_card"
    until = me()["account"]["card_paused_until"]
    assert until is not None

    assert propose({"type": "pause_card"}).status_code == 409  # already paused

    unpause = propose({"type": "unpause_card"})
    assert unpause.status_code == 200
    assert confirm(unpause.json()["action_id"]).json()["type"] == "unpause_card"
    assert me()["account"]["card_paused_until"] is None
    assert propose({"type": "unpause_card"}).status_code == 409  # not paused


def test_an_expired_pause_is_not_shown():
    me()  # the first request creates and seeds the database
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    run("UPDATE users SET card_paused_until = ? WHERE persona='priya'", (past,))
    assert me()["account"]["card_paused_until"] is None


# ---------- /ask then confirm ----------

def test_ask_proposes_and_confirm_runs_it():
    r = client.post("/ask", json={"question": "I don't recognise the 42 pound charge"}, headers=who())
    action = r.json()["proposed_action"]
    assert action and action["type"] == "dispute"
    done = confirm(action["action_id"])
    assert done.status_code == 200
    assert done.json()["reference"].startswith("SIM-CASE-")


# ---------- demo spend ----------

def test_demo_spend_crosses_80_percent_with_a_check_in_message():
    r = client.post("/demo/spend", json={"merchant": "Test Shop", "amount_pence": 1500}, headers=who())
    assert r.status_code == 200
    body = r.json()
    assert body["threshold_crossed"] == 80
    assert body["spending"]["spent_this_month_pence"] == 32500
    assert body["message"]
    assert me()["account"]["balance_pence"] == 63500
    txs = client.get("/transactions", headers=who()).json()["transactions"]
    assert any(t["merchant"] == "Test Shop" for t in txs)


def test_demo_spend_crosses_100_percent():
    r = client.post("/demo/spend", json={"merchant": "Big Shop", "amount_pence": 10000}, headers=who())
    assert r.json()["threshold_crossed"] == 100


def test_demo_spend_below_the_threshold_has_no_message():
    r = client.post("/demo/spend", json={"merchant": "Tiny", "amount_pence": 100}, headers=who())
    assert r.json()["threshold_crossed"] is None
    assert r.json()["message"] is None


def test_demo_spend_for_someone_with_no_limit():
    r = client.post("/demo/spend", json={"merchant": "Shop", "amount_pence": 5000}, headers=who("sam"))
    assert r.status_code == 200
    assert r.json()["threshold_crossed"] is None


def test_demo_spend_is_declined_while_the_card_is_paused():
    confirm(propose({"type": "pause_card"}).json()["action_id"])
    r = client.post("/demo/spend", json={"merchant": "Shop", "amount_pence": 500}, headers=who())
    assert r.status_code == 409


def test_demo_spend_over_the_credit_limit_is_declined():
    r = client.post("/demo/spend", json={"merchant": "Yacht", "amount_pence": 90000}, headers=who())
    assert r.status_code == 409


def test_demo_routes_can_be_switched_off(monkeypatch):
    monkeypatch.setenv("ENABLE_DEMO_ROUTES", "0")
    assert client.post("/demo/spend", json={"merchant": "x", "amount_pence": 1}).status_code == 404


def test_reset_clears_actions_and_payments():
    confirm(propose({"type": "pay"}).json()["action_id"])
    assert client.post("/demo/reset").json()["ok"] is True
    assert sql("SELECT * FROM pending_actions") == []
    assert sql("SELECT * FROM payments") == []
    assert me()["account"]["balance_pence"] == 62000


# ---------- settings ----------

def test_settings_partial_update_is_saved():
    r = client.put("/me/settings", headers=who(), json={"settings": {"text_size": "extra_large"}})
    assert r.status_code == 200
    assert r.json()["settings"]["text_size"] == "extra_large"
    assert r.json()["settings"]["font"] == "dyslexia_friendly"
    assert me()["settings"]["text_size"] == "extra_large"


def test_set_a_limit_for_sam():
    r = client.put("/me/settings", headers=who("sam"), json={"monthly_limit_pence": 40000})
    assert r.status_code == 200
    assert r.json()["spending"]["monthly_limit_pence"] == 40000
    assert me("sam")["spending"]["monthly_limit_pence"] == 40000


def test_limit_must_be_below_the_credit_limit():
    r = client.put("/me/settings", headers=who(), json={"monthly_limit_pence": 150000})
    assert r.status_code == 400
    assert "£1,500.00" in r.json()["detail"]
    assert me()["spending"]["monthly_limit_pence"] == 40000


# ---------- everything is live ----------

@pytest.mark.parametrize(
    "method, path, body",
    [
        ("get", "/me", None),
        ("get", "/transactions", None),
        ("post", "/ask", {"question": "Explain my bill"}),
        ("post", "/actions", {"type": "pay"}),
        ("put", "/me/settings", {"monthly_limit_pence": 30000}),
        ("post", "/demo/spend", {"merchant": "Shop", "amount_pence": 100}),
        ("post", "/demo/reset", None),
    ],
)
def test_every_route_answers_in_default_mode(method, path, body):
    r = getattr(client, method)(path, headers=who(), **({"json": body} if body is not None else {}))
    assert r.status_code == 200, r.text
