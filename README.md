# Clocked & Paid web

Next.js App Router app, beside `mobile/` and `backend/`. The client source provides visual references; the reviewed mobile models supply calculation and state behavior. Tracker, History/Calendar, Pay, Jobs, Settings, mock auth/onboarding and public landing/legal/contact pages are implemented for review, not the full web product. See [web scope](../docs/WEB_SCOPE.md), [parity/status](../docs/WEB_PARITY.md), [History details](../docs/WEB_HISTORY_PARITY.md), [Pay details](../docs/WEB_PAY_PARITY.md), [Jobs details](../docs/WEB_JOBS_PARITY.md), [Settings details](../docs/WEB_SETTINGS_PARITY.md), [auth/setup details](../docs/WEB_AUTH_ONBOARDING_PARITY.md) and [public-page details](../docs/WEB_PUBLIC_PARITY.md).

## Run

Use Node 20.9+ and npm:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. `/` is the public landing page. Try as guest opens local tracking; Open your workspace resumes saved work or shows the appropriate sign-in/setup screen; History is at `/history`, Pay at `/pay`, Jobs at `/jobs`, and Settings at `/settings`. No backend, API keys, environment file or sign-in is required for guest tracking. Use Continue as Guest, or enter any non-empty mock email/password. Signup includes Free/Premium selection and a local confirmation link; recovery and job onboarding are also functional local previews. Privacy, Terms and Contact are available at `/privacy`, `/terms` and `/contact`, independently of workspace storage/lock status. Full W5 acceptance remains pending.

## Verify

```bash
npm run domain:check
npm test
npm run typecheck
npm run build
npm run test:e2e
# Additional engines and full review:
npx playwright install firefox webkit
npm run test:e2e:review
npm run test:e2e:all
```

Playwright uses the production build on port 3100. `test:e2e` uses installed Google Chrome, `test:e2e:review` runs focused accessibility/keyboard/layout checks across Chrome, Firefox and WebKit, and `test:e2e:all` runs the full suite across those engines. Firefox/WebKit need the browser installation command above. Playwright WebKit does not replace real Safari/device acceptance. If Chrome is unavailable, install Playwright Chromium and change the `channel` setting in `playwright.config.ts` to match your environment. Browser tests use disposable browser contexts; they do not reset a real user workspace. See [engineering acceptance review](../docs/WEB_ACCEPTANCE_REVIEW.md) for findings, coverage and remaining platform checks.

Production preview: `npm run build` then `npm start`.

## Structure

- `src/app`: public server pages, metadata and shared styles. `(workspace)/layout.tsx` owns privacy/workspace/auth providers for the app routes without changing their URLs. Public pages work without browser storage.
- `src/components`: responsive app shell, HTML form controls/dialogs and workspace provider.
- `src/lib`: store factory, central RTK Query injection seam and IndexedDB repository.
- `src/features/*/*.ts`, `src/store/appSlice.ts`, `src/types.ts`, `src/utils`: reviewed pure mobile-domain snapshot, plus web-specific History view helpers. The manifest hashes are verified against mobile and web. Browser UI lives under each feature's `components/` directory.
- `src/features/public`: client-style landing, shared public chrome, contact copy action and public CSS.
- `public`: existing C&P branding and self-hosted client fonts.
- `tests`: inherited domain regressions and browser theme property checks. `e2e`: functional, accessibility, keyboard and responsive scenarios across the three configured browser engines.

The web snapshot avoids importing native dependencies or requiring the mobile build to run. Reconcile any domain change intentionally on both platforms; a shared pure package should replace the snapshot before sustained parallel changes. Do not change manifest hashes to hide behavior drift.

## Local data and API boundary

IndexedDB database `clocked-paid-web` stores versioned state for this origin. Each save reads the latest snapshot and commits the reducer result in one transaction; commands can prepare/validate synchronously against that snapshot. History corrections, Pay forms and Jobs forms reject stale originals rather than overwriting newer records. Pay validates receipt overlap and deduction consumption against the latest transaction snapshot. Failures retain existing UI state and inputs. Multiple tabs broadcast revision changes. Initial hydration is separate from ordinary updates, so toggling pay visibility cannot accidentally trigger startup privacy defaults. Current workspace and recovery writes share one transaction; reset clears both atomically. Local privacy/mock-password digests live in a separate browser database and are excluded from backups. See the Settings parity document for gate and platform limits.

No real credentials are stored or real billing/auth/cloud writes made. Free/Premium is a local preview. Future backend endpoints belong behind the repository/RTK Query boundary, not inside UI components. Never modify `../backend/` during frontend work.

Visual references: client `src/index.css`, `src/App.tsx`, Tracker page and components. Inter/JetBrains Mono font assets and C&P branding come from the supplied project. The implementation uses [Next.js App Router](https://nextjs.org/docs/app/getting-started) and the [Redux Next.js store-provider pattern](https://redux.js.org/usage/nextjs).
