# Security & privacy notes

- **Untrusted input:** imported ZIPs are never executed, dependencies are never installed, and no script runs during analysis.
- **Archive safety (`lib/security.ts`, unit-tested):** `../` and absolute paths rejected, symlinks not followed (only string entries read), limits of 30 MB zip / 2,000 files / 25 MB uncompressed / 512 KB per file, binary files skipped, default exclusions for `node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`, `vendor`.
- **Secrets:** `.env*`, `*.pem`, `*.key`, secret/credential filenames, and detected secret patterns are redacted before display; environment variable *names only* are ever listed. Detection returns pattern names, never values (tested).
- **Data location:** everything lives in the browser's IndexedDB on the user's device. No AI provider is configured by default, so no source leaves the device. If a provider is enabled later it must be server-side only (never `NEXT_PUBLIC_`), disclosed in Settings, with secret-bearing files excluded from context.
- **Prompt injection:** repository text is treated as data; there is no instruction channel from source files to any agent in this MVP.
- **Deletion/export:** Project Settings deletes the IndexedDB record (confirmed) and exports learning data as JSON.
