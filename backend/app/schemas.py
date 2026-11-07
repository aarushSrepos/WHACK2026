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

Persona = Literal["priya", "sam", "amara", "alex"]
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
    """One number the answer is allowed to use. Exactly one of the three values is set."""

    id: str  # e.g. "minimum_payment"
    label: str  # e.g. "Minimum payment"
    kind: Literal["pence", "percent", "days"] | None = None
    display: str | None = None  # ready-made text to show or speak: "£35.00", "41%", "5 days"
    value_pence: int | None = None
    value_percent: float | None = None
    value_days: int | None = None


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
    # True when the customer seems to be struggling (e.g. "I can't pay"): the app offers to put them
    # in touch with a person, on their terms. Nothing is sent unless they choose to.
    support_offer: bool = False


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
    message: str | None = None  # C's fixed, neutral check-in wording to show when a line was crossed


class ResetResponse(BaseModel):
    ok: bool
    message: str


# ---------- "Tell us once": the needs profile (GET/PUT /me/needs) ----------

Channel = Literal["app", "email", "text", "letter", "phone"]
LetterFormat = Literal["standard", "large_print", "braille", "easy_read", "audio"]
CallAdjustment = Literal["extra_time", "speak_slowly", "relay_uk", "agreed_times", "same_person"]


class NeedsProfileUpdate(BaseModel):
    """How the customer wants us to contact and support them. Every field is optional to fill in."""

    channels: list[Channel] = Field(default_factory=lambda: ["app", "email", "letter", "phone"])
    preferred_channel: Channel = "app"
    letter_format: LetterFormat = "standard"
    call_adjustments: list[CallAdjustment] = Field(default_factory=list)
    helper_name: str | None = Field(default=None, max_length=80)  # someone who helps manage their money
    notes: str | None = Field(default=None, max_length=300)  # in their own words
    share_with_staff: bool = False  # nothing above is shown to staff unless this is True

    @model_validator(mode="after")
    def tidy(self):
        # In-app messages always work: they are how we reply inside SpendSense.
        channels = ["app"] + [c for c in dict.fromkeys(self.channels) if c != "app"]
        self.channels = channels
        if self.preferred_channel not in channels:
            raise ValueError("Your preferred way to be contacted must be one of the ways you allow")
        self.call_adjustments = list(dict.fromkeys(self.call_adjustments))
        self.helper_name = (self.helper_name or "").strip() or None
        self.notes = (self.notes or "").strip() or None
        return self


class NeedsProfile(NeedsProfileUpdate):
    updated_at: datetime | None = None


# ---------- Support requests (customer side) ----------

SupportTopic = Literal["struggling_to_pay", "understanding_account", "accessibility", "something_else"]
SupportStatus = Literal["open", "in_progress", "resolved"]


class SupportRequestCreate(BaseModel):
    topic: SupportTopic
    message: str | None = Field(default=None, max_length=500)
    channel: Channel = "app"  # how the customer wants us to get back to them


class CustomerReply(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class SupportMessage(BaseModel):
    id: int
    author: Literal["customer", "staff", "note"]  # "note" = staff-only, never sent to the customer
    text: str
    channel: Channel | None = None
    staff_name: str | None = None
    created_at: datetime


class SupportRequest(BaseModel):
    id: int
    topic: SupportTopic
    topic_label: str
    message: str | None = None
    channel: Channel
    status: SupportStatus
    created_at: datetime
    updated_at: datetime
    messages: list[SupportMessage]


class SupportRequestsResponse(BaseModel):
    requests: list[SupportRequest]  # newest first


# ---------- Staff console (/staff/*) ----------

class Guidance(BaseModel):
    kind: Literal["contact", "no_phone", "letters", "calls", "helper", "notes"]
    text: str  # a plain instruction for the agent: "Do not phone. Use text or email."


class StaffRequestSummary(BaseModel):
    id: int
    persona: Persona
    display_name: str
    topic: SupportTopic
    topic_label: str
    message: str | None = None
    channel: Channel
    status: SupportStatus
    needs_shared: bool
    created_at: datetime
    updated_at: datetime


class StaffQueueResponse(BaseModel):
    requests: list[StaffRequestSummary]  # open first, then in progress, then resolved; oldest first within each


class StaffCustomerSummary(BaseModel):
    persona: Persona
    display_name: str
    needs_shared: bool
    open_requests: int


class StaffCustomersResponse(BaseModel):
    customers: list[StaffCustomerSummary]


class StaffAccountSnapshot(BaseModel):
    balance_pence: int
    minimum_payment_pence: int
    due_date: date
    days_until_due: int
    card_paused: bool
    monthly_limit_pence: int | None = None


class StaffCustomerView(BaseModel):
    persona: Persona
    display_name: str
    needs_shared: bool
    needs: NeedsProfile | None = None  # None unless the customer chose to share it
    guidance: list[Guidance]
    allowed_channels: list[Channel]  # always enforced, even when the details are not shared
    account: StaffAccountSnapshot
    requests: list[SupportRequest]  # including staff-only notes


class StatusUpdate(BaseModel):
    status: SupportStatus


class StaffMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    channel: Channel = "app"
    internal: bool = False  # True = a note for colleagues; the customer never sees it
