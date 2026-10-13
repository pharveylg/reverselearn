export type Confidence = 'observed' | 'inferred' | 'unverified';
export type EvidenceRef = { path: string; startLine?: number; endLine?: number; symbol?: string };
export type Finding = {
  id: string; kind: string; title: string; summary: string;
  evidence: EvidenceRef[]; confidence: Confidence; limitations?: string[];
};
export type InputFile = { path: string; content: string };
export type SourceFileMeta = {
  path: string; language: string; size: number; hash: string;
  category: 'frontend' | 'backend' | 'database' | 'test' | 'config' | 'docs' | 'other';
  redacted: boolean; sensitive: boolean; symbols: string[];
};
export type RouteInfo = { path: string; file: string; kind: 'page' | 'api' | 'route'; methods: string[]; line?: number };
export type ArchNode = { id: string; type: string; label: string; detail: string; evidence: EvidenceRef[]; confidence: Confidence };
export type ArchEdge = { from: string; to: string; label: string; confidence: Confidence };
export type TraceStep = { title: string; body: string; confidence: Confidence; evidence: EvidenceRef[] };
export type FeatureTrace = { id: string; name: string; steps: TraceStep[]; unknowns: string[] };
export type ArchitectureDoc = { path: string; kind: 'mermaid' | 'plantuml' | 'headings' | 'image'; nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[] };
export type ArchAlignmentItem = { nodeId: string; label: string; status: 'matched' | 'declared-only'; files: string[]; reason: string };
export type Analysis = {
  architectureDocs?: ArchitectureDoc[];
  archAlignment?: { docPath: string; kind: string; items: ArchAlignmentItem[]; uncoveredCode: string[] } | null;
  version: string; analyzedAt: string; languages: Record<string, number>;
  frameworks: string[]; dependencies: string[]; devDependencies: string[];
  files: SourceFileMeta[]; routes: RouteInfo[]; findings: Finding[];
  nodes: ArchNode[]; edges: ArchEdge[]; traces: FeatureTrace[];
  warnings: string[]; excludedCount: number; sensitiveFiles: string[];
  envVarNames: string[];
};
export type Project = {
  id: string; name: string; description: string; createdAt: string; source?: string;
  isSample?: boolean; analysis: Analysis | null; files: InputFile[];
  progress: Record<string, { status: string; hints?: number; confidence?: number; answer?: string; updatedAt: string }>;
  changeProposals?: { id: string; request: string; file: string; diff: string; status: string; createdAt: string }[];
  stale?: boolean; previousHashes?: Record<string, string>;
};
export type Level = 'beginner' | 'intermediate' | 'advanced';
export function hashContent(s: string): string {
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
export function uid(): string { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
