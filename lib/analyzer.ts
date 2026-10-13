import { Analysis, ArchEdge, ArchNode, FeatureTrace, Finding, InputFile, RouteInfo, SourceFileMeta, TraceStep, hashContent, uid } from './types';
import { detectSecretKinds, isSensitivePath } from './security';

export const ANALYZER_VERSION = 'reverselearn-analyzer/1.0.0';

const LANG: Record<string, string> = { ts: 'TypeScript', tsx: 'TypeScript (React)', js: 'JavaScript', jsx: 'JavaScript (React)', json: 'JSON', css: 'CSS', html: 'HTML', md: 'Markdown', sql: 'SQL', py: 'Python', prisma: 'Prisma', yml: 'YAML', yaml: 'YAML' };
function ext(p: string) { const m = p.split('.').pop()?.toLowerCase() || ''; return m; }
function category(p: string): SourceFileMeta['category'] {
  const l = p.toLowerCase();
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(l) || l.includes('/tests/') || l.includes('/__tests__/')) return 'test';
  if (l.includes('prisma') || l.endsWith('.sql') || l.includes('/db/') || l.includes('schema')) return 'database';
  if (/(route|api|server|handler)/.test(l) && !l.includes('/components/')) return l.includes('/api/') || l.includes('route.') ? 'backend' : category2(l);
  if (l.endsWith('.json') || l.endsWith('.yml') || l.endsWith('.yaml') || l.includes('config') || l.includes('.config.')) return 'config';
  if (l.endsWith('.md')) return 'docs';
  if (/\.(tsx|jsx)$/.test(l) || l.includes('/components/') || l.includes('/app/') || l.includes('/pages/')) return 'frontend';
  return 'other';
}
function category2(l: string): SourceFileMeta['category'] { return /\.(tsx|jsx)$/.test(l) ? 'frontend' : 'backend'; }

function lineOf(content: string, needle: string | RegExp): number | undefined {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) { if (typeof needle === 'string' ? lines[i].includes(needle) : needle.test(lines[i])) return i + 1; }
  return undefined;
}
function symbolsOf(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of content.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g)) out.add(m[1]);
  return [...out].slice(0, 20);
}

