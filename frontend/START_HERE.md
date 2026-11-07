# SpendSense v2 — frontend demo

This is your existing Next.js project, extended with the v2 demo screens. It runs with **mock data only**. It does **not** connect to FastAPI, SQLite or Claude yet. No real payment, dispute or card pause occurs.

## Start
1. Unzip the project.
2. Open a terminal inside the `spendsense` folder (the one containing `package.json`).
3. Run `npm install` (requires internet access).
4. Run `npm run dev`.
5. Open http://localhost:3000.

## Demo walkthrough
- Use the demo customer dropdown to choose Priya, Sam or Amara.
- Open **Your needs** to change text, contrast and reading preferences.
- Open **Statement** for simple/detailed explanations and a template chat answer.
- Open **Dispute** to review the £42 unknown charge, then confirm.
- Open **Pay** to confirm a simulated £35 payment.
- Open **Spending limit**. Starting spend is £280 of £400; simulate a £40 purchase to reach 80%, then review and confirm a demo pause.
- Reset demo data before presenting.

## Integration notes for teammate B
The frontend uses local React state for demo actions and account data. `src/lib/api.ts` contains the planned v2 endpoint paths and X-Persona request helper but is not yet called. Replace local state with backend requests after agreeing response schemas. The local confirmation is a **UI simulation**, not a server-enforced, idempotent confirmation gate.

## Testing status
Code has been assembled from your original ZIP, but automated npm build and browser testing could not be run in this environment because required npm packages were not available offline. Run `npm install && npm run build` on your computer and report errors if any. Test keyboard and a real screen reader before presenting accessibility claims.


## Four-persona accessibility demo

Use the demo customer selector in the header. Priya applies larger Lexend text and simple wording; Sam selects text-first, no automatic speech; Amara enables speech options and screen-reader-oriented wording; Alex selects a calmer, reduced-motion view with optional spending limits. These are editable starting preferences, not medical assumptions. All financial actions remain simulated and require confirmation.

This update also avoids calculating `new Date()` during the initial client render.
