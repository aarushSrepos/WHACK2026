"""SpendSense API (person B owns this file).

Every route has two branches:

    if use_mock("route_name"):   # fixed JSON from app/mocks/ (only when MOCK=1 or not in LIVE_ROUTES)
        return load_mock(...)
    ...real code: database, C's engine, C's AI layer...

All routes are built. The default is the real thing. Set MOCK=1 to get fixed mock data
instead (useful for frontend work with no database), or MOCK=1 plus LIVE_ROUTES=a,b to
make just some routes real.

Run with:  uvicorn app.main:app --reload   (from the backend/ folder)
"""
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import actions, ai_glue, mutations, queries
from app.config import cors_origins, demo_enabled, live_routes, mock_default, use_mock
from app.db import db
from app.errors import ApiError
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
from app.seed import seed

PERSONAS = ("priya", "sam", "amara")

app = FastAPI(
    title="SpendSense API",
    version="0.2.0",
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


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, error: ApiError):
    """A request we cannot do, with a message that is safe to show the customer."""
    return JSONResponse(status_code=error.status_code, content={"detail": error.message})


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
    with db() as conn:
        return queries.get_me(conn, persona)


@app.put("/me/settings", response_model=MeResponse, tags=["account"])
def update_settings(body: SettingsUpdate, persona: str = Depends(get_persona)):
    """Save accessibility settings and/or the monthly spending limit. Only fields you send change."""
    if use_mock("settings"):
        data = load_mock(f"me_{persona}")
        if body.settings is not None:
            data["settings"].update(body.settings.model_dump(exclude_unset=True))
        if body.monthly_limit_pence is not None:
            spending = data["spending"]
            spending["monthly_limit_pence"] = body.monthly_limit_pence
            spending["percent_used"] = round(
                spending["spent_this_month_pence"] / body.monthly_limit_pence * 100, 1
            )
        return data  # mock mode forgets the change on the next request
    with db() as conn:
        mutations.update_settings(conn, persona, body)
        return queries.get_me(conn, persona)


@app.get("/transactions", response_model=TransactionsResponse, tags=["account"])
def get_transactions(persona: str = Depends(get_persona)):
    """The statement's transactions, newest first."""
    if use_mock("transactions"):
        return load_mock("transactions")
    with db() as conn:
        return queries.get_transactions(conn, persona)


@app.post("/ask", response_model=AskResponse, tags=["companion"])
def ask(body: AskRequest, persona: str = Depends(get_persona)):
    """Plain-language answer to a question, plus an optional action for the customer to confirm."""
    if use_mock("ask"):
        data = load_mock("ask")[pick_ask_mock(body.question)]
        data["format"] = body.format
        return data
    # C's engine computes the figures, C's AI layer writes the answer and checks every number,
    # and any proposed action is saved in pending_actions. See app/ai_glue.py.
    with db() as conn:
        account, transactions = queries.load_engine_inputs(conn, persona)
        return ai_glue.answer_question(conn, persona, body.question, body.format, account, transactions)


@app.post("/actions", response_model=ProposedAction, tags=["actions"])
def propose_action(body: ActionRequest, persona: str = Depends(get_persona)):
    """Propose a payment, dispute or card pause WITHOUT the AI. Nothing happens until /confirm."""
    if use_mock("actions"):
        return load_mock("actions")[body.type]
    with db() as conn:
        return actions.propose(conn, persona, body)


@app.post("/actions/{action_id}/confirm", response_model=ConfirmResponse, tags=["actions"])
def confirm_action(action_id: str, persona: str = Depends(get_persona)):
    """The customer has heard the read-back and said yes. Run the action, once.

    Nothing is read from the request body: the amount and charge come from the saved proposal.
    """
    if use_mock("confirm"):
        kind = action_id.removeprefix("mock-")
        confirmations = load_mock("confirm")
        if kind not in confirmations:
            raise HTTPException(status_code=404, detail="Unknown action id")
        return confirmations[kind]
    with db() as conn:
        return actions.confirm(conn, persona, action_id)


@app.post("/demo/spend", response_model=SpendResponse, tags=["demo"], dependencies=[Depends(require_demo)])
def demo_spend(body: SpendRequest, persona: str = Depends(get_persona)):
    """Rehearsal helper: a purchase on the card, so the 80% check-in can be shown live."""
    if use_mock("demo_spend"):
        return load_mock("demo_spend")  # mock mode ignores the body
    with db() as conn:
        return mutations.demo_spend(conn, persona, body)


@app.post("/demo/reset", response_model=ResetResponse, tags=["demo"], dependencies=[Depends(require_demo)])
def demo_reset():
    """Rehearsal helper: put all three personas back to their starting data."""
    if use_mock("demo_reset"):
        return {"ok": True, "message": "Mock mode: nothing to reset."}
    with db() as conn:
        seed(conn)
    return {"ok": True, "message": "Demo data reset. Due date is five days from today."}
