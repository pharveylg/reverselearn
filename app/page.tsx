'use client';
import { useEffect, useMemo, useState } from 'react';
import { Analysis, Level, Project, hashContent, uid } from '../lib/types';
import { analyzeProject, compareHashes } from '../lib/analyzer';
import { readZip } from '../lib/zip';
import { store } from '../lib/storage';
import { SAMPLE_FILES, SAMPLE_NAME } from '../lib/sample';
import { generateExercises, generateLesson, learningPath } from '../lib/lessons';
import { makeDiff, diffStats } from '../lib/diff';
import { redactSecrets } from '../lib/security';
import { parseGitHubUrl, fetchDefaultBranch, fetchRepoZipBlob, fetchRepoFilesViaTree } from '../lib/github';
import { techBehindFeature, functionTech, detectTechInFiles } from '../lib/tech';
import { buildSequence } from '../lib/sequence';
import { useRef } from 'react';

type View = 'dashboard' | 'import' | 'overview' | 'explorer' | 'trace' | 'path' | 'lesson' | 'change' | 'settings';
const NAV: { id: View; label: string }[] = [
  { id: 'dashboard', label: '🏠 Dashboard' }, { id: 'import', label: '📥 Import project' },
  { id: 'overview', label: '🗺️ Project overview' }, { id: 'explorer', label: '🔎 Codebase explorer' },
  { id: 'trace', label: '🧵 Feature trace' }, { id: 'path', label: '🎯 Learning path' },
  { id: 'lesson', label: '📚 Lesson workspace' }, { id: 'change', label: '🧪 Change Lab' },
  { id: 'settings', label: '⚙️ Project settings' },
];
const LAYER_ICON: Record<string, string> = { Frontend: '🖥️', Transport: '🌐', Backend: '⚙️', Data: '🗄️', Auth: '🔐', Testing: '🧪', Config: '🔧', Foundations: '🧱' };
const LAYER_COLOR: Record<string, string> = { Frontend: 'linear-gradient(90deg,#173a5e,#1d2631)', Transport: 'linear-gradient(90deg,#3a2f5e,#1d2631)', Backend: 'linear-gradient(90deg,#14532d,#1d2631)', Data: 'linear-gradient(90deg,#5e3a17,#1d2631)', Auth: 'linear-gradient(90deg,#5e1730,#1d2631)', Testing: 'linear-gradient(90deg,#175e57,#1d2631)', Config: 'linear-gradient(90deg,#44403c,#1d2631)', Foundations: 'linear-gradient(90deg,#334155,#1d2631)' };
function stepIcon(title: string) { const t = title.toLowerCase(); if (t.includes('user')) return '👆'; if (t.includes('front')) return '🖥️'; if (t.includes('transport')) return '🌐'; if (t.includes('back')) return '⚙️'; if (t.includes('data')) return '🗄️'; if (t.includes('auth')) return '🔐'; if (t.includes('test')) return '🧪'; if (t.includes('response')) return '↩️'; return '🔹'; }
function conf(c: string) { return <span className={`pill ${c}`}>{c}</span>; }
function download(name: string, text: string, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}


