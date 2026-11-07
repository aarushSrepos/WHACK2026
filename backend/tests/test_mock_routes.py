"""Checks that every route works in mock mode and that the mock JSON matches schemas.py.

Run from the backend/ folder:  pytest
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "unused.db"))  # never touch the real .db
    monkeypatch.setenv("MOCK", "1")
    monkeypatch.delenv("LIVE_ROUTES", raising=False)
    monkeypatch.delenv("ENABLE_DEMO_ROUTES", raising=False)


def as_persona(name: str) -> dict:
    return {"X-Persona": name}


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["mock"] is True


@pytest.mark.parametrize("persona", ["priya", "sam", "amara"])
def test_me_for_each_persona(persona):
    r = client.get("/me", headers=as_persona(persona))
    assert r.status_code == 200
    body = r.json()
    assert body["persona"] == persona
    assert body["label"] == "Simulated demo data"
    assert isinstance(body["account"]["minimum_payment_pence"], int)


def test_me_defaults_to_priya():
    assert client.get("/me").json()["persona"] == "priya"


def test_unknown_persona_is_rejected():
    r = client.get("/me", headers=as_persona("nobody"))
    assert r.status_code == 400


def test_priya_has_her_needs_profile():
    settings = client.get("/me", headers=as_persona("priya")).json()["settings"]
    assert settings["font"] == "dyslexia_friendly"
    assert settings["reading_level"] == "plain"


def test_update_settings_changes_the_response():
    r = client.put(
        "/me/settings",
        headers=as_persona("sam"),
        json={"settings": {"text_size": "extra_large"}, "monthly_limit_pence": 20000},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["settings"]["text_size"] == "extra_large"
    assert body["spending"]["monthly_limit_pence"] == 20000
    assert body["spending"]["percent_used"] == 155.0  # 31000 spent of 20000


def test_update_settings_rejects_a_negative_limit():
    r = client.put("/me/settings", json={"monthly_limit_pence": -5})
    assert r.status_code == 422


def test_transactions_include_the_unrecognised_charge():
    r = client.get("/transactions")
    assert r.status_code == 200
    charge = next(t for t in r.json()["transactions"] if t["id"] == "tx_042")
    assert charge["amount_pence"] == 4200


@pytest.mark.parametrize(
    "question, expects_action",
    [
        ("Why is my bill higher this month?", None),
        ("I don't recognise the 42 pound charge", "dispute"),
        ("Please pay the minimum", "pay"),
    ],
)
def test_ask(question, expects_action):
    r = client.post("/ask", json={"question": question})
    assert r.status_code == 200
    body = r.json()
    assert body["verified"] is True
    assert len(body["figures"]) >= 1
    action = body["proposed_action"]
    assert (action["type"] if action else None) == expects_action


def test_ask_echoes_the_requested_format():
    r = client.post("/ask", json={"question": "Explain my bill", "format": "detailed"})
    assert r.json()["format"] == "detailed"


def test_ask_rejects_an_empty_question():
    assert client.post("/ask", json={"question": ""}).status_code == 422


@pytest.mark.parametrize("kind", ["pay", "dispute", "pause_card", "unpause_card"])
def test_propose_then_confirm(kind):
    body = {"type": kind}
    if kind == "dispute":
        body["transaction_id"] = "tx_042"
    proposed = client.post("/actions", json=body)
    assert proposed.status_code == 200
    action = proposed.json()
    assert action["type"] == kind
    assert action["read_back"]

    done = client.post(f"/actions/{action['action_id']}/confirm")
    assert done.status_code == 200
    assert done.json()["status"] == "done"
    assert done.json()["simulated"] is True


def test_dispute_needs_a_transaction_id():
    r = client.post("/actions", json={"type": "dispute"})
    assert r.status_code == 422


def test_confirm_unknown_action_is_404():
    assert client.post("/actions/not-a-real-id/confirm").status_code == 404


def test_demo_routes():
    spend = client.post("/demo/spend", json={"merchant": "Test Shop", "amount_pence": 1500})
    assert spend.status_code == 200
    assert spend.json()["threshold_crossed"] == 80
    assert client.post("/demo/reset").json()["ok"] is True


def test_demo_routes_can_be_switched_off(monkeypatch):
    monkeypatch.setenv("ENABLE_DEMO_ROUTES", "0")
    assert client.post("/demo/reset").status_code == 404


def test_real_mode_says_501_until_a_route_is_built(monkeypatch):
    # /ask is not built yet. When you build a route, move this check to one that still is unbuilt.
    monkeypatch.setenv("MOCK", "0")
    r = client.post("/ask", json={"question": "Why is my bill higher?"})
    assert r.status_code == 501
    assert "not built yet" in r.json()["detail"]


def test_live_routes_override_mock_mode(monkeypatch):
    monkeypatch.setenv("LIVE_ROUTES", "ask")
    assert client.post("/ask", json={"question": "hello"}).status_code == 501  # live, not built yet
    assert client.get("/transactions").status_code == 200  # still mock


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:3000", "https://my-space-abc123-3000.app.github.dev"],
)
def test_cors_allows_the_frontend(origin):
    r = client.options(
        "/me",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-persona",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == origin
