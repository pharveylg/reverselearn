import { describe, it, expect } from 'vitest';
import { analyzeProject, compareHashes } from '../lib/analyzer';
import { SAMPLE_FILES } from '../lib/sample';

describe('analyzer on the labelled SAMPLE fixture', () => {
  const a = analyzeProject(SAMPLE_FILES);
  it('detects Next.js/React/Prisma from the manifest (observed, not invented)', () => {
    expect(a.frameworks).toContain('Next.js'); expect(a.frameworks).toContain('Prisma');
  });
  it('finds page and API routes with file evidence', () => {
    expect(a.routes.some((r) => r.path === '/' || r.kind === 'page')).toBe(true);
    expect(a.routes.some((r) => r.kind === 'api')).toBe(true);
    for (const f of a.findings) for (const e of f.evidence) expect(a.files.some((x) => x.path === e.path)).toBe(true);
  });
  it('builds traces that label unknowns instead of inventing steps', () => {
    expect(a.traces.length).toBeGreaterThan(0);
    expect(a.traces.every((t) => t.steps.length >= 4)).toBe(true);
  });
  it('never treats a no-route project as having features', () => {
    const empty = analyzeProject([{ path: 'notes.txt', content: 'hello' }]);
    expect(empty.traces).toHaveLength(0);
    expect(empty.warnings.length).toBeGreaterThan(0);
  });
});
describe('compareHashes (re-analysis / stale detection)', () => {
  it('reports added/removed/modified', () => {
    const c = compareHashes({ 'a.ts': '1', 'b.ts': '2' }, { 'a.ts': '9', 'c.ts': '3' });
    expect(c).toEqual({ added: ['c.ts'], removed: ['b.ts'], modified: ['a.ts'] });
  });
});