function ArchDiagram({ analysis, onOpen, onSelect, selectedId }: { analysis: Analysis; onOpen: (p: string) => void; onSelect?: (n: Analysis['nodes'][0]) => void; selectedId?: string }) {
  const [scale, setScale] = useState(1); const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const order = ['UI', 'API', 'Auth', 'Database', 'External', 'Files'];
  const cols = new Map<string, number>();
  const pos = new Map<string, { x: number; y: number; n: (typeof analysis.nodes)[0] }>();
  for (const n of analysis.nodes) { const col = Math.max(0, order.indexOf(n.type)); const row = cols.get(n.type) || 0; cols.set(n.type, row + 1); pos.set(n.id, { x: 24 + col * 228, y: 24 + row * 112, n }); }
  const W = 24 + (Math.max(1, ...order.map((t, i) => (analysis.nodes.some((n) => n.type === t) ? i + 1 : 0))) * 228);
  const H = 48 + Math.max(1, ...[...cols.values()]) * 112;
  const center = (id: string) => { const p = pos.get(id); return p ? { x: p.x + 96, y: p.y + 42 } : { x: 0, y: 0 }; };
  const wrap = (txt: string, max = 22) => { const words = txt.split(' '); const lines: string[] = []; let cur = ''; for (const w of words) { if ((cur + ' ' + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; } if (cur.trim()) lines.push(cur.trim()); return lines.slice(0, 2); };
  return (<div>
    <div className="svgtools"><button onClick={() => setScale(Math.min(2, scale + 0.15))}>＋ Zoom in</button><button onClick={() => setScale(Math.max(0.4, scale - 0.15))}>－ Zoom out</button><button onClick={() => { setScale(1); setOff({ x: 0, y: 0 }); }}>↺ Reset view</button><span className="muted" style={{ alignSelf: 'center' }}>Drag to pan · scroll inside the box · click a box to open its file ({Math.round(scale * 100)}%)</span></div>
    <div className="svgwrap" style={{ maxHeight: 460, cursor: 'grab' }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; }}
      onPointerMove={(e) => { if (drag.current) setOff({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }); }}
      onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
      <svg width={Math.max(640, W)} height={Math.max(240, H)} role="img" aria-label="Architecture diagram">
        <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#9db0c1" /></marker></defs>
        <g transform={`translate(${off.x},${off.y}) scale(${scale})`}>
          {analysis.edges.map((e, i) => { const a = center(e.from), b = center(e.to); return (<g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#9db0c1" strokeWidth="1.8" markerEnd="url(#arr)" /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} fontSize="10" textAnchor="middle" className="mut">{e.label.slice(0, 34)}</text></g>); })}
          {[...pos.values()].map(({ x, y, n }) => (<g key={n.id} onClick={() => { if (onSelect) onSelect(n); else { const p = n.evidence[0]?.path; if (p) onOpen(p); } }} style={{ cursor: 'pointer' }}>
            <rect x={x} y={y} width="192" height="84" rx="13" fill={selectedId === n.id ? '#25415e' : '#1d2631'} stroke={n.confidence === 'observed' ? '#2dd4a8' : n.confidence === 'inferred' ? '#ffb84d' : '#ff7a7a'} strokeWidth={selectedId === n.id ? 4 : 2} />
            <text x={x + 96} y={y + 25} fontSize="13" fontWeight="800" textAnchor="middle">{n.type === 'UI' ? '🖥️ ' : n.type === 'API' ? '⚙️ ' : n.type === 'Database' ? '🗄️ ' : n.type === 'Auth' ? '🔐 ' : '🔹 '}{n.label.slice(0, 24)}</text>
            {wrap(n.detail).map((l, i) => <text key={i} x={x + 96} y={y + 46 + i * 14} fontSize="10.5" textAnchor="middle" className="mut">{l}</text>)}
            <text x={x + 96} y={y + 78} fontSize="9.5" textAnchor="middle" className="mut">{n.confidence}</text></g>))}
        </g>
      </svg>
    </div></div>);
}

function SequenceDiagram({ analysis, files, trace, onOpen }: { analysis: Analysis; files: Project['files']; trace: NonNullable<Analysis['traces']>[0]; onOpen: (p: string) => void }) {
  const seq = buildSequence(analysis, files, trace);
  const X = (id: string) => 90 + seq.actors.findIndex((a) => a.id === id) * 190;
  const W = Math.max(640, 180 + seq.actors.length * 190); const H = 118 + seq.messages.length * 50;
  return (<div className="svgwrap"><svg width={W} height={H} role="img" aria-label={`Sequence diagram for ${trace.name}`}>
    {seq.actors.map((a) => (<g key={a.id}>
      <rect x={X(a.id) - 72} y={14} width="144" height="42" rx="11" fill="#1d2631" stroke="#4da3ff" strokeWidth="1.6" />
      <text x={X(a.id)} y={40} fontSize="13" fontWeight="800" textAnchor="middle">{a.icon} {a.label}</text>
      <line x1={X(a.id)} y1={56} x2={X(a.id)} y2={H - 12} stroke="#2a3746" strokeDasharray="5 5" /></g>))}
    {seq.messages.map((msg) => { const y = 92 + (msg.n - 1) * 50; const x1 = X(msg.from), x2 = X(msg.to); const dir = x2 >= x1 ? 1 : -1; const col = msg.kind === 'unknown' ? '#ff7a7a' : msg.kind === 'return' ? '#2dd4a8' : '#4da3ff';
      return (<g key={msg.n} onClick={() => { if (msg.evidence) onOpen(msg.evidence); }} style={{ cursor: msg.evidence ? 'pointer' : 'default' }}>
        <circle cx={x1} cy={y} r="10" fill={col} /><text x={x1} y={y + 3.5} fontSize="10" fontWeight="900" textAnchor="middle" fill="#04101f">{msg.n}</text>
        <line x1={x1} y1={y} x2={x2 - dir * 8} y2={y} stroke={col} strokeWidth="2" strokeDasharray={msg.kind === 'call' ? '' : '6 4'} markerEnd="url(#arr)" />
        <text x={(x1 + x2) / 2} y={y - 8} fontSize="11" textAnchor="middle">{msg.kind === 'unknown' ? '❓ ' : ''}{msg.label.slice(0, 52)}</text></g>); })}
  </svg></div>);
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const [importName, setImportName] = useState(''); const [importDesc, setImportDesc] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [githubUrl, setGithubUrl] = useState(''); const [githubToken, setGithubToken] = useState('');
  const [query, setQuery] = useState(''); const [catFilter, setCatFilter] = useState('all');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [traceId, setTraceId] = useState(''); const [level, setLevel] = useState<Level>('beginner');
  const [quizPicked, setQuizPicked] = useState<number | null>(null);
  const [hintIdx, setHintIdx] = useState<Record<string, number>>({});
  const [funcSymbol, setFuncSymbol] = useState('');
  const [devView, setDevView] = useState(true);
  const [tipIdx, setTipIdx] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [liveUrl, setLiveUrl] = useState('');
  const [changeReq, setChangeReq] = useState(''); const [changeFile, setChangeFile] = useState('');
  const [edited, setEdited] = useState(''); const [diff, setDiff] = useState(''); const [approved, setApproved] = useState(false);
  const [compare, setCompare] = useState<{ added: string[]; removed: string[]; modified: string[] } | null>(null);

  const current = projects.find((p) => p.id === currentId) || null;
  const analysis: Analysis | null = current?.analysis || null;
  useEffect(() => { store.all().then((ps) => { setProjects(ps.sort((a, b) => b.createdAt.localeCompare(a.createdAt))); if (ps[0]) setCurrentId(ps[0].id); }).catch(() => setError('Local storage (IndexedDB) unavailable. Projects will not persist in this browser context.')); }, []);
  async function save(p: Project) { setProjects((prev) => { const next = [p, ...prev.filter((x) => x.id !== p.id)]; return next; }); try { await store.put(p); } catch { /* surfaced on load */ } }
  function openProject(p: Project) { setCurrentId(p.id); setSelectedFile(p.analysis?.files[0]?.path || null); setView('overview'); }

  async function handleFiles(files: { path: string; content: string }[], excludedCount: number, rejected: string[], sourceLabel: string, fallbackName: string, replaceId?: string) {
    if (!files.length) throw new Error('No readable text source files found after exclusions.');
    const a = analyzeProject(files, excludedCount);
    if (rejected.length) a.warnings.push(`Rejected/skipped entries: ${rejected.slice(0, 8).join(', ')}`);
    if (replaceId && current) {
      const before: Record<string, string> = {}; current.files.forEach((f) => before[f.path] = hashContent(f.content));
      const after: Record<string, string> = {}; files.forEach((f) => after[f.path] = hashContent(f.content));
      const cmp = compareHashes(before, after); setCompare(cmp);
      const updated = { ...current, files, analysis: a, source: sourceLabel, stale: cmp.modified.length + cmp.added.length + cmp.removed.length > 0 };
      await save(updated); setView('overview');
    } else {
      const p: Project = { id: uid(), name: importName || fallbackName, description: importDesc, createdAt: new Date().toISOString(), source: sourceLabel, analysis: a, files, progress: {} };
      await save(p); setCurrentId(p.id); setSelectedFile(a.files[0]?.path || null); setView('overview');
    }
  }
  async function importZip(replaceId?: string) {
    if (!zipFile) { setError('Choose a ZIP file first.'); return; }
    setBusy('Reading ZIP safely (no code is executed)…'); setError('');
    try { const { files, excludedCount, rejected } = await readZip(zipFile); await handleFiles(files, excludedCount, rejected, 'ZIP upload', zipFile.name.replace(/\.zip$/i, ''), replaceId); }
    catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); }
    setBusy('');
  }
  async function importGithub(replaceId?: string) {
    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) { setError('That does not look like a GitHub repo link. Example: https://github.com/yourname/your-app'); return; }
    setError(''); const token = githubToken || undefined;
    try {
      const branch = parsed.branch || await (async () => { setBusy(`Contacting GitHub for ${parsed.owner}/${parsed.repo}…`); return fetchDefaultBranch(parsed, token); })();
      setBusy(`Downloading ${parsed.owner}/${parsed.repo} (${branch}) from GitHub…`);
      let files: { path: string; content: string }[] = []; let excludedCount = 0; const rejected: string[] = [];
      try {
        const blob = await fetchRepoZipBlob(parsed, branch, token);
        if (blob.size > 30 * 1024 * 1024) throw new Error('That repository ZIP is over 30 MB. Import a sub-folder link (…/tree/branch/folder), or download the ZIP and remove large folders first.');
        const r = await readZip(new File([blob], 'repo.zip'));
        excludedCount = r.excludedCount; rejected.push(...r.rejected); files = r.files;
      } catch (zipErr) {
        setBusy('ZIP download was blocked — fetching files individually instead…');
        const r = await fetchRepoFilesViaTree(parsed, branch, token, (n) => setBusy(`Fetching files individually… ${n} files`));
        files = r.files; excludedCount = r.excludedCount;
        if (!files.length) throw zipErr;
      }
      if (parsed.subpath) {
        const prefix = parsed.subpath + '/'; const before = files.length;
        files = files.filter((f) => f.path.startsWith(prefix)).map((f) => ({ ...f, path: f.path.slice(prefix.length) }));
        excludedCount += before - files.length;
      }
      setGithubToken('');
      await handleFiles(files, excludedCount, rejected, `GitHub: ${parsed.owner}/${parsed.repo}@${branch}`, parsed.repo, replaceId);
    } catch (e) { setError(e instanceof Error ? e.message : 'GitHub import failed.'); }
    setBusy('');
  }
  async function loadSample() {
    const a = analyzeProject(SAMPLE_FILES, 0);
    const p: Project = { id: uid(), name: SAMPLE_NAME, description: 'Bundled demo data — clearly a sample, not your project. Use it to learn the tool, then import your own ZIP.', createdAt: new Date().toISOString(), isSample: true, analysis: a, files: SAMPLE_FILES, progress: {} };
    await save(p); setCurrentId(p.id); setSelectedFile(a.files[0]?.path || null); setView('overview');
  }
  async function markProgress(key: string, status: string, extra: Record<string, unknown> = {}) {
    if (!current) return; const updated = { ...current, progress: { ...current.progress, [key]: { ...(current.progress[key] || {}), status, ...extra, updatedAt: new Date().toISOString() } } }; await save(updated);
  }

  const filteredFiles = useMemo(() => (analysis?.files || []).filter((f) => (catFilter === 'all' || f.category === catFilter) && f.path.toLowerCase().includes(query.toLowerCase())), [analysis, query, catFilter]);
  const lesson = useMemo(() => (analysis && current ? generateLesson(analysis, current.files, selectedFile, level) : null), [analysis, current, selectedFile, level]);
  const exercises = useMemo(() => (analysis ? generateExercises(analysis) : []), [analysis]);
  const trace = analysis?.traces.find((t) => t.id === traceId) || analysis?.traces[0];
  const selectedContent = current?.files.find((f) => f.path === selectedFile)?.content || '';
  const techLayers = useMemo(() => (analysis && current && trace ? techBehindFeature(analysis, current.files, trace, level) : []), [analysis, current, trace, level]);
  const funcTech = useMemo(() => (analysis && current && selectedFile ? functionTech(analysis, current.files, selectedFile, funcSymbol || undefined) : null), [analysis, current, selectedFile, funcSymbol]);
  const doneCount = current ? Object.values(current.progress).filter((p) => p.status === 'done').length : 0;

  return (
    <div className="layout">
      <aside className="side">
        <div className="logo">Reverse<span>Learn</span></div>
        <p className="tag">Understand apps AI built for you — from real evidence in your code, not guesses. 🔒 Analysis runs in your browser; your source is not uploaded.</p>
        <nav className="nav" aria-label="Main">{NAV.map((n) => <button key={n.id} className={view === n.id ? 'on' : ''} onClick={() => setView(n.id)}>{n.label}</button>)}</nav>
        <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => setDevView(!devView)} aria-pressed={devView}>{devView ? '🎓 Dev View: ON' : '🎓 Dev View: OFF'}</button>
        <p className="tag">Dev View shows learning tidbits on every screen while you explore. Use it beside your real, deployed app.</p>
        <p className="tag" style={{ marginTop: 16 }}>No AI key configured — deterministic lessons from file evidence. See <code>.env.example</code> to enable an AI adapter later.</p>
      </aside>

      <main className="main">
        {error && <div className="card" role="alert" style={{ borderColor: 'var(--bad)' }}>⚠️ {error}</div>}
        {busy && <div className="card" aria-live="polite">⏳ {busy}</div>}
        {devView && current && analysis && (() => {
          const fileTechs = selectedFile ? detectTechInFiles(current.files.filter((f) => f.path === selectedFile), level) : [];
          const tips: Record<string, string[]> = {
            dashboard: ['Every project card is real analysis output — stack, file count and warnings come from the import, not a template.', 'Start from the diagram, not from random files: Overview first, then one feature.'],
            import: ['A GitHub /tree/branch/folder link imports just that folder — perfect for monorepos.', 'Whatever you import is never executed and never leaves this browser.'],
            overview: ['Click any box in the architecture diagram: a panel below explains the tech behind it, with a Learn more button.', 'Green border = observed in code. Red = unverified — treat it as a question, not a fact.'],
            explorer: [fileTechs[0] ? `This file uses ${fileTechs[0].name}: ${fileTechs[0].plain}` : 'Follow the imports at the top of a file — that is the wiring diagram of the app.', 'Line numbers in findings are clickable evidence, not decoration.'],
            trace: ['In the sequence diagram, blue is a request, green dashed is the reply, red ❓ means "not found in code".', 'Click a numbered message to open the exact file that performs it.'],
            path: ['Red "!" stops are diagram boxes missing from code — verifying a gap is real learning.', 'Progress here is self-assessed. The explain-it-back exercise is the real test.'],
            lesson: ['Use "Explain differently / go deeper" after reading, not before — predicting first makes it stick.', fileTechs[0] ? `Tech in the selected file: ${fileTechs.map((t) => t.name).slice(0, 3).join(', ')}.` : 'Pick a function in this file to see its inputs → outputs anatomy.'],
            change: ['One tiny change, reviewed as a diff, beats three changes made on faith.', 'Nothing here writes anywhere until you tick the approval box.'],
            settings: ['Re-import after the app changes: modified files mark old lessons stale instead of silently wrong.', 'Export your learning data before clearing browser storage.'],
          };
          const list = tips[view] || tips.dashboard; const tip = list[tipIdx % list.length];
          return <div className="card" style={{ borderColor: 'var(--accent2)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }} role="note"><span style={{ fontSize: 22 }}>🎓</span><p style={{ flex: '1 1 320px', margin: 0 }}><b>Dev View · {view}</b><br /><span className="muted">{tip}</span></p><button className="btn secondary" onClick={() => setTipIdx(tipIdx + 1)}>Next tip →</button><button className="btn" onClick={() => setView('lesson')}>Learn more</button></div>;
        })()}

        {view === 'dashboard' && <>
          <h1>Your learning projects</h1><p className="muted">Import an app built by Claude, ChatGPT, Cursor, Lovable, Bolt, Replit, v0 — any tool. Paste its GitHub link, or upload a ZIP, and ReverseLearn can map it.</p>
          <div className="kv"><button className="btn" onClick={() => setView('import')}>+ Import a project</button><button className="btn secondary" onClick={loadSample}>Load the labelled SAMPLE app</button></div>
          <div className="grid">{projects.map((p) => (
            <article className="card" key={p.id}><h3>{p.isSample ? '🏷️ ' : ''}{p.name}</h3>
              <p className="muted">{p.description || 'No description.'}</p>{p.source && <p className="muted">📦 Source: {p.source}</p>}
              <p>{(p.analysis?.frameworks || []).map((f) => <span className="pill" key={f}>{f}</span>)}</p>
              <p className="muted">{p.analysis ? `${p.analysis.files.length} files · analysed ${new Date(p.analysis.analyzedAt).toLocaleString()} · ${Object.values(p.progress).filter((x) => x.status === 'done').length} exercises done` : 'Not analysed yet'}</p>
              {p.stale && <p className="inferred">⚠️ Code changed on re-import — older explanations may be stale.</p>}
              {p.analysis?.warnings?.[0] && <p className="muted">⚠️ {p.analysis.warnings[0]}</p>}
              <button className="btn" onClick={() => openProject(p)}>Continue learning →</button>
            </article>))}
          </div>
          {!projects.length && <div className="card"><h3>Start here 👇</h3><p className="muted">No projects yet. Either load the SAMPLE app (30 seconds, teaches you the tool) or import a ZIP of a real app you built with an AI tool.</p></div>}
        </>}

        {view === 'import' && <>
          <h1>Import a project</h1><p className="muted">ZIP only in this MVP. Limits: 30 MB ZIP, 2,000 files, 25 MB uncompressed text, 512 KB/file. Excluded by default: node_modules, .git, .next, dist, build, coverage, vendor, binaries. Suspicious paths (../), .env and secret-looking files are rejected/redacted — values are never shown. Nothing is executed.</p>
          <div className="card" style={{ borderColor: 'var(--accent)' }}>
            <h3 style={{ marginTop: 0 }}>⭐ From a GitHub link (recommended if your app is on GitHub)</h3>
            <label htmlFor="ghurl">Paste your repository link</label>
            <input id="ghurl" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/yourname/your-app" />
            <p className="muted" style={{ marginTop: -6 }}>Also accepts a folder link like <code>…/tree/main/my-app</code> (monorepos), or just <code>yourname/your-app</code>. Public repos need nothing else.</p>
            <label htmlFor="ghtok">Private repo? Paste a read-only token (optional)</label>
            <input id="ghtok" type="password" autoComplete="off" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="github_pat_… (used once, in memory only — never saved)" />
            <p className="muted" style={{ marginTop: -6 }}>Create one at GitHub → Settings → Developer settings → Fine-grained tokens, with <b>Contents: Read-only</b> on that one repo. It is sent only to api.github.com, is cleared after import, and is never stored in your project or browser storage.</p>
            <div className="kv"><button className="btn" onClick={() => importGithub()}>Import from GitHub →</button>{current && <button className="btn secondary" onClick={() => importGithub(current.id)}>Re-import current project from this link & compare</button>}</div>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>…or upload a ZIP</h3>
            <label htmlFor="pname">Project name</label><input id="pname" value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="e.g. My invoice app" />
            <label htmlFor="pdesc">What was this app supposed to do? (optional)</label><input id="pdesc" value={importDesc} onChange={(e) => setImportDesc(e.target.value)} placeholder="e.g. Let clients pay invoices" />
            <label htmlFor="zip">Source ZIP</label><input id="zip" type="file" accept=".zip,application/zip" onChange={(e) => setZipFile(e.target.files?.[0] || null)} />
            <div className="kv"><button className="btn" onClick={() => importZip()}>Analyse project →</button>{current && <button className="btn secondary" onClick={() => importZip(current.id)}>Re-import into “{current.name}” & compare</button>}</div>
            <p className="muted">How to get a ZIP: in Lovable/Bolt/Replit/v0 export/download the project, or in GitHub: green <b>Code</b> button → <b>Download ZIP</b>. Remove any <code>.env</code> file first if it contains real secrets.</p>
          </div>
          {compare && <div className="card"><h3>Re-import comparison</h3><p>Added: {compare.added.length} · Removed: {compare.removed.length} · Modified: {compare.modified.length}</p><pre>{[...compare.added.map((x) => '+ ' + x), ...compare.removed.map((x) => '- ' + x), ...compare.modified.map((x) => '~ ' + x)].join('\n') || 'No changes detected.'}</pre><p className="muted">Lessons citing modified files should be re-read — they are marked stale on the dashboard.</p></div>}
        </>}

        {!current && view !== 'dashboard' && view !== 'import' && <div className="card"><h2>No project selected</h2><p className="muted">Import a ZIP or load the SAMPLE app from the Dashboard first.</p><button className="btn" onClick={() => setView('dashboard')}>Go to dashboard</button></div>}

        {current && analysis && view === 'overview' && <>
          <h1>{current.name}</h1><p className="muted">{current.description}</p>
          {current.isSample && <p><span className="pill inferred">SAMPLE DATA</span></p>}
          <div className="grid">
            <div className="card"><h3>Detected stack (observed)</h3><p>{analysis.frameworks.map((f) => <span className="pill" key={f}>{f}</span>)}</p><p className="muted">Languages: {Object.entries(analysis.languages).map(([k, v]) => `${k} (${v})`).join(', ')}</p><p className="muted">Deps: {analysis.dependencies.join(', ') || 'none listed'}</p><p className="muted">Env var <i>names only</i>: {analysis.envVarNames.join(', ') || 'none found'}</p></div>
            <div className="card"><h3>Inventory</h3><p><b>{analysis.files.length}</b> files · <b>{analysis.routes.length}</b> routes · <b>{analysis.findings.length}</b> findings</p><p className="muted">Analyzer {analysis.version} · {new Date(analysis.analyzedAt).toLocaleString()}</p><p className="muted">Progress: {doneCount} exercise(s) marked done</p></div>
            <div className="card"><h3>⚠️ Caveats (honest limits)</h3>{analysis.warnings.length ? analysis.warnings.map((w, i) => <p className="muted" key={i}>• {w}</p>) : <p className="muted">No warnings. Still: static analysis cannot prove runtime behaviour.</p>}<p className="muted">Observed = directly in source · Inferred = likely, check it · Unverified = needs running the app.</p></div>
          </div>
          <h2>Architecture map <span className="muted">(generated from findings — text fallback is the same data)</span></h2>
          <div className="card"><h3 style={{ marginTop: 0 }}>Architecture diagram <span className="muted">(pan / zoom — text version below)</span></h3><ArchDiagram analysis={analysis} selectedId={selectedNodeId} onSelect={(n) => setSelectedNodeId(n.id)} onOpen={(p) => { setSelectedFile(p); setView('explorer'); }} /><div className="map">{analysis.nodes.map((n, i) => <span key={n.id} style={{ display: 'contents' }}>{i > 0 && <span className="arrow">──▶</span>}<button className="node" onClick={() => setSelectedNodeId(n.id)}><b>{n.label}</b><br /><span className="muted">{n.detail}</span><br />{conf(n.confidence)}</button></span>)}</div>
            {analysis.edges.map((e, i) => <p className="muted" key={i}>{e.from} → {e.to}: {e.label} {conf(e.confidence)}</p>)}
          </div>
          {analysis.archAlignment ? <>
            <h2>📐 Architecture diagram shipped with this project <span className="muted">(aligned to your learning path)</span></h2>
            <div className="card"><p className="muted">Found in <code>{analysis.archAlignment.docPath}</code> ({analysis.archAlignment.kind}). This is the app author's/AI's <b>declared</b> design — each box checked against code below. Your Learning Path follows this diagram's flow order.</p>
              <div className="map">{analysis.archAlignment.items.map((it, i) => <span key={it.nodeId} style={{ display: 'contents' }}>{i > 0 && <span className="arrow">──▶</span>}<div className="node"><b>{it.label}</b><br />{it.status === 'matched' ? <span className="pill observed">✓ matched to code</span> : <span className="pill unverified">⚠️ declared only — not found in code</span>}<br /><span className="muted">{it.reason}</span>{it.files.map((f) => <button key={f} className="filebtn" onClick={() => { setSelectedFile(f); setView('explorer'); }}>📄 {f}</button>)}</div></span>)}</div>
              {analysis.archAlignment.uncoveredCode.length > 0 && <p className="muted">🧩 In the code but NOT on the diagram: {analysis.archAlignment.uncoveredCode.join(', ')} — your path adds a module for these.</p>}
              <button className="btn" onClick={() => setView('path')}>Follow the learning path aligned to this diagram →</button>
            </div></> : <div className="card"><h3>📐 No architecture diagram found in this project</h3><p className="muted">Your learning path is generated from code analysis (routes, files, data). If the original app has a diagram in its README or docs folder, make sure that folder is included in the import and re-import.</p></div>}
          {(() => { const node = analysis.nodes.find((n) => n.id === selectedNodeId) || analysis.nodes[0]; if (!node) return null;
            const techs = detectTechInFiles(current.files.filter((f) => node.evidence.some((e) => e.path === f.path)), level);
            const links = analysis.edges.filter((e) => e.from === node.id || e.to === node.id);
            const learn = () => { const p = node.evidence[0]?.path; if (p) { setSelectedFile(p); const t = analysis.traces.find((x) => x.steps.some((st) => st.evidence.some((e) => e.path === p))); if (t) setTraceId(t.id); } setView('lesson'); };
            return <div className="card" style={{ borderColor: 'var(--accent)' }}>
              <h3 style={{ marginTop: 0 }}>{node.type === 'UI' ? '🖥️' : node.type === 'API' ? '⚙️' : node.type === 'Database' ? '🗄️' : node.type === 'Auth' ? '🔐' : '🔹'} {node.label} {conf(node.confidence)}</h3>
              <p>{node.detail}</p>
              <h3>🧠 Tech behind this part</h3>
              {techs.length ? <div className="grid">{techs.slice(0, 6).map((t) => <div className="card" key={t.id} style={{ margin: 0 }}><span className="bigicon">{LAYER_ICON[t.layer] || '🔹'}</span> <b>{t.name}</b><p className="muted">{t.plain}</p><p><b>In this app:</b> <span className="muted">{t.inThisCode}</span></p></div>)}</div>
                : <p className="muted">No technology patterns were detected in this part's files yet — open the file below and use a lesson to explore it.</p>}
              {links.length > 0 && <><h3>Connections</h3>{links.map((e, i) => <p className="muted" key={i}>{e.from === node.id ? `${node.label} → ${analysis.nodes.find((n) => n.id === e.to)?.label || e.to}` : `${analysis.nodes.find((n) => n.id === e.from)?.label || e.from} → ${node.label}`}: {e.label}</p>)}</>}
              <h3>Evidence</h3>
              {node.evidence.map((e, i) => <button key={i} className="filebtn" onClick={() => { setSelectedFile(e.path); setView('explorer'); }}>📄 {e.path}{e.startLine ? ` : line ${e.startLine}` : ''}</button>)}
              <div className="kv" style={{ marginTop: 10 }}><button className="btn" onClick={learn}>Learn more about this tech →</button><button className="btn secondary" onClick={() => { const p = node.evidence[0]?.path; if (p) { setSelectedFile(p); setView('explorer'); } }}>Open the code</button><button className="btn secondary" onClick={() => setView('trace')}>See it in a feature trace</button></div>
            </div>; })()}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>▶️ Explore your live app with Dev View (companion mode)</h3>
            <p className="muted">Keep ReverseLearn open in this tab, open your deployed app in a new tab, and click through it there. As you use each screen, find it below: ReverseLearn shows the route, the file behind it, and the tech to learn. <b>Log in only on your app's own page — never type your password or tokens into ReverseLearn.</b> (Embedding your app inside ReverseLearn is deliberately not done: many apps block framing, and your login must stay on its own site.)</p>
            <label htmlFor="liveurl">Your deployed app URL</label>
            <input id="liveurl" value={liveUrl || current.liveUrl || ''} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://your-app.vercel.app" />
            <div className="kv"><button className="btn" onClick={async () => { const raw = (liveUrl || current.liveUrl || '').trim(); if (!raw) { setError('Paste your deployed app URL first.'); return; } const url = /^https?:\/\//.test(raw) ? raw : 'https://' + raw; await save({ ...current, liveUrl: url }); window.open(url, '_blank', 'noopener,noreferrer'); }}>Open live app in a new tab ↗</button></div>
            <h3>While you click around your live app, match the screen here:</h3>
            {analysis.routes.slice(0, 10).map((r) => <div key={r.path + r.file} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--line)', padding: '7px 0' }}><code style={{ minWidth: 150 }}>{r.path}</code><span className="muted" style={{ flex: '1 1 220px' }}>{r.kind} · {r.file}</span><button className="btn secondary" onClick={() => { setSelectedFile(r.file); const t = analysis.traces.find((x) => x.name.endsWith(r.path)); if (t) setTraceId(t.id); setView('lesson'); }}>Learn the tech</button><button className="btn secondary" onClick={() => { setSelectedFile(r.file); setView('trace'); }}>Trace it</button></div>)}
            {!analysis.routes.length && <p className="muted">No routes were discovered in this import, so screens cannot be matched yet.</p>}
          </div>
          <h2>Findings with evidence</h2>
          {analysis.findings.slice(0, 14).map((f) => <div className="card" key={f.id}><b>{f.title}</b> {conf(f.confidence)}<p className="muted">{f.summary}</p>{f.evidence.map((e, i) => <button key={i} className="filebtn" onClick={() => { setSelectedFile(e.path); setView('explorer'); }}>📄 {e.path}{e.startLine ? ` : line ${e.startLine}` : ''}</button>)}{f.limitations?.map((l, i) => <p className="muted" key={i}>Limit: {l}</p>)}</div>)}
          <h2>Suggested learning sequence</h2><div className="card">{learningPath(analysis).map((s, i) => <p key={i}><b>{i + 1}. {s.title}</b> <span className="muted">(~{s.minutes} min) — {s.why}</span></p>)}</div>
        </>}

        {current && analysis && view === 'explorer' && <>
          <h1>Codebase explorer</h1>
          <div className="kv"><input aria-label="Search files" placeholder="Search path…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320 }} />
            <select aria-label="Category filter" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ maxWidth: 220 }}><option value="all">All categories</option>{['frontend', 'backend', 'database', 'test', 'config', 'docs', 'other'].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
            <div className="card" style={{ maxHeight: 560, overflow: 'auto' }}>{filteredFiles.map((f) => <button key={f.path} className="filebtn" onClick={() => setSelectedFile(f.path)}>{f.path}<br /><span className="muted">{f.category} · {f.language} · {f.symbols.join(', ')}</span>{f.sensitive && <span className="pill unverified">redacted</span>}</button>)}{!filteredFiles.length && <p className="muted">No files match.</p>}</div>
            <div className="card"><h3>{selectedFile || 'Select a file'}</h3>{selectedFile && <><p className="muted">{analysis.files.find((f) => f.path === selectedFile)?.category} · symbols: {analysis.files.find((f) => f.path === selectedFile)?.symbols.join(', ') || 'none'}</p><pre>{redactSecrets(selectedContent).split('\n').slice(0, 120).map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n')}</pre><div className="kv"><button className="btn secondary" onClick={() => setView('lesson')}>Teach me this file →</button><button className="btn secondary" onClick={() => setView('lesson')}>Learn the tech behind its functions →</button></div></>}</div>
          </div>
        </>}

        {current && analysis && view === 'trace' && <>
          <h1>Feature trace</h1><p className="muted">Each step is labelled. “Unverified” means: we could not prove it from source — that honesty is the point.</p>
          <label htmlFor="trace">Feature / route</label><select id="trace" value={trace?.id || ''} onChange={(e) => setTraceId(e.target.value)}>{analysis.traces.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          {trace ? <div className="card"><h3>{trace.name}</h3>
            <h3>🔀 Sequence diagram — who talks to whom, in order</h3>
            <p className="muted">Blue = a request/call · green dashed = the reply · <span className="unverified">red dashed ❓ = could not be verified in code</span>. Click a numbered message to open its evidence file.</p>
            <SequenceDiagram analysis={analysis} files={current.files} trace={trace} onOpen={(p) => { setSelectedFile(p); setView('explorer'); }} />
            {trace.steps.map((s, i) => <div className="step" key={i}><b>{s.title}</b> {conf(s.confidence)}<p className="muted">{s.body}</p>{s.evidence.map((e, j) => <button key={j} className="filebtn" onClick={() => { setSelectedFile(e.path); setView('explorer'); }}>📄 {e.path}{e.startLine ? `:${e.startLine}` : ''}</button>)}</div>)}
            {trace.unknowns.length > 0 && <p>❓ <b>Unknowns:</b> {trace.unknowns.join(' ')}</p>}
            <h3>🧠 Tech behind this feature</h3>
            {techLayers.map((l) => <p key={l.layer} style={{ margin: '6px 0' }}><b>{l.layer}:</b> {l.tech.map((t) => <span className="pill" key={t}>{t}</span>)} {conf(l.confidence)}</p>)}
            <div className="kv"><button className="btn secondary" onClick={() => setView('lesson')}>Turn this into a lesson →</button><button className="btn" onClick={() => setView('lesson')}>Learn the tech behind this feature →</button></div></div>
            : <div className="card"><p className="muted">No routes were discovered, so no trace can be built without inventing one — so we don’t. Try the explorer, or check the import warnings.</p></div>}
        </>}

        {current && analysis && view === 'path' && <>
          <h1>Learning path & exercises</h1>
          {analysis.archAlignment ? <div className="card" style={{ borderColor: 'var(--accent2)' }}><b>📐 Aligned to your app's architecture diagram</b> <span className="pill inferred">declared in {analysis.archAlignment.docPath}</span><p className="muted">Modules below follow the diagram in <code>{analysis.archAlignment.docPath}</code> in flow order. Boxes marked <span className="pill unverified">declared only</span> could not be found in code — learning to spot that gap is part of the lesson.</p></div>
          : <div className="card"><p className="muted">📐 No architecture diagram was found in this import, so this path is ordered from <b>code analysis</b> instead. If your app ships a diagram (README/docs), include it and re-import to align the path to it.</p></div>}
          <div className="card"><b>Your progress</b><p className="muted">{doneCount} of {exercises.length} exercises marked done ({exercises.length ? Math.round(doneCount / exercises.length * 100) : 0}%) — honest self-assessment, not proven mastery.</p><div className="progressbar" role="progressbar" aria-valuenow={exercises.length ? Math.round(doneCount / exercises.length * 100) : 0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${exercises.length ? doneCount / exercises.length * 100 : 0}%` }} /></div></div>
          <div className="roadmap">
          {learningPath(analysis).map((s, i) => { const techs = detectTechInFiles(current.files.filter((f) => s.files.includes(f.path)), level); return (
            <div className={`rm ${s.status === 'declared-only' ? 'gap' : ''}`} data-n={s.status === 'declared-only' ? '!' : i + 1} key={i}><div className="card" style={{ margin: 0 }}><b>{i + 1}. {s.title}</b> <span className="muted">~{s.minutes} min (rough estimate)</span> {s.source === 'architecture-diagram' ? <span className="pill observed">📐 diagram-aligned</span> : <span className="pill">code-analysis</span>} {s.status === 'matched' ? <span className="pill observed">✓ in code</span> : s.status === 'declared-only' ? <span className="pill unverified">⚠️ declared only</span> : null}<p className="muted">{s.why}</p>
            {techs.length > 0 && <p style={{ margin: '4px 0' }}><span className="muted">Tech you will meet here: </span>{techs.slice(0, 6).map((t) => <span className="pill" key={t.id} title={t.plain}>{t.name}</span>)}</p>}
            <p>{s.files.map((f) => <button key={f} className="filebtn" onClick={() => { setSelectedFile(f); setView('explorer'); }}>📄 {f}</button>)}</p></div></div>); })}
          </div>
          <h2>🧠 Learn the tech behind a feature</h2>
          <p className="muted">Pick a feature and learn each technology it uses — what it is, how it works under the hood, and how this app uses it.</p>
          {analysis.traces.map((t) => { const ls = techBehindFeature(analysis, current.files, t, level); return (
            <div className="card" key={t.id}><b>{t.name}</b>
              {ls.map((l) => <p key={l.layer} style={{ margin: '5px 0' }}><b>{l.layer}:</b> {l.tech.map((x) => <span className="pill" key={x}>{x}</span>)}</p>)}
              <button className="btn" onClick={() => { setTraceId(t.id); const f = t.steps[0]?.evidence[0]?.path; if (f) setSelectedFile(f); setView('lesson'); }}>Learn the tech behind this →</button>
            </div>); })}
          {!analysis.traces.length && <div className="card"><p className="muted">No features were discovered yet, so there is no honest tech breakdown to show. Import a project with routes (or open the SAMPLE app) first.</p></div>}
          <h2>Exercises (progress is saved, “done” = your self-assessment, not proven mastery)</h2>
          {exercises.map((ex) => { const prog = current.progress[ex.id]; return (
            <div className="card" key={ex.id}><h3>{ex.title} {prog?.status === 'done' && <span className="pill observed">done</span>}</h3>
              <p><b>Objective:</b> {ex.objective}</p><p className="muted">{ex.instructions}</p>
              <p className="muted"><b>Verify:</b> {ex.verify}</p>
              {(hintIdx[ex.id] || 0) < ex.hints.length ? <button className="btn secondary" onClick={() => setHintIdx({ ...hintIdx, [ex.id]: (hintIdx[ex.id] || 0) + 1 })}>Show hint ({(hintIdx[ex.id] || 0)}/{ex.hints.length})</button> : null}
              {ex.hints.slice(0, hintIdx[ex.id] || 0).map((h, i) => <p key={i}>💡 {h}</p>)}
              <details><summary>Show solution / explanation (try first!)</summary><p className="muted">{ex.solution}</p></details>
              <label>Your answer / explanation-back</label><textarea defaultValue={prog?.answer || ''} id={`ans-${ex.id}`} rows={2} placeholder="Write what you found…" />
              <div className="kv"><button className="btn" onClick={() => markProgress(ex.id, 'done', { hints: hintIdx[ex.id] || 0, answer: (document.getElementById(`ans-${ex.id}`) as HTMLTextAreaElement)?.value || '' })}>Mark done</button>
                <select aria-label="Confidence" defaultValue={prog?.confidence || 2} id={`conf-${ex.id}`} style={{ maxWidth: 240 }} onChange={(e) => markProgress(ex.id, prog?.status || 'started', { confidence: Number(e.target.value) })}><option value={1}>Confidence: 1 – lost</option><option value={2}>2 – shaky</option><option value={3}>3 – okay</option><option value={4}>4 – confident</option><option value={5}>5 – could teach it</option></select></div>
            </div>); })}
        </>}

        {current && analysis && view === 'lesson' && lesson && <>
          <h1>Lesson workspace</h1>
          <label htmlFor="lvl">Explanation level</label><select id="lvl" value={level} onChange={(e) => { setLevel(e.target.value as Level); setQuizPicked(null); }} style={{ maxWidth: 260 }}><option value="beginner">Beginner – plain language</option><option value="intermediate">Intermediate – patterns & trade-offs</option><option value="advanced">Advanced – internals & failure modes</option></select>
          <label htmlFor="lfile">File to teach</label><select id="lfile" value={selectedFile || ''} onChange={(e) => { setSelectedFile(e.target.value); setFuncSymbol(''); }} style={{ maxWidth: 520 }}>{analysis.files.map((f) => <option key={f.path} value={f.path}>{f.path}</option>)}</select>
          {analysis.traces.length > 0 && <><label htmlFor="lfeat">Feature to learn the tech behind</label><select id="lfeat" value={trace?.id || ''} onChange={(e) => setTraceId(e.target.value)} style={{ maxWidth: 520 }}>{analysis.traces.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></>}
          {(analysis.files.find((f) => f.path === selectedFile)?.symbols.length || 0) > 0 && <><label htmlFor="lfunc">Function in this file</label><select id="lfunc" value={funcSymbol} onChange={(e) => setFuncSymbol(e.target.value)} style={{ maxWidth: 520 }}><option value="">(first function in file)</option>{(analysis.files.find((f) => f.path === selectedFile)?.symbols || []).map((x) => <option key={x} value={x}>{x}</option>)}</select></>}
          <div className="card"><h3>{lesson.title}</h3>
          {trace && <><h3>🗺️ The feature, visually</h3><p className="muted">Follow the journey left → right. Border colour = confidence (green observed · amber inferred · red unverified). Click any box to open its file.</p>
          <div className="flowviz">{trace.steps.map((st, i) => <span key={i} style={{ display: 'contents' }}>{i > 0 && <span className="flowarrow">➜</span>}<button className={`flowstep ${st.confidence === 'observed' ? 'obs' : st.confidence === 'inferred' ? 'inf' : 'unv'}`} onClick={() => { const p = st.evidence[0]?.path; if (p) setSelectedFile(p); }}><span className="ic">{stepIcon(st.title)}</span><b>{st.title}</b><span>{st.body.slice(0, 110)}…</span></button></span>)}</div></>}
          <p>{lesson.plain}</p><h3>Why this exists</h3><p className="muted">{lesson.why}</p>
            {lesson.excerpt && <><h3>Evidence — {lesson.excerpt.path}</h3><pre>{lesson.excerpt.lines}</pre></>}
            <h3>Words to know</h3>{lesson.terms.map((t) => <p key={t.term}><b>{t.term}:</b> <span className="muted">{t.def}</span></p>)}
            <h3>How it connects</h3><p className="muted">{lesson.connections}</p>
            {techLayers.length > 0 && <><h3>🧠 Tech behind this feature {trace ? `— ${trace.name}` : ''}</h3>
              <p className="muted">Every technology this feature actually uses, layer by layer. Wording follows your level above; “what breaks without it” is the self-check.</p>
              <div className="stacktower" role="img" aria-label="Technology stack layers for this feature">{techLayers.map((l) => <div className="stacklayer" key={l.layer} style={{ background: LAYER_COLOR[l.layer] || LAYER_COLOR.Foundations }}><span className="ic">{LAYER_ICON[l.layer] || '🔹'}</span><div><b>{l.layer}</b> {l.tech.slice(0, 3).map((t) => <span className="pill" key={t}>{t}</span>)}<br /><small>{l.confidence === 'unverified' ? '⚠️ not detected in this feature — see below' : l.inThisFeature.slice(0, 130) + '…'}</small></div></div>)}</div>
              {techLayers.map((l) => <div className="step" key={l.layer}><b>{l.layer}</b> {conf(l.confidence)}<p>{l.tech.map((t) => <span className="pill" key={t}>{t}</span>)}</p><p><b>How this tech works:</b> <span className="muted">{l.howItWorks}</span></p><p><b>In this feature:</b> <span className="muted">{l.inThisFeature}</span></p><p>✅ <b>Self-check:</b> <span className="muted">{l.selfCheck}</span></p>{l.evidence.map((e, j) => <button key={j} className="filebtn" onClick={() => { setSelectedFile(e.path); setView('explorer'); }}>📄 {e.path}{e.startLine ? `:${e.startLine}` : ''}</button>)}</div>)}
            </>}
            {funcTech && <><h3>🔧 Tech behind the function <code>{funcTech.symbol}</code></h3>
              <p className="muted">{funcTech.file} : line {funcTech.startLine}</p>
              <div className="anatomy" role="img" aria-label={`Inputs go into ${funcTech.symbol} and produce outputs`}>
                <div className="anat"><span className="ic">📥</span><b> Inputs</b><p className="muted" style={{ fontSize: 12 }}>{funcTech.inputs.slice(0, 160)}</p></div><span className="flowarrow">➜</span>
                <div className="anat fn"><span className="ic">⚙️</span><b> {funcTech.symbol}( )</b><p>{funcTech.concepts.slice(0, 4).map((c) => <span className="pill" key={c.id}>{LAYER_ICON[c.layer] || ''} {c.name}</span>)}</p><p className="muted" style={{ fontSize: 12 }}>{funcTech.signature.slice(0, 120)}</p></div><span className="flowarrow">➜</span>
                <div className="anat"><span className="ic">📤</span><b> Outputs</b><p className="muted" style={{ fontSize: 12 }}>{funcTech.output.slice(0, 160)}</p></div>
              </div>
              <pre>{funcTech.signature}</pre>
              <p><b>Inputs:</b> <span className="muted">{funcTech.inputs}</span></p><p><b>Output:</b> <span className="muted">{funcTech.output}</span></p>
              <pre>{funcTech.excerpt}</pre>
              <div className="grid">{funcTech.concepts.map((c) => <div className="card" key={c.id} style={{ margin: 0 }}><span className="bigicon">{LAYER_ICON[c.layer] || '🔹'}</span> <b>{c.name}</b> <span className="pill">{c.layer}</span><p className="muted">{c.plain}</p><p><b>Deeper:</b> <span className="muted">{c.underTheHood}</span></p><p><b>In this function:</b> <span className="muted">{c.inThisCode}</span></p><p><b>Learn next:</b> <span className="muted">{c.learnNext}</span></p><p className="muted">Evidence: {c.evidence.map((e) => `${e.path}:${e.startLine || ''}`).join(', ')}</p></div>)}</div>
              {!funcTech.concepts.length && <p className="muted">No known technology patterns were detected inside this function — try another function, or read it with the file lesson above.</p>}
            </>}
            <h3>Why might the AI have chosen this? <span className="pill inferred">inference</span></h3><p className="muted">{lesson.whyChosen}</p>
            <h3>Alternatives & trade-offs</h3><p className="muted">{lesson.alternatives}</p>
            <h3>When it breaks</h3><p className="muted">{lesson.failures}</p>
            <h3>Knowledge check</h3><p>{lesson.quiz.q}</p>
            {lesson.quiz.options.map((o, i) => <button key={i} className="filebtn" onClick={() => setQuizPicked(i)}>{quizPicked === i ? (i === lesson.quiz.answer ? '✅ ' : '❌ ') : '○ '}{o}</button>)}
            {quizPicked !== null && <p className="muted">{lesson.quiz.explain}</p>}
            <div className="kv"><button className="btn secondary" onClick={() => setLevel(level === 'beginner' ? 'intermediate' : 'advanced')}>Explain differently / go deeper</button><button className="btn secondary" onClick={() => setView('path')}>Give me an exercise →</button><button className="btn secondary" onClick={() => setView('change')}>Help me change it →</button></div>
            <p className="muted">Ask a follow-up: pick another file above, or use Trace mode. Answers here are generated from the file excerpt shown — if it is not in the excerpt, treat it as general knowledge, not a fact about your app.</p>
          </div>
        </>}

        {current && analysis && view === 'change' && <>
          <h1>Change Lab 🧪</h1><p className="muted">Describe a small change → review the exact diff → export a patch. Nothing is written until you tick approval AND press Apply. Applying keeps the previous version in your browser history via re-import/export, and marks the project stale for re-reading lessons.</p>
          <div className="card">
            <label htmlFor="creq">What small change do you want?</label><input id="creq" value={changeReq} onChange={(e) => setChangeReq(e.target.value)} placeholder="e.g. Change the heading ‘My Tasks’ to ‘Today’s Tasks’" />
            <label htmlFor="cfile">File likely affected (impact analysis: routes/components matching your words are ranked first)</label>
            <select id="cfile" value={changeFile} onChange={(e) => { const p = e.target.value; setChangeFile(p); setEdited(current.files.find((f) => f.path === p)?.content || ''); setDiff(''); }}>
              <option value="">Choose a file…</option>
              {[...analysis.files].sort((a, b) => scoreFile(b, changeReq) - scoreFile(a, changeReq)).map((f) => <option key={f.path} value={f.path}>{f.path} ({f.category})</option>)}
            </select>
            {changeFile && <><label htmlFor="edit">Edit the file content (one small change)</label><textarea id="edit" rows={14} value={edited} onChange={(e) => setEdited(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
              <button className="btn secondary" onClick={() => setDiff(makeDiff(changeFile, current.files.find((f) => f.path === changeFile)?.content || '', edited))}>Generate diff for review</button></>}
            {diff && <><h3>Review this diff carefully</h3><p className="muted">{diffStats(diff).added} line(s) added, {diffStats(diff).removed} removed. Verification checklist: ☐ re-open the feature trace ☐ run the original app’s tests ☐ check the UI at that route.</p><pre>{diff}</pre>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={approved} onChange={(e) => setApproved(e.target.checked)} /> I have read this diff and understand it changes only the file above.</label>
              <div className="kv"><button className="btn secondary" onClick={() => download((changeFile.split('/').pop() || 'change') + '.patch', diff)}>⬇️ Export .patch</button>
                <button className="btn good" disabled={!approved} onClick={async () => { if (!approved) return; const files = current.files.map((f) => f.path === changeFile ? { ...f, content: edited } : f); const updated = { ...current, files, analysis: analyzeProject(files, analysis.excludedCount), stale: true, changeProposals: [...(current.changeProposals || []), { id: uid(), request: changeReq, file: changeFile, diff, status: 'applied-in-reverselearn', createdAt: new Date().toISOString() }] }; await save(updated); setDiff(''); setApproved(false); }}>Apply approved change in ReverseLearn copy</button></div>
              <p className="muted">Rollback: re-import your original ZIP (Import screen), or apply the reverse patch (<code>git apply -R your.patch</code>) in the real project. ReverseLearn never touches your real project folder.</p></>}
          </div>
          {(current.changeProposals || []).map((c) => <div className="card" key={c.id}><b>{c.request || 'Change'}</b> <span className="muted">{c.file} · {c.status} · {new Date(c.createdAt).toLocaleString()}</span><pre>{c.diff.slice(0, 1200)}</pre></div>)}
        </>}

        {current && view === 'settings' && <>
          <h1>Project settings</h1>
          <div className="card"><h3>Project</h3>
            <label htmlFor="rename">Name</label><input id="rename" defaultValue={current.name} onBlur={async (e) => { if (e.target.value.trim()) await save({ ...current, name: e.target.value.trim() }); }} />
            <p className="muted">Source: {current.source || 'ZIP upload'} · Analyzed: {analysis ? new Date(analysis.analyzedAt).toLocaleString() : 'never'} · Analyzer: {analysis?.version || '—'}</p>
            <p className="muted">Privacy: analysis runs in your browser. Source is stored only in this browser’s IndexedDB. No AI provider is configured, so no code is sent anywhere. Secret-looking files are redacted in views.</p>
            <div className="kv"><button className="btn secondary" onClick={() => setView('import')}>Re-analyse / re-import</button>
              <button className="btn secondary" onClick={() => download(current.name.replace(/\W+/g, '-') + '-reverselearn-export.json', JSON.stringify({ name: current.name, analysis: current.analysis, progress: current.progress, changeProposals: current.changeProposals || [] }, null, 2), 'application/json')}>Export learning data (JSON)</button>
              <button className="btn danger" onClick={async () => { if (confirm('Delete this project and all its learning data from this browser? This cannot be undone.')) { await store.remove(current.id); setProjects(projects.filter((p) => p.id !== current.id)); setCurrentId(null); setView('dashboard'); } }}>Delete project</button></div>
          </div>
          <div className="card"><h3>Exclusions & redaction (MVP defaults)</h3><p className="muted">Excluded: node_modules, .git, .next, dist, build, coverage, vendor, binaries. Redacted: .env*, *.pem, *.key, secret/credential filenames, and detected secret patterns. Configurable exclusions are a Phase-2 item — documented in the README, not silently promised here.</p></div>
        </>}
      </main>
    </div>
  );
}
function scoreFile(f: { path: string; category: string }, req: string): number {
  if (!req) return 0; const words = req.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  return words.reduce((s, w) => s + (f.path.toLowerCase().includes(w) ? 2 : 0), 0) + (f.category === 'frontend' ? 1 : 0);
}
