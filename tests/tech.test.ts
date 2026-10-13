import { describe, it, expect } from 'vitest';
import { analyzeProject } from '../lib/analyzer';
import { SAMPLE_FILES } from '../lib/sample';
import { detectTechInFile, techBehindFeature, functionTech } from '../lib/tech';

const a = analyzeProject(SAMPLE_FILES);
describe('tech behind a feature/function', () => {
  it('detects the actual technologies in a file with line evidence', () => {
    const page = SAMPLE_FILES.find((f) => f.path === 'app/page.tsx')!;
    const names = detectTechInFile(page).map((c) => c.name);
    expect(names.join(' ')).toMatch(/state/i); expect(names.join(' ')).toMatch(/fetch/i);
    for (const c of detectTechInFile(page)) expect(c.evidence[0].startLine).toBeGreaterThan(0);
  });
  it('explains every layer of a trace and admits missing layers', () => {
    const layers = techBehindFeature(a, SAMPLE_FILES, a.traces[0]);
    expect(layers.length).toBeGreaterThanOrEqual(3);
    expect(layers.map((l) => l.layer)).toContain('Auth'); // stated as missing/unverified, not invented
    expect(layers.find((l) => l.layer === 'Auth')!.confidence).toBe('unverified');
    for (const l of layers) expect(l.selfCheck.length).toBeGreaterThan(10);
  });
  it('dissects a named function: signature, inputs, concepts', () => {
    const ft = functionTech(a, SAMPLE_FILES, 'app/api/tasks/route.ts', 'POST');
    expect(ft).not.toBeNull(); expect(ft!.signature).toContain('POST');
    expect(ft!.concepts.map((c) => c.name).join(' ')).toMatch(/validation|ORM|response/i);
    expect(ft!.inputs.length).toBeGreaterThan(5);
  });
});
