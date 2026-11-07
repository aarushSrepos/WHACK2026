"""THE API CONTRACT.

Every request and response the frontend and AI code rely on is defined here.
If you change this file, tell A and C in chat BEFORE you merge.

Rules:
- Money is whole pence in an int (3500 means 35.00 pounds). Never floats, never strings.
- Dates are ISO strings in JSON ("2026-11-12"); FastAPI converts them for us.
- Every figure shown to the customer comes from Python code, never from the AI.
"""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Persona = Literal["priya", "sam", "amara"]
ActionType = Literal["pay", "dispute", "pause_card", "unpause_card"]


# ---------- Needs profile (what "tell us once" saves) ----------

class AccessibilitySettings(BaseModel):
    text_size: Literal["normal", "large", "extra_large"] = "normal"
    contrast: Literal["standard", "high"] = "standard"
    font: Literal["default", "dyslexia_friendly"] = "default"
    reading_level: Literal["standard", "plain"] = "standard"
    read_aloud: bool = False
    reduced_motion: bool = False
    input_mode: Literal["any", "keyboard", "voice", "text_only"] = "any"


# ---------- GET /me ----------

class Account(BaseModel):
    credit_limit_pence: int
    balance_pence: int
    available_credit_pence: int
    utilisation_percent: float
    apr_basis_points: int  # 2490 means 24.90% APR
    minimum_payment_pence: int
    due_date: date
    interest_estimate_pence: int
    card_paused_until: datetime | None = None


class Spending(BaseModel):
    """The customer's own monthly limit and how close they are to it."""

    monthly_limit_pence: int | None = None  # None = the customer has not set one
    spent_this_month_pence: int
    percent_used: float | None = None  # None when there is no limit


class MeResponse(BaseModel):
    persona: Persona
    display_name: str
    settings: AccessibilitySettings
    account: Account
    spending: Spending
    label: str = "Simulated demo data"  # show this on every screen with figures


# ---------- PUT /me/settings ----------

class SettingsUpdate(BaseModel):
    """Send only what changed. A field left out (null) is left as it is."""

    settings: AccessibilitySettings | None = None
    monthly_limit_pence: int | None = Field(default=None, gt=0)


# ---------- GET /transactions ----------

class Transaction(BaseModel):
    id: str
    merchant: str
    amount_pence: int
    date: date
    status: Literal["posted", "pending", "disputed"]


class TransactionsResponse(BaseModel):
    transactions: list[Transaction]  # newest first


# ---------- POST /ask ----------

class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    format: Literal["simple", "detailed"] = "simple"


class Figure(BaseModel):
    """One number the answer is allowed to use. Set exactly one of the two values."""

    id: str  # e.g. "minimum_payment"
    label: str  # e.g. "Minimum payment"
    value_pence: int | None = None
    value_percent: float | None = None


class ProposedAction(BaseModel):
    """Something the customer can confirm. Nothing happens until they do."""

    action_id: str
    type: ActionType
    read_back: str  # the sentence shown and read aloud before Confirm


class AskResponse(BaseModel):
    answer: str
    format: Literal["simple", "detailed"]
    figures: list[Figure]
    verified: bool  # True = every number in the answer was checked against `figures`
    badge: str  # text for the badge: "Verified figures" or "Standard explanation"
    proposed_action: ProposedAction | None = None


# ---------- POST /actions and POST /actions/{id}/confirm ----------

class ActionRequest(BaseModel):
    """Ask to pay, dispute or pause WITHOUT the AI (for plain button clicks)."""

    type: ActionType
    transaction_id: str | None = None  # needed for "dispute"
    amount_pence: int | None = Field(default=None, gt=0)  # "pay": leave out = minimum payment
    reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def check_needed_fields(self):
        if self.type == "dispute" and not self.transaction_id:
            raise ValueError("transaction_id is required to dispute a charge")
        return self


class ConfirmResponse(BaseModel):
    action_id: str
    type: ActionType
    status: Literal["done"]
    summary: str  # receipt text or case summary
    reference: str | None = None
    simulated: bool = True  # always True in the hackathon: no real money moves


# ---------- /demo/* (rehearsal helpers) ----------

class SpendRequest(BaseModel):
    merchant: str = Field(min_length=1, max_length=100)
    amount_pence: int = Field(gt=0)


class SpendResponse(BaseModel):
    spending: Spending
    threshold_crossed: Literal[80, 100] | None = None  # set when this purchase crossed a check-in line


class ResetResponse(BaseModel):
    ok: bool
    message: str