export function analyzeProject(input: InputFile[], excludedCount = 0): Analysis {
  const warnings: string[] = [];
  const languages: Record<string, number> = {};
  const files: SourceFileMeta[] = [];
  const sensitiveFiles: string[] = [];
  const byPath = new Map(input.map((f) => [f.path, f.content]));

  for (const f of input) {
    const language = LANG[ext(f.path)] || 'Other';
    languages[language] = (languages[language] || 0) + 1;
    const sensitive = isSensitivePath(f.path) || detectSecretKinds(f.content).length > 0;
    if (sensitive) sensitiveFiles.push(f.path);
    files.push({ path: f.path, language, size: f.content.length, hash: hashContent(f.content), category: category(f.path), redacted: sensitive, sensitive, symbols: symbolsOf(f.content) });
  }

  // Manifests / stack
  let deps: string[] = [], devDeps: string[] = [], pkgName = '';
  const pkgRaw = byPath.get('package.json') || [...byPath.entries()].find(([p]) => p.endsWith('/package.json'))?.[1];
  if (pkgRaw) { try { const pkg = JSON.parse(pkgRaw); pkgName = pkg.name || ''; deps = Object.keys(pkg.dependencies || {}); devDeps = Object.keys(pkg.devDependencies || {}); } catch { warnings.push('package.json could not be parsed as JSON.'); } }
  const allDeps = [...deps, ...devDeps];
  const frameworks: string[] = [];
  const detect = (cond: boolean, label: string) => { if (cond) frameworks.push(label); };
  detect(allDeps.includes('next'), 'Next.js'); detect(allDeps.includes('react'), 'React');
  detect(allDeps.includes('vue'), 'Vue'); detect(allDeps.includes('svelte'), 'Svelte');
  detect(allDeps.includes('express'), 'Express'); detect(allDeps.includes('@prisma/client') || input.some((f) => f.path.endsWith('.prisma')), 'Prisma');
  detect(allDeps.some((d) => d.includes('supabase')), 'Supabase'); detect(allDeps.some((d) => d.includes('firebase')), 'Firebase');
  detect(allDeps.some((d) => d.includes('tailwind')), 'Tailwind CSS'); detect(allDeps.includes('typescript') || input.some((f) => f.path.endsWith('.ts')), 'TypeScript');
  if (!pkgRaw && input.some((f) => f.path.endsWith('.py'))) frameworks.push('Python (deep analysis not yet supported)');
  if (!frameworks.length) warnings.push('No known framework detected from manifests. Findings are limited to file inventory and pattern search — this is stated honestly rather than guessed.');

  // Routes
  const routes: RouteInfo[] = [];
  for (const f of input) {
    const p = f.path;
    const appPage = p.match(/(?:^|\/)app\/(?:(.*)\/)?(page|route)\.(tsx|ts|jsx|js)$/);
    const pagesFile = p.match(/(?:^|\/)pages\/(.+)\.(tsx|ts|jsx|js)$/);
    if (appPage) {
      const kind = appPage[2] === 'route' ? 'api' : 'page';
      routes.push({ path: '/' + (appPage[1] ? appPage[1].replace(/\[(.+?)\]/g, ':$1') : ''), file: p, kind, methods: kind === 'api' ? methodsIn(f.content) : ['GET'], line: 1 });
    } else if (pagesFile && !pagesFile[1].startsWith('_')) {
      const isApi = pagesFile[1].startsWith('api/');
      routes.push({ path: '/' + pagesFile[1].replace(/index$/, '').replace(/\[(.+?)\]/g, ':$1'), file: p, kind: isApi ? 'api' : 'page', methods: isApi ? ['GET/POST (default handler)'] : ['GET'], line: 1 });
    }
    // Express-style
    for (const m of f.content.matchAll(/\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g)) {
      routes.push({ path: m[2], file: p, kind: 'api', methods: [m[1].toUpperCase()], line: lineOf(f.content, m[0].slice(0, 24)) });
    }
  }

  const findings: Finding[] = [];
  const add = (kind: string, title: string, summary: string, evidence: Finding['evidence'], confidence: Finding['confidence'], limitations?: string[]) =>
    findings.push({ id: uid(), kind, title, summary, evidence, confidence, limitations });

  if (pkgRaw) add('stack', `Detected stack: ${frameworks.join(', ') || 'unknown'}`, `package.json${pkgName ? ` for "${pkgName}"` : ''} lists ${deps.length} runtime and ${devDeps.length} dev dependencies. Framework labels above are read directly from those dependency names.`, [{ path: [...byPath.keys()].find((p) => p.endsWith('package.json')) || 'package.json' }], 'observed');
  for (const r of routes) add(r.kind === 'api' ? 'api' : 'route', `${r.kind === 'api' ? 'API route' : 'Page route'} ${r.path}`, `Defined in ${r.file}. Methods: ${r.methods.join(', ')}.`, [{ path: r.file, startLine: r.line }], 'observed');

  // DB, auth, external, tests — pattern evidence only
  const dbHits = input.filter((f) => /prisma\.|from\s+['"][^'"]*db|create table|INSERT INTO|SELECT .* FROM/i.test(f.content));
  for (const f of dbHits.slice(0, 8)) add('database', `Possible database access in ${f.path.split('/').pop()}`, 'A database-looking pattern (ORM call or SQL) was found. Exact runtime behaviour cannot be proven by static reading alone.', [{ path: f.path, startLine: lineOf(f.content, /prisma\.|INSERT INTO|SELECT .* FROM/i) }], 'observed', ['Static analysis only — not executed.']);
  const authHits = input.filter((f) => /getServerSession|auth\(\)|requireAuth|jsonwebtoken|next-auth|clerk|supabase\.auth/i.test(f.content));
  for (const f of authHits.slice(0, 6)) add('auth', `Authentication pattern in ${f.path.split('/').pop()}`, 'Auth-related import/call detected. Whether every route enforces it correctly requires reading each handler and runtime testing.', [{ path: f.path, startLine: lineOf(f.content, /getServerSession|next-auth|clerk|supabase\.auth/i) }], 'inferred', ['Presence of an auth library is not proof the app is secure.']);
  const extHits = input.filter((f) => /fetch\(\s*['"]https?:\/\//.test(f.content));
  for (const f of extHits.slice(0, 6)) add('external', `External HTTP call in ${f.path.split('/').pop()}`, 'An absolute-URL fetch was found. The external service identity is taken from the URL host in that line.', [{ path: f.path, startLine: lineOf(f.content, /fetch\(\s*['"]https?:\/\//) }], 'observed');
  const testFiles = files.filter((f) => f.category === 'test');
  add('tests', testFiles.length ? `${testFiles.length} test file(s) found` : 'No test files found', testFiles.length ? `Tests live at: ${testFiles.slice(0, 5).map((t) => t.path).join(', ')}. Coverage % is unknown without running them.` : 'No test files matched common patterns. That is a learning opportunity: the Change Lab suggests adding one.', testFiles.slice(0, 5).map((t) => ({ path: t.path })), testFiles.length ? 'observed' : 'unverified', ['ReverseLearn does not execute imported code.']);

  // Env var NAMES only
  const envNames = new Set<string>();
  for (const f of input) for (const m of f.content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) envNames.add(m[1]);
  if (sensitiveFiles.length) warnings.push(`${sensitiveFiles.length} file(s) look sensitive (name or secret pattern). Their values are redacted in the explorer and excluded from lesson context by default: ${sensitiveFiles.slice(0, 5).join(', ')}`);
  if (excludedCount) warnings.push(`${excludedCount} file(s)/folder(s) were excluded by default (dependencies, build output, .git, etc.).`);

  // Architecture graph — derived from findings, never hand-invented
  const nodes: ArchNode[] = []; const edges: ArchEdge[] = [];
  const hasPages = routes.some((r) => r.kind === 'page'); const hasApi = routes.some((r) => r.kind === 'api');
  if (hasPages) nodes.push({ id: 'ui', type: 'UI', label: 'Browser / UI pages', detail: `${routes.filter((r) => r.kind === 'page').length} page route(s) discovered.`, evidence: routes.filter((r) => r.kind === 'page').slice(0, 4).map((r) => ({ path: r.file, startLine: r.line })), confidence: 'observed' });
  if (hasApi) nodes.push({ id: 'api', type: 'API', label: 'API / server handlers', detail: `${routes.filter((r) => r.kind === 'api').length} API route(s) discovered.`, evidence: routes.filter((r) => r.kind === 'api').slice(0, 4).map((r) => ({ path: r.file, startLine: r.line })), confidence: 'observed' });
  if (dbHits.length) nodes.push({ id: 'db', type: 'Database', label: 'Database / ORM', detail: 'Database access patterns found in source.', evidence: dbHits.slice(0, 4).map((f) => ({ path: f.path })), confidence: 'inferred' });
  if (authHits.length) nodes.push({ id: 'auth', type: 'Auth', label: 'Authentication', detail: 'Auth patterns found. Enforcement per-route is unverified.', evidence: authHits.slice(0, 3).map((f) => ({ path: f.path })), confidence: 'inferred' });
  if (extHits.length) nodes.push({ id: 'ext', type: 'External', label: 'External services', detail: 'Absolute-URL HTTP calls found.', evidence: extHits.slice(0, 3).map((f) => ({ path: f.path })), confidence: 'observed' });
  if (!nodes.length) nodes.push({ id: 'files', type: 'Files', label: 'Source files (no routes detected)', detail: 'Only a file inventory could be built. Open the Codebase Explorer to inspect manually.', evidence: files.slice(0, 3).map((f) => ({ path: f.path })), confidence: 'unverified' });
  if (hasPages && hasApi) edges.push({ from: 'ui', to: 'api', label: 'pages call / are served alongside API routes (verify per-feature in traces)', confidence: 'inferred' });
  if (hasApi && dbHits.length) edges.push({ from: 'api', to: 'db', label: 'handlers contain DB patterns', confidence: 'inferred' });
  if (authHits.length && hasApi) edges.push({ from: 'auth', to: 'api', label: 'auth checks expected in handlers — verify each one', confidence: 'unverified' });

  // Feature traces
  const traces: FeatureTrace[] = routes.slice(0, 12).map((r) => buildTrace(r, input, dbHits.map((f) => f.path), authHits.map((f) => f.path), testFiles.map((f) => f.path)));

  return { version: ANALYZER_VERSION, analyzedAt: new Date().toISOString(), languages, frameworks, dependencies: deps, devDependencies: devDeps, files: files.sort((a, b) => a.path.localeCompare(b.path)), routes, findings, nodes, edges, traces, warnings, excludedCount, sensitiveFiles, envVarNames: [...envNames].sort() };
}

function methodsIn(content: string): string[] {
  const ms = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(content));
  return ms.length ? ms : ['(handler present, method unclear)'];
}

function buildTrace(r: RouteInfo, input: InputFile[], dbFiles: string[], authFiles: string[], testFiles: string[]): FeatureTrace {
  const file = input.find((f) => f.path === r.file);
  const content = file?.content || '';
  const usesFetch = /fetch\(/.test(content);
  const steps: TraceStep[] = []; const unknowns: string[] = [];
  const step = (title: string, body: string, confidence: TraceStep['confidence'], evidence: TraceStep['evidence'] = []) => steps.push({ title, body, confidence, evidence });
  if (r.kind === 'page') {
    step('1 · User action', `The learner opens ${r.path} in the browser. Which button/form starts a specific action must be confirmed by reading the component.`, 'observed', [{ path: r.file, startLine: 1 }]);
    step('2 · Frontend', `Page component in ${r.file} renders the UI. Event handlers (onClick/onSubmit) in that file are the next thing to inspect.`, 'observed', [{ path: r.file }]);
    step('3 · Transport', usesFetch ? 'This file contains a fetch() call — open it to see the URL, method and payload shape.' : 'No fetch() was found in this file. It may use a server component, a form action, a library client, or do no network call at all.', usesFetch ? 'observed' : 'unverified', [{ path: r.file }]);
  } else {
    step('1 · User action', `Something in the UI (or an external client) sends a request to ${r.path}. Find the caller by searching the codebase for "${r.path}".`, 'inferred', [{ path: r.file }]);
    step('2 · Transport', `Methods detected: ${r.methods.join(', ')}. Request/response shapes must be read from the handler body.`, 'observed', [{ path: r.file, startLine: r.line }]);
    step('3 · Backend handler', `Handler in ${r.file}. Check: auth first, then input validation, then business logic, then error handling — in that order.`, 'observed', [{ path: r.file }]);
  }
  step('4 · Data', dbFiles.length ? `Database patterns were found in: ${dbFiles.slice(0, 3).join(', ')}. Confirm this specific feature actually uses one of them.` : 'No database pattern was found anywhere in the imported files.', dbFiles.length ? 'inferred' : 'unverified', dbFiles.slice(0, 3).map((p) => ({ path: p })));
  step('5 · Auth', authFiles.includes(r.file) ? 'This file itself contains an auth pattern.' : 'No auth pattern was found inside this file. If this feature should be private, that is worth investigating — it is not proof of a vulnerability.', authFiles.includes(r.file) ? 'observed' : 'unverified', [{ path: r.file }]);
  step('6 · Tests', testFiles.length ? `Existing test files: ${testFiles.slice(0, 3).join(', ')}. Search them for "${r.path}" to see if this feature is covered.` : 'No tests found. A good first exercise is writing a test for this route.', testFiles.length ? 'inferred' : 'unverified', testFiles.slice(0, 3).map((p) => ({ path: p })));
  if (!usesFetch && r.kind === 'page') unknowns.push('Network step could not be verified from this file alone.');
  if (!dbFiles.length) unknowns.push('Persistence step unknown — no DB pattern detected.');
  return { id: 'trace-' + r.path.replace(/[^a-z0-9]+/gi, '-'), name: `${r.kind === 'api' ? 'API' : 'Page'} ${r.path}`, steps, unknowns };
}

/** Compare two snapshots → added/removed/modified paths (for re-analysis / stale marking). */
export function compareHashes(before: Record<string, string>, after: Record<string, string>) {
  const added = Object.keys(after).filter((p) => !(p in before));
  const removed = Object.keys(before).filter((p) => !(p in after));
  const modified = Object.keys(after).filter((p) => p in before && before[p] !== after[p]);
  return { added, removed, modified };
}
