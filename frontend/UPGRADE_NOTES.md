# Design refresh notes

- Replaced prototype-style top navigation, marketing hero, loud gradient logo and oversized coloured tiles with a restrained banking workspace.
- Added an elegant fixed sidebar and compact profile switcher; responsive drawer on mobile.
- Built account balance, account-status, credit utilisation, financial summary, recent transactions and miniature activity visualizations from ledger data.
- Applied a consistent Beacon-inspired editorial layout with a Capital One-inspired deep-blue, signature-red and soft-white palette throughout the app; serif editorial display type and accessible UI system type.
- Redesigned statements, chat helper, payment, monthly limits, repayment scenario comparison and accessibility preferences.
- Added a deterministic local demo bank for real interactions without a backend, preserving the optional API integration.
- Added `npm run test:demo` smoke tests for the sample ledger.
- Kept explicit demo labelling and review/confirm gates; no real financial activity occurs.

## Capital One-inspired colour update (November 2026)

- Swapped prior teal/sage highlights for blue-led navigation, hero surfaces, credit-card visual, links, primary actions, graphs, and selected fields.
- Added restrained red accents for active navigation, the brand emblem, and highlights on the activity chart and assistant panel.
- Updated favicons and browser theme colour without using Capital One's logo.
- Kept the sample data, screen structure, responsive layout, demo features and accessibility controls intact.
- This remains an independent SpendSense demo, not an official or affiliated bank app.

## Accessible onboarding and assistance (November 2026)

- Replaced direct dashboard entry with an accessible first-screen experience, shown once per browser tab/session.
- Built an assistant chat plus a fully equivalent manual preference panel, with a live preview of changes.
- Added private local natural-language interpretation and an optional server-side AI model route (explicit opt-in required).
- Expanded settings to reading spacing and large interactive targets, alongside text size, font, contrast, explanation style, motion, and voice.
- Applied saved settings site-wide and converted fixed text sizes to relative units so text scaling meaningfully affects the dashboard.
- Removed the dispute screen, navigation links, statement prompts, UI components and mock action handling.
- Added 12 assistant/setting checks alongside the existing bank-demo checks.

## Integration with the backend (feature/new-frontend branch)

- **Alex has his own account:** he is no longer mapped to Sam's data, in the backend or the local demo ledger.
- **Codespaces keeps your `.env.local`:** `.devcontainer/start.sh` (run by `./dev.sh`) now only replaces the `NEXT_PUBLIC_API_URL` line, instead of overwriting the whole file. An `OPENAI_API_KEY` you add there survives restarts.
- Removed `START_HERE.md`, which described unzipping the project. `README.md` covers setup.
- The dispute screen stays removed in this design. The backend still supports disputes, so if the statement helper is asked about an unrecognised charge in backend mode, it can still propose one for confirmation.
