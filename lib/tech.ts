import { Analysis, EvidenceRef, FeatureTrace, InputFile, Level } from './types';
import { redactSecrets } from './security';

export type TechConcept = {
  id: string; name: string; layer: string;
  plain: string;          // beginner explanation
  underTheHood: string;   // intermediate/advanced
  inThisCode: string;     // specific to the evidence
  learnNext: string;
  evidence: EvidenceRef[];
};
export type TechLayer = {
  layer: string; tech: string[]; howItWorks: string; inThisFeature: string;
  confidence: 'observed' | 'inferred' | 'unverified'; evidence: EvidenceRef[]; selfCheck: string;
};
export type FunctionTech = {
  file: string; symbol: string; signature: string; startLine: number; excerpt: string;
  inputs: string; output: string; concepts: TechConcept[];
};

type Rule = Omit<TechConcept, 'inThisCode' | 'evidence'> & { re: RegExp; note: string };
const RULES: Rule[] = [
  { id: 'component', name: 'React component & JSX', layer: 'Frontend', re: /export\s+(default\s+)?function\s+[A-Z]|return\s*\(\s*</, plain: 'A component is a function that returns a description of a piece of screen. JSX looks like HTML but is really JavaScript that builds UI elements.', underTheHood: 'React calls your function, compares the returned element tree with the previous one (reconciliation), and updates only the DOM nodes that changed.', learnNext: 'Props, JSX expressions {}, and why components re-render.', note: 'This file returns UI markup, so it is a component.' },
  { id: 'state', name: 'React state (useState)', layer: 'Frontend', re: /\buseState\s*\(/, plain: 'State is the screen\u2019s memory — e.g. what the user typed. When it changes, React redraws the affected part automatically.', underTheHood: 'useState stores a value plus a setter. Calling the setter schedules a re-render; the old value is never mutated in place.', learnNext: 'Controlled inputs, lifting state up, and useEffect for side-effects.', note: 'A useState call gives this screen memory (form text, loading flags, results).' },
  { id: 'effect', name: 'Side effects (useEffect)', layer: 'Frontend', re: /\buseEffect\s*\(/, plain: 'useEffect runs code after the screen appears — typically to load data.', underTheHood: 'Effects run after paint, re-run when their dependency array changes, and can return a cleanup function.', learnNext: 'Dependency arrays and race conditions when fetching.', note: 'A useEffect here runs after render, most likely to fetch or sync something.' },
  { id: 'events', name: 'Event handlers', layer: 'Frontend', re: /on(Click|Submit|Change)\s*=/, plain: 'An event handler is a function the browser runs when the user clicks, types, or submits.', underTheHood: 'React attaches listeners at the root and dispatches synthetic events; handlers often call preventDefault, update state, then start async work.', learnNext: 'Event objects, form submission, and keyboard accessibility.', note: 'An on* prop connects a user gesture to a function in this file.' },
  { id: 'forms', name: 'Controlled form inputs', layer: 'Frontend', re: /value=\{|onChange=/, plain: 'The input\u2019s displayed text comes from state, and every keystroke writes back into state — React is the single source of truth.', underTheHood: 'This makes validation, disabling buttons, and building the request payload straightforward, at the cost of a re-render per keystroke.', learnNext: 'Validation, touched/dirty state, and uncontrolled alternatives (refs/FormData).', note: 'An input here is bound to state with value + onChange.' },
  { id: 'fetch', name: 'HTTP requests with fetch', layer: 'Transport', re: /\bfetch\s*\(/, plain: 'fetch sends an HTTP request over the network — a method (GET/POST), a URL, headers, and often a JSON body — and later gets a response back.', underTheHood: 'fetch returns a Promise<Response>. Network failure rejects; HTTP 4xx/5xx do NOT reject — you must check response.ok/status yourself.', learnNext: 'HTTP methods, status codes, headers, and CORS.', note: 'A fetch call is this feature\u2019s bridge from browser to server.' },
  { id: 'json', name: 'JSON (data format)', layer: 'Transport', re: /JSON\.(stringify|parse)|\.json\(\)/, plain: 'JSON is text that represents data (objects, lists, strings, numbers). Both sides agree on its shape to talk to each other.', underTheHood: 'JSON.stringify turns values into text for the wire; parsing validates and rebuilds them. Dates and functions do not survive JSON.', learnNext: 'Schemas/validation (e.g. zod) and why APIs version their shapes.', note: 'Data is converted to/from JSON around the network call here.' },
  { id: 'async', name: 'Async / await & Promises', layer: 'Transport', re: /\basync\b|\bawait\b/, plain: 'Network and database work takes time. async/await lets code "pause here until that finishes" without freezing the screen or server.', underTheHood: 'await unwraps a Promise and yields to the event loop; errors surface as thrown exceptions you can catch. Forgetting await is a classic bug: you get the Promise, not the value.', learnNext: 'Promises, try/catch, and parallel vs sequential awaits.', note: 'This code awaits slow work (network/database) before continuing.' },
  { id: 'apiroute', name: 'API route handler', layer: 'Backend', re: /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+default\s+async\s+function\s+handler/, plain: 'This function runs on the server when a request hits its URL. It is the app\u2019s "reception desk" for data.', underTheHood: 'Framework routing maps the exported method name/file path to an HTTP endpoint; the handler receives a Request and must return a Response.', learnNext: 'REST conventions, middleware, and route parameters.', note: 'Exported HTTP-method functions make this file a server endpoint.' },
  { id: 'validation', name: 'Server-side validation', layer: 'Backend', re: /if\s*\(!|status:\s*400|zod|safeParse|\.parse\(/, plain: 'The server re-checks everything the browser sends, because anyone can send hand-crafted requests. Missing input → a 400 error instead of a crash or bad data.', underTheHood: 'Validate shape, types, ranges, and ownership — then business rules. Client validation is for UX; server validation is the actual security boundary.', learnNext: 'Status codes 400/401/403/404/500 and input schemas.', note: 'A guard/400-style check appears before the main work in this file.' },
  { id: 'response', name: 'HTTP responses & status codes', layer: 'Backend', re: /Response\.json|res\.(json|status)|NextResponse/, plain: 'The server answers with data plus a status number: 200 ok, 201 created, 400 bad input, 401 not signed in, 500 server error.', underTheHood: 'The UI should branch on status, not just parse the body. Consistent error shapes make debugging and UX far better.', learnNext: 'Designing error responses and loading/error UI states.', note: 'This handler builds the HTTP response the browser receives.' },
  { id: 'orm', name: 'ORM (Prisma-style database access)', layer: 'Data', re: /\bprisma\.|createMany|findMany|findUnique/, plain: 'An ORM lets code ask the database in app language — "create a Task with this title" — and translates it into SQL safely.', underTheHood: 'The ORM generates parameterized SQL (protecting against SQL injection), maps rows to typed objects, and pools connections.', learnNext: 'Models, relations (1-to-many), and reading generated SQL.', note: 'ORM calls like prisma.<model>.<action> are the actual database reads/writes here.' },
  { id: 'sql', name: 'SQL & relational data', layer: 'Data', re: /SELECT\s+.+\s+FROM|INSERT\s+INTO|CREATE\s+TABLE|model\s+\w+\s*\{/i, plain: 'Data lives in tables (rows and columns). A model/schema declares the table shape; queries insert, read, update, or delete rows.', underTheHood: 'Primary keys identify rows; foreign keys link tables; indexes make lookups fast; migrations evolve the shape over time.', learnNext: 'Keys, joins, indexes, and migrations.', note: 'A table/model definition or SQL statement defines where data persists.' },
  { id: 'auth', name: 'Authentication & sessions', layer: 'Auth', re: /getServerSession|auth\(\)|requireAuth|next-auth|clerk|supabase\.auth|session/i, plain: 'Auth answers "who is calling?" — usually via a signed cookie/token from sign-in — before the server trusts a request.', underTheHood: 'Common patterns: server-checked session cookies, or JWTs verified per request. Authentication (who) is different from authorization (what they may do).', learnNext: 'Cookies vs tokens, and per-record authorization checks.', note: 'An auth/session pattern appears in this code — check it runs before private data work.' },
  { id: 'env', name: 'Environment variables & secrets', layer: 'Config', re: /process\.env\./, plain: 'Configuration and secrets (database URL, API keys) are injected from outside the code so they are not hard-coded or committed.', underTheHood: 'Only names belong in code/docs. Values live in the host\u2019s env; anything prefixed for the browser (e.g. NEXT_PUBLIC_) is public by design.', learnNext: '.env files, secret rotation, and least-privilege keys.', note: 'This code reads configuration from process.env (names only are safe to share).' },
  { id: 'modules', name: 'Imports & modules', layer: 'Foundations', re: /^import\s/m, plain: 'import pulls in code from another file or library — the visible wiring diagram of the app.', underTheHood: 'Bundlers/servers resolve these into a dependency graph; following imports is how you navigate any codebase.', learnNext: 'Default vs named exports, and circular-import pitfalls.', note: 'The imports at the top list everything this file depends on.' },
  { id: 'types', name: 'TypeScript types', layer: 'Foundations', re: /:\s*(string|number|boolean|Request|Response|React\.|Promise<)|interface\s+\w+|type\s+\w+\s*=/, plain: 'Types are labels that say "this must be text / a number / a Request", letting the editor catch mismatches before the app runs.', underTheHood: 'Types are erased at runtime — they guide developers and tooling but do not validate real user input by themselves.', learnNext: 'Interfaces, generics (Promise<T>), and runtime validation vs types.', note: 'Typed parameters/values describe the contracts this code expects.' },
  { id: 'errors', name: 'Error handling (try/catch)', layer: 'Backend', re: /try\s*\{|catch\s*\(/, plain: 'When something fails, try/catch decides: show a friendly error, retry, or safely stop — instead of crashing.', underTheHood: 'Distinguish user errors (4xx, fixable) from server faults (5xx, log with context, never leak stack traces or secrets to the client).', learnNext: 'Logging, error boundaries in React, and monitoring.', note: 'A try/catch here defines what the user experiences when things fail.' },
  { id: 'tests', name: 'Automated tests', layer: 'Testing', re: /\b(describe|it|test)\s*\(|expect\s*\(/, plain: 'A test is code that makes one claim — "empty title is rejected" — and fails loudly if the app stops doing that.', underTheHood: 'Unit tests check one function; integration tests check connected pieces; nothing about "tests pass" proves security or good UX.', learnNext: 'Arrange-Act-Assert, mocking, and end-to-end tests.', note: 'describe/it/expect in this file are executable claims about behaviour.' },
];

function lineOf(content: string, re: RegExp): number | undefined {
  const lines = content.split('\n'); for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1; return undefined;
}

/** Every technology detected in one file, each tied to a line. Level selects wording depth. */
export function detectTechInFile(file: InputFile, level: Level = 'beginner'): TechConcept[] {
  const out: TechConcept[] = [];
  for (const r of RULES) {
    const line = lineOf(file.content, r.re);
    if (!line) continue;
    out.push({ id: r.id, name: r.name, layer: r.layer, plain: level === 'beginner' ? r.plain : r.underTheHood, underTheHood: r.underTheHood, inThisCode: r.note, learnNext: r.learnNext, evidence: [{ path: file.path, startLine: line }] });
  }
  return out;
}
export function detectTechInFiles(files: InputFile[], level: Level = 'beginner'): TechConcept[] {
  const map = new Map<string, TechConcept>();
  for (const f of files) for (const c of detectTechInFile(f, level)) if (!map.has(c.id)) map.set(c.id, c);
  return [...map.values()];
}

const LAYER_HOW: Record<string, string> = {
  Frontend: 'The browser loads HTML/CSS/JavaScript; React turns component functions and state changes into updated pixels. Nothing here can be trusted for security — it runs on the user\u2019s machine.',
  Transport: 'Browser and server exchange HTTP messages: a method + URL + headers + (often JSON) body out, and a status code + body back. fetch starts that exchange and hands you the reply.',
  Backend: 'Server code is the trusted referee: authenticate, validate, apply business rules, talk to data/services, then shape the response. It runs where secrets can exist safely.',
  Data: 'Persistence means data survives refreshes and devices. An ORM translates app objects into SQL; a relational database stores rows, enforces keys, and answers queries.',
  Auth: 'Sign-in proves identity and yields a session cookie or token. Every private request must be checked server-side — and checked for ownership of the specific record, not just "signed in".',
  Testing: 'Tests are executable claims. They prove only what they assert; they are how you change code later without fear.',
};

/** The technology stack behind one traced feature, layer by layer. */
export function techBehindFeature(analysis: Analysis, files: InputFile[], trace: FeatureTrace, level: Level = 'beginner'): TechLayer[] {
  const evidencePaths = [...new Set(trace.steps.flatMap((s) => s.evidence.map((e) => e.path)))];
  const traced = files.filter((f) => evidencePaths.includes(f.path));
  const concepts = detectTechInFiles(traced.length ? traced : files, level);
  const byLayer = new Map<string, TechConcept[]>();
  for (const c of concepts) byLayer.set(c.layer, [...(byLayer.get(c.layer) || []), c]);
  const order = ['Frontend', 'Transport', 'Backend', 'Auth', 'Data', 'Testing', 'Config', 'Foundations'];
  const route = analysis.routes.find((r) => trace.name.endsWith(r.path));
  const layers: TechLayer[] = [];
  for (const layer of order) {
    const cs = byLayer.get(layer); if (!cs?.length) continue;
    layers.push({
      layer, tech: cs.map((c) => c.name),
      howItWorks: LAYER_HOW[layer] || cs[0].underTheHood,
      inThisFeature: `${trace.name}: ${cs.map((c) => c.inThisCode).join(' ')}`,
      confidence: layer === 'Auth' && !cs.some((c) => traced.some((f) => c.evidence[0].path === f.path)) ? 'unverified' : (route && traced.length ? 'observed' : 'inferred'),
      evidence: cs.slice(0, 4).flatMap((c) => c.evidence),
      selfCheck: `In your own words: what does ${cs[0].name} do inside "${trace.name}", and what breaks if it is removed?`,
    });
  }
  if (!byLayer.has('Data')) layers.push({ layer: 'Data', tech: ['(none detected)'], howItWorks: LAYER_HOW.Data, inThisFeature: `No database/ORM pattern was detected for ${trace.name}. Either this feature does not save data, or it persists somewhere this import could not show.`, confidence: 'unverified', evidence: [], selfCheck: 'Close the app and reopen it: does this feature\u2019s data survive? That tells you whether persistence exists.' });
  if (!byLayer.has('Auth')) layers.push({ layer: 'Auth', tech: ['(none detected)'], howItWorks: LAYER_HOW.Auth, inThisFeature: `No auth pattern was detected in the traced files for ${trace.name}. If this feature should be private, that gap is your first investigation — it is not, by itself, proof of a vulnerability.`, confidence: 'unverified', evidence: [], selfCheck: 'Open this feature in a private/incognito window: are you correctly asked to sign in?' });
  return layers;
}

/** Approximate function-body extraction: find the symbol, take lines until braces balance. */
export function functionTech(analysis: Analysis, files: InputFile[], filePath: string, symbol?: string): FunctionTech | null {
  const file = files.find((f) => f.path === filePath); if (!file) return null;
  const meta = analysis.files.find((f) => f.path === filePath);
  const sym = symbol || meta?.symbols[0]; if (!sym) return null;
  const lines = file.content.split('\n');
  let start = lines.findIndex((l) => new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(l) && /(function|=>|=|class)/.test(l));
  if (start < 0) start = lines.findIndex((l) => l.includes(sym)); if (start < 0) return null;
  let depth = 0, end = start, seen = false;
  for (let i = start; i < Math.min(lines.length, start + 80); i++) { for (const ch of lines[i]) { if (ch === '{') { depth++; seen = true; } if (ch === '}') depth--; } end = i; if (seen && depth <= 0) break; }
  const body = lines.slice(start, end + 1).join('\n');
  const sig = lines[start].trim();
  const params = sig.match(/\(([^)]*)\)/)?.[1]?.trim() || '';
  const returns = (body.match(/\breturn\b/g) || []).length;
  return {
    file: filePath, symbol: sym, signature: sig, startLine: start + 1,
    excerpt: redactSecrets(body).split('\n').slice(0, 40).join('\n'),
    inputs: params ? `Declared inputs: ${params}. In plain terms, whoever calls ${sym} must hand it these values.` : `No explicit inputs in the signature — ${sym} likely reads state/props, the request, or imports instead. Check its first lines.`,
    output: returns ? `It returns in ${returns} place(s) — find each "return" to see every possible outcome (success, error, early exit).` : `No explicit return found — it probably works by causing an effect (updating state, sending a response, writing data).`,
    concepts: detectTechInFile({ path: filePath, content: body }).map((c) => ({ ...c, evidence: [{ path: filePath, startLine: (c.evidence[0].startLine || 1) + start }] })),
  };
}
