# ReverseLearn

**Understand any app an AI built for you — from evidence in the actual code, not guesses.**

Import a project built by Claude, ChatGPT, Cursor, Lovable, Bolt, Replit, v0, or any other tool. ReverseLearn maps its architecture, traces one feature end-to-end, teaches the concepts at your level, gives you exercises, and helps you propose a small change safely.

> 🔒 **Local-first MVP:** analysis runs entirely in your browser. Your source code is never uploaded, never executed, and stored only in your browser's IndexedDB. No account, no database, and **no AI API key is required** — lessons are generated deterministically from real file evidence. Secret-looking files are redacted and never shown with values.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Then either:
1. Click **Load the labelled SAMPLE app** (30 seconds, teaches you the tool), or
2. **Import project** → upload a ZIP of a real app.

Production check:

```bash
npm test           # 11 unit tests: zip safety, secret redaction, analyzer, diff
npm run typecheck  # TypeScript
npm run build      # production build
```

## How to import your next AI-built app

| Tool | How to get a ZIP |
|---|---|
| GitHub | Green **Code** button → **Download ZIP** |
| Lovable / Bolt / Replit / v0 | Export / Download project, or connect it to GitHub then use the row above |
| Claude / ChatGPT / Cursor (local folder) | Zip the project folder yourself — delete `node_modules` and any `.env` first |

On import you get: file count, detected languages/framework, routes & API handlers, database/auth/external patterns, a file inventory, and warnings explaining exactly what was excluded and why. Findings are labelled **Observed** (directly in source), **Inferred** (likely — check it), or **Unverified** (needs running the app). Steps ReverseLearn cannot prove are marked unknown instead of invented.

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
UI: app/page.tsx — Dashboard, Import, Overview, Explorer, Trace, Learning Path,
    Lesson Workspace, Change Lab, Settings (Next.js App Router, all client-side)
```

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Security: [`docs/SECURITY.md`](docs/SECURITY.md)

**Why Next.js but no server/DB?** The spec's priority is a usable vertical slice. A local-first design gives the strongest privacy story for other people's source code, zero setup, and free static-ish hosting. The analyzer is framework-agnostic pure TypeScript, so a future server, Postgres persistence, accounts, and a server-side AI adapter (`AI_PROVIDER=openai|anthropic`, see `.env.example`) can be added behind the same interfaces — they were deliberately not built before the MVP loop works.

## Current limitations (honest)

- ZIP import only (Git URL import = Phase 2). Re-import comparison and stale-marking are included.
- Deep analysis targets JavaScript/TypeScript, React/Next.js, Node APIs, Prisma/SQL patterns. Other languages get inventory + honest warnings.
- Static analysis cannot prove runtime behaviour, auth correctness, or coverage %. ReverseLearn never executes imported code.
- Lessons without an AI key are template-based from evidence excerpts; follow-up free-form Q&A is file/lesson navigation, not a chat model.
- Data lives in one browser. Export learning data (JSON) from Project Settings to move it.

## Deploy to Vercel

Import this repo at [vercel.com/new](https://vercel.com/new) — framework preset **Next.js**, no environment variables needed for the MVP. Or: `npx vercel`.

## Tests & acceptance mapping

`tests/security.test.ts` (traversal rejection, exclusions, secret detection/redaction without leaking values), `tests/analyzer.test.ts` (sample fixture stack/route detection, evidence paths must exist, traces label unknowns, hash-compare for stale detection), `tests/diff.test.ts` (Change Lab diff never mutates inputs). These cover spec acceptance items 2–7, 10–12 at unit level; UI flows (1, 8, 9, 14) are exercised manually via the SAMPLE app. Multi-user authorization (13) is N/A until accounts exist — projects are device-local.
