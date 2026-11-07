"""Checks "tell us once" and the staff console: consent, contact rules and the support queue.

Each test gets its own empty database file (seeded on first request). No test calls the real Claude API.
"""
import pytest
from fastapi.testclient import TestClient

from ai import AnswerCache
from app import ai_glue
from app.main import app

client = TestClient(app)
STAFF = {"X-Staff": "demo-agent"}


@pytest.fixture(autouse=True)
def live_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MOCK", "0")
    monkeypatch.delenv("LIVE_ROUTES", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(ai_glue, "CACHE", AnswerCache())


def who(name: str) -> dict:
    return {"X-Persona": name}


def needs(persona: str) -> dict:
    return client.get("/me/needs", headers=who(persona)).json()


def staff_view(persona: str) -> dict:
    return client.get(f"/staff/customers/{persona}", headers=STAFF).json()


# ---------- needs profile ----------

def test_seeded_profiles():
    sam = needs("sam")
    assert sam["channels"] == ["app", "email", "text"] and sam["preferred_channel"] == "text"
    assert sam["share_with_staff"] is True
    assert needs("priya")["share_with_staff"] is False


def test_save_profile_always_keeps_in_app_messages():
    r = client.put("/me/needs", headers=who("amara"), json={"channels": ["email"], "preferred_channel": "email"})
    assert r.status_code == 200
    assert r.json()["channels"] == ["app", "email"] and r.json()["updated_at"]


def test_preferred_channel_must_be_allowed():
    r = client.put("/me/needs", headers=who("amara"), json={"channels": ["email"], "preferred_channel": "phone"})
    assert r.status_code == 422


# ---------- consent ----------

def test_staff_see_nothing_until_the_customer_shares():
    view = staff_view("priya")
    assert view["needs_shared"] is False and view["needs"] is None and view["guidance"] == []

    profile = needs("priya")
    profile["share_with_staff"] = True
    client.put("/me/needs", headers=who("priya"), json=profile)

    view = staff_view("priya")
    assert view["needs_shared"] is True and view["needs"]["letter_format"] == "easy_read"
    texts = " ".join(g["text"] for g in view["guidance"])
    assert "Easy Read" in texts and "extra time" in texts


def test_withdrawing_consent_hides_it_again():
    profile = needs("sam")
    profile["share_with_staff"] = False
    client.put("/me/needs", headers=who("sam"), json=profile)
    assert staff_view("sam")["needs"] is None


def test_guidance_for_sam_says_do_not_phone():
    kinds = {g["kind"]: g["text"] for g in staff_view("sam")["guidance"]}
    assert kinds["contact"].startswith("Contact by text message first")
    assert "Do not phone Sam" in kinds["no_phone"]
    assert "Relay UK" in kinds["calls"]


# ---------- contact rules ----------

def test_staff_cannot_phone_someone_who_asked_not_to_be_phoned():
    alex_request = client.get("/support/requests", headers=who("alex")).json()["requests"][0]
    r = client.post(f"/staff/requests/{alex_request['id']}/messages", headers=STAFF,
                    json={"text": "Can I give you a call?", "channel": "phone"})
    assert r.status_code == 409 and "Alex has asked not to be contacted by phone call" in r.json()["detail"]


def test_rule_holds_even_when_details_are_not_shared():
    profile = needs("alex")
    profile["share_with_staff"] = False
    client.put("/me/needs", headers=who("alex"), json=profile)
    view = staff_view("alex")
    assert view["needs"] is None and "phone" not in view["allowed_channels"]
    request_id = view["requests"][0]["id"]
    r = client.post(f"/staff/requests/{request_id}/messages", headers=STAFF, json={"text": "Hi", "channel": "phone"})
    assert r.status_code == 409


def test_customer_cannot_ask_for_a_blocked_channel():
    r = client.post("/support/requests", headers=who("sam"), json={"topic": "something_else", "channel": "phone"})
    assert r.status_code == 400 and "phone call" in r.json()["detail"]


# ---------- the support journey ----------

def test_full_journey_customer_to_staff_and_back():
    r = client.post("/support/requests", headers=who("amara"),
                    json={"topic": "struggling_to_pay", "message": "Money is tight this month", "channel": "email"})
    assert r.status_code == 200
    request = r.json()
    assert request["status"] == "open" and request["topic_label"] == "Finding it hard to pay"

    queue = client.get("/staff/requests", headers=STAFF).json()["requests"]
    assert any(q["id"] == request["id"] and q["display_name"] == "Amara" for q in queue)

    client.post(f"/staff/requests/{request['id']}/messages", headers=STAFF,
                json={"text": "Agreed a plan, check in next week", "internal": True})
    reply = client.post(f"/staff/requests/{request['id']}/messages", headers=STAFF,
                        json={"text": "Hi Amara, we can help. Here are your options.", "channel": "email"})
    assert reply.status_code == 200 and reply.json()["status"] == "in_progress"

    # The customer sees the reply but never the staff-only note.
    mine = client.get("/support/requests", headers=who("amara")).json()["requests"][0]
    assert [m["author"] for m in mine["messages"]] == ["staff"]
    assert mine["messages"][0]["channel"] == "email"
    # Staff see both.
    staff_messages = staff_view("amara")["requests"][0]["messages"]
    assert {m["author"] for m in staff_messages} == {"staff", "note"}

    done = client.patch(f"/staff/requests/{request['id']}", headers=STAFF, json={"status": "resolved"})
    assert done.json()["status"] == "resolved"
    # A customer reply re-opens it.
    again = client.post(f"/support/requests/{request['id']}/messages", headers=who("amara"), json={"text": "Thanks, one more question"})
    assert again.json()["status"] == "open"


def test_customers_cannot_see_each_others_requests():
    alex_id = client.get("/support/requests", headers=who("alex")).json()["requests"][0]["id"]
    r = client.post(f"/support/requests/{alex_id}/messages", headers=who("sam"), json={"text": "hi"})
    assert r.status_code == 404


def test_queue_lists_open_first():
    statuses = [q["status"] for q in client.get("/staff/requests", headers=STAFF).json()["requests"]]
    assert statuses == sorted(statuses, key=["open", "in_progress", "resolved"].index)
    assert client.get("/staff/requests?status=open", headers=STAFF).json()["requests"][0]["display_name"] == "Alex"


def test_staff_routes_need_staff_header():
    assert client.get("/staff/requests").status_code == 401
    assert client.get("/staff/customers/sam", headers={"X-Staff": "guess"}).status_code == 401


def test_ask_offers_support_when_customer_is_struggling():
    r = client.post("/ask", headers=who("sam"), json={"question": "I can't pay this month", "format": "simple"})
    assert r.json()["support_offer"] is True and r.json()["proposed_action"] is None
    r = client.post("/ask", headers=who("sam"), json={"question": "When is my payment due?", "format": "simple"})
    assert r.json()["support_offer"] is False


def test_reset_restores_the_queue():
    client.post("/support/requests", headers=who("amara"), json={"topic": "something_else", "channel": "app"})
    client.post("/demo/reset")
    assert len(client.get("/staff/requests", headers=STAFF).json()["requests"]) == 2
