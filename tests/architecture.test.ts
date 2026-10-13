import { describe, it, expect } from 'vitest';
import { analyzeProject } from '../lib/analyzer';
import { SAMPLE_FILES } from '../lib/sample';
import { learningPath } from '../lib/lessons';

describe('architecture-diagram alignment', () => {
  const a = analyzeProject(SAMPLE_FILES);
  it('finds and parses the shipped mermaid diagram', () => {
    expect(a.architectureDocs?.length).toBeGreaterThan(0);
    expect(a.architectureDocs![0].nodes.map((n) => n.label).join(' ')).toMatch(/Prisma/i);
  });
  it('matches diagram nodes to code and honestly flags declared-only nodes', () => {
    const items = a.archAlignment!.items;
    expect(items.find((i) => /Prisma/i.test(i.label))?.status).toBe('matched');
    // the sample has no auth code, so "User Sign-in" must NOT be claimed as present
    expect(items.find((i) => /Sign-in/i.test(i.label))?.status).toBe('declared-only');
  });
  it('aligns the learning path to the diagram order when one exists', () => {
    const path = learningPath(a);
    expect(path[0].source).toBe('architecture-diagram');
    const titles = path.map((p) => p.title).join(' | ');
    expect(titles.indexOf('Prisma')).toBeGreaterThan(titles.indexOf('API'));
  });
  it('falls back to code-analysis path when no diagram exists', () => {
    const plain = analyzeProject([{ path: 'app/page.tsx', content: 'export default function P(){return <p>hi</p>}' }]);
    expect(plain.archAlignment).toBeNull();
    expect(learningPath(plain)[0].source).toBe('code-analysis');
  });
});
