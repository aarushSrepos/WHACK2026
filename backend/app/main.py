"""SpendSense API (person B owns this file).

Every route has two branches:

    if use_mock("route_name"):   # fixed JSON from app/mocks/, so A can build from hour 1
        return load_mock(...)
    raise not_built("route_name")   # TODO(B): replace this with the real code

To make a route real: write the real code where the `raise not_built(...)` line is,
then try it with LIVE_ROUTES=route_name while everything else stays mock.
Run with:  uvicorn app.main:app --reload   (from the backend/ folder)
"""
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import cors_origins, demo_enabled, live_routes, mock_default, use_mock
from app.mock_data import load_mock
from app.schemas import (
    ActionRequest,
    AskRequest,
    AskResponse,
    ConfirmResponse,
    MeResponse,
    ProposedAction,
    ResetResponse,
    SettingsUpdate,
    SpendRequest,
    SpendResponse,
    TransactionsResponse,
)

PERSONAS = ("priya", "sam", "amara")

app = FastAPI(
    title="SpendSense API",
    version="0.1.0",
    description=(
        "Accessible credit-card companion. Simulated demo data only. "
        "Send an X-Persona header (priya, sam or amara) instead of logging in."
    ),
)

# The browser blocks calls from the frontend unless we allow it here.
# The regex lets a GitHub Codespaces frontend (https://<name>-3000.app.github.dev) call us.
# TODO(B): remove the regex before any real deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_origin_regex=r"https://.*\.app\.github\.dev",
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- helpers ----------

def get_persona(x_persona: str = Header(default="priya")) -> str:
    """Who is calling? No login in the hackathon: the frontend sends X-Persona."""
    persona = x_persona.lower()
    if persona not in PERSONAS:
        raise HTTPException(status_code=400, detail=f"X-Persona must be one of {list(PERSONAS)}")
    return persona


def require_demo() -> None:
    """Hide /demo/* completely when ENABLE_DEMO_ROUTES=0."""
    if not demo_enabled():
        raise HTTPException(status_code=404, detail="Not Found")


def not_built(route: str) -> HTTPException:
    """The error a route gives when mock mode is off and the real code is not written yet."""
    return HTTPException(
        status_code=501,
        detail=f"'{route}' is not built yet. Run with MOCK=1, or write the real version in app/main.py.",
    )


def pick_ask_mock(question: str) -> str:
    """Mock mode only: choose a canned answer from keywords. The real /ask does not do this."""
    q = question.lower()
    if any(word in q for word in ("recognise", "recognize", "dispute", "fraud")):
        return "dispute"
    if "pay" in q:
        return "pay"
    return "bill"


# ---------- routes ----------

@app.get("/health", tags=["meta"])
def health():
    """Is the server up, and which mode is it in?"""
    return {"status": "ok", "mock": mock_default(), "live_routes": sorted(live_routes())}


@app.get("/me", response_model=MeResponse, tags=["account"])
def get_me(persona: str = Depends(get_persona)):
    """Settings, account figures and progress against the customer's own spending limit."""
    if use_mock("me"):
        return load_mock(f"me_{persona}")
    # TODO(B): read this persona's row from SQLite and build a MeResponse.
    # Take the figures from backend/engine (C's functions), do not calculate them here.
    raise not_built("me")


@app.put("/me/settings", response_model=MeResponse, tags=["account"])
def update_settings(body: SettingsUpdate, persona: str = Depends(get_persona)):
    """Save accessibility settings and/or the monthly spending limit."""
    if use_mock("settings"):
        data = load_mock(f"me_{persona}")
        if body.settings is not None:
            data["settings"] = body.settings.model_dump()
        if body.monthly_limit_pence is not None:
            spending = data["spending"]
            spending["monthly_limit_pence"] = body.monthly_limit_pence
            spending["percent_used"] = round(
                spending["spent_this_month_pence"] / body.monthly_limit_pence * 100, 1
            )
        return data  # mock mode forgets the change on the next request
    # TODO(B): UPDATE the user's row in SQLite, then return the same thing GET /me returns.
    raise not_built("settings")


@app.get("/transactions", response_model=TransactionsResponse, tags=["account"])
def get_transactions(persona: str = Depends(get_persona)):
    """The statement's transactions, newest first."""
    if use_mock("transactions"):
        return load_mock("transactions")
    # TODO(B): SELECT this persona's transactions ORDER BY date DESC.
    raise not_built("transactions")


@app.post("/ask", response_model=AskResponse, tags=["companion"])
def ask(body: AskRequest, persona: str = Depends(get_persona)):
    """Plain-language answer to a question, plus an optional action for the customer to confirm."""
    if use_mock("ask"):
        data = load_mock("ask")[pick_ask_mock(body.question)]
        data["format"] = body.format
        return data
    # TODO(B) with C: 1) C's engine computes the figures, 2) C's AI layer writes the answer and
    # the number checker verifies it, 3) if it proposes an action, save a pending action and
    # return its action_id and read_back.
    raise not_built("ask")


@app.post("/actions", response_model=ProposedAction, tags=["actions"])
def propose_action(body: ActionRequest, persona: str = Depends(get_persona)):
    """Propose a payment, dispute or card pause WITHOUT the AI. Nothing happens until /confirm."""
    if use_mock("actions"):
        return load_mock("actions")[body.type]
    # TODO(B): save a row in pending_actions (type, details, read_back, status="waiting")
    # and return its id and the read-back sentence. /ask will call this same function.
    raise not_built("actions")


@app.post("/actions/{action_id}/confirm", response_model=ConfirmResponse, tags=["actions"])
def confirm_action(action_id: str, persona: str = Depends(get_persona)):
    """The customer has heard the read-back and said yes. Run the action, once."""
    if use_mock("confirm"):
        kind = action_id.removeprefix("mock-")
        confirmations = load_mock("confirm")
        if kind not in confirmations:
            raise HTTPException(status_code=404, detail="Unknown action id")
        return confirmations[kind]
    # TODO(B): load the pending_actions row (it must belong to this persona and still be
    # waiting), do the action using the SAVED details (never numbers sent again by the browser),
    # mark it done. Calling this twice must not pay twice: return the first result instead.
    raise not_built("confirm")


@app.post("/demo/spend", response_model=SpendResponse, tags=["demo"], dependencies=[Depends(require_demo)])
def demo_spend(body: SpendRequest, persona: str = Depends(get_persona)):
    """Rehearsal helper: add a purchase so the 80% check-in can be shown live."""
    if use_mock("demo_spend"):
        return load_mock("demo_spend")  # mock mode ignores the body
    # TODO(B): INSERT a transaction, add to this month's spend, report if 80% or 100% was crossed.
    raise not_built("demo_spend")


@app.post("/demo/reset", response_model=ResetResponse, tags=["demo"], dependencies=[Depends(require_demo)])
def demo_reset():
    """Rehearsal helper: put all three personas back to their starting data."""
    if use_mock("demo_reset"):
        return {"ok": True, "message": "Mock mode: nothing to reset."}
    # TODO(B): re-run seed.py (delete the .db and rebuild it).
    raise not_built("demo_reset")
