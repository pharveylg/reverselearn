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
| `lib/analyzer.ts` | Staged analysis: inventory → stack → routes → DB/auth/external/tests → nodes/edges → traces; `compareHashes` for stale detection |
| `lib/lessons.ts` | Lessons (3 levels), progressive exercises, learning path — from analysis only |
| `lib/diff.ts` | Line diff (LCS) + stats |
| `lib/storage.ts` | IndexedDB (`reverselearn/projects`) |
| `lib/sample.ts` + `fixtures/` | Labelled SAMPLE fixture, also the test fixture |
| `app/page.tsx` | 9 screens, view state, progress tracking |

## Data model (MVP subset of spec §5)
`Project { id, name, description, files: InputFile[], analysis: Analysis, progress, changeProposals, stale }` persisted per-project in IndexedDB. `Analysis` embeds the spec's `Finding/EvidenceRef/ArchitectureNode/Edge/FeatureTrace` types (`lib/types.ts`). Analysis version (`ANALYZER_VERSION`) is stored so stale findings can be detected on re-import.

## Extension points (Phase 2/3, interfaces already allow them)
Git import (produce the same `InputFile[]`), server AI adapter behind `AI_PROVIDER` env, Postgres sync of the same `Project` shape, more language analyzers as additional stages in `analyzer.ts`.

## Dev View & live-app companion mode
ReverseLearn does not embed or proxy the user's deployed app and never collects its credentials: framing is commonly blocked (X-Frame-Options/CSP) and logins must remain on the app's own origin. Instead, Overview offers a companion mode: the user opens the deployed app in a new tab (logging in there), while ReverseLearn's route list maps each live screen to its route file, feature trace, and a "Learn the tech" lesson. The in-app Dev View tutor bar provides contextual tidbits per screen from the current project's actual detected tech.
