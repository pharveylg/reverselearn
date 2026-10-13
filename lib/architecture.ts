// Detect architecture diagrams/docs that shipped with a project (README,
// docs/*.md, *.mmd, *.puml) and align them with code evidence.
// Trust model: a diagram is a CLAIM by the project author/AI, not proof.
// Every node is labelled matched (code evidence found) or declared-only.
import { Analysis, ArchitectureDoc, InputFile } from './types';

function stripQuotes(s: string) { return s.replace(/^["']|["']$/g, '').trim(); }

function parseMermaid(text: string, path: string): ArchitectureDoc | null {
  const nodes = new Map<string, string>(); const edges: ArchitectureDoc['edges'] = [];
  const addNode = (id: string, label?: string) => { if (!id || /^(graph|flowchart|sequenceDiagram|classDiagram|erDiagram|stateDiagram)/i.test(id)) return; const lab = label ? stripQuotes(label).replace(/^\(|\)$/g, '') : undefined; if (lab && lab !== id) nodes.set(id, lab); else if (!nodes.has(id)) nodes.set(id, id); };
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line || /^(graph|flowchart|%%|subgraph|end\b)/i.test(line)) continue;
    const part = line.match(/^participant\s+(\w+)(?:\s+as\s+(.+))?$/i); if (part) { addNode(part[1], part[2]); continue; }
    // node definitions anywhere in the line: ID[label], ID(label), ID{label}
    for (const m of line.matchAll(/([A-Za-z0-9_]+)\s*(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})/g)) addNode(m[1], m[2] || m[3] || m[4]);
    // edges (on a label-stripped copy so UI[Home Page] --> API[Tasks] parses): A --> B, A -- label --> B, A ->> B: msg
    const clean = line.replace(/([A-Za-z0-9_]+)\s*(?:\[[^\]]+\]|\([^)]+\)|\{[^}]+\})/g, '$1');
    const seq = clean.match(/^([A-Za-z0-9_]+)\s*-{1,2}>>?\s*([A-Za-z0-9_]+)\s*:\s*(.+)$/); if (seq) { addNode(seq[1]); addNode(seq[2]); edges.push({ from: seq[1], to: seq[2], label: seq[3].trim() }); continue; }
    const edge = clean.match(/^([A-Za-z0-9_]+)\s*(?:-->\|[^|]*\||--[^->|]+-->|-->|---|-\.->|==>)\s*(?:\|[^|]*\|\s*)?([A-Za-z0-9_]+)/);
    if (edge) { addNode(edge[1]); addNode(edge[2]); edges.push({ from: edge[1], to: edge[2] }); }
  }
  if (!nodes.size) return null;
  return { path, kind: 'mermaid', nodes: [...nodes].map(([id, label]) => ({ id, label })), edges };
}

function parsePlantUml(text: string, path: string): ArchitectureDoc | null {
  const nodes = new Map<string, string>(); const edges: ArchitectureDoc['edges'] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const comp = line.match(/(?:component|database|actor|rectangle|node)\s+(?:\[([^\]]+)\]|(\w+))(?:\s+as\s+(\w+))?/i);
    if (comp) { const label = comp[1] || comp[2]; const id = comp[3] || (comp[1] ? comp[1].replace(/\W+/g, '_') : comp[2]); nodes.set(id, label); }
    const arr = line.match(/^(\w+)\s+-+>?\s*(\w+)/); if (arr && nodes.has(arr[1]) || (arr && /^[A-Za-z]/.test(arr[1]) && line.includes('-'))) { if (arr) { if (!nodes.has(arr[1])) nodes.set(arr[1], arr[1]); if (!nodes.has(arr[2])) nodes.set(arr[2], arr[2]); edges.push({ from: arr[1], to: arr[2] }); } }
  }
  return nodes.size ? { path, kind: 'plantuml', nodes: [...nodes].map(([id, label]) => ({ id, label })), edges } : null;
}

