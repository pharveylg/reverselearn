# ReverseLearn — Architecture

## Decisions
1. **Local-first Next.js (App Router), TypeScript.** All analysis is client-side pure functions; no DB/auth in MVP (spec §5 permits a simpler single-user schema; §10 says do not build multi-tenant infra before needed).
2. **Deterministic before AI.** Inventory/framework/route/DB/auth/test detection is regex + manifest parsing with typed `Finding` output (`kind, evidence[{path,startLine}], confidence: observed|inferred|unverified, limitations`). AI (optional, later) may only explain retrieved evidence — it never replaces parsing.
3. **Evidence invariant (tested):** every finding's cited path must exist in the snapshot; unprovable trace steps are `unverified` with explicit `unknowns`.
4. **Change Lab safety:** diff is generated from edited text, shown in full, and requires a checkbox + explicit Apply. Default action is exporting a `.patch`. ReverseLearn never writes to the user's real project.

## Modules
| Module | Responsibility |
|---|---|
| `lib/security.ts` | ZIP path normalization, exclusions, size limits, secret detection/redaction |
| `lib/zip.ts` | Browser ZIP extraction under those limits |
| `lib/live-browser.ts` | Live-app URL validation and origin-only persistence policy |
| `lib/analyzer.ts` | Staged analysis: inventory → stack → routes → DB/auth/external/tests → nodes/edges → traces; `compareHashes` for stale detection |
| `lib/lessons.ts` | Lessons (3 levels), progressive exercises, learning path — from analysis only |
| `lib/diff.ts` | Line diff (LCS) + stats |
| `lib/storage.ts` | IndexedDB (`reverselearn/projects`) |
| `lib/sample.ts` + `fixtures/` | Labelled SAMPLE fixture, also the test fixture |
| `app/page.tsx` | 10 screens, view state, progress tracking, optional live-app iframe |

## Data model (MVP subset of spec §5)
`Project { id, name, description, files: InputFile[], analysis: Analysis, progress, changeProposals, stale, liveUrl? }` persisted per-project in IndexedDB; `liveUrl` stores only the target origin. `Analysis` embeds the spec's `Finding/EvidenceRef/ArchitectureNode/Edge/FeatureTrace` types (`lib/types.ts`). Analysis version (`ANALYZER_VERSION`) is stored so stale findings can be detected on re-import.

## Extension points (Phase 2/3, interfaces already allow them)
Git import (produce the same `InputFile[]`), server AI adapter behind `AI_PROVIDER` env, Postgres sync of the same `Project` shape, more language analyzers as additional stages in `analyzer.ts`.

## Dev View & live-app companion mode
Overview offers an optional Live App Browser: it loads the explicitly supplied HTTPS app URL in a cross-origin sandboxed iframe beside a route/learning panel. A separate-tab fallback is provided. No app proxy or source fetch is used. ReverseLearn cannot inspect the framed document or infer which route the user reached; the learner manually selects a route, which maps to the imported route file, detected technologies, feature trace, and lesson. The Dev View tutor bar provides contextual notes based on the current project's actual detected tech.

The URL policy (`lib/live-browser.ts`) accepts only HTTP(S), rejects URL userinfo and ReverseLearn's own origin, requires HTTPS for deployed sites, and allows HTTP only for localhost-to-localhost development. Only the target origin is persisted; route, query, and fragment stay in component memory. The frame uses `referrerPolicy=no-referrer` and a sandbox that allows scripts/forms and popup-based auth but denies top-level navigation. The remote deployed app's code executes inside the browser frame as a website only after the user explicitly opens its URL; imported repository files are still never executed by the analyzer. The parent app cannot read cross-origin page content, credentials, cookies, or session. The target host may reject framing (CSP `frame-ancestors` / X-Frame-Options), and browser third-party cookie rules or an auth provider may prevent embedded sign-in. ReverseLearn does not bypass either; use the separate-tab fallback.
