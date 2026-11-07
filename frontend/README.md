# SpendSense — accessible banking demo

A responsive credit-account prototype built with **Next.js 16, React 19 and TypeScript**. Design direction: Beacon's restrained, data-first layout and an independent Capital One-inspired palette of **deep blue (`#004977`), red (`#D03027`), white and blue-grey**. SpendSense is not an official banking service and is not affiliated with Capital One.

## Run it locally

Use Node.js **20.9+** and npm:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. **The first screen is now accessibility setup**, not the account dashboard. Select **Ask the assistant** (default) or **Choose manually**, tailor the settings, then click **Continue to dashboard**.

- Accessibility setup appears when opening a **new browser tab/session**. Completing setup lets the current tab navigate and refresh without being prompted again.
- Accessibility preferences themselves **persist in browser local storage** and are reused across visits. Your saved selections appear in the live preview on return.
- The **Accessibility** sidebar page opens the same assistant/manual interface at any time. From there, choose **View welcome setup again** to return to onboarding.
- No financial account, username, credit-card information or API key is needed for the demo.

## AI-powered and offline accessibility assistance

The assistant accepts ordinary-language instructions, including multiple requests in a sentence:

- "Make text much bigger and increase contrast."
- "I have dyslexia. Make reading easier."
- "I find animations distracting and want simpler explanations."
- "Use more space between the lines and larger buttons."
- "Please read the page aloud more slowly."

**Private guided mode is the default.** It uses a tested, local intent interpreter to adjust settings without sending messages to an AI service. It is not generative AI; if it cannot identify a request, it asks for a supported preference. The manual controls offer exactly the same settings. Chat messages are not stored after the tab closes; applied preferences are saved in your browser. You can continue without disclosing a disability or diagnosis.

### Enable a genuine AI model (optional)

Create `.env.local` in the `frontend` directory with:

```env
OPENAI_API_KEY=your_own_api_key
# Optional model override:
OPENAI_ACCESSIBILITY_MODEL=gpt-4o-mini
```

Restart `npm run dev`. The chat then shows a **Use enhanced AI** checkbox. It is **off by default**. Selecting it explicitly opts into sending your chat message and current accessibility settings to the AI provider via `src/app/api/accessibility-ai/route.ts`. The key stays **server-side**, not in the browser. AI outputs are validated to a small, allow-listed set of preference values. If the provider is unavailable, the chat safely falls back to local guided mode. An AI API key may incur usage charges from the provider. Never put secret keys in `NEXT_PUBLIC_` variables or commit `.env.local`.

## Accessibility settings supported

Both chat and manual setup apply the **same preference model** (`src/lib/accessibility.ts`):

| Setting | Options |
| --- | --- |
| Text size | Default, large, extra large |
| Contrast | Standard, high contrast |
| Reading font | Default, Lexend, Atkinson Hyperlegible (with accessible fallbacks) |
| Explanations | Simple/plain language, detailed |
| Reading spacing | Standard, relaxed |
| Motion | Follow device, reduce animations |
| Interaction targets | Standard controls, larger buttons/controls |
| Read-aloud | On/off |
| Speech speed | Slow, normal, fast |
| Spoken confirmations | On/off |

Settings are applied to the document itself, so they affect the whole app. Accessible font files are requested by the browser from Google Fonts when online; local fallback fonts are used when unavailable. Reduced-motion settings and keyboard access work without network connectivity.

## Banking demo features

- **Overview:** illustrative account balance, available credit, card mock-up, utilisation, repayments and transactions.
- **Statements:** sample transactions, search, plain/detailed explanations and a separate rule-based statement helper.
- **Payments:** minimum/full/custom amounts, review and confirm, sample receipts and updated simulated balance.
- **Spending controls:** monthly guide, progress, pause/resume a sample card, simulate a purchase and reset.
- **Repayment planner:** interactive monthly payment scenarios with stated assumptions.
- **Accessibility:** conversational and manual setup, preview and persistent preferences.

The old **Dispute a Charge** screen, navigation item and mock-dispute actions have been removed. No live banking activity takes place.

## Run checks

```bash
npm run typecheck
npm run lint
npm run test:demo
npm run test:accessibility
npm run build
```

## Connect a compatible bank API (optional)

By default, all financial interactions use a deterministic demo ledger in browser `localStorage`. To point the **banking** functions to your own compatible API, create `.env.local` with:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

In Codespaces, `./dev.sh` sets this for you and the app uses the FastAPI backend in `../backend` (four demo customers: Priya, Sam, Amara and Alex). The separate server must implement `/me`, `/transactions`, `/ask`, `/actions`, `/actions/:id/confirm`, `/me/settings`, `/demo/spend` and `/demo/reset` according to `src/lib/api.ts`, and allow the frontend origin via CORS. A bank backend is **not** necessary for accessibility chat, manual settings, dashboard demo or payments simulation. Server-backed actions still require authentication, authorisation, security reviews and real banking safeguards before any real use.

## Project structure

- `src/components/accessibility-workspace.tsx`: new first-run chat, manual controls, tabs and live preview.
- `src/components/accessibility-provider.tsx`: shared settings, save/apply/reset and first-screen gate state.
- `src/components/app-experience.tsx`: show accessibility setup before displaying the banking shell.
- `src/lib/accessibility-chat.ts`: local text interpretation, safe preference values and change descriptions.
- `src/app/api/accessibility-ai/route.ts`: optional server-only model integration, explicit opt-in from client.
- `src/lib/accessibility.ts`: the canonical settings model, persistence and DOM attributes.
- `src/app/globals.css`: design system, responsive bank UI, onboarding styles and accessibility overrides.
- `src/lib/mock-bank.ts`: illustrative local bank ledger.

**Important:** This is a hackathon interface prototype, not an actual bank. Do not use it to store customer credentials, handle payments or process live account data without independent security and privacy work.