/** Find every declared architecture diagram/doc, best (most nodes) first. */
export function findArchitectureDocs(files: InputFile[]): ArchitectureDoc[] {
  const docs: ArchitectureDoc[] = [];
  for (const f of files) {
    const low = f.path.toLowerCase();
    if (low.endsWith('.mmd') || low.endsWith('.mermaid')) { const d = parseMermaid(f.content, f.path); if (d) docs.push(d); continue; }
    if (low.endsWith('.puml') || low.endsWith('.plantuml')) { const d = parsePlantUml(f.content, f.path); if (d) docs.push(d); continue; }
    if (/\.(md|markdown|txt)$/.test(low)) {
      for (const m of f.content.matchAll(/```(?:mermaid|mmd)\s*\n([\s\S]*?)```/g)) { const d = parseMermaid(m[1], f.path); if (d) docs.push(d); }
      // heading-based fallback: architecture doc with ## sections but no diagram syntax
      if (/architect|diagram|system design/i.test(f.path + '\n' + f.content.slice(0, 400)) && !docs.some((d) => d.path === f.path)) {
        const heads = [...f.content.matchAll(/^#{2,3}\s+(.+)$/gm)].map((h) => h[1].trim()).filter((h) => h.length < 60);
        if (heads.length >= 2 && /(architect|diagram|overview|components)/i.test(f.path + f.content.slice(0, 200))) {
          docs.push({ path: f.path, kind: 'headings', nodes: heads.map((label, i) => ({ id: 'h' + i, label })), edges: heads.slice(1).map((_, i) => ({ from: 'h' + i, to: 'h' + (i + 1) })) });
        }
      }
    }
  }
  // images named as diagrams are recorded as evidence-free declared docs (cannot OCR honestly)
  for (const f of files) if (/(architect|diagram).*\.(png|jpg|jpeg|svg)$/i.test(f.path)) docs.push({ path: f.path, kind: 'image', nodes: [], edges: [] });
  return docs.sort((a, b) => b.nodes.length - a.nodes.length);
}

/** Topological order of diagram nodes (falls back to declared order). */
export function orderNodes(doc: ArchitectureDoc): string[] {
  const ids = doc.nodes.map((n) => n.id); const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of doc.edges) if (indeg.has(e.to)) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  const queue = ids.filter((id) => !indeg.get(id)); const out: string[] = [];
  while (queue.length) { const id = queue.shift()!; out.push(id); for (const e of doc.edges.filter((x) => x.from === id)) { indeg.set(e.to, (indeg.get(e.to) || 0) - 1); if (!indeg.get(e.to)) queue.push(e.to); } }
  return out.length === ids.length ? out : ids; // cycle -> declared order
}

const SYNONYMS: { re: RegExp; cats: string[]; words: string[] }[] = [
  { re: /browser|client|frontend|front-end|ui|web app|react|next/i, cats: ['frontend'], words: ['page', 'component', 'app'] },
  { re: /api|backend|back-end|server|service|controller|lambda|function/i, cats: ['backend'], words: ['api', 'route', 'server'] },
  { re: /database|db|sql|postgres|mysql|mongo|prisma|supabase|firestore|storage|data layer/i, cats: ['database'], words: ['prisma', 'db', 'schema', 'sql'] },
  { re: /auth|login|session|identity|clerk|oauth/i, cats: [], words: ['auth', 'session', 'login', 'clerk'] },
  { re: /test|ci|pipeline|deploy|hosting|vercel|docker/i, cats: ['test', 'config'], words: ['test', 'config', 'vercel'] },
  { re: /payment|stripe|email|queue|external|third.party/i, cats: [], words: ['stripe', 'email', 'payment'] },
];
export type AlignmentItem = { nodeId: string; label: string; status: 'matched' | 'declared-only'; files: string[]; reason: string };
export type ArchitectureAlignment = { docPath: string; kind: string; items: AlignmentItem[]; uncoveredCode: string[] };

/** Check each diagram node against the actual code inventory. */
export function alignArchitecture(doc: ArchitectureDoc, analysis: Analysis, files: InputFile[]): ArchitectureAlignment {
  const items: AlignmentItem[] = orderNodes(doc).map((id) => {
    const node = doc.nodes.find((n) => n.id === id)!;
    const label = node.label;
    const tokens = label.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !['the', 'and', 'app', 'web'].includes(t));
    const scored = analysis.files.map((meta) => {
      const f = files.find((x) => x.path === meta.path); let score = 0; const why: string[] = [];
      for (const t of tokens) { if (meta.path.toLowerCase().includes(t)) { score += 3; why.push(`path contains "${t}"`); } if (meta.symbols.some((s) => s.toLowerCase().includes(t))) { score += 3; why.push(`exports ${t}`); } if (f && new RegExp(`\\b${t}`, 'i').test(f.content)) score += 1; }
      for (const syn of SYNONYMS) if (syn.re.test(label)) { if (syn.cats.includes(meta.category)) { score += 2; why.push(`${meta.category} file`); } if (syn.words.some((w) => meta.path.toLowerCase().includes(w))) score += 2; }
      return { path: meta.path, score, why };
    }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 4);
    return top.length
      ? { nodeId: id, label, status: 'matched' as const, files: top.map((x) => x.path), reason: `Code evidence matched (${[...new Set(top.flatMap((x) => x.why))].slice(0, 2).join('; ') || 'content mentions'}). Still a static match — verify by opening the file.` }
      : { nodeId: id, label, status: 'declared-only' as const, files: [], reason: 'Declared in the project docs, but no matching file/symbol was found. It may be planned, renamed, hosted externally, or the diagram may be stale.' };
  });
  const coveredCats = new Set<string>();
  for (const it of items) for (const p of it.files) { const m = analysis.files.find((x) => x.path === p); if (m) coveredCats.add(m.category); }
  const uncoveredCode = [...new Set(analysis.files.map((f) => f.category))].filter((c) => !coveredCats.has(c) && c !== 'docs' && c !== 'other');
  return { docPath: doc.path, kind: doc.kind, items, uncoveredCode };
}
