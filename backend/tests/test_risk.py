"""Checks the missed-payment model: the maths, the training, fairness, and the staff API."""
import math

import pytest
from fastapi.testclient import TestClient

from app import ai_glue
from ai import AnswerCache
from app.main import app
from risk import FEATURES, load_model
from risk.model import sigmoid
from risk.train import auc, log_loss, make_dataset, train

client = TestClient(app)
STAFF = {"X-Staff": "demo-agent"}


@pytest.fixture(autouse=True)
def live_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MOCK", "0")
    monkeypatch.delenv("LIVE_ROUTES", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(ai_glue, "CACHE", AnswerCache())


def risk(persona: str) -> dict:
    return client.get(f"/staff/customers/{persona}", headers=STAFF).json()["risk"]


# ---------- the maths ----------

def test_sigmoid_is_a_probability():
    assert sigmoid(0) == 0.5
    assert 0 < sigmoid(-10) < 0.001 and 0.999 < sigmoid(10) < 1
    assert sigmoid(-1000) == 0.0 and sigmoid(1000) == 1.0  # no overflow


def test_gradient_descent_learns_and_beats_guessing():
    xs, ys = make_dataset(rows=1200, seed=7)
    cut = 900
    b0, w, means, stds = train(xs[:cut], ys[:cut], epochs=200)
    from risk.model import RiskModel
    model = RiskModel(b0, w, means, stds, {})
    ps = [model.probability(x) for x in xs[cut:]]
    base = sum(ys[:cut]) / cut
    assert log_loss(ps, ys[cut:]) < log_loss([base] * len(ps), ys[cut:])
    assert auc(ps, ys[cut:]) > 0.8


def test_saved_model_points_the_right_way():
    weights = dict(zip([f.name for f in FEATURES], load_model().weights))
    assert weights["paid_this_cycle"] < 0  # paying already lowers the risk
    for name in ("utilisation", "min_only_last_3", "late_last_6", "balance_growth", "spend_ratio"):
        assert weights[name] > 0, name


def test_more_late_payments_means_higher_risk():
    model = load_model()
    base = {"utilisation": 0.4, "min_only_last_3": 1, "late_last_6": 0, "balance_growth": 1.0,
            "spend_ratio": 1.0, "paid_this_cycle": 0}
    p0 = model.predict(base).probability
    p2 = model.predict({**base, "late_last_6": 2}).probability
    paid = model.predict({**base, "paid_this_cycle": 1}).probability
    assert paid < p0 < p2


def test_explanations_add_up_to_z():
    model = load_model()
    x = {"utilisation": 0.9, "min_only_last_3": 3, "late_last_6": 2, "balance_growth": 1.4,
         "spend_ratio": 1.8, "paid_this_cycle": 0}
    prediction = model.predict(x)
    z = model.intercept + sum(d.impact for d in prediction.drivers)
    assert math.isclose(sigmoid(z), prediction.probability, abs_tol=0.001)
    assert prediction.band == "high" and prediction.drivers[0].effect == "raises"


# ---------- fairness ----------

def test_features_are_account_behaviour_only():
    names = " ".join(f.name for f in FEATURES)
    for word in ("needs", "disab", "channel", "letter", "support", "helper", "notes", "age", "persona"):
        assert word not in names


def test_needs_profile_and_asking_for_help_do_not_change_the_score():
    before = risk("sam")["probability"]
    client.put("/me/needs", headers={"X-Persona": "sam"},
               json={"channels": ["app"], "preferred_channel": "app", "notes": "I have a disability", "share_with_staff": True})
    client.post("/support/requests", headers={"X-Persona": "sam"}, json={"topic": "struggling_to_pay", "channel": "app"})
    assert risk("sam")["probability"] == before


# ---------- the staff API ----------

def test_seeded_customers_tell_different_stories():
    bands = {p: risk(p)["band"] for p in ("priya", "sam", "amara", "alex")}
    assert bands == {"priya": "low", "sam": "low", "amara": "medium", "alex": "high"}
    alex = risk("alex")
    assert alex["drivers"][0]["effect"] == "raises" and alex["model"]["synthetic_data"] is True


def test_customer_list_includes_risk():
    customers = {c["persona"]: c for c in client.get("/staff/customers", headers=STAFF).json()["customers"]}
    assert customers["alex"]["risk_band"] == "high" and customers["alex"]["risk_percent"] > 50


def test_paying_the_minimum_lowers_the_risk_straight_away():
    before = risk("alex")["percent"]
    action = client.post("/actions", headers={"X-Persona": "alex"}, json={"type": "pay", "amount_pence": 3500}).json()
    client.post(f"/actions/{action['action_id']}/confirm", headers={"X-Persona": "alex"})
    after = risk("alex")
    assert after["percent"] < before - 20
    assert any(d["feature"] == "paid_this_cycle" and d["effect"] == "lowers" for d in after["drivers"])
