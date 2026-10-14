# ReverseLearn

**Understand any app an AI built for you — from evidence in the actual code, not guesses.**

Import a project built by Claude, ChatGPT, Cursor, Lovable, Bolt, Replit, v0, or any other tool. ReverseLearn maps its architecture, traces one feature end-to-end, teaches the concepts at your level, gives you exercises, and helps you propose a small change safely.

> 🔒 **Local-first MVP:** analysis runs entirely in your browser. Your source code is never uploaded, never executed, and stored only in your browser's IndexedDB. No account, no database, and **no AI API key is required** — lessons are generated deterministically from real file evidence. Secret-looking files are redacted and never shown with values.

## Run it online (GitHub Pages)

**Live app: https://pharveylg.github.io/reverselearn/**

GitHub Pages serves a static export from the `gh-pages` branch. Publishing is currently a manual step (the auto-deploy workflow needs to be added through GitHub's web UI with workflow permission); Pages does not run the app server. Analysis still happens only in the visitor's browser, and projects are stored in that browser only.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Then either:
1. Click **Load the labelled SAMPLE app** (30 seconds, teaches you the tool), or
2. **Import project** → paste the app's **GitHub repo link** (`https://github.com/you/your-app`, a `…/tree/branch/folder` link, or just `you/your-app`) — public repos need no token; private repos take an optional fine-grained **Contents: Read-only** token that is used once in memory and never saved — or upload a ZIP.

Production check:

```bash
npm test           # 28 unit tests: ZIP safety, secret redaction, analysis, browser URL policy, diff
npm run typecheck  # TypeScript
npm run build      # production build
```

## Import sources

| Source | How |
|---|---|
| **GitHub link** | Paste the repo/folder URL on the Import screen. Fetched via the GitHub API in your browser (60 req/hr unauthenticated; token raises it). Re-importing the same link compares changes and marks stale lessons. |
| ZIP upload | See the table below. |

## How to import your next AI-built app

| Tool | How to get a ZIP |
|---|---|
| GitHub | Green **Code** button → **Download ZIP** |
| Lovable / Bolt / Replit / v0 | Export / Download project, or connect it to GitHub then use the row above |
| Claude / ChatGPT / Cursor (local folder) | Zip the project folder yourself — delete `node_modules` and any `.env` first |

On import you get: file count, detected languages/framework, routes & API handlers, database/auth/external patterns, a file inventory, and warnings explaining exactly what was excluded and why. Findings are labelled **Observed** (directly in source), **Inferred** (likely — check it), or **Unverified** (needs running the app). Steps ReverseLearn cannot prove are marked unknown instead of invented.

### Aligned to your app's own architecture diagram

Most AI-built apps ship a diagram (README, `docs/architecture.md`, Mermaid/PlantUML, `.mmd`). ReverseLearn parses it, orders your **Learning Path by the diagram's flow**, and checks **every box against real code**: boxes get ✓ *matched* (with the files) or ⚠️ *declared only — not found in code* (planned / renamed / external / stale diagram), and code areas missing from the diagram become their own module. The diagram is treated as a claim to verify, never as proof.

### Learn the tech behind any feature or function

In **Learning Path** and **Lesson Workspace** (and from Feature Trace / the code explorer), pick a feature or a named function and get its full technology breakdown, layer by layer — React components/state, events and controlled forms, fetch/HTTP and JSON, async/await, API route handlers, validation and status codes, Prisma/ORM and SQL, auth/sessions, env config, TypeScript and tests. For each one: a plain-language explanation at your chosen level, how it works under the hood, how *this* feature/function uses it (with file:line evidence), what to learn next, and a self-check question. Technologies not detected are stated as missing/unverified (e.g. "no auth found") instead of being invented.

### Use your app inside ReverseLearn

From **Project Overview**, enter your deployed app's HTTPS URL and choose **Open inside ReverseLearn**. The Live App Browser shows the site beside a learning panel: select the route you're on (manually, because browser same-origin rules prevent ReverseLearn from reading the app's page or URL) to see its source file, detected tech and **Learn more** / **Trace feature** actions. The address field won't track links clicked inside the frame; paste a URL or pick a route to map the page. You can also choose **Open in a separate tab**.

This is an optional, cross-origin sandboxed frame — not a full Chrome replacement. The deployed site runs in your browser as a website, but ReverseLearn cannot read its contents, credentials, cookies, or session. Only the app's origin is persisted; the current path/query stays in memory. Some hosts prohibit framing or some sign-in flows block third-party cookies; use the separate-tab fallback in that case. Never paste passwords or one-time tokens into ReverseLearn, and only load deployed apps you trust. Imported source files are still never executed by the analyzer.

## The learning loop

Import → architecture map → pick a feature → trace its flow (UI → transport → backend → data → tests) → lesson at Beginner/Intermediate/Advanced → exercises (identify → predict → trace → find missing validation → tiny change → test plan → explain it back) → **Change Lab**: describe a change, review the exact diff, tick approval, export a `.patch` (nothing is written before approval; ReverseLearn only ever edits its own copy — rollback is re-importing your original ZIP).

## Architecture

```
ZIP (untrusted) ─▶ lib/security.ts   path-traversal/bomb guards, exclusions, secret redaction
                ─▶ lib/zip.ts        safe in-browser extraction (limits enforced)
                ─▶ lib/analyzer.ts   deterministic static analysis → findings, routes,
                                     architecture nodes/edges, feature traces (typed, evidence-linked)
                ─▶ lib/lessons.ts    lessons / exercises / learning path from analysis only
                ─▶ lib/diff.ts       Change Lab diff (LCS), requires explicit approval
                ─▶ lib/storage.ts    IndexedDB persistence (on-device only)
UI: app/page.tsx — Dashboard, Import, Overview, Live App Browser, Explorer, Trace,
    Learning Path, Lesson Workspace, Change Lab, Settings (all client-side)
```

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Security: [`docs/SECURITY.md`](docs/SECURITY.md)

**Why Next.js but no server/DB?** The spec's priority is a usable vertical slice. A local-first design gives the strongest privacy story for other people's source code, zero setup, and free static-ish hosting. The analyzer is framework-agnostic pure TypeScript, so a future server, Postgres persistence, accounts, and a server-side AI adapter (`AI_PROVIDER=openai|anthropic`, see `.env.example`) can be added behind the same interfaces — they were deliberately not built before the MVP loop works.

## Current limitations (honest)

- Imports support ZIP and GitHub repository/folder links. Re-import comparison and stale-marking are included.
- Deep analysis targets JavaScript/TypeScript, React/Next.js, Node APIs, Prisma/SQL patterns. Other languages get inventory + honest warnings.
- Static analysis cannot prove runtime behaviour, auth correctness, or coverage %. The analyzer never executes imported code; the optional Live App Browser loads a deployed site separately in an isolated frame.
- Lessons without an AI key are template-based from evidence excerpts; follow-up free-form Q&A is file/lesson navigation, not a chat model.
- Data lives in one browser. Export learning data (JSON) from Project Settings to move it.

## Deploy to Vercel

Import this repo at [vercel.com/new](https://vercel.com/new) — framework preset **Next.js**, no environment variables needed for the MVP. Or: `npx vercel`.

## Tests & acceptance mapping

`tests/security.test.ts` (traversal rejection, exclusions, secret detection/redaction without leaking values), `tests/analyzer.test.ts` (sample fixture stack/route detection, evidence paths must exist, traces label unknowns, hash-compare for stale detection), `tests/diff.test.ts` (Change Lab diff never mutates inputs). These cover spec acceptance items 2–7, 10–12 at unit level; UI flows (1, 8, 9, 14) are exercised manually via the SAMPLE app. Multi-user authorization (13) is N/A until accounts exist — projects are device-local.
