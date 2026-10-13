# Security & privacy notes

- **Untrusted input:** imported ZIPs are never executed, dependencies are never installed, and no script runs during analysis.
- **Archive safety (`lib/security.ts`, unit-tested):** `../` and absolute paths rejected, symlinks not followed (only string entries read), limits of 30 MB zip / 2,000 files / 25 MB uncompressed / 512 KB per file, binary files skipped, default exclusions for `node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`, `vendor`.
- **Secrets:** `.env*`, `*.pem`, `*.key`, secret/credential filenames, and detected secret patterns are redacted before display; environment variable *names only* are ever listed. Detection returns pattern names, never values (tested).
- **Data location:** everything lives in the browser's IndexedDB on the user's device. No AI provider is configured by default, so no source leaves the device. If a provider is enabled later it must be server-side only (never `NEXT_PUBLIC_`), disclosed in Settings, with secret-bearing files excluded from context.
- **Prompt injection:** repository text is treated as data; there is no instruction channel from source files to any agent in this MVP.
- **Deletion/export:** Project Settings deletes the IndexedDB record (confirmed) and exports learning data as JSON.

## Expected local-run security alerts (not malware, but verify)
- **Windows SmartScreen / "unknown publisher"**: unsigned `.bat` files downloaded from the internet have no reputation. Expected. Only run launchers you obtained from this project; inspect them (they are ~25 lines of plain text).
- **macOS Gatekeeper**: `.command` is not notarized. Right-click > Open is the intended user-consent path; do not disable Gatekeeper globally.
- **Antivirus / EDR behavioural flags**: `npm install` downloads ~80 packages from registry.npmjs.org and executes their install lifecycle scripts, then Node opens a local listening port. On managed/corporate machines this can trigger software-install, script-execution, or local-server policies and may be blocked. Use a personal machine or get IT approval; do not bypass controls.
- **Firewall prompt**: minimized by binding to `127.0.0.1` only (launchers do this). If prompted anyway, choosing "private/home network only" or denying inbound access still lets the app work in your own browser.
- **Dependency audit**: `npm audit` currently reports transitive findings (mostly dev/build tooling). They affect the build machine's tooling risk, not imported projects — ReverseLearn never installs or runs imported code. Review `npm audit` output, keep dependencies updated.
- **Imported source at rest**: projects are stored unencrypted in the browser's IndexedDB profile. On shared machines, delete projects from Settings after use and treat the browser profile as you would the source folder itself.

- **GitHub-link import:** requests go from the browser directly to `api.github.com`. An optional private-repo token is held only in component memory, sent only to `api.github.com`, cleared after import, and never written to IndexedDB/logs. Prefer fine-grained tokens scoped to one repo with Contents: Read-only, and revoke them after use if you do not need re-import.
