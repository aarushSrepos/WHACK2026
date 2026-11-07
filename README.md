# SpendSense

An account companion that lets credit card customers with accessibility needs manage their
account on their own: understand the statement, dispute a charge, pay, and set their own
spending limit. Hackathon project. All data is **simulated demo data**.

## Who owns what

| Folder | Owner | What lives there |
| --- | --- | --- |
| `frontend/` | A | Next.js app, theme, accessibility |
| `backend/app/` | B | FastAPI routes, database, seed data, mock mode |
| `backend/engine/`, `backend/ai/` | C | Figure calculations, Claude prompt, number checker |
| `docs/` | D | Personas, copy, test log, demo script, slides |

`backend/app/schemas.py` is the **API contract**. Tell A and C in chat before changing it.

## Run the backend

In a **GitHub Codespace** the packages are already installed, so skip to the last two lines.
On your own computer, run all of these:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Open <http://localhost:8000/docs> (in a Codespace, open the forwarded port 8000 and add `/docs`).
You should see every route. Click **Try it out** to call one.

**Codespaces and the frontend:** in the **Ports** tab, right-click port 8000 and choose
**Port Visibility → Public**. Without this the browser blocks the frontend's calls.

## Real mode and mock mode

Every route is built. **By default the backend uses the real code**: the SQLite database, C's engine
and C's AI layer. The first request creates and seeds the database by itself.

For frontend work with no database, set `MOCK=1` and every route returns fixed JSON from
`backend/app/mocks/` instead.

| Setting | Meaning |
| --- | --- |
| *(nothing set)* or `MOCK=0` | All routes use real code |
| `MOCK=1` | All routes return mock JSON |
| `MOCK=1` and `LIVE_ROUTES=me,transactions` | Only these routes use real code |
| `ENABLE_DEMO_ROUTES=0` | Hides `/demo/*` |

Send `X-Persona: priya`, `sam` or `amara` on each request instead of logging in.

```bash
curl localhost:8000/me -H "X-Persona: sam"
curl localhost:8000/transactions
curl -X POST localhost:8000/ask -H "Content-Type: application/json" \
     -d '{"question": "I do not recognise a charge"}'
```

In mock mode `/ask` picks a canned answer from keywords: "recognise" gives a dispute,
"pay" gives a payment, anything else explains the bill.

## Routes

| Method | Route | Does |
| --- | --- | --- |
| GET | `/health` | Server up? Which mode? |
| GET | `/me` | Settings, account figures, spending-limit progress |
| PUT | `/me/settings` | Save accessibility settings and/or monthly limit |
| GET | `/transactions` | Statement transactions, newest first |
| POST | `/ask` | Plain-language answer, figures used, `verified` flag, optional action |
| POST | `/actions` | Propose pay / dispute / pause without the AI |
| POST | `/actions/{id}/confirm` | Run the proposed action, once |
| POST | `/demo/spend` | Add a demo purchase (shows the 80% check-in) |
| POST | `/demo/reset` | Put all personas back to the starting data |

Actions always take two steps: **propose** (returns an `action_id` and a `read_back` sentence),
then **confirm**. Nothing moves money or opens a case before the confirm.

## Database

SQLite file at `backend/spendsense.db` (git ignores it). Tables: `users`, `transactions`,
`disputes`, `payments`, `pending_actions`. They are defined in `backend/app/db.py`.

```bash
cd backend
python -m app.seed      # wipe the database and recreate Priya, Sam and Amara
```

- The due date is always **five days from the day you seed**, so re-seed on demo day.
- `POST /demo/reset` does the same thing from the running API.
- A live route creates and seeds the database by itself the first time it is called.
- All figures come from C's `backend/engine/` (minimum payment, utilisation, interest, month spend).
  Nothing in `backend/app/` does its own money maths.
- "This month" means the **calendar month**, the same as the engine. The seed adds a last-month
  set of transactions too, so "why is my bill higher?" has something to compare with.
  This month adds up to £310.00 and last month to £186.00.

`backend/app/figures.py` is an old stand-in that nothing uses any more. Delete it: `git rm backend/app/figures.py`.

## The AI layer (`/ask`)

C's `backend/ai/` does the thinking and `backend/app/ai_glue.py` connects it to the API:

1. `ask()` works out which figures are relevant and asks Claude to write the answer.
2. The number checker rejects any £ amount or percentage that the engine did not produce, and retries once.
3. If that still fails, or there is no key or no Wi-Fi, a **template answer** is used instead
   (badge: "Standard explanation"). With `ANTHROPIC_API_KEY` empty, `/ask` always uses templates.
4. If the answer proposes an action, it is saved in `pending_actions` as `waiting` and the
   response carries its `action_id`. Nothing runs until the customer confirms.

`/ask` figures also carry `kind` and `display` (the text to show or speak, like "£35.00"), and
`value_days` for day counts. The action type for a card pause is `pause_card`.

## Actions (propose, then confirm)

`POST /actions` (or an `/ask` answer) saves a proposal in `pending_actions` and returns an `action_id`
and a `read_back` sentence. `POST /actions/{id}/confirm` then runs it:

- It runs from the **saved** proposal. Anything in the confirm request body is ignored.
- A second confirm returns the same receipt and does nothing twice.
- Each persona only sees their own actions (another persona's id answers 404).
- It checks the account again first. If things changed (balance dropped, charge already disputed) it answers 409 and runs nothing.
- Receipts use `SIM-PAY-`, `SIM-CASE-`, `SIM-PAUSE-` and `SIM-UNPAUSE-` references. No real money moves.

A card pause lasts 24 hours and shows in `/me` as `account.card_paused_until` until it runs out.
`/demo/spend` is declined (409) while the card is paused. Cancelling a proposal is not built;
an unconfirmed proposal just stays `waiting`.

## Settings and the spending limit

`PUT /me/settings` changes only the fields you send. The limit must be below the credit limit (400 if not).
A limit cannot be cleared once set. `POST /demo/spend` adds a purchase; when it crosses 80% or 100%
of the limit the response has `threshold_crossed` and a `message` from C's check-in wording.

## Tests

```bash
cd backend
pytest
```

This runs everyone's tests: `tests/` (the API, B), `engine/` (C's maths) and `ai/` (C's AI layer).
No test calls the real Claude API.

## Git rules

1. Work on a branch named after you and the task, like `b/confirm-route`. Never push straight to `main`.
2. Open small pull requests and merge every couple of hours. Pull `main` before starting new work.
3. Only edit your own folder. Need a change somewhere else? Ask the owner.
4. Never commit `.env`, API keys or `.db` files (`.gitignore` blocks them). Put variable names in `.env.example` instead.
5. After the hour 12 feature freeze, only bug-fix pull requests.
