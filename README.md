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

## Mock mode (how the frontend builds before the backend exists)

With `MOCK=1` (the default) every route returns fixed JSON from `backend/app/mocks/`.
A can clone the repo, start the backend, and build against it straight away.

| Setting | Meaning |
| --- | --- |
| `MOCK=1` | All routes return mock JSON |
| `MOCK=0` | All routes use real code; routes not built yet answer `501` |
| `LIVE_ROUTES=me,transactions` | These routes use real code even when `MOCK=1` |
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
- `backend/app/figures.py` holds the money calculations for now. C's `backend/engine/` replaces it later.
- "This month" in the demo means the last 30 days of transactions.

**Built so far (real data):** `GET /me`, `GET /transactions`, `POST /demo/reset`.
Turn them on with `LIVE_ROUTES=me,transactions,demo_reset` in `backend/.env`.

## Making the next route real (for B)

1. Find the `raise not_built("...")` line in `backend/app/main.py` for that route.
2. Put the SQL in `backend/app/queries.py` and call it from the route, like `/me` does.
3. Try it with that route name added to `LIVE_ROUTES` while the rest stay mock.
4. Add a test in `backend/tests/test_live_routes.py`, run `pytest`, then open a pull request.

Next in order: `POST /actions`, `POST /actions/{id}/confirm`, `PUT /me/settings`, `POST /demo/spend`, then `/ask`.

## Tests

```bash
cd backend
pytest
```

## Git rules

1. Work on a branch named after you and the task, like `b/confirm-route`. Never push straight to `main`.
2. Open small pull requests and merge every couple of hours. Pull `main` before starting new work.
3. Only edit your own folder. Need a change somewhere else? Ask the owner.
4. Never commit `.env`, API keys or `.db` files (`.gitignore` blocks them). Put variable names in `.env.example` instead.
5. After the hour 12 feature freeze, only bug-fix pull requests.
