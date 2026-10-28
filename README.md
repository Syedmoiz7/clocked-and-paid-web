# Clocked & Paid web

Next.js App Router app, beside `mobile/` and `backend/`. The client source provides visual references; the reviewed mobile models supply calculation and state behavior. Tracker, History/Calendar and Pay are implemented for review, not the full web product. See [web scope](../docs/WEB_SCOPE.md), [parity/status](../docs/WEB_PARITY.md), [History details](../docs/WEB_HISTORY_PARITY.md) and [Pay details](../docs/WEB_PAY_PARITY.md).

## Run

Use Node 20.9+ and npm:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. `/` opens `/tracker`; History is at `/history` and Pay at `/pay`. No backend, API keys, environment file or sign-in is required for guest tracking. Jobs, Settings and account/landing flows are subsequent phases; their navigation labels do not lead to unfinished routes.

## Verify

```bash
npm run domain:check
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Playwright uses the production build on port 3100 and installed Google Chrome. If Chrome is unavailable, install Playwright Chromium and change the `channel` setting in `playwright.config.ts` to match your environment. Browser tests use disposable browser contexts; they do not reset a real user workspace.

Production preview: `npm run build` then `npm start`.

## Structure

- `src/app`: server pages, root layout, styles and Plans client route.
- `src/components`: responsive app shell, HTML form controls/dialogs and workspace provider.
- `src/lib`: store factory, central RTK Query injection seam and IndexedDB repository.
- `src/features/*/*.ts`, `src/store/appSlice.ts`, `src/types.ts`, `src/utils`: reviewed pure mobile-domain snapshot, plus web-specific History view helpers. The manifest hashes are verified against mobile and web. Browser UI lives under each feature's `components/` directory.
- `public`: existing C&P branding and self-hosted client fonts.
- `tests`: inherited domain regression tests. `e2e`: browser-specific acceptance scenarios.

The web snapshot avoids importing native dependencies or requiring the mobile build to run. Reconcile any domain change intentionally on both platforms; a shared pure package should replace the snapshot before sustained parallel changes. Do not change manifest hashes to hide behavior drift.

## Local data and API boundary

IndexedDB database `clocked-paid-web` stores versioned state for this origin. Each save reads the latest snapshot and commits the reducer result in one transaction; commands can prepare/validate synchronously against that snapshot. History corrections and Pay forms reject stale originals rather than overwriting newer records. Pay validates receipt overlap and deduction consumption against the latest transaction snapshot. Failures retain existing UI state and inputs. Multiple tabs broadcast revision changes. Initial hydration is separate from ordinary updates, so toggling pay visibility cannot accidentally trigger startup privacy defaults.

No real credentials are stored or real billing/auth/cloud writes made. Free/Premium is a local preview. Future backend endpoints belong behind the repository/RTK Query boundary, not inside UI components. Never modify `../backend/` during frontend work.

Visual references: client `src/index.css`, `src/App.tsx`, Tracker page and components. Inter/JetBrains Mono font assets and C&P branding come from the supplied project. The implementation uses [Next.js App Router](https://nextjs.org/docs/app/getting-started) and the [Redux Next.js store-provider pattern](https://redux.js.org/usage/nextjs).
