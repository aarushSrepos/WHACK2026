# SpendSense: accessible credit, on your terms

Our entry for the Capital One **"Make Credit Accessible"** challenge at WHACK 2026.

SpendSense is a credit card companion for customers with accessibility needs. They set the app up by simply saying what they need, then understand their bill, pay and pause their card **without phoning anyone**, in the way that suits them: larger text, dyslexia-friendly fonts, plain English, read-aloud, high contrast or reduced motion.

> **Demo only.** All data is simulated. No real bank account is connected and no money moves.

## What it does

| Screen | What the customer can do |
| --- | --- |
| **Welcome setup** | Before anything else, the customer says what they need in their own words ("bigger text and less movement") to the **accessibility assistant**, or sets it up by hand. Works privately on the device by default, with an optional AI mode (see `frontend/README.md`) |
| **Overview** | Balance, minimum payment and due date, in plain or detailed wording, read aloud on request |
| **Statement** | "Why is my bill higher?" explained in plain English; ask any question in your own words |
| **Credit simulator** | See how paying more than the minimum changes the time and the interest; what happens if you miss a payment |
| **Payments** | Pay the minimum, the full balance or any amount |
| **Spending & wellbeing** | Set your own monthly limit, get a gentle check-in at 80%, pause your card for 24 hours, find independent support |
| **Accessibility** | The same assistant or manual controls at any time: text size, contrast, font, wording, line spacing, larger buttons, motion and speech. Saved, and applied everywhere |

### Two safety rules

1. **The AI never does the maths.** The Python engine works out every figure. Claude only writes the words, and a checker rejects any answer that contains a £ amount or percentage the engine did not supply. With no API key (or no Wi-Fi), built-in template answers take over, labelled "Standard explanation".
2. **Nothing happens until you confirm.** Every payment or card pause, whether it comes from a button or from the AI, is saved as a proposal and read back to the customer. Only `POST /actions/{id}/confirm` runs it, exactly once, using the saved amount (never anything sent from the screen).

## Demo customers

Pick one from the **Demo customer** dropdown. Each one applies starting preferences that the customer can change at any time. They are not assumptions about anyone's needs.

| Persona | Starting preferences |
| --- | --- |
| **Priya**: easier reading | Large Lexend text, plain wording, has a £400 monthly limit |
| **Sam**: text first | Everything in text, no sound needed, detailed wording |
| **Amara**: screen reader | Atkinson Hyperlegible, read-aloud and spoken confirmations on |
| **Alex**: calmer view | Reduced motion, plain wording, wellbeing support up front, no limit set yet |

## Run it

**Codespaces (easiest):** open the repo in a Codespace, then run:

```bash
./dev.sh          # backend on :8000, frontend on :3000
```

**Locally:**

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # optional: add ANTHROPIC_API_KEY for Claude answers
python -m app.seed            # creates spendsense.db
uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

In Codespaces, `./dev.sh` points the frontend at the backend for you. Locally, put `NEXT_PUBLIC_API_URL=http://localhost:8000` in `frontend/.env.local`. **Without it, the frontend runs on its own built-in demo ledger** (handy for design work, but the backend, engine and number checker aren't used).

**Before presenting:** run `npm run build && npm start` (faster and steadier than dev mode), then press **Reset demo data** on the Spending page.

## Tests

```bash
cd backend && python -m pytest -q      # engine, AI checker, routes, confirm-once actions
cd frontend && npm run typecheck && npm run lint && npm run test:demo && npm run test:accessibility && npm run build
```

## How it fits together

```
frontend/ (Next.js)          backend/ (FastAPI + SQLite)
  src/app/*        pages       app/main.py      routes (X-Persona header instead of login)
  src/components/  UI          app/actions.py   propose -> confirm, run once
  src/lib/api.ts   API client  engine/          every number (balance, interest, minimum…)
  src/lib/accessibility-chat.ts  assistant rules  ai/        intent -> figures -> Claude or template -> number check
  src/app/api/accessibility-ai   optional AI for the assistant (opt-in)
```

`backend/app/schemas.py` is the API contract. Money is always whole pence in an integer.
