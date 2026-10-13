import { describe, it, expect } from 'vitest';
import { makeDiff, diffStats } from '../lib/diff';
describe('makeDiff', () => {
  it('produces a reviewable diff and never mutates inputs', () => {
    const before = 'line1\nold\nline3'; const d = makeDiff('a.txt', before, 'line1\nnew\nline3');
    expect(d).toContain('-old'); expect(d).toContain('+new'); expect(before).toBe('line1\nold\nline3');
    expect(diffStats(d)).toEqual({ added: 1, removed: 1 });
  });
});
